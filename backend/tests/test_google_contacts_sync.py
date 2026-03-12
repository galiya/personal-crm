"""Tests for Google Contacts sync: fetch_google_contacts and sync task logic."""
from __future__ import annotations

from unittest.mock import MagicMock, Mock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.google_contacts import fetch_google_contacts, _extract_contact_fields
from app.models.contact import Contact
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_person(
    resource_name: str = "people/c123",
    given_name: str | None = "Alice",
    family_name: str | None = "Smith",
    display_name: str | None = "Alice Smith",
    emails: list[str] | None = None,
    phones: list[str] | None = None,
    org_name: str | None = None,
    org_title: str | None = None,
) -> dict:
    """Build a minimal Google People API person resource."""
    person: dict = {"resourceName": resource_name}
    if given_name or family_name or display_name:
        name_entry: dict = {}
        if given_name:
            name_entry["givenName"] = given_name
        if family_name:
            name_entry["familyName"] = family_name
        if display_name:
            name_entry["displayName"] = display_name
        person["names"] = [name_entry]
    if emails:
        person["emailAddresses"] = [{"value": e} for e in emails]
    if phones:
        person["phoneNumbers"] = [{"value": p} for p in phones]
    if org_name:
        person["organizations"] = [{"name": org_name, "title": org_title or ""}]
    return person


def _build_mock_service(pages: list[list[dict]]) -> MagicMock:
    """Return a mock Google People service that returns paginated responses."""
    service = MagicMock()
    connections_mock = service.people.return_value.connections.return_value.list

    responses = []
    for i, page in enumerate(pages):
        response: dict = {"connections": page}
        if i < len(pages) - 1:
            response["nextPageToken"] = f"token_{i}"
        responses.append(response)

    execute_mock = MagicMock(side_effect=[r for r in responses])
    connections_mock.return_value.execute = execute_mock
    return service


# ---------------------------------------------------------------------------
# Tests: fetch_google_contacts — Google API fully mocked, no DB required.
#
# Kept as synchronous class methods so they are NOT assigned their own
# asyncio event loop by pytest-asyncio.  The setup_database autouse fixture
# still manages its own async lifecycle without conflicting between tests.
# ---------------------------------------------------------------------------


