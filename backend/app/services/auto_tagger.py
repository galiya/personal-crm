"""AI-powered tag discovery and assignment using Anthropic Claude."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_MODEL = "claude-haiku-4-5-20251001"
_BATCH_SIZE = 50

# Reuse retry/semaphore patterns from event_classifier
_llm_semaphore = asyncio.Semaphore(5)
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
        logger.warning("_parse_json_response: could not parse: %r", raw[:200])
        return None


async def _call_with_retry(client, **kwargs) -> Any:
    """Call Anthropic API with exponential backoff on transient errors."""
    from anthropic import APIStatusError
    import random

    transient_codes = {429, 500, 529}
    last_exc: Exception | None = None

    for attempt in range(_RETRY_MAX_ATTEMPTS):
        try:
            return await asyncio.wait_for(
                client.messages.create(**kwargs),
                timeout=60,
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


def _sanitize(value: str, max_len: int = 200) -> str:
    """Sanitize a user-supplied string before interpolating into an LLM prompt.

    Wraps the value in structural delimiters so injected instructions inside
    contact fields cannot be misread as system-level instructions.
    Truncates to max_len and strips control characters.
    """
    # Truncate and strip control chars (keep newlines for bios)
    cleaned = value[:max_len].replace("\r", "")
    return f"<value>{cleaned}</value>"


def _build_contact_summary(contact_data: dict) -> str:
    """Build a concise text summary of a contact for the LLM."""
    parts = []
    if contact_data.get("full_name"):
        parts.append(f"Name: {_sanitize(contact_data['full_name'], 100)}")
    if contact_data.get("title"):
        parts.append(f"Title: {_sanitize(contact_data['title'], 100)}")
    if contact_data.get("company"):
        parts.append(f"Company: {_sanitize(contact_data['company'], 100)}")
    if contact_data.get("twitter_bio"):
        parts.append(f"Twitter bio: {_sanitize(contact_data['twitter_bio'], 200)}")
    if contact_data.get("telegram_bio"):
        parts.append(f"Telegram bio: {_sanitize(contact_data['telegram_bio'], 200)}")
    if contact_data.get("notes"):
        # Filter out bio sentinel lines
        notes = contact_data["notes"]
        lines = [l for l in notes.splitlines() if not l.startswith("__twitter_bio__:")]
        trimmed = "\n".join(lines)[:300]
        if trimmed.strip():
            parts.append(f"Notes: {_sanitize(trimmed, 300)}")
    if contact_data.get("tags"):
        tags_str = ", ".join(str(t)[:50] for t in contact_data["tags"][:20])
        parts.append(f"Existing tags: {_sanitize(tags_str, 500)}")
    if contact_data.get("location"):
        parts.append(f"Location: {_sanitize(contact_data['location'], 100)}")
    if contact_data.get("interaction_topics"):
        topics = [str(t)[:100] for t in contact_data["interaction_topics"][:10]]
        topics_str = ", ".join(topics)
        parts.append(f"Interaction topics: {_sanitize(topics_str, 500)}")
    return "\n".join(parts) if parts else "(minimal data)"


async def discover_taxonomy(contacts_summary: list[dict]) -> dict[str, list[str]]:
    """Phase 1: Scan contacts and propose a categorized tag taxonomy.

    Args:
        contacts_summary: List of dicts with contact fields (name, title, company, bios, etc.)

    Returns:
        Dict mapping category names to lists of tag strings.
    """
    if not settings.ANTHROPIC_API_KEY:
        logger.warning("discover_taxonomy: ANTHROPIC_API_KEY not configured.")
        return {}

    if not contacts_summary:
        return {}

    client = _get_anthropic_client()

    # Batch contacts
    batches: list[list[dict]] = []
    for i in range(0, len(contacts_summary), _BATCH_SIZE):
        batches.append(contacts_summary[i:i + _BATCH_SIZE])

    all_categories: dict[str, set[str]] = {}

    for batch_idx, batch in enumerate(batches):
        summaries = []
        for i, c in enumerate(batch):
            summaries.append(f"Contact {i + 1}:\n{_build_contact_summary(c)}")

        prompt = (
            "You are analysing a batch of professional contacts to discover common themes "
            "and propose a tag taxonomy.\n\n"
            "Here are the contacts:\n\n"
            + "\n---\n".join(summaries)
            + "\n\n"
            "Based on these contacts, propose a categorized tag taxonomy. "
            "Categories should be broad groups like: Role/Expertise, Industry, Events, "
            "Interests/Hobbies, Cohort/Program, Geography, etc.\n"
            "Tags should be specific, human-readable labels like: \"UX Designer\", "
            "\"ETHdenver 2026\", \"AI Enthusiast\", \"YC W22\", \"Wine Collector\".\n\n"
            "Return ONLY a JSON object where keys are category names and values are arrays of tags.\n"
            "Example: {\"Role\": [\"UX Designer\", \"Solidity Dev\"], \"Events\": [\"ETHdenver 2026\"]}\n"
            "Do not include any other text."
        )

        try:
            async with _llm_semaphore:
                message = await _call_with_retry(
                    client,
                    model=_MODEL,
                    max_tokens=2048,
                    messages=[{"role": "user", "content": prompt}],
                )
            raw = message.content[0].text if message.content else ""
            parsed = _parse_json_response(raw)

            if isinstance(parsed, dict):
                for category, tags in parsed.items():
                    if isinstance(tags, list):
                        if category not in all_categories:
                            all_categories[category] = set()
                        for tag in tags:
                            if isinstance(tag, str) and tag.strip():
                                all_categories[category].add(tag.strip())
        except Exception:
            logger.exception("discover_taxonomy: batch %d/%d failed.", batch_idx + 1, len(batches))
            # If the first batch fails, re-raise so the caller can surface the error
            if batch_idx == 0 and not all_categories:
                raise

    # Convert sets to sorted lists
    return {cat: sorted(tags) for cat, tags in all_categories.items() if tags}


async def deduplicate_taxonomy(
    raw_taxonomy: dict[str, list[str]],
) -> dict[str, list[str]]:
    """Post-discovery pass: merge near-duplicate tags and categories via LLM.

    Examples of merges:
    - "COO" + "Chief Operating Officer" → "COO"
    - "VC/Investment" + "Venture Capital" → "Venture Capital"
    - Categories "Role/Expertise" + "Role" → "Role/Expertise"
    """
    if not settings.ANTHROPIC_API_KEY:
        logger.warning("deduplicate_taxonomy: ANTHROPIC_API_KEY not configured.")
        return raw_taxonomy

    # Guard: skip if taxonomy is empty or small (≤10 tags total)
    total_tags = sum(len(tags) for tags in raw_taxonomy.values())
    if total_tags <= 10:
        logger.info("deduplicate_taxonomy: skipping (only %d tags).", total_tags)
        return raw_taxonomy

    taxonomy_json = json.dumps(raw_taxonomy, indent=2)

    prompt = (
        "You are deduplicating a tag taxonomy. Merge near-duplicate entries aggressively.\n\n"
        "Rules:\n"
        "1. Aggressively merge categories that overlap, are subsets, or cover the same domain. "
        "Examples: \"Role/Title\" + \"Role/Expertise\" → \"Role\", "
        "\"Industry\" + \"Industry/Specialization\" → \"Industry\", "
        "\"Interest\" + \"Interests/Hobbies\" → \"Interests\". "
        "Combine all tags from merged categories into the surviving one\n"
        "2. Merge tags that are abbreviations, acronyms, or synonyms "
        "(e.g. \"COO\" + \"Chief Operating Officer\" → \"COO\", "
        "\"VC/Investment\" + \"Venture Capital\" → \"Venture Capital\")\n"
        "3. Merge tags that differ only by seniority prefix or minor qualifier "
        "(e.g. \"Senior Venture Principal\" + \"Venture Principal\" → \"Venture Principal\", "
        "\"VC/Investor\" + \"Venture Capital\" → \"VC/Investor\")\n"
        "4. When multiple tags cover the same role/concept, keep ONE canonical form — "
        "the shorter, more commonly used version\n"
        "5. If the same or very similar tag appears in multiple categories, keep it in "
        "only the MOST appropriate category and remove it from the others "
        "(e.g. \"Token Vesting\" in both \"Interest\" and \"Industry\" → keep only in \"Industry\")\n"
        "6. Do NOT remove tags that are genuinely different in meaning\n\n"
        f"Input taxonomy:\n{taxonomy_json}\n\n"
        "Return ONLY the deduplicated JSON object. Same format: "
        "keys are category names, values are arrays of tag strings."
    )

    try:
        client = _get_anthropic_client()
        async with _llm_semaphore:
            message = await _call_with_retry(
                client,
                model=_MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
        raw = message.content[0].text if message.content else ""
        parsed = _parse_json_response(raw)

        if isinstance(parsed, dict) and all(
            isinstance(v, list) and all(isinstance(t, str) for t in v)
            for v in parsed.values()
        ):
            deduped_total = sum(len(tags) for tags in parsed.values())
            logger.info(
                "deduplicate_taxonomy: %d categories/%d tags → %d categories/%d tags",
                len(raw_taxonomy),
                total_tags,
                len(parsed),
                deduped_total,
            )
            return parsed

        logger.warning("deduplicate_taxonomy: unexpected response structure, returning original.")
        return raw_taxonomy
    except Exception:
        logger.exception("deduplicate_taxonomy: LLM call failed, returning original taxonomy.")
        return raw_taxonomy


async def assign_tags(
    contact_data: dict,
    taxonomy: dict[str, list[str]],
    *,
    client=None,
) -> list[str]:
    """Phase 2: Assign tags to a single contact from the approved taxonomy.

    Args:
        contact_data: Dict with contact fields.
        taxonomy: The approved taxonomy (category -> tags).
        client: Optional pre-created AsyncAnthropic client (reuse to avoid connection leaks).

    Returns:
        List of tag strings to assign.
    """
    if not settings.ANTHROPIC_API_KEY:
        logger.warning("assign_tags: ANTHROPIC_API_KEY not configured.")
        return []

    if client is None:
        client = _get_anthropic_client()

    # Flatten taxonomy for prompt
    taxonomy_lines = []
    for category, tags in taxonomy.items():
        taxonomy_lines.append(f"  {category}: {', '.join(tags)}")
    taxonomy_text = "\n".join(taxonomy_lines)

    summary = _build_contact_summary(contact_data)

    prompt = (
        "You are tagging a professional contact using an approved taxonomy.\n\n"
        f"Approved taxonomy:\n{taxonomy_text}\n\n"
        f"Contact:\n{summary}\n\n"
        "Select all tags from the taxonomy that apply to this contact. "
        "You may also suggest up to 2 new tags not in the taxonomy (prefix with \"NEW: \").\n\n"
        "Return ONLY a JSON object with:\n"
        "- \"tags\": array of tag strings from the taxonomy\n"
        "- \"new_tags\": array of up to 2 suggested new tags (or empty array)\n"
        "Do not include any other text."
    )

    try:
        async with _llm_semaphore:
            message = await _call_with_retry(
                client,
                model=_MODEL,
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}],
            )
        raw = message.content[0].text if message.content else ""
        parsed = _parse_json_response(raw)

        if isinstance(parsed, dict):
            tags = parsed.get("tags", [])
            if isinstance(tags, list):
                # Validate tags exist in taxonomy
                all_valid_tags = set()
                for tag_list in taxonomy.values():
                    all_valid_tags.update(tag_list)

                result = []
                for tag in tags:
                    if isinstance(tag, str) and tag.strip():
                        # Case-insensitive match
                        matched = next(
                            (t for t in all_valid_tags if t.lower() == tag.strip().lower()),
                            None,
                        )
                        if matched:
                            result.append(matched)
                return result
        return []
    except Exception:
        logger.exception("assign_tags: Anthropic API call failed.")
        return []


def merge_tags(existing: list[str] | None, new_tags: list[str]) -> list[str]:
    """Merge new AI tags into existing tags, deduplicating case-insensitively.

    Never removes existing tags — only appends.
    """
    existing = existing or []
    existing_lower = {t.lower() for t in existing}
    merged = list(existing)
    for tag in new_tags:
        if tag.lower() not in existing_lower:
            merged.append(tag)
            existing_lower.add(tag.lower())
    return merged
