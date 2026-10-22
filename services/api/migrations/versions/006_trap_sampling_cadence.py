"""Store expected trap sampling cadence for monitoring denominators."""

import sqlalchemy as sa
from alembic import op

revision = "006"
down_revision = "005"


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("traps")}
    if "sampling_cadence_days" not in columns:
        op.add_column(
            "traps",
            sa.Column("sampling_cadence_days", sa.Integer(), nullable=False, server_default="7"),
        )


def downgrade():
    raise RuntimeError("Trap sampling cadence is retained; restore a database backup instead")
