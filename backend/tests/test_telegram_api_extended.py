"""Extended tests for Telegram API endpoints.

Covers gaps not addressed by test_telegram_api.py:
- connect: PhoneNumberInvalid error -> specific 502 message
- connect: FloodWait error -> specific 502 message
- verify: SessionPasswordNeededError -> requires_2fa: true in response
- verify-2fa: success path (connected: True)
- verify-2fa: missing password -> 422
- verify-2fa: no active telegram_session -> 400
- verify-2fa: PasswordHashInvalid error -> specific 400 message
- verify-2fa: requires auth -> 401
- common-groups: redis cache hit returns cached DB groups without calling service
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token
from app.models.user import User


# ---------------------------------------------------------------------------
# POST /api/v1/auth/telegram/connect — specific error mappings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_phone_number_invalid_returns_502_with_specific_message(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    """connect endpoint maps PhoneNumberInvalidError to a human-readable 502 detail."""

    class PhoneNumberInvalidError(Exception):
        pass

    with patch(
        "app.integrations.telegram.connect_telegram",
        new=AsyncMock(side_effect=PhoneNumberInvalidError("bad number")),
    ):
        response = await client.post(
            "/api/v1/auth/telegram/connect",
            json={"phone": "+000"},
            headers=auth_headers,
        )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "Invalid phone number" in detail
    assert "international format" in detail.lower() or "+" in detail


@pytest.mark.asyncio
async def test_connect_flood_wait_returns_502_with_specific_message(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    """connect endpoint maps FloodWait errors to a human-readable 502 detail."""

    class FloodWaitError(Exception):
        pass

    with patch(
        "app.integrations.telegram.connect_telegram",
        new=AsyncMock(side_effect=FloodWaitError("wait 60s")),
    ):
        response = await client.post(
            "/api/v1/auth/telegram/connect",
            json={"phone": "+15551234567"},
            headers=auth_headers,
        )

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "Too many attempts" in detail or "wait" in detail.lower()


# ---------------------------------------------------------------------------
# POST /api/v1/auth/telegram/verify — 2FA redirect
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verify_session_password_needed_returns_requires_2fa(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    """verify endpoint returns requires_2fa: true when Telegram needs 2FA."""
    from telethon.errors import SessionPasswordNeededError

    with patch(
        "app.integrations.telegram.verify_telegram",
        new=AsyncMock(side_effect=SessionPasswordNeededError(request=None)),
    ):
        response = await client.post(
            "/api/v1/auth/telegram/verify",
            json={
                "phone": "+15551234567",
                "code": "12345",
                "phone_code_hash": "hash_abc",
            },
            headers=auth_headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"]["connected"] is False
    assert body["data"]["requires_2fa"] is True


# ---------------------------------------------------------------------------
# POST /api/v1/auth/telegram/verify-2fa
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verify_2fa_success_returns_connected_true(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
):
    """verify-2fa endpoint returns connected: True on correct password."""
    test_user.telegram_session = "partial_session_string"
    test_user.telegram_username = "myusername"
    db.add(test_user)
    await db.commit()

    token = create_access_token(data={"sub": str(test_user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.integrations.telegram.verify_telegram_2fa",
        new=AsyncMock(return_value=None),
    ):
        response = await client.post(
            "/api/v1/auth/telegram/verify-2fa",
            json={"password": "correct_password"},
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"]["connected"] is True
    assert body["data"]["username"] == "myusername"


@pytest.mark.asyncio
async def test_verify_2fa_missing_password_returns_422(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
):
    """verify-2fa endpoint returns 422 when password field is absent."""
    test_user.telegram_session = "session"
    db.add(test_user)
    await db.commit()

    token = create_access_token(data={"sub": str(test_user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/auth/telegram/verify-2fa",
        json={},
        headers=headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_verify_2fa_empty_password_returns_422(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
):
    """verify-2fa endpoint returns 422 when password is an empty string."""
    test_user.telegram_session = "session"
    db.add(test_user)
    await db.commit()

    token = create_access_token(data={"sub": str(test_user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/auth/telegram/verify-2fa",
        json={"password": ""},
        headers=headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_verify_2fa_without_session_returns_400(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    """verify-2fa endpoint returns 400 when user has no active telegram_session."""
    # test_user has telegram_session=None by default via auth_headers fixture
    response = await client.post(
        "/api/v1/auth/telegram/verify-2fa",
        json={"password": "somepassword"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "No active Telegram session" in detail or "connect" in detail.lower()


@pytest.mark.asyncio
async def test_verify_2fa_wrong_password_returns_400_with_specific_message(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
):
    """verify-2fa endpoint returns 400 with specific message on wrong password."""

    class PasswordHashInvalidError(Exception):
        pass

    test_user.telegram_session = "partial_session_string"
    db.add(test_user)
    await db.commit()

    token = create_access_token(data={"sub": str(test_user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.integrations.telegram.verify_telegram_2fa",
        new=AsyncMock(side_effect=PasswordHashInvalidError("bad pw")),
    ):
        response = await client.post(
            "/api/v1/auth/telegram/verify-2fa",
            json={"password": "wrong_password"},
            headers=headers,
        )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "Incorrect 2FA password" in detail or "2FA" in detail


@pytest.mark.asyncio
async def test_verify_2fa_generic_error_returns_400(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
):
    """verify-2fa endpoint returns 400 for unexpected integration errors."""
    test_user.telegram_session = "partial_session_string"
    db.add(test_user)
    await db.commit()

    token = create_access_token(data={"sub": str(test_user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.integrations.telegram.verify_telegram_2fa",
        new=AsyncMock(side_effect=RuntimeError("network error")),
    ):
        response = await client.post(
            "/api/v1/auth/telegram/verify-2fa",
            json={"password": "somepassword"},
            headers=headers,
        )

    assert response.status_code == 400
    assert "2FA" in response.json()["detail"] or "failed" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_2fa_requires_auth(client: AsyncClient):
    """verify-2fa endpoint returns 401 without auth headers."""
    response = await client.post(
        "/api/v1/auth/telegram/verify-2fa",
        json={"password": "somepassword"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/contacts/{contact_id}/telegram/common-groups — redis cache hit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_common_groups_returns_cached_groups_on_redis_hit(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
):
    """common-groups returns DB-cached groups when redis cache key exists (no Telegram call)."""
    from app.models.contact import Contact

    test_user.telegram_session = "session_string"
    db.add(test_user)
    await db.commit()

    cached_groups = [{"id": 123, "title": "Dev Group"}, {"id": 456, "title": "Work Chat"}]
    contact = Contact(
        user_id=test_user.id,
        full_name="Alice",
        telegram_username="alice_tg",
        telegram_common_groups=cached_groups,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)

    token = create_access_token(data={"sub": str(test_user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=1)  # cache hit

    with patch("app.core.redis.get_redis", return_value=mock_redis):
        with patch(
            "app.services.telegram_service.get_common_groups_cached",
            new=AsyncMock(return_value=[]),
        ) as mock_service:
            response = await client.get(
                f"/api/v1/contacts/{contact.id}/telegram/common-groups",
                headers=headers,
            )

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"] == cached_groups
    # Service must NOT be called when cache exists
    mock_service.assert_not_called()
