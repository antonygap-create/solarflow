"""
Add proposals table

Revision ID: 002_add_proposals_table
Revises: 001_initial_baseline
Create Date: 2026-08-03 15:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_add_proposals_table'
down_revision = '001_initial_baseline'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'proposals',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('customer_email', sa.String(length=255), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('system_capacity_kw', sa.Float(), nullable=False),
        sa.Column('annual_generation_kwh', sa.Float(), nullable=False),
        sa.Column('total_system_cost', sa.Float(), nullable=False),
        sa.Column('estimated_annual_savings', sa.Float(), nullable=False),
        sa.Column('roi_25_years_percent', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_proposals_customer_email'), 'proposals', ['customer_email'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_proposals_customer_email'), table_name='proposals')
    op.drop_table('proposals')
