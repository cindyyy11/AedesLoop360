"""Persist tenant-scoped model evaluation and allocation benchmark summaries."""

import sqlalchemy as sa
from alembic import op

revision = "005"
down_revision = "004"


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "analytics_runs" not in inspector.get_table_names():
        op.create_table(
            "analytics_runs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False),
            sa.Column("mode", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("run_id", sa.String(), nullable=False),
            sa.Column("run_type", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("source_mode", sa.String(), nullable=False),
            sa.Column("run_metadata", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("metrics", sa.JSON(), nullable=True),
            sa.Column("artifacts", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("limitations", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("initiated_by", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.UniqueConstraint("tenant_id", "run_id", name="uq_analytics_tenant_run"),
        )
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("analytics_runs")}
    if "ix_analytics_runs_tenant_id" not in indexes:
        op.create_index("ix_analytics_runs_tenant_id", "analytics_runs", ["tenant_id"])
    if "ix_analytics_runs_run_id" not in indexes:
        op.create_index("ix_analytics_runs_run_id", "analytics_runs", ["run_id"])
    if "ix_analytics_runs_run_type" not in indexes:
        op.create_index("ix_analytics_runs_run_type", "analytics_runs", ["run_type"])
    if "ix_analytics_runs_status" not in indexes:
        op.create_index("ix_analytics_runs_status", "analytics_runs", ["status"])
    if "ix_analytics_runs_source_mode" not in indexes:
        op.create_index("ix_analytics_runs_source_mode", "analytics_runs", ["source_mode"])


def downgrade():
    raise RuntimeError("Analytics evidence is retained; restore a database backup instead")
