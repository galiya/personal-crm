"""Tests for Google Calendar integration: sync_calendar_events and helper functions."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.google_calendar import (
    _extract_attendee_emails,
    _extract_name_from_email,
    _extract_name_from_summary,
    sync_calendar_events,
)
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.models.user import User


# ---------------------------------------------------------------------------
# Helper builders
# ---------------------------------------------------------------------------

def _make_event(
    event_id: str,
    summary: str,
    start_iso: str,
    attendees: list[dict] | None = None,
    status: str = "confirmed",
) -> dict:
    """Build a minimal Google Calendar API event dict."""
    event: dict = {
        "id": event_id,
        "summary": summary,
        "status": status,
        "start": {"dateTime": start_iso},
        "end": {"dateTime": start_iso},
    }
    if attendees is not None:
        event["attendees"] = attendees
    return event


def _mock_calendar_service(events: list[dict]) -> MagicMock:
    """Return a MagicMock that mimics the Google Calendar service for a single page."""
    mock_service = MagicMock()
    (
        mock_service
        .events.return_value
        .list.return_value
        .execute.return_value
    ) = {"items": events}
    return mock_service


# ---------------------------------------------------------------------------
# Unit tests for pure helper functions
# ---------------------------------------------------------------------------

class TestExtractAttendeeEmails:
    def test_excludes_user_email(self):
        event = {
            "attendees": [
                {"email": "user@example.com"},
                {"email": "alice@example.com"},
            ]
        }
        result = _extract_attendee_emails(event, "user@example.com")
        assert result == ["alice@example.com"]

    def test_excludes_resource_calendars(self):
        event = {
            "attendees": [
                {"email": "room@resource.calendar.google.com", "resource": True},
                {"email": "bob@example.com"},
            ]
        }
        result = _extract_attendee_emails(event, "user@example.com")
        assert result == ["bob@example.com"]

    def test_empty_attendees_returns_empty_list(self):
        result = _extract_attendee_emails({}, "user@example.com")
        assert result == []

    def test_case_insensitive_user_exclusion(self):
        event = {"attendees": [{"email": "USER@EXAMPLE.COM"}]}
        result = _extract_attendee_emails(event, "user@example.com")
        assert result == []


class TestExtractNameFromEmail:
    def test_dot_separated(self):
        given, family = _extract_name_from_email("simon.letort@example.com")
        assert given == "Simon"
        assert family == "Letort"

    def test_underscore_separated(self):
        given, family = _extract_name_from_email("simon_letort@example.com")
        assert given == "Simon"
        assert family == "Letort"

    def test_single_name(self):
        given, family = _extract_name_from_email("simon@example.com")
        assert given == "Simon"
        assert family is None

    def test_noreply_returns_none(self):
        given, family = _extract_name_from_email("noreply@example.com")
        assert given is None
        assert family is None

    def test_info_returns_none(self):
        given, family = _extract_name_from_email("info@example.com")
        assert given is None
        assert family is None


class TestExtractNameFromSummary:
    def test_between_pattern(self):
        name = _extract_name_from_summary(
            "30 Min Meeting between Nick Sawinyh and Simon Letort",
            "Nick Sawinyh",
        )
        assert name == "Simon Letort"

    def test_meeting_with_pattern(self):
        name = _extract_name_from_summary("Meeting with Simon Letort", "Nick Sawinyh")
        assert name == "Simon Letort"

    def test_coffee_with_pattern(self):
        name = _extract_name_from_summary("Coffee with Alice", None)
        assert name == "Alice"

    def test_no_match_returns_none(self):
        name = _extract_name_from_summary("Weekly team standup", "Nick")
        assert name is None


# ---------------------------------------------------------------------------
# Integration tests for sync_calendar_events
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sync_creates_interactions_from_events(db: AsyncSession, test_user: User):
    """sync_calendar_events creates contacts and meeting interactions for attendees."""
    test_user.google_refresh_token = "fake-refresh-token"
    db.add(test_user)
    await db.commit()

    event_time = (datetime.now(UTC) - timedelta(days=10)).isoformat()
    events = [
        _make_event(
            "evt001",
            "Sync with Alice",
            event_time,
            attendees=[
                {"email": test_user.email, "displayName": "Test User"},
                {"email": "alice@example.com", "displayName": "Alice Smith"},
            ],
        )
    ]

    mock_service = _mock_calendar_service(events)

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=mock_service,
    ):
        result = await sync_calendar_events(test_user, db)

    assert result["events_processed"] == 1
    assert result["new_contacts"] == 1
    assert result["new_interactions"] == 1

    # Verify the interaction was persisted
    int_result = await db.execute(
        select(Interaction).where(Interaction.user_id == test_user.id)
    )
    interactions = int_result.scalars().all()
    assert len(interactions) == 1
    assert interactions[0].platform == "meeting"
    assert interactions[0].direction == "mutual"
    assert interactions[0].content_preview == "Sync with Alice"


@pytest.mark.asyncio
async def test_sync_extracts_contact_names_from_attendees(db: AsyncSession, test_user: User):
    """Contacts are created with displayName from the attendee list."""
    test_user.google_refresh_token = "fake-refresh-token"
    db.add(test_user)
    await db.commit()

    event_time = (datetime.now(UTC) - timedelta(days=5)).isoformat()
    events = [
        _make_event(
            "evt002",
            "Catch-up",
            event_time,
            attendees=[
                {"email": test_user.email},
                {"email": "bob.jones@example.com", "displayName": "Bob Jones"},
            ],
        )
    ]

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=_mock_calendar_service(events),
    ):
        await sync_calendar_events(test_user, db)

    contact_result = await db.execute(
        select(Contact).where(Contact.user_id == test_user.id)
    )
    contact = contact_result.scalar_one()
    assert contact.full_name == "Bob Jones"
    assert contact.given_name == "Bob"
    assert contact.family_name == "Jones"
    assert "bob.jones@example.com" in contact.emails


@pytest.mark.asyncio
async def test_sync_skips_events_with_no_attendees(db: AsyncSession, test_user: User):
    """Events without external attendees are not counted or stored."""
    test_user.google_refresh_token = "fake-refresh-token"
    db.add(test_user)
    await db.commit()

    event_time = (datetime.now(UTC) - timedelta(days=5)).isoformat()
    events = [
        # No attendees field at all
        _make_event("evt003", "Personal reminder", event_time, attendees=None),
        # Only the user themselves
        _make_event(
            "evt004",
            "Block time",
            event_time,
            attendees=[{"email": test_user.email}],
        ),
    ]

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=_mock_calendar_service(events),
    ):
        result = await sync_calendar_events(test_user, db)

    assert result["events_processed"] == 0
    assert result["new_contacts"] == 0
    assert result["new_interactions"] == 0


@pytest.mark.asyncio
async def test_sync_skips_cancelled_events(db: AsyncSession, test_user: User):
    """Events with status='cancelled' are skipped."""
    test_user.google_refresh_token = "fake-refresh-token"
    db.add(test_user)
    await db.commit()

    event_time = (datetime.now(UTC) - timedelta(days=5)).isoformat()
    events = [
        _make_event(
            "evt005",
            "Cancelled meeting",
            event_time,
            attendees=[
                {"email": test_user.email},
                {"email": "carol@example.com", "displayName": "Carol"},
            ],
            status="cancelled",
        )
    ]

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=_mock_calendar_service(events),
    ):
        result = await sync_calendar_events(test_user, db)

    assert result["events_processed"] == 0
    assert result["new_contacts"] == 0


@pytest.mark.asyncio
async def test_sync_returns_zeros_when_no_refresh_token(db: AsyncSession, test_user: User):
    """sync_calendar_events short-circuits when user has no google_refresh_token."""
    test_user.google_refresh_token = None
    db.add(test_user)
    await db.commit()

    result = await sync_calendar_events(test_user, db)

    assert result == {"new_contacts": 0, "new_interactions": 0, "events_processed": 0}


@pytest.mark.asyncio
async def test_sync_does_not_create_duplicate_contact(db: AsyncSession, test_user: User):
    """When a contact with matching email already exists, sync reuses it and does not create a duplicate."""
    test_user.google_refresh_token = "fake-refresh-token"
    att_email = "dave@example.com"
    existing_contact = Contact(
        id=uuid.uuid4(),
        user_id=test_user.id,
        full_name="Dave Existing",
        given_name="Dave",
        family_name="Existing",
        emails=[att_email],
        source="manual",
    )
    # Commit user (already created by fixture) and contact in one transaction
    db.add(existing_contact)
    await db.commit()

    event_time = (datetime.now(UTC) - timedelta(days=3)).isoformat()
    events = [
        _make_event(
            "evt006",
            "Recurring sync",
            event_time,
            attendees=[
                {"email": test_user.email},
                {"email": att_email, "displayName": "Dave Existing"},
            ],
        )
    ]

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=_mock_calendar_service(events),
    ):
        result = await sync_calendar_events(test_user, db)

    # Contact already existed — no new contact should be created
    assert result["new_contacts"] == 0
    # But a new interaction should be created for this event
    assert result["new_interactions"] == 1
    assert result["events_processed"] == 1

    contact_result = await db.execute(
        select(Contact).where(Contact.user_id == test_user.id)
    )
    contacts = contact_result.scalars().all()
    assert len(contacts) == 1


@pytest.mark.asyncio
async def test_sync_updates_last_interaction_at(db: AsyncSession, test_user: User):
    """sync_calendar_events updates contact.last_interaction_at for newer events."""
    test_user.google_refresh_token = "fake-refresh-token"

    # Create an existing contact with an old last_interaction_at
    old_time = datetime.now(UTC) - timedelta(days=60)
    contact = Contact(
        id=uuid.uuid4(),
        user_id=test_user.id,
        full_name="Eve Prior",
        given_name="Eve",
        family_name="Prior",
        emails=["eve@example.com"],
        source="manual",
        last_interaction_at=old_time,
    )
    db.add(contact)
    await db.commit()

    event_time = (datetime.now(UTC) - timedelta(days=2)).isoformat()
    events = [
        _make_event(
            "evt007",
            "Chat with Eve",
            event_time,
            attendees=[
                {"email": test_user.email},
                {"email": "eve@example.com", "displayName": "Eve Prior"},
            ],
        )
    ]

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=_mock_calendar_service(events),
    ):
        await sync_calendar_events(test_user, db)

    await db.refresh(contact)
    assert contact.last_interaction_at > old_time


@pytest.mark.asyncio
async def test_sync_handles_api_error_gracefully(db: AsyncSession, test_user: User):
    """sync_calendar_events propagates API errors so the caller can handle them."""
    test_user.google_refresh_token = "invalid-token"
    db.add(test_user)
    await db.commit()

    mock_service = MagicMock()
    (
        mock_service
        .events.return_value
        .list.return_value
        .execute.side_effect
    ) = Exception("Google API error: 401 Unauthorized")

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=mock_service,
    ):
        with pytest.raises(Exception, match="Google API error"):
            await sync_calendar_events(test_user, db)


@pytest.mark.asyncio
async def test_sync_multi_attendee_event_creates_multiple_contacts(
    db: AsyncSession, test_user: User
):
    """An event with multiple attendees creates a contact and interaction per attendee."""
    test_user.google_refresh_token = "fake-refresh-token"
    db.add(test_user)
    await db.commit()

    event_time = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    events = [
        _make_event(
            "evt008",
            "Team planning",
            event_time,
            attendees=[
                {"email": test_user.email},
                {"email": "frank@example.com", "displayName": "Frank"},
                {"email": "grace@example.com", "displayName": "Grace"},
            ],
        )
    ]

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=_mock_calendar_service(events),
    ):
        result = await sync_calendar_events(test_user, db)

    assert result["new_contacts"] == 2
    assert result["new_interactions"] == 2
    assert result["events_processed"] == 1


@pytest.mark.asyncio
async def test_sync_backfills_name_on_existing_nameless_contact(
    db: AsyncSession, test_user: User
):
    """When a contact without a name appears as attendee, their name is backfilled."""
    test_user.google_refresh_token = "fake-refresh-token"

    # Contact exists but has no name
    nameless = Contact(
        id=uuid.uuid4(),
        user_id=test_user.id,
        full_name=None,
        given_name=None,
        family_name=None,
        emails=["henry@example.com"],
        source="manual",
    )
    db.add(nameless)
    await db.commit()

    event_time = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    events = [
        _make_event(
            "evt009",
            "1:1 with Henry",
            event_time,
            attendees=[
                {"email": test_user.email},
                {"email": "henry@example.com", "displayName": "Henry Adams"},
            ],
        )
    ]

    with patch(
        "app.integrations.google_calendar._build_calendar_service",
        return_value=_mock_calendar_service(events),
    ):
        await sync_calendar_events(test_user, db)

    await db.refresh(nameless)
    assert nameless.full_name == "Henry Adams"
    assert nameless.given_name == "Henry"
    assert nameless.family_name == "Adams"
