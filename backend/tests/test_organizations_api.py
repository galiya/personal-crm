"""Tests for organizations API endpoints."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.user import User


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _make_contact(
    user_id: uuid.UUID,
    full_name: str,
    company: str | None,
    *,
    priority_level: str = "normal",
    relationship_score: int = 5,
    title: str | None = None,
) -> Contact:
    return Contact(
        id=uuid.uuid4(),
        user_id=user_id,
        full_name=full_name,
        company=company,
        priority_level=priority_level,
        relationship_score=relationship_score,
        title=title,
        source="manual",
    )


# ---------------------------------------------------------------------------
# GET /api/v1/organizations — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_organizations_requires_auth(client: AsyncClient):
    """401 when no auth token is provided."""
    resp = await client.get("/api/v1/organizations")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_organizations_empty_state(client: AsyncClient, auth_headers: dict):
    """Empty list returned when no contacts have a company set."""
    resp = await client.get("/api/v1/organizations", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["meta"]["total"] == 0


@pytest.mark.asyncio
async def test_list_organizations_groups_contacts_by_company(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Contacts with the same company are grouped into one organization entry."""
    alice = _make_contact(test_user.id, "Alice Smith", "Acme Corp", title="CTO")
    bob = _make_contact(test_user.id, "Bob Jones", "Acme Corp")
    carol = _make_contact(test_user.id, "Carol Lee", "BetaCo")
    db.add_all([alice, bob, carol])
    await db.commit()

    resp = await client.get("/api/v1/organizations", headers=auth_headers)
    assert resp.status_code == 200
    orgs = resp.json()["data"]

    companies = [o["company"] for o in orgs]
    assert "Acme Corp" in companies
    assert "BetaCo" in companies

    acme = next(o for o in orgs if o["company"] == "Acme Corp")
    assert acme["contact_count"] == 2
    acme_names = {c["full_name"] for c in acme["contacts"]}
    assert acme_names == {"Alice Smith", "Bob Jones"}

    beta = next(o for o in orgs if o["company"] == "BetaCo")
    assert beta["contact_count"] == 1


