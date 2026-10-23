"""Record human review of drone candidate findings."""

import sqlalchemy as sa
from alembic import op

revision = "008"
down_revision = "007"


def upgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("findings")}
    # SQLite cannot add a foreign key to an existing table; keep it on databases that can.
    reviewer = (
        sa.Column("reviewed_by", sa.String(), nullable=True)
        if bind.dialect.name == "sqlite"
        else sa.Column("reviewed_by", sa.String(), sa.ForeignKey("users.id"), nullable=True)
    )
    additions = [
        sa.Column("review_status", sa.String(), nullable=False, server_default="UNREVIEWED"),
        reviewer,
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.String(), nullable=True),
    ]
    for column in additions:
        if column.name not in columns:
            op.add_column("findings", column)


def downgrade():
    raise RuntimeError("Finding review provenance is retained; restore a database backup instead")
