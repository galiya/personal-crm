"""backfill_organizations_from_company

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-13 16:02:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _extract_domain(emails: list[str] | None) -> str | None:
    """Extract the first non-generic email domain from a list of emails."""
    GENERIC_DOMAINS = {
        "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
        "icloud.com", "me.com", "aol.com", "protonmail.com", "proton.me",
        "mail.ru", "yandex.ru", "yandex.com", "fastmail.com", "hey.com",
        "tutanota.com", "zoho.com", "gmx.com", "inbox.com", "mail.com",
        "msn.com", "qq.com", "163.com", "126.com",
    }
    if not emails:
        return None
    for email in emails:
        if "@" in email:
            domain = email.rsplit("@", 1)[1].lower().strip()
            if domain and domain not in GENERIC_DOMAINS:
                return domain
    return None


def upgrade() -> None:
    conn = op.get_bind()

    # Get distinct (user_id, company) pairs
    rows = conn.execute(sa.text(
        "SELECT DISTINCT user_id, company FROM contacts "
        "WHERE company IS NOT NULL AND company != '' AND organization_id IS NULL"
    )).fetchall()

    for user_id, company in rows:
        org_id = uuid.uuid4()

        # Try to extract domain from one of the contacts' emails
        email_row = conn.execute(sa.text(
            "SELECT emails FROM contacts "
            "WHERE user_id = :uid AND company = :company AND emails IS NOT NULL "
            "LIMIT 1"
        ), {"uid": user_id, "company": company}).fetchone()

        domain = _extract_domain(email_row[0] if email_row else None)

        # Create organization
        conn.execute(sa.text(
            "INSERT INTO organizations (id, user_id, name, domain, created_at) "
            "VALUES (:id, :uid, :name, :domain, NOW())"
        ), {"id": org_id, "uid": user_id, "name": company, "domain": domain})

        # Backfill contacts
        conn.execute(sa.text(
            "UPDATE contacts SET organization_id = :oid "
            "WHERE user_id = :uid AND company = :company AND organization_id IS NULL"
        ), {"oid": org_id, "uid": user_id, "company": company})


def downgrade() -> None:
    # Clear organization_id on contacts, then delete auto-created orgs
    op.execute("UPDATE contacts SET organization_id = NULL")
    op.execute("DELETE FROM organizations")
