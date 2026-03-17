"""Utilities for sync operations that update Contact fields."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.contact import Contact

# Fields that sync should never overwrite if the user has edited them.
PROTECTABLE_FIELDS = frozenset({
    "full_name", "given_name", "family_name",
    "company", "title", "location",
    "tags", "notes", "birthday",
    "linkedin_headline", "twitter_handle",
})


def sync_set_field(
    contact: Contact,
    field: str,
    value: Any,
    *,
    overwrite: bool = False,
) -> bool:
    """Set a field on a contact during sync, respecting user-edited fields.

    Returns True if the field was actually updated.

    Rules:
    - If `field` is in `contact.user_edited_fields`, skip (user pinned it).
    - If the field already has a truthy value and `overwrite` is False, skip.
    - Otherwise, set the value.

    For fields not in PROTECTABLE_FIELDS (e.g. telegram_user_id, avatar_url),
    the user_edited_fields check is skipped — those are always sync-managed.
    """
    if not value:
        return False

    # Check user-edited protection (only for protectable fields)
    if field in PROTECTABLE_FIELDS:
        edited = contact.user_edited_fields or []
        if field in edited:
            return False

    current = getattr(contact, field, None)
    if current and not overwrite:
        return False

    setattr(contact, field, value)
    return True
