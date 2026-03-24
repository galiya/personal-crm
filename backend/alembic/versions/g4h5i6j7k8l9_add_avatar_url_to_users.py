"""add avatar_url to users

Revision ID: g4h5i6j7k8l9
Revises: f3a4b5c6d7e8
Create Date: 2026-03-24
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = 'g4h5i6j7k8l9'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_url')
