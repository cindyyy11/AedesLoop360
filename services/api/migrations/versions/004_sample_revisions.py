"""Persist count corrections as append-only sample revisions."""

import sqlalchemy as sa
from alembic import op

revision = "004"
down_revision = "003"


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "sample_revisions" not in inspector.get_table_names():
        op.create_table(
            "sample_revisions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False),
            sa.Column("mode", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("sample_id", sa.String(), sa.ForeignKey("samples.id"), nullable=False),
            sa.Column("reviewer_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("previous_egg_count", sa.Integer(), nullable=False),
            sa.Column("corrected_egg_count", sa.Integer(), nullable=False),
            sa.Column("media_id", sa.String(), sa.ForeignKey("media.id"), nullable=False),
            sa.Column("reason", sa.String(), nullable=False),
        )
        op.create_index("ix_sample_revisions_sample_id", "sample_revisions", ["sample_id"])
        op.create_index("ix_sample_revisions_reviewer_id", "sample_revisions", ["reviewer_id"])
        op.create_index("ix_sample_revisions_media_id", "sample_revisions", ["media_id"])
        op.create_index("ix_sample_revisions_tenant_id", "sample_revisions", ["tenant_id"])
    if bind.dialect.name == "sqlite":
        trigger_names = {
            row[0]
            for row in bind.execute(sa.text("SELECT name FROM sqlite_master WHERE type='trigger'"))
        }
        if "sample_revisions_no_update" not in trigger_names:
            op.execute(
                "CREATE TRIGGER sample_revisions_no_update BEFORE UPDATE ON sample_revisions "
                "BEGIN SELECT RAISE(ABORT, 'sample revisions are append-only'); END"
            )
        if "sample_revisions_no_delete" not in trigger_names:
            op.execute(
                "CREATE TRIGGER sample_revisions_no_delete BEFORE DELETE ON sample_revisions "
                "BEGIN SELECT RAISE(ABORT, 'sample revisions are append-only'); END"
            )
    else:
        op.execute(
            "CREATE TRIGGER sample_revisions_immutable BEFORE UPDATE OR DELETE "
            "ON sample_revisions FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation()"
        )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS sample_revisions_no_update")
        op.execute("DROP TRIGGER IF EXISTS sample_revisions_no_delete")
    else:
        op.execute("DROP TRIGGER IF EXISTS sample_revisions_immutable ON sample_revisions")
