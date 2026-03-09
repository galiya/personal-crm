"""add unique index telegram_user_id per user

Revision ID: 97d166ac9db2
Revises: e722561cce26
Create Date: 2026-03-09
"""
from typing import Union

from alembic import op

revision: str = '97d166ac9db2'
down_revision: Union[str, None] = 'e722561cce26'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'uq_contacts_telegram_user_id_per_user',
        'contacts',
        ['user_id', 'telegram_user_id'],
        unique=True,
        postgresql_where="telegram_user_id IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_index('uq_contacts_telegram_user_id_per_user', table_name='contacts')