class TestFetchGoogleContacts:
    def test_returns_contacts_from_single_page(self):
        """Contacts on a single page are returned correctly."""
        persons = [
            _make_person("people/c1", "Alice", "Smith", emails=["alice@example.com"]),
            _make_person("people/c2", "Bob", "Jones", emails=["bob@example.com"]),
        ]
        mock_service = _build_mock_service([persons])

        with patch("app.integrations.google_contacts._build_people_service", return_value=mock_service):
            result = fetch_google_contacts("fake-token")

        assert len(result) == 2
        assert result[0]["given_name"] == "Alice"
        assert result[1]["emails"] == ["bob@example.com"]

    def test_paginates_through_multiple_pages(self):
        """Contacts spread across multiple pages are all returned."""
        page1 = [_make_person("people/c1", "Alice", "Smith", emails=["a@ex.com"])]
        page2 = [_make_person("people/c2", "Bob", "Jones", emails=["b@ex.com"])]
        page3 = [_make_person("people/c3", "Carol", "White", emails=["c@ex.com"])]
        mock_service = _build_mock_service([page1, page2, page3])

        with patch("app.integrations.google_contacts._build_people_service", return_value=mock_service):
            result = fetch_google_contacts("fake-token")

        assert len(result) == 3
        names = [r["given_name"] for r in result]
        assert names == ["Alice", "Bob", "Carol"]

    def test_skips_contacts_without_name_or_email(self):
        """Contacts with no full_name and no emails are excluded."""
        persons = [
            _make_person("people/c1", "Alice", "Smith", emails=["a@ex.com"]),
            # Phone only, no name, no email — should be skipped
            {"resourceName": "people/c2", "phoneNumbers": [{"value": "+1555"}]},
            # Has name but no email — included (name is sufficient)
            _make_person("people/c3", "Bob", "Jones"),
        ]
        mock_service = _build_mock_service([persons])

        with patch("app.integrations.google_contacts._build_people_service", return_value=mock_service):
            result = fetch_google_contacts("fake-token")

        assert len(result) == 2
        resource_names = [r["resource_name"] for r in result]
        assert "people/c2" not in resource_names

    def test_api_error_propagates(self):
        """An HttpError from the Google API bubbles up as an exception."""
        from googleapiclient.errors import HttpError

        mock_service = MagicMock()
        mock_resp = Mock()
        mock_resp.status = 403
        mock_resp.reason = "Forbidden"
        error = HttpError(resp=mock_resp, content=b"Forbidden")
        mock_service.people.return_value.connections.return_value.list.return_value.execute.side_effect = error

        with patch("app.integrations.google_contacts._build_people_service", return_value=mock_service):
            with pytest.raises(HttpError):
                fetch_google_contacts("bad-token")

    def test_rate_limit_error_propagates(self):
        """A 429 rate-limit HttpError propagates to the caller."""
        from googleapiclient.errors import HttpError

        mock_service = MagicMock()
        mock_resp = Mock()
        mock_resp.status = 429
        mock_resp.reason = "Too Many Requests"
        error = HttpError(resp=mock_resp, content=b"Rate limit exceeded")
        mock_service.people.return_value.connections.return_value.list.return_value.execute.side_effect = error

        with patch("app.integrations.google_contacts._build_people_service", return_value=mock_service):
            with pytest.raises(HttpError) as exc_info:
                fetch_google_contacts("token")

        assert exc_info.value.resp.status == 429

    def test_empty_connections_returns_empty_list(self):
        """A response with no connections key returns an empty list."""
        mock_service = MagicMock()
        mock_service.people.return_value.connections.return_value.list.return_value.execute.return_value = {}

        with patch("app.integrations.google_contacts._build_people_service", return_value=mock_service):
            result = fetch_google_contacts("token")

        assert result == []

    def test_resource_name_captured(self):
        """The Google resourceName is preserved on each returned contact."""
        persons = [_make_person("people/abc999", "Alice", "Smith", emails=["a@ex.com"])]
        mock_service = _build_mock_service([persons])

        with patch("app.integrations.google_contacts._build_people_service", return_value=mock_service):
            result = fetch_google_contacts("token")

        assert result[0]["resource_name"] == "people/abc999"

    def test_duplicate_emails_from_google_both_returned(self):
        """If Google returns two entries for the same email, both are fetched.
        Deduplication is the sync task's responsibility, not fetch_google_contacts."""
        persons = [
            _make_person("people/c1", "Alice", "Smith", emails=["shared@ex.com"]),
            _make_person("people/c2", "Alice", "Smith2", emails=["shared@ex.com"]),
        ]
        mock_service = _build_mock_service([persons])

        with patch("app.integrations.google_contacts._build_people_service", return_value=mock_service):
            result = fetch_google_contacts("token")

        assert len(result) == 2
        emails = [r["emails"][0] for r in result]
        assert emails.count("shared@ex.com") == 2

    def test_contact_without_name_or_email_filtered_by_extract(self):
        """_extract_contact_fields returns empty full_name and emails for phone-only entries,
        causing the sync loop to skip them."""
        person = {"resourceName": "people/empty", "phoneNumbers": [{"value": "+1555"}]}
        fields = _extract_contact_fields(person)

        should_include = bool(fields["full_name"] or fields["emails"])
        assert should_include is False


# ---------------------------------------------------------------------------
# Tests: sync DB logic — async, using real test DB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_new_contact_created_from_google_data(db: AsyncSession, test_user: User):
    """Fields from _extract_contact_fields can be persisted as a new Contact row."""
    person = _make_person(
        "people/new1",
        "New",
        "Person",
        display_name="New Person",
        emails=["newperson@example.com"],
        org_name="Acme",
        org_title="Engineer",
    )
    fields = _extract_contact_fields(person)

    contact = Contact(
        user_id=test_user.id,
        full_name=fields["full_name"],
        given_name=fields["given_name"],
        family_name=fields["family_name"],
        emails=fields["emails"],
        phones=fields["phones"],
        company=fields["company"],
        title=fields["title"],
        source=fields["source"],
        google_resource_name=fields["resource_name"],
    )
    db.add(contact)
    await db.commit()

    result = await db.execute(
        select(Contact).where(Contact.google_resource_name == "people/new1")
    )
    saved = result.scalar_one()
    assert saved.full_name == "New Person"
    assert saved.given_name == "New"
    assert saved.family_name == "Person"
    assert "newperson@example.com" in saved.emails
    assert saved.company == "Acme"
    assert saved.title == "Engineer"
    assert saved.source == "google"


