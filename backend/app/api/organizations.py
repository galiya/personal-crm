from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.contact import Contact
from app.models.user import User
from app.schemas.responses import Envelope


router = APIRouter(prefix="/api/v1/organizations", tags=["organizations"])


# ---------------------------------------------------------------------------
# Local schemas
# ---------------------------------------------------------------------------


class OrgContact(BaseModel):
    id: str
    full_name: str | None
    given_name: str | None
    family_name: str | None
    title: str | None
    avatar_url: str | None
    relationship_score: int
    last_interaction_at: datetime | None


class Organization(BaseModel):
    company: str
    contact_count: int
    contacts: list[OrgContact]


class OrganizationListMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


def _envelope(data: Any, meta: dict | None = None) -> dict:
    return {"data": data, "error": None, "meta": meta}


# ---------------------------------------------------------------------------
# GET /api/v1/organizations
# ---------------------------------------------------------------------------


@router.get("", response_model=Envelope[list[Organization]])
async def list_organizations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, description="Filter by company name (case-insensitive)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return contacts grouped by company name.

    Only contacts with a non-empty company field are included.
    Archived contacts are excluded. Results are ordered alphabetically by company.
    Supports optional case-insensitive substring search on the company name.
    """
    stmt = (
        select(Contact)
        .where(
            Contact.user_id == current_user.id,
            Contact.company.isnot(None),
            Contact.company != "",
            Contact.priority_level != "archived",
        )
        .order_by(Contact.company)
    )

    if search:
        stmt = stmt.where(Contact.company.ilike(f"%{search}%"))

    result = await db.execute(stmt)
    contacts: list[Contact] = list(result.scalars().all())

    # Group contacts by company name (preserve alphabetical order via dict insertion)
    org_map: dict[str, list[Contact]] = {}
    for contact in contacts:
        company = contact.company  # guaranteed non-None/non-empty by filter above
        org_map.setdefault(company, []).append(contact)  # type: ignore[arg-type]

    # Build list of Organization dicts
    organizations: list[dict] = [
        {
            "company": company,
            "contact_count": len(members),
            "contacts": [
                {
                    "id": str(c.id),
                    "full_name": c.full_name,
                    "given_name": c.given_name,
                    "family_name": c.family_name,
                    "title": c.title,
                    "avatar_url": c.avatar_url,
                    "relationship_score": c.relationship_score,
                    "last_interaction_at": c.last_interaction_at,
                }
                for c in members
            ],
        }
        for company, members in org_map.items()
    ]

    total = len(organizations)
    total_pages = max(1, (total + page_size - 1) // page_size)

    # Paginate the organization list (not the contacts within each org)
    offset = (page - 1) * page_size
    page_orgs = organizations[offset : offset + page_size]

    return _envelope(
        page_orgs,
        meta={
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
    )
