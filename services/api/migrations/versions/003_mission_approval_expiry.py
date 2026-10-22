"""Expire local simulated mission approvals after a fixed review window."""

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("missions")}
    if "approval_expires_at" not in columns:
        op.add_column(
            "missions", sa.Column("approval_expires_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("missions")}
    if "approval_expires_at" in columns:
        op.drop_column("missions", "approval_expires_at")
