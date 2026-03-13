"""create_organizations_table

Revision ID: a1b2c3d4e5f6
Revises: 6740016dfb39
Create Date: 2026-03-13 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '6740016dfb39'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'organizations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('domain', sa.String(), nullable=True),
        sa.Column('industry', sa.String(), nullable=True),
        sa.Column('location', sa.String(), nullable=True),
        sa.Column('website', sa.String(), nullable=True),
        sa.Column('linkedin_url', sa.String(), nullable=True),
        sa.Column('twitter_handle', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_organizations_user_id', 'organizations', ['user_id'])
    op.create_index('ix_organizations_name', 'organizations', ['name'])
    op.create_index('ix_organizations_domain', 'organizations', ['domain'])


def downgrade() -> None:
    op.drop_index('ix_organizations_domain')
    op.drop_index('ix_organizations_name')
    op.drop_index('ix_organizations_user_id')
    op.drop_table('organizations')
