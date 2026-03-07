"""add_contact_merges_table_and_set_null_identity_match

Revision ID: b7fee2bffb64
Revises: 1a832c7279b3
Create Date: 2026-03-07 07:07:29.650057

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7fee2bffb64'
down_revision: Union[str, None] = '1a832c7279b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'contact_merges',
        sa.Column('id', sa.UUID(), nullable=False, primary_key=True),
        sa.Column('primary_contact_id', sa.UUID(), sa.ForeignKey('contacts.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('merged_contact_id', sa.UUID(), nullable=False),
        sa.Column('match_score', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('match_method', sa.String(), nullable=False, server_default='deterministic'),
        sa.Column('merged_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Change identity_matches.contact_b_id from CASCADE to SET NULL
    op.drop_constraint('identity_matches_contact_b_id_fkey', 'identity_matches', type_='foreignkey')
    op.alter_column('identity_matches', 'contact_b_id', nullable=True)
    op.create_foreign_key(
        'identity_matches_contact_b_id_fkey',
        'identity_matches', 'contacts',
        ['contact_b_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    # Revert contact_b_id back to CASCADE NOT NULL
    op.drop_constraint('identity_matches_contact_b_id_fkey', 'identity_matches', type_='foreignkey')
    op.alter_column('identity_matches', 'contact_b_id', nullable=False)
    op.create_foreign_key(
        'identity_matches_contact_b_id_fkey',
        'identity_matches', 'contacts',
        ['contact_b_id'], ['id'],
        ondelete='CASCADE',
    )

    op.drop_table('contact_merges')
