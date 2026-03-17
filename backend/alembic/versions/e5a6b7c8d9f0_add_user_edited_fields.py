"""add user_edited_fields to contacts

Revision ID: e5a6b7c8d9f0
Revises: d4f5a6b7c8e9
Create Date: 2026-03-17
"""
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = 'e5a6b7c8d9f0'
down_revision: Union[str, None] = 'd4f5a6b7c8e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contacts', sa.Column('user_edited_fields', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('contacts', 'user_edited_fields')
