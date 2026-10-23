"""Collapse the five demo roles into coordinator and operator."""

import sqlalchemy as sa
from alembic import op

revision = "010"
down_revision = "009"

# inspector -> operator (field work); reviewer/admin -> coordinator (review, approval, settings).
REMAP = {"inspector": "operator", "reviewer": "coordinator", "admin": "coordinator", "viewer": "operator"}


def upgrade():
    users = sa.table("users", sa.column("role", sa.String))
    for old, new in REMAP.items():
        op.execute(users.update().where(users.c.role == old).values(role=new))


def downgrade():
    raise RuntimeError("Role merge is retained; restore a database backup instead")
