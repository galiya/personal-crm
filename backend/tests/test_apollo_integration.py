"""Tests for the Apollo People Enrichment API wrapper."""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.integrations.apollo import enrich_person


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_response(body: dict[str, Any], status_code: int = 200) -> MagicMock:
    """Return a mock httpx.Response."""
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = status_code
    mock_resp.json.return_value = body
    if status_code >= 400:
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            message=f"HTTP {status_code}",
            request=MagicMock(),
            response=mock_resp,
        )
    else:
        mock_resp.raise_for_status.return_value = None
    return mock_resp


FULL_PERSON_PAYLOAD: dict[str, Any] = {
    "person": {
        "first_name": "Jane",
        "last_name": "Doe",
        "name": "Jane Doe",
        "title": "VP Engineering",
        "email": "jane@example.com",
        "linkedin_url": "https://linkedin.com/in/janedoe",
        "twitter_url": "https://twitter.com/janedoe",
        "photo_url": "https://example.com/photo.jpg",
        "city": "San Francisco",
        "state": "CA",
        "country": "United States",
        "organization": {"name": "Acme Corp"},
        "phone_numbers": [
            {"sanitized_number": "+14155550100"},
            {"sanitized_number": "+14155550101"},
        ],
    }
}


# ---------------------------------------------------------------------------
# Test: successful enrichment returns all expected contact fields
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enrich_person_success_returns_contact_data():
    """A valid API response is normalised into the expected contact dict."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=_make_response(FULL_PERSON_PAYLOAD))

    with (
        patch("app.integrations.apollo.settings") as mock_settings,
        patch("app.integrations.apollo.httpx.AsyncClient") as mock_cls,
    ):
        mock_settings.APOLLO_API_KEY = "test-key-abc"
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await enrich_person(email="jane@example.com")

    assert result["given_name"] == "Jane"
    assert result["family_name"] == "Doe"
    assert result["full_name"] == "Jane Doe"
    assert result["title"] == "VP Engineering"
    assert result["company"] == "Acme Corp"
    assert result["location"] == "San Francisco, CA, United States"
    assert result["linkedin_url"] == "https://linkedin.com/in/janedoe"
    assert result["twitter_handle"] == "janedoe"
    assert result["avatar_url"] == "https://example.com/photo.jpg"
    assert result["emails"] == ["jane@example.com"]
    assert "+14155550100" in result["phones"]
    assert "+14155550101" in result["phones"]


# ---------------------------------------------------------------------------
# Test: parse response fields correctly (LinkedIn URL lookup, partial data)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enrich_person_partial_response_parsed_correctly():
    """Fields absent from the API response are simply omitted from the result."""
    partial_payload: dict[str, Any] = {
        "person": {
            "first_name": "Alice",
            "last_name": "Smith",
            "name": "Alice Smith",
            # no title, no org, no location, no twitter, no phones, no photo
        }
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=_make_response(partial_payload))

    with (
        patch("app.integrations.apollo.settings") as mock_settings,
        patch("app.integrations.apollo.httpx.AsyncClient") as mock_cls,
    ):
        mock_settings.APOLLO_API_KEY = "test-key-abc"
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await enrich_person(linkedin_url="https://linkedin.com/in/alicesmith")

    assert result["given_name"] == "Alice"
    assert result["family_name"] == "Smith"
    assert result["full_name"] == "Alice Smith"
    assert "title" not in result
    assert "company" not in result
    assert "location" not in result
    assert "twitter_handle" not in result
    assert "phones" not in result


# ---------------------------------------------------------------------------
# Test: handle API errors gracefully (HTTP 4xx/5xx)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enrich_person_api_error_returns_empty_dict():
    """An HTTP error from Apollo results in an empty dict (best-effort)."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=_make_response({}, status_code=429))

    with (
        patch("app.integrations.apollo.settings") as mock_settings,
        patch("app.integrations.apollo.httpx.AsyncClient") as mock_cls,
    ):
        mock_settings.APOLLO_API_KEY = "test-key-abc"
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await enrich_person(email="rate-limited@example.com")

    assert result == {}


@pytest.mark.asyncio
async def test_enrich_person_network_error_returns_empty_dict():
    """A network-level exception from httpx results in an empty dict."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))

    with (
        patch("app.integrations.apollo.settings") as mock_settings,
        patch("app.integrations.apollo.httpx.AsyncClient") as mock_cls,
    ):
        mock_settings.APOLLO_API_KEY = "test-key-abc"
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await enrich_person(email="offline@example.com")

    assert result == {}


# ---------------------------------------------------------------------------
# Test: handle missing / invalid API key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enrich_person_missing_api_key_returns_empty_dict():
    """When APOLLO_API_KEY is falsy, no HTTP call is made and {} is returned."""
    with (
        patch("app.integrations.apollo.settings") as mock_settings,
        patch("app.integrations.apollo.httpx.AsyncClient") as mock_cls,
    ):
        mock_settings.APOLLO_API_KEY = ""  # not configured
        mock_cls.return_value.__aenter__ = AsyncMock()
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await enrich_person(email="test@example.com")

    assert result == {}
    mock_cls.assert_not_called()


@pytest.mark.asyncio
async def test_enrich_person_no_identifier_returns_empty_dict():
    """When neither email nor linkedin_url is provided, {} is returned immediately."""
    with patch("app.integrations.apollo.settings") as mock_settings:
        mock_settings.APOLLO_API_KEY = "test-key-abc"

        result = await enrich_person()

    assert result == {}


# ---------------------------------------------------------------------------
# Test: Apollo returns a response with no "person" key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enrich_person_empty_person_object_returns_empty_dict():
    """When the API returns an empty/missing person block, {} is returned."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=_make_response({"person": None}))

    with (
        patch("app.integrations.apollo.settings") as mock_settings,
        patch("app.integrations.apollo.httpx.AsyncClient") as mock_cls,
    ):
        mock_settings.APOLLO_API_KEY = "test-key-abc"
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await enrich_person(email="ghost@example.com")

    assert result == {}


# ---------------------------------------------------------------------------
# Test: Twitter handle extraction strips @ prefix and trailing slash
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_enrich_person_twitter_handle_extraction():
    """Twitter handle is extracted correctly from various URL formats."""
    payload: dict[str, Any] = {
        "person": {
            "name": "Bob",
            "twitter_url": "https://twitter.com/@bobhandle/",
        }
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=_make_response(payload))

    with (
        patch("app.integrations.apollo.settings") as mock_settings,
        patch("app.integrations.apollo.httpx.AsyncClient") as mock_cls,
    ):
        mock_settings.APOLLO_API_KEY = "test-key-abc"
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await enrich_person(email="bob@example.com")

    assert result["twitter_handle"] == "bobhandle"
