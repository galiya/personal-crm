"""Tests for suggestions API endpoints."""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.models.follow_up import FollowUpSuggestion


@pytest.mark.asyncio
async def test_list_suggestions(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    resp = await client.get("/api/v1/suggestions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1
    assert data[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_update_suggestion_dismiss(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    resp = await client.put(f"/api/v1/suggestions/{test_suggestion.id}", json={
        "status": "dismissed",
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "dismissed"


@pytest.mark.asyncio
async def test_update_suggestion_snooze_requires_datetime(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    resp = await client.put(f"/api/v1/suggestions/{test_suggestion.id}", json={
        "status": "snoozed",
    }, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_suggestion_snooze_with_datetime(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    future = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    resp = await client.put(f"/api/v1/suggestions/{test_suggestion.id}", json={
        "status": "snoozed",
        "snooze_until": future,
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "snoozed"


@pytest.mark.asyncio
async def test_update_suggestion_invalid_status(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    resp = await client.put(f"/api/v1/suggestions/{test_suggestion.id}", json={
        "status": "invalid_status",
    }, headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_suggestion_not_found(client: AsyncClient, auth_headers: dict):
    resp = await client.put(f"/api/v1/suggestions/{uuid.uuid4()}", json={
        "status": "dismissed",
    }, headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_suggestion_sent_updates_followup_at(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    resp = await client.put(f"/api/v1/suggestions/{test_suggestion.id}", json={
        "status": "sent",
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "sent"


@pytest.mark.asyncio
async def test_update_suggestion_persists_edited_message(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    """PUT /suggestions/{id} persists an edited message and channel."""
    resp = await client.put(f"/api/v1/suggestions/{test_suggestion.id}", json={
        "status": "sent",
        "suggested_message": "Edited draft for John",
        "suggested_channel": "telegram",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["suggested_message"] == "Edited draft for John"
    assert data["suggested_channel"] == "telegram"


@pytest.mark.asyncio
async def test_update_suggestion_partial_message_only(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    """PUT /suggestions/{id} can update just the message without changing channel."""
    original_channel = test_suggestion.suggested_channel
    resp = await client.put(f"/api/v1/suggestions/{test_suggestion.id}", json={
        "status": "pending",
        "suggested_message": "Only message changed",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["suggested_message"] == "Only message changed"
    assert data["suggested_channel"] == original_channel


@pytest.mark.asyncio
async def test_regenerate_suggestion(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    """POST /suggestions/{id}/regenerate returns a new AI-generated message."""
    from unittest.mock import AsyncMock, patch

    with patch(
        "app.services.message_composer.compose_followup_message",
        new=AsyncMock(return_value="Fresh AI-generated message"),
    ):
        resp = await client.post(
            f"/api/v1/suggestions/{test_suggestion.id}/regenerate",
            json={"channel": "telegram"},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["suggested_message"] == "Fresh AI-generated message"
    assert data["suggested_channel"] == "telegram"


@pytest.mark.asyncio
async def test_regenerate_suggestion_not_found(client: AsyncClient, auth_headers: dict):
    """POST /suggestions/{id}/regenerate returns 404 for unknown suggestion."""
    resp = await client.post(
        f"/api/v1/suggestions/{uuid.uuid4()}/regenerate",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_regenerate_suggestion_uses_existing_channel(client: AsyncClient, auth_headers: dict, test_suggestion: FollowUpSuggestion):
    """POST /suggestions/{id}/regenerate falls back to existing channel when none specified."""
    from unittest.mock import AsyncMock, patch

    with patch(
        "app.services.message_composer.compose_followup_message",
        new=AsyncMock(return_value="Regenerated with default channel"),
    ):
        resp = await client.post(
            f"/api/v1/suggestions/{test_suggestion.id}/regenerate",
            json={},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["suggested_channel"] == test_suggestion.suggested_channel
