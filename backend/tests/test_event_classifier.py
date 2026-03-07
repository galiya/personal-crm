"""Tests for event classifier service."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.event_classifier import (
    _parse_classifier_response,
    classify_tweet,
    classify_bio_change,
)


def test_parse_classifier_response_valid_json():
    raw = '{"event_type": "job_change", "confidence": 0.9, "summary": "New role at Google"}'
    result = _parse_classifier_response(raw)
    assert result["event_type"] == "job_change"
    assert result["confidence"] == 0.9
    assert result["summary"] == "New role at Google"


def test_parse_classifier_response_markdown_fenced():
    raw = '```json\n{"event_type": "fundraising", "confidence": 0.8, "summary": "Raised Series A"}\n```'
    result = _parse_classifier_response(raw)
    assert result["event_type"] == "fundraising"
    assert result["confidence"] == 0.8


def test_parse_classifier_response_invalid_json():
    raw = "this is not json"
    result = _parse_classifier_response(raw)
    assert result["event_type"] == "none"
    assert result["confidence"] == 0.0


def test_parse_classifier_response_invalid_event_type():
    raw = '{"event_type": "alien_invasion", "confidence": 0.5, "summary": "Aliens"}'
    result = _parse_classifier_response(raw)
    assert result["event_type"] == "none"


def test_parse_classifier_response_clamps_confidence():
    raw = '{"event_type": "job_change", "confidence": 1.5, "summary": "Test"}'
    result = _parse_classifier_response(raw)
    assert result["confidence"] == 1.0


@pytest.mark.asyncio
async def test_classify_tweet_no_api_key():
    with patch("app.services.event_classifier.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = ""
        result = await classify_tweet("Hello world", "testuser")
        assert result["event_type"] == "none"


@pytest.mark.asyncio
async def test_classify_tweet_with_mock_api():
    mock_content = MagicMock()
    mock_content.text = '{"event_type": "job_change", "confidence": 0.9, "summary": "Started new role"}'

    mock_response = MagicMock()
    mock_response.content = [mock_content]

    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    with patch("app.services.event_classifier.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        with patch("app.services.event_classifier._get_anthropic_client", return_value=mock_client):
            result = await classify_tweet("Excited to announce I'm joining Google!", "testuser")
            assert result["event_type"] == "job_change"
            assert result["confidence"] == 0.9


@pytest.mark.asyncio
async def test_classify_bio_change_with_mock_api():
    mock_content = MagicMock()
    mock_content.text = '{"event_type": "job_change", "confidence": 0.85, "summary": "Changed role"}'

    mock_response = MagicMock()
    mock_response.content = [mock_content]

    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    with patch("app.services.event_classifier.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        with patch("app.services.event_classifier._get_anthropic_client", return_value=mock_client):
            result = await classify_bio_change("Engineer at Startup", "CTO at BigCo", "testuser")
            assert result["event_type"] == "job_change"
