"""Tests for the LinkedIn Chrome Extension push endpoint."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.interaction import Interaction


PUSH_URL = "/api/v1/linkedin/push"


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_requires_auth(client: AsyncClient):
    """Unauthenticated requests must be rejected with 401."""
    resp = await client.post(PUSH_URL, json={"profiles": [], "messages": []})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Profile push — new contact creation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_creates_new_contact(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
):
    """A profile push for an unknown profile_id should create a new contact."""
    payload = {
        "profiles": [
            {
                "profile_id": "alice-smith-123",
                "profile_url": "https://www.linkedin.com/in/alice-smith-123",
                "full_name": "Alice Smith",
                "headline": "Product Manager at Acme",
                "company": "Acme",
                "location": "San Francisco",
            }
        ],
        "messages": [],
    }

    resp = await client.post(PUSH_URL, json=payload, headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["contacts_created"] == 1
    assert data["contacts_updated"] == 0
    assert data["interactions_created"] == 0
    assert data["interactions_skipped"] == 0

    # Verify the contact is actually in the DB
    result = await db.execute(
        select(Contact).where(Contact.linkedin_profile_id == "alice-smith-123")
    )
    contact = result.scalar_one_or_none()
    assert contact is not None
    assert contact.full_name == "Alice Smith"
    assert contact.company == "Acme"
    assert contact.source == "linkedin-extension"


# ---------------------------------------------------------------------------
# Profile push — existing contact update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_updates_existing_contact(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    test_user,
):
    """A profile push matching an existing contact should update its fields."""
    # Pre-create a contact with a known linkedin_profile_id
    existing = Contact(
        user_id=test_user.id,
        full_name="Bob Jones",
        linkedin_profile_id="bob-jones-456",
        source="manual",
    )
    db.add(existing)
    await db.commit()
    await db.refresh(existing)

    payload = {
        "profiles": [
            {
                "profile_id": "bob-jones-456",
                "profile_url": "https://www.linkedin.com/in/bob-jones-456",
                "full_name": "Bob Jones",
                "headline": "Engineer at StartupCo",
                "company": "StartupCo",
            }
        ],
        "messages": [],
    }

    resp = await client.post(PUSH_URL, json=payload, headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["contacts_created"] == 0
    assert data["contacts_updated"] == 1

    # Verify updated fields in DB
    await db.refresh(existing)
    assert existing.linkedin_headline == "Engineer at StartupCo"
    assert existing.company == "StartupCo"


# ---------------------------------------------------------------------------
# Message push — interaction creation and dedup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_creates_interactions(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
):
    """Messages in the payload should create Interaction records."""
    payload = {
        "profiles": [],
        "messages": [
            {
                "profile_id": "carol-white-789",
                "profile_name": "Carol White",
                "direction": "inbound",
                "content_preview": "Hey, great meeting you!",
                "timestamp": "2026-01-15T10:00:00+00:00",
                "conversation_id": "conv-001",
                "content_hash": "hash-abc123",
            }
        ],
    }

    resp = await client.post(PUSH_URL, json=payload, headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()["data"]
    # Contact auto-created from message
    assert data["contacts_created"] == 1
    assert data["interactions_created"] == 1
    assert data["interactions_skipped"] == 0

    # Verify interaction in DB
    result = await db.execute(
        select(Interaction).where(
            Interaction.raw_reference_id == "linkedin:conv-001:hash-abc123"
        )
    )
    interaction = result.scalar_one_or_none()
    assert interaction is not None
    assert interaction.platform == "linkedin"
    assert interaction.direction == "inbound"
    assert interaction.content_preview == "Hey, great meeting you!"


@pytest.mark.asyncio
async def test_push_deduplicates_interactions(
    client: AsyncClient,
    auth_headers: dict,
):
    """Sending the same message twice should skip the duplicate on the second push."""
    message = {
        "profile_id": "dave-green-999",
        "profile_name": "Dave Green",
        "direction": "outbound",
        "content_preview": "Looking forward to connecting.",
        "timestamp": "2026-02-01T09:00:00+00:00",
        "conversation_id": "conv-002",
        "content_hash": "hash-dup999",
    }
    payload = {"profiles": [], "messages": [message]}

    # First push — should create
    resp1 = await client.post(PUSH_URL, json=payload, headers=auth_headers)
    assert resp1.status_code == 200
    assert resp1.json()["data"]["interactions_created"] == 1
    assert resp1.json()["data"]["interactions_skipped"] == 0

    # Second push — should skip (duplicate)
    resp2 = await client.post(PUSH_URL, json=payload, headers=auth_headers)
    assert resp2.status_code == 200
    assert resp2.json()["data"]["interactions_created"] == 0
    assert resp2.json()["data"]["interactions_skipped"] == 1


# ---------------------------------------------------------------------------
# Empty payload
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_empty_payload(client: AsyncClient, auth_headers: dict):
    """An empty push should succeed and return all-zero counts."""
    resp = await client.post(PUSH_URL, json={}, headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["contacts_created"] == 0
    assert data["contacts_updated"] == 0
    assert data["interactions_created"] == 0
    assert data["interactions_skipped"] == 0


# ---------------------------------------------------------------------------
# Match contact by linkedin_url when profile_id is absent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_push_matches_contact_by_linkedin_url(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    test_user,
):
    """If a contact exists with a matching linkedin_url, update it instead of creating."""
    existing = Contact(
        user_id=test_user.id,
        full_name="Eve Adams",
        linkedin_url="https://www.linkedin.com/in/eve-adams",
        source="manual",
    )
    db.add(existing)
    await db.commit()
    await db.refresh(existing)

    payload = {
        "profiles": [
            {
                "profile_id": "eve-adams",
                "profile_url": "https://www.linkedin.com/in/eve-adams",
                "full_name": "Eve Adams",
                "headline": "Designer",
            }
        ],
        "messages": [],
    }

    resp = await client.post(PUSH_URL, json=payload, headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()["data"]
    assert data["contacts_created"] == 0
    assert data["contacts_updated"] == 1

    await db.refresh(existing)
    assert existing.linkedin_profile_id == "eve-adams"
    assert existing.linkedin_headline == "Designer"