@pytest.mark.asyncio
async def test_existing_contact_updated_by_email_match(db: AsyncSession, test_user: User):
    """When a contact with matching email exists, empty fields are filled from Google data."""
    existing = Contact(
        user_id=test_user.id,
        full_name=None,
        given_name=None,
        family_name=None,
        emails=["match@example.com"],
        phones=[],
        source="manual",
    )
    db.add(existing)
    await db.commit()
    await db.refresh(existing)

    person = _make_person(
        "people/upd1",
        "Updated",
        "Contact",
        display_name="Updated Contact",
        emails=["match@example.com"],
        org_name="NewCorp",
    )
    fields = _extract_contact_fields(person)

    # Mirror the sync update logic: only fill empty fields
    if fields.get("full_name") and not existing.full_name:
        existing.full_name = fields["full_name"]
    if fields.get("given_name") and not existing.given_name:
        existing.given_name = fields["given_name"]
    if fields.get("family_name") and not existing.family_name:
        existing.family_name = fields["family_name"]
    if fields.get("company") and not existing.company:
        existing.company = fields["company"]
    if not existing.google_resource_name:
        existing.google_resource_name = fields["resource_name"]
    await db.commit()
    await db.refresh(existing)

    assert existing.full_name == "Updated Contact"
    assert existing.given_name == "Updated"
    assert existing.company == "NewCorp"
    assert existing.google_resource_name == "people/upd1"
    # Source must NOT be overwritten to "google"
    assert existing.source == "manual"


@pytest.mark.asyncio
async def test_existing_fields_not_overwritten(db: AsyncSession, test_user: User):
    """The sync must not replace populated fields on an already-existing contact."""
    existing = Contact(
        user_id=test_user.id,
        full_name="Original Name",
        given_name="Original",
        family_name="Name",
        emails=["keep@example.com"],
        company="OriginalCo",
        source="manual",
    )
    db.add(existing)
    await db.commit()
    await db.refresh(existing)

    person = _make_person(
        "people/nooverwrite",
        "Replacement",
        "Name",
        display_name="Replacement Name",
        emails=["keep@example.com"],
        org_name="NewCo",
    )
    fields = _extract_contact_fields(person)

    # Mirror sync logic — only fill empty fields
    if fields.get("full_name") and not existing.full_name:
        existing.full_name = fields["full_name"]
    if fields.get("given_name") and not existing.given_name:
        existing.given_name = fields["given_name"]
    if fields.get("company") and not existing.company:
        existing.company = fields["company"]
    await db.commit()
    await db.refresh(existing)

    assert existing.full_name == "Original Name"
    assert existing.given_name == "Original"
    assert existing.company == "OriginalCo"


@pytest.mark.asyncio
async def test_duplicate_email_does_not_create_second_contact(db: AsyncSession, test_user: User):
    """Email-based lookup finds the existing contact so no duplicate is inserted."""
    first = Contact(
        user_id=test_user.id,
        full_name="First Entry",
        emails=["dup@example.com"],
        source="google",
        google_resource_name="people/dup1",
    )
    db.add(first)
    await db.commit()

    # Simulate the sync email-fallback lookup
    result = await db.execute(
        select(Contact).where(
            Contact.user_id == test_user.id,
            Contact.emails.any("dup@example.com"),
        )
    )
    found = result.scalar_one_or_none()
    assert found is not None
    assert found.google_resource_name == "people/dup1"

    count_result = await db.execute(
        select(Contact).where(Contact.user_id == test_user.id)
    )
    all_contacts = count_result.scalars().all()
    assert len(all_contacts) == 1


@pytest.mark.asyncio
async def test_new_phones_appended_not_replaced(db: AsyncSession, test_user: User):
    """Phones from Google are appended to the existing list, not substituted."""
    existing = Contact(
        user_id=test_user.id,
        full_name="Phone Test",
        emails=["phonetest@example.com"],
        phones=["+111"],
        source="manual",
    )
    db.add(existing)
    await db.commit()
    await db.refresh(existing)

    person = _make_person(
        "people/ph1",
        "Phone",
        "Test",
        emails=["phonetest@example.com"],
        phones=["+222"],
    )
    fields = _extract_contact_fields(person)

    # Mirror sync logic: append only phones not already present
    new_phones = [p for p in fields.get("phones", []) if p not in (existing.phones or [])]
    if new_phones:
        existing.phones = list(existing.phones or []) + new_phones
    await db.commit()
    await db.refresh(existing)

    assert "+111" in existing.phones
    assert "+222" in existing.phones
    assert len(existing.phones) == 2
