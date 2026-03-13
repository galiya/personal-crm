"""add_organization_id_to_contacts

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-13 16:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('contacts', sa.Column(
        'organization_id',
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey('organizations.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.create_index('ix_contacts_organization_id', 'contacts', ['organization_id'])


def downgrade() -> None:
    op.drop_index('ix_contacts_organization_id')
    op.drop_column('contacts', 'organization_id')
