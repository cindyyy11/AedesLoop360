"""Initial portable demo schema, revision frozen in this release."""

from alembic import op
from app.db import Base
from app import models  # noqa: F401

revision = "001"
down_revision = None


def upgrade():
    Base.metadata.create_all(op.get_bind())
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        op.execute(
            "CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'append-only audit'); END"
        )
        op.execute(
            "CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'append-only audit'); END"
        )
    elif dialect == "postgresql":
        op.execute(
            "CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only audit'; END; $$"
        )
        op.execute(
            "CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation()"
        )


def downgrade():
    raise RuntimeError("Audit-retaining migration; restore a database backup instead")
