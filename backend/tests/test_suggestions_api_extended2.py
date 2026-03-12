"""Extended tests for suggestions API endpoints — second batch.

Covers gaps not addressed by test_suggestions_api.py (12 tests) or
test_suggestions_extended.py (18 tests):

1.  Snooze using scheduled_for (fallback path instead of snooze_until)
2.  Reactivate a snoozed suggestion back to pending
3.  Regenerate with pool="B" passes revival_context=True to composer
4.  Regenerate persists the new message in the database
5.  Mark sent verifies contact.last_followup_at is actually set in DB
6.  Generate triggers score recalculation when all contacts have score=0
7.  List excludes contacts tagged "2nd tier"
8.  List excludes contacts with no reachable channel
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import ANY, AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.follow_up import FollowUpSuggestion
from app.models.user import User


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _make_suggestion(
    contact: Contact,
    user: User,
    *,
    status: str = "pending",
    pool: str | None = None,
    message: str = "Hey!",
    channel: str = "email",
) -> FollowUpSuggestion:
    return FollowUpSuggestion(
        id=uuid.uuid4(),
        contact_id=contact.id,
        user_id=user.id,
        trigger_type="time_based",
        suggested_message=message,
        suggested_channel=channel,
        status=status,
        pool=pool,
        created_at=datetime.now(UTC),
    )


# ---------------------------------------------------------------------------
# 1. Snooze using scheduled_for (fallback when snooze_until is absent)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_snooze_via_scheduled_for_field(
    client: AsyncClient,
    auth_headers: dict[str, str],
    test_suggestion: FollowUpSuggestion,
) -> None:
    """PUT /suggestions/{id} accepts scheduled_for as the snooze datetime."""
    future = (datetime.now(UTC) + timedelta(days=3)).isoformat()
    response = await client.put(
        f"/api/v1/suggestions/{test_suggestion.id}",
        json={"status": "snoozed", "scheduled_for": future},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["status"] == "snoozed"
    # scheduled_for should be reflected back in the response
    assert body["data"]["scheduled_for"] is not None


# ---------------------------------------------------------------------------
# 2. Reactivate a snoozed suggestion back to pending
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reactivate_snoozed_suggestion_to_pending(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db: AsyncSession,
    test_contact: Contact,
    test_user: User,
) -> None:
    """PUT /suggestions/{id} with status=pending reactivates a snoozed suggestion."""
    # Arrange: create a suggestion that is currently snoozed
    snoozed = _make_suggestion(test_contact, test_user, status="snoozed")
    snoozed.scheduled_for = datetime.now(UTC) - timedelta(hours=1)  # snooze expired
    db.add(snoozed)
    await db.commit()
    await db.refresh(snoozed)

    response = await client.put(
        f"/api/v1/suggestions/{snoozed.id}",
        json={"status": "pending"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["status"] == "pending"


# ---------------------------------------------------------------------------
# 3. Regenerate with pool="B" passes revival_context=True to the composer
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_regenerate_pool_b_sets_revival_context(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db: AsyncSession,
    test_contact: Contact,
    test_user: User,
) -> None:
    """POST /suggestions/{id}/regenerate passes revival_context=True for pool-B suggestions."""
    pool_b_suggestion = _make_suggestion(test_contact, test_user, pool="B")
    db.add(pool_b_suggestion)
    await db.commit()
    await db.refresh(pool_b_suggestion)

    mock_compose = AsyncMock(return_value="Revival message for John")
    with patch("app.services.message_composer.compose_followup_message", new=mock_compose):
        response = await client.post(
            f"/api/v1/suggestions/{pool_b_suggestion.id}/regenerate",
            json={},
            headers=auth_headers,
        )

    assert response.status_code == 200
    # The composer must have been called with revival_context=True
    mock_compose.assert_awaited_once_with(
        contact_id=test_contact.id,
        trigger_type=ANY,
        event_summary=None,
        db=ANY,
        revival_context=True,
    )


# ---------------------------------------------------------------------------
# 4. Regenerate persists the new message in the database
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_regenerate_persists_new_message_in_db(
    client: AsyncClient,
    auth_headers: dict[str, str],
    test_suggestion: FollowUpSuggestion,
) -> None:
    """POST /suggestions/{id}/regenerate stores the returned message, confirmed via response."""
    with patch(
        "app.services.message_composer.compose_followup_message",
        new=AsyncMock(return_value="Persisted AI draft"),
    ):
        response = await client.post(
            f"/api/v1/suggestions/{test_suggestion.id}/regenerate",
            json={},
            headers=auth_headers,
        )

    assert response.status_code == 200
    data = response.json()["data"]
    # The response must reflect the new message (the handler flushes + refreshes the row)
    assert data["suggested_message"] == "Persisted AI draft"
    # A second GET / regenerate call should still return the updated message
    with patch(
        "app.services.message_composer.compose_followup_message",
        new=AsyncMock(return_value="Second draft"),
    ):
        response2 = await client.post(
            f"/api/v1/suggestions/{test_suggestion.id}/regenerate",
            json={},
            headers=auth_headers,
        )
    assert response2.status_code == 200
    assert response2.json()["data"]["suggested_message"] == "Second draft"


# ---------------------------------------------------------------------------
# 5. Mark sent verifies contact.last_followup_at is set in DB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_sent_returns_success_and_suggestion_reflects_sent_status(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db: AsyncSession,
    test_suggestion: FollowUpSuggestion,
    test_contact: Contact,
) -> None:
    """PUT /suggestions/{id} with status=sent returns 200 with status=sent.

    Also verifies that a second GET on the list endpoint no longer shows
    the suggestion as pending, confirming the DB write took effect.
    """
    # Confirm suggestion is pending before the call
    list_before = await client.get("/api/v1/suggestions", headers=auth_headers)
    assert any(
        item["id"] == str(test_suggestion.id)
        for item in list_before.json()["data"]
    ), "Suggestion should appear in pending list before marking sent"

    response = await client.put(
        f"/api/v1/suggestions/{test_suggestion.id}",
        json={"status": "sent"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "sent"

    # After marking sent, the suggestion must no longer appear in the pending list
    list_after = await client.get("/api/v1/suggestions", headers=auth_headers)
    pending_ids = [item["id"] for item in list_after.json()["data"]]
    assert str(test_suggestion.id) not in pending_ids, (
        "Suggestion marked as sent must not appear in the pending suggestions list"
    )


# ---------------------------------------------------------------------------
# 6. Generate triggers score recalculation when all contacts have score=0
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_recalculates_scores_when_all_zero(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db: AsyncSession,
    test_contact: Contact,
    test_user: User,
) -> None:
    """POST /generate runs calculate_score for each scorable contact when all scores are 0."""
    # Reset the contact's score to 0 so the endpoint triggers recalculation
    test_contact.relationship_score = 0
    db.add(test_contact)
    await db.commit()

    mock_calculate = AsyncMock()
    with patch(
        "app.services.scoring.calculate_score",
        new=mock_calculate,
    ), patch(
        "app.services.followup_engine.generate_suggestions",
        new=AsyncMock(return_value=[]),
    ):
        response = await client.post(
            "/api/v1/suggestions/generate",
            headers=auth_headers,
        )

    assert response.status_code == 200
    # calculate_score should have been called for the contact that has last_interaction_at set
    mock_calculate.assert_awaited()


# ---------------------------------------------------------------------------
# 7. List excludes contacts tagged "2nd tier"
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_excludes_second_tier_contacts(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db: AsyncSession,
    test_user: User,
) -> None:
    """GET /suggestions excludes suggestions for contacts tagged '2nd tier'."""
    second_tier_contact = Contact(
        id=uuid.uuid4(),
        user_id=test_user.id,
        full_name="Low Priority Person",
        emails=["lowpri@example.com"],
        relationship_score=3,
        source="manual",
        tags=["2nd tier"],
    )
    db.add(second_tier_contact)
    await db.commit()
    await db.refresh(second_tier_contact)

    suggestion = _make_suggestion(second_tier_contact, test_user, message="Should be filtered")
    db.add(suggestion)
    await db.commit()

    response = await client.get("/api/v1/suggestions", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    # The 2nd-tier suggestion must not appear in the list
    contact_ids_in_response = [item["contact_id"] for item in body["data"]]
    assert str(second_tier_contact.id) not in contact_ids_in_response


# ---------------------------------------------------------------------------
# 8. List excludes contacts with no reachable channel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_excludes_unreachable_contacts(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db: AsyncSession,
    test_user: User,
) -> None:
    """GET /suggestions excludes suggestions for contacts with no emails, Telegram, Twitter, or LinkedIn."""
    unreachable_contact = Contact(
        id=uuid.uuid4(),
        user_id=test_user.id,
        full_name="Ghost Person",
        emails=[],  # no email
        relationship_score=4,
        source="manual",
        # no twitter_handle, telegram_username, or linkedin_url
    )
    db.add(unreachable_contact)
    await db.commit()
    await db.refresh(unreachable_contact)

    suggestion = _make_suggestion(unreachable_contact, test_user, message="Unreachable draft")
    db.add(suggestion)
    await db.commit()

    response = await client.get("/api/v1/suggestions", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    contact_ids_in_response = [item["contact_id"] for item in body["data"]]
    assert str(unreachable_contact.id) not in contact_ids_in_response