@pytest.mark.asyncio
async def test_list_organizations_excludes_contacts_without_company(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Contacts with no company (None or empty string) are excluded."""
    with_company = _make_contact(test_user.id, "Has Company", "SomeCo")
    without_company = _make_contact(test_user.id, "No Company", None)
    empty_company = _make_contact(test_user.id, "Empty Company", "")
    db.add_all([with_company, without_company, empty_company])
    await db.commit()

    resp = await client.get("/api/v1/organizations", headers=auth_headers)
    assert resp.status_code == 200
    orgs = resp.json()["data"]
    assert len(orgs) == 1
    assert orgs[0]["company"] == "SomeCo"


@pytest.mark.asyncio
async def test_list_organizations_excludes_archived_contacts(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Archived contacts are not included in any organization."""
    active = _make_contact(test_user.id, "Active Person", "Acme Corp")
    archived = _make_contact(
        test_user.id, "Archived Person", "Acme Corp", priority_level="archived"
    )
    db.add_all([active, archived])
    await db.commit()

    resp = await client.get("/api/v1/organizations", headers=auth_headers)
    assert resp.status_code == 200
    orgs = resp.json()["data"]
    acme = next((o for o in orgs if o["company"] == "Acme Corp"), None)
    assert acme is not None
    assert acme["contact_count"] == 1
    names = [c["full_name"] for c in acme["contacts"]]
    assert "Active Person" in names
    assert "Archived Person" not in names


@pytest.mark.asyncio
async def test_list_organizations_ordered_alphabetically(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Organizations are returned in alphabetical order by company name."""
    db.add_all([
        _make_contact(test_user.id, "Person Z", "Zebra Inc"),
        _make_contact(test_user.id, "Person A", "Alpha LLC"),
        _make_contact(test_user.id, "Person M", "Midway Corp"),
    ])
    await db.commit()

    resp = await client.get("/api/v1/organizations", headers=auth_headers)
    assert resp.status_code == 200
    companies = [o["company"] for o in resp.json()["data"]]
    assert companies == sorted(companies)


@pytest.mark.asyncio
async def test_list_organizations_org_contact_fields(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Each contact within an org has the expected fields."""
    contact = _make_contact(
        test_user.id, "Test Person", "FieldCo", title="Engineer", relationship_score=7
    )
    contact.given_name = "Test"
    contact.family_name = "Person"
    db.add(contact)
    await db.commit()

    resp = await client.get("/api/v1/organizations", headers=auth_headers)
    assert resp.status_code == 200
    org_contact = resp.json()["data"][0]["contacts"][0]
    assert org_contact["full_name"] == "Test Person"
    assert org_contact["given_name"] == "Test"
    assert org_contact["family_name"] == "Person"
    assert org_contact["title"] == "Engineer"
    assert org_contact["relationship_score"] == 7
    assert "id" in org_contact


# ---------------------------------------------------------------------------
# GET /api/v1/organizations — search
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_organizations_search_filters_by_company_name(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """search param filters organizations by case-insensitive substring match."""
    db.add_all([
        _make_contact(test_user.id, "Alice", "Acme Corp"),
        _make_contact(test_user.id, "Bob", "Beta Industries"),
        _make_contact(test_user.id, "Carol", "Acme Solutions"),
    ])
    await db.commit()

    resp = await client.get("/api/v1/organizations?search=acme", headers=auth_headers)
    assert resp.status_code == 200
    orgs = resp.json()["data"]
    companies = {o["company"] for o in orgs}
    assert companies == {"Acme Corp", "Acme Solutions"}
    assert "Beta Industries" not in companies


@pytest.mark.asyncio
async def test_list_organizations_search_case_insensitive(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Search is case-insensitive."""
    db.add(_make_contact(test_user.id, "Alice", "TechCorp"))
    await db.commit()

    for query in ("TECHCORP", "techcorp", "TechCorp", "tech"):
        resp = await client.get(f"/api/v1/organizations?search={query}", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()["data"]) == 1, f"Expected 1 result for search={query!r}"


@pytest.mark.asyncio
async def test_list_organizations_search_no_match_returns_empty(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Search with no matching company returns empty list."""
    db.add(_make_contact(test_user.id, "Alice", "Acme Corp"))
    await db.commit()

    resp = await client.get("/api/v1/organizations?search=nonexistent", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"] == []
    assert resp.json()["meta"]["total"] == 0


# ---------------------------------------------------------------------------
# GET /api/v1/organizations — pagination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_organizations_pagination(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Pagination meta is accurate and page slicing works correctly."""
    companies = [f"Company {chr(65 + i)}" for i in range(5)]  # Company A … E
    for name in companies:
        db.add(_make_contact(test_user.id, f"Person at {name}", name))
    await db.commit()

    resp = await client.get("/api/v1/organizations?page=1&page_size=2", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["total"] == 5
    assert body["meta"]["total_pages"] == 3
    assert body["meta"]["page"] == 1
    assert body["meta"]["page_size"] == 2
    assert len(body["data"]) == 2

    # Page 2
    resp2 = await client.get("/api/v1/organizations?page=2&page_size=2", headers=auth_headers)
    assert resp2.status_code == 200
    assert len(resp2.json()["data"]) == 2

    # Pages should not overlap
    page1_companies = {o["company"] for o in body["data"]}
    page2_companies = {o["company"] for o in resp2.json()["data"]}
    assert page1_companies.isdisjoint(page2_companies)


@pytest.mark.asyncio
async def test_list_organizations_pagination_last_page(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Last page returns remaining items (fewer than page_size)."""
    for i in range(3):
        db.add(_make_contact(test_user.id, f"Person {i}", f"Company {i}"))
    await db.commit()

    resp = await client.get("/api/v1/organizations?page=2&page_size=2", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["data"]) == 1


@pytest.mark.asyncio
async def test_list_organizations_isolates_by_user(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Contacts from another user are not visible."""
    other_user = User(
        id=uuid.uuid4(),
        email="other@example.com",
        hashed_password="hashed",
        full_name="Other User",
    )
    db.add(other_user)
    await db.flush()

    # Other user's contact with a company
    db.add(_make_contact(other_user.id, "Other Person", "OtherCorp"))
    # Current user has no contacts
    await db.commit()

    resp = await client.get("/api/v1/organizations", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"] == []


# ---------------------------------------------------------------------------
# POST /api/v1/organizations/merge
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_merge_organizations_requires_auth(client: AsyncClient):
    """401 when no auth token is provided."""
    resp = await client.post(
        "/api/v1/organizations/merge",
        json={"source_companies": ["OldCo"], "target_company": "NewCo"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_merge_organizations_combines_contacts(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Merging renames source contacts' company to the target company."""
    c1 = _make_contact(test_user.id, "Alice", "Old Corp")
    c2 = _make_contact(test_user.id, "Bob", "Old Corp")
    c3 = _make_contact(test_user.id, "Carol", "Other Corp")
    db.add_all([c1, c2, c3])
    await db.commit()

    resp = await client.post(
        "/api/v1/organizations/merge",
        json={"source_companies": ["Old Corp"], "target_company": "New Corp"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["target_company"] == "New Corp"
    assert data["contacts_updated"] == 2
    assert "Old Corp" in data["source_companies_merged"]

    # Verify via list endpoint that Old Corp is gone and New Corp has 2 contacts
    list_resp = await client.get("/api/v1/organizations", headers=auth_headers)
    orgs = {o["company"]: o for o in list_resp.json()["data"]}
    assert "Old Corp" not in orgs
    assert "New Corp" in orgs
    assert orgs["New Corp"]["contact_count"] == 2
    # Carol's company is unchanged
    assert "Other Corp" in orgs


@pytest.mark.asyncio
async def test_merge_organizations_multiple_sources(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Multiple source companies can be merged into a single target in one request."""
    db.add_all([
        _make_contact(test_user.id, "Alice", "Variant A"),
        _make_contact(test_user.id, "Bob", "Variant B"),
        _make_contact(test_user.id, "Carol", "Canonical"),
    ])
    await db.commit()

    resp = await client.post(
        "/api/v1/organizations/merge",
        json={"source_companies": ["Variant A", "Variant B"], "target_company": "Canonical"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["contacts_updated"] == 2
    assert set(data["source_companies_merged"]) == {"Variant A", "Variant B"}

    list_resp = await client.get("/api/v1/organizations", headers=auth_headers)
    orgs = {o["company"]: o for o in list_resp.json()["data"]}
    assert len(orgs) == 1
    assert orgs["Canonical"]["contact_count"] == 3


@pytest.mark.asyncio
async def test_merge_organizations_source_equals_target_returns_400(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """400 error when source_companies contains only the target company."""
    db.add(_make_contact(test_user.id, "Alice", "Acme"))
    await db.commit()

    resp = await client.post(
        "/api/v1/organizations/merge",
        json={"source_companies": ["Acme"], "target_company": "Acme"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_merge_organizations_nonexistent_source_updates_zero(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Merging a source that does not exist updates 0 contacts (no error)."""
    db.add(_make_contact(test_user.id, "Alice", "RealCo"))
    await db.commit()

    resp = await client.post(
        "/api/v1/organizations/merge",
        json={"source_companies": ["GhostCo"], "target_company": "RealCo"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["contacts_updated"] == 0


@pytest.mark.asyncio
async def test_merge_organizations_only_affects_current_user(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
):
    """Merge does not touch contacts belonging to another user."""
    other_user = User(
        id=uuid.uuid4(),
        email="other2@example.com",
        hashed_password="hashed",
        full_name="Other User 2",
    )
    db.add(other_user)
    await db.flush()

    current_contact = _make_contact(test_user.id, "Mine", "OldName")
    other_contact = _make_contact(other_user.id, "Theirs", "OldName")
    db.add_all([current_contact, other_contact])
    await db.commit()

    resp = await client.post(
        "/api/v1/organizations/merge",
        json={"source_companies": ["OldName"], "target_company": "NewName"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    # Only 1 contact updated (the current user's)
    assert resp.json()["data"]["contacts_updated"] == 1

    # Refresh the other user's contact from DB to confirm it was not changed
    from sqlalchemy import select as sa_select

    result = await db.execute(
        sa_select(Contact).where(Contact.id == other_contact.id)
    )
    other_refreshed = result.scalar_one()
    assert other_refreshed.company == "OldName"
