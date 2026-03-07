"""Tests for Google OAuth callback in auth API."""
from unittest.mock import patch

import pytest
import fakeredis.aioredis
from httpx import AsyncClient


_fake_redis_instance = None


@pytest.fixture(autouse=True)
def _patch_redis():
    """Patch get_redis to use fakeredis for all tests in this module."""
    global _fake_redis_instance
    fr = fakeredis.aioredis.FakeRedis(decode_responses=True)
    _fake_redis_instance = fr
    with patch("app.core.redis.get_redis", return_value=fr), \
         patch("app.api.auth.get_redis", return_value=fr):
        yield fr
    _fake_redis_instance = None


async def _inject_state(state: str = "test-state-123") -> str:
    """Insert a valid state nonce into the Redis-backed Google state store."""
    from app.api.auth import _store_google_state
    await _store_google_state(state, "test-user-id")
    return state


@pytest.mark.asyncio
async def test_google_url_returns_oauth_url(client: AsyncClient, auth_headers: dict):
    """GET /auth/google/url returns an authorization URL when credentials are configured."""
    with patch("app.api.auth.settings") as mock_settings, \
         patch("app.api.auth.build_oauth_url", return_value=("https://accounts.google.com/o/oauth2/auth?mock=1", "state123")):
        mock_settings.GOOGLE_CLIENT_ID = "test-client-id"
        mock_settings.GOOGLE_CLIENT_SECRET = "test-client-secret"
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 1440
        resp = await client.get("/api/v1/auth/google/url", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "url" in data
    assert data["url"].startswith("https://accounts.google.com")
    assert "state" in data


@pytest.mark.asyncio
async def test_google_url_stores_state_nonce(client: AsyncClient, auth_headers: dict):
    """GET /auth/google/url stores the state in Redis."""
    with patch("app.api.auth.settings") as mock_settings, \
         patch("app.api.auth.build_oauth_url", return_value=("https://accounts.google.com/mock", "nonce-abc")):
        mock_settings.GOOGLE_CLIENT_ID = "test-client-id"
        mock_settings.GOOGLE_CLIENT_SECRET = "test-client-secret"
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 1440
        resp = await client.get("/api/v1/auth/google/url", headers=auth_headers)

    assert resp.status_code == 200
    # Verify the state was stored in Redis
    assert await _fake_redis_instance.exists("oauth_state:nonce-abc")


@pytest.mark.asyncio
async def test_google_url_without_credentials(client: AsyncClient, auth_headers: dict):
    """GET /auth/google/url returns 400 when GOOGLE_CLIENT_ID is not set."""
    with patch("app.api.auth.settings") as mock_settings:
        mock_settings.GOOGLE_CLIENT_ID = ""
        mock_settings.GOOGLE_CLIENT_SECRET = ""
        resp = await client.get("/api/v1/auth/google/url", headers=auth_headers)
    assert resp.status_code == 400
    assert "not configured" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_google_url_requires_auth(client: AsyncClient):
    """GET /auth/google/url returns 401 without auth headers."""
    resp = await client.get("/api/v1/auth/google/url")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_google_callback_missing_state(client: AsyncClient):
    """POST /auth/google/callback returns 400 when state is missing."""
    resp = await client.post(
        "/api/v1/auth/google/callback",
        json={"code": "valid-code"},
    )
    assert resp.status_code == 400
    assert "state" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_google_callback_invalid_state(client: AsyncClient):
    """POST /auth/google/callback returns 400 when state doesn't match any stored nonce."""
    resp = await client.post(
        "/api/v1/auth/google/callback",
        json={"code": "valid-code", "state": "bogus-state"},
    )
    assert resp.status_code == 400
    assert "state" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_google_callback_state_consumed_once(client: AsyncClient):
    """State nonce is consumed on first use and cannot be replayed."""
    state = await _inject_state("one-time-state")
    mock_tokens = {"id_token": "fake", "refresh_token": "ref"}
    id_info = {"email": "onetime@example.com", "name": "One Time", "sub": "789"}

    with patch("app.api.auth.exchange_code", return_value=mock_tokens), \
         patch("app.api.auth.google_id_token.verify_oauth2_token", return_value=id_info):
        resp1 = await client.post(
            "/api/v1/auth/google/callback",
            json={"code": "valid-code", "state": state},
        )
    assert resp1.status_code == 200

    # Second attempt with same state should fail
    resp2 = await client.post(
        "/api/v1/auth/google/callback",
        json={"code": "valid-code", "state": state},
    )
    assert resp2.status_code == 400


@pytest.mark.asyncio
async def test_google_callback_exchange_fails(client: AsyncClient):
    """POST /auth/google/callback returns 400 when code exchange fails."""
    state = await _inject_state("exchange-fail-state")
    with patch("app.api.auth.exchange_code", side_effect=RuntimeError("bad code")):
        resp = await client.post(
            "/api/v1/auth/google/callback",
            json={"code": "bad-code", "state": state},
        )
    assert resp.status_code == 400
    assert "Failed to exchange" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_google_callback_invalid_id_token(client: AsyncClient):
    """POST /auth/google/callback returns 400 when id_token verification fails."""
    state = await _inject_state("invalid-token-state")
    mock_tokens = {"id_token": "fake", "refresh_token": "ref"}
    with patch("app.api.auth.exchange_code", return_value=mock_tokens), \
         patch("app.api.auth.google_id_token.verify_oauth2_token", side_effect=ValueError("bad token")):
        resp = await client.post(
            "/api/v1/auth/google/callback",
            json={"code": "valid-code", "state": state},
        )
    assert resp.status_code == 400
    assert "Invalid Google ID token" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_google_callback_no_email(client: AsyncClient):
    """POST /auth/google/callback returns 400 when id_token has no email."""
    state = await _inject_state("no-email-state")
    mock_tokens = {"id_token": "fake", "refresh_token": "ref"}
    with patch("app.api.auth.exchange_code", return_value=mock_tokens), \
         patch("app.api.auth.google_id_token.verify_oauth2_token", return_value={"sub": "123"}):
        resp = await client.post(
            "/api/v1/auth/google/callback",
            json={"code": "valid-code", "state": state},
        )
    assert resp.status_code == 400
    assert "does not provide an email" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_google_callback_new_user(client: AsyncClient):
    """POST /auth/google/callback creates a new user when email not found."""
    state = await _inject_state("new-user-state")
    mock_tokens = {"id_token": "fake", "refresh_token": "ref"}
    id_info = {"email": "google@example.com", "name": "Google User", "sub": "123"}
    with patch("app.api.auth.exchange_code", return_value=mock_tokens), \
         patch("app.api.auth.google_id_token.verify_oauth2_token", return_value=id_info):
        resp = await client.post(
            "/api/v1/auth/google/callback",
            json={"code": "valid-code", "state": state},
        )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_google_callback_existing_user(client: AsyncClient):
    """POST /auth/google/callback logs in existing user and updates refresh token."""
    # First create the user via register
    await client.post("/api/v1/auth/register", json={
        "email": "existing@example.com",
        "password": "securepass123",
    })

    state = await _inject_state("existing-user-state")
    mock_tokens = {"id_token": "fake", "refresh_token": "new_refresh"}
    id_info = {"email": "existing@example.com", "name": "Existing", "sub": "456"}
    with patch("app.api.auth.exchange_code", return_value=mock_tokens), \
         patch("app.api.auth.google_id_token.verify_oauth2_token", return_value=id_info):
        resp = await client.post(
            "/api/v1/auth/google/callback",
            json={"code": "valid-code", "state": state},
        )
    assert resp.status_code == 200
    assert "access_token" in resp.json()["data"]
