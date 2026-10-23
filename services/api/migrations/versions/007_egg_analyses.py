"""Persist reviewed egg proposals without changing interval observations."""

import sqlalchemy as sa
from alembic import op

revision = "007"
down_revision = "006"


def upgrade():
    bind = op.get_bind()
    if "egg_analyses" not in sa.inspect(bind).get_table_names():
        op.create_table(
            "egg_analyses",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False),
            sa.Column("mode", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("trap_id", sa.String(), sa.ForeignKey("traps.id"), nullable=False),
            sa.Column("media_id", sa.String(), sa.ForeignKey("media.id"), nullable=False),
            sa.Column("roi", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("proposed_count", sa.Integer(), nullable=True),
            sa.Column("model_version", sa.String(), nullable=True),
            sa.Column("reason", sa.String(), nullable=True),
            sa.Column("details", sa.JSON(), nullable=False),
            sa.Column(
                "confirmed_sample_id", sa.String(), sa.ForeignKey("samples.id"), nullable=True
            ),
            sa.Column("reviewer_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("accepted_count", sa.Integer(), nullable=True),
            sa.Column("confirmation_reason", sa.String(), nullable=True),
            sa.UniqueConstraint("confirmed_sample_id"),
            sa.CheckConstraint("proposed_count IS NULL OR proposed_count >= 0"),
        )
    indexes = {i["name"] for i in sa.inspect(bind).get_indexes("egg_analyses")}
    for column in ("tenant_id", "trap_id", "media_id", "reviewer_id"):
        name = f"ix_egg_analyses_{column}"
        if name not in indexes:
            op.create_index(name, "egg_analyses", [column])


def downgrade():
    raise RuntimeError("Review provenance is retained; restore a database backup instead")
