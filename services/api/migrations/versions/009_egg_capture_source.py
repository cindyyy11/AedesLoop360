"""Record whether an egg photo was uploaded by a person or delivered by the simulated drone."""

import sqlalchemy as sa
from alembic import op

revision = "009"
down_revision = "008"


def upgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("egg_analyses")}
    if "source" not in columns:
        op.add_column(
            "egg_analyses",
            sa.Column("source", sa.String(), nullable=False, server_default="UPLOAD"),
        )
    if "capture_pass_id" not in columns:
        op.add_column("egg_analyses", sa.Column("capture_pass_id", sa.String(), nullable=True))
    indexes = {i["name"] for i in sa.inspect(bind).get_indexes("egg_analyses")}
    if "ix_egg_analyses_capture_pass_id" not in indexes:
        op.create_index("ix_egg_analyses_capture_pass_id", "egg_analyses", ["capture_pass_id"])


def downgrade():
    raise RuntimeError("Capture provenance is retained; restore a database backup instead")
