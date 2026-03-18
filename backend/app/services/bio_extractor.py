"""AI-powered structured data extraction from contact bios using Claude Haiku."""
from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_MODEL = "claude-haiku-4-5-20251001"
_RETRY_MAX_ATTEMPTS = 3
_RETRY_BASE_DELAY = 1.0
_RETRY_BACKOFF_FACTOR = 2.0


def _get_anthropic_client():
    from anthropic import AsyncAnthropic
    return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


def _parse_json_response(raw: str) -> Any:
    """Parse JSON from LLM response, handling markdown code fences."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        lines = lines[1:] if lines else lines
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("bio_extractor: could not parse LLM response: %r", raw[:200])
        return None


async def _call_with_retry(client, **kwargs) -> Any:
    """Call Anthropic API with exponential backoff on transient errors."""
    from anthropic import APIStatusError

    transient_codes = {429, 500, 529}
    last_exc: Exception | None = None

    for attempt in range(_RETRY_MAX_ATTEMPTS):
        try:
            return await asyncio.wait_for(
                client.messages.create(**kwargs),
                timeout=30,
            )
        except APIStatusError as exc:
            if exc.status_code not in transient_codes:
                raise
            last_exc = exc
        except asyncio.TimeoutError as exc:
            last_exc = exc

        if attempt < _RETRY_MAX_ATTEMPTS - 1:
            delay = _RETRY_BASE_DELAY * (_RETRY_BACKOFF_FACTOR ** attempt)
            jitter = random.uniform(-0.5, 0.5)
            await asyncio.sleep(max(0.0, delay + jitter))

    raise last_exc  # type: ignore[misc]


async def extract_from_bios(
    *,
    full_name: str | None = None,
    given_name: str | None = None,
    family_name: str | None = None,
    title: str | None = None,
    company: str | None = None,
    twitter_bio: str | None = None,
    telegram_bio: str | None = None,
    linkedin_bio: str | None = None,
    linkedin_headline: str | None = None,
) -> dict[str, str]:
    """Extract structured contact and company info from bios using Haiku.

    Returns a dict with any of these keys (only non-empty extractions):
        - given_name, family_name
        - title
        - company, company_website, company_industry, company_location
    """
    # Build context block
    parts: list[str] = []
    if full_name:
        parts.append(f"Full name: {full_name}")
    if given_name:
        parts.append(f"First name: {given_name}")
    if family_name:
        parts.append(f"Last name: {family_name}")
    if title:
        parts.append(f"Current title: {title}")
    if company:
        parts.append(f"Current company: {company}")
    if twitter_bio:
        parts.append(f"Twitter bio: {twitter_bio}")
    if telegram_bio:
        parts.append(f"Telegram bio: {telegram_bio}")
    if linkedin_headline:
        parts.append(f"LinkedIn headline: {linkedin_headline}")
    if linkedin_bio:
        parts.append(f"LinkedIn bio: {linkedin_bio}")

    if not any([twitter_bio, telegram_bio, linkedin_bio, linkedin_headline, full_name]):
        return {}

    contact_info = "\n".join(parts)

    prompt = f"""Extract structured information from this contact's profile data.

<contact>
{contact_info}
</contact>

Rules:
1. If the full name contains separators like "|", "/", "—", "at", or similar patterns that indicate "Name | Company" or "Name / Role at Company", split them into the correct fields.
2. Extract the person's current job title and company from bios.
3. If a company website URL is mentioned in any bio, extract it.
4. If the company's industry can be clearly inferred, include it.
5. If a location is mentioned, extract it.
6. Only return fields you are confident about. Omit uncertain fields.
7. For given_name and family_name, return the cleaned personal name only (no company/role).

Return JSON only, no explanation. Use exactly these keys (omit any that are empty/unknown):
{{
  "given_name": "first name",
  "family_name": "last name",
  "title": "job title",
  "company": "company name",
  "company_website": "https://...",
  "company_industry": "industry",
  "company_location": "city, country"
}}"""

    client = _get_anthropic_client()
    response = await _call_with_retry(
        client,
        model=_MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text
    parsed = _parse_json_response(raw)
    if not isinstance(parsed, dict):
        return {}

    # Filter to only non-empty string values with known keys
    allowed_keys = {
        "given_name", "family_name", "title", "company",
        "company_website", "company_industry", "company_location",
    }
    return {
        k: str(v).strip()
        for k, v in parsed.items()
        if k in allowed_keys and v and str(v).strip()
    }
