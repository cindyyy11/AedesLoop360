"""Record the operator who starts each simulated mission."""

import sqlalchemy as sa
from alembic import op
from alembic import context

revision = "002"
down_revision = "001"


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("jobs")}
    foreign_keys = {key.get("name") for key in inspector.get_foreign_keys("jobs")}
    if "operator_id" not in columns:
        if context.get_context().dialect.name == "sqlite":
            with op.batch_alter_table("jobs", recreate="always") as batch:
                batch.add_column(sa.Column("operator_id", sa.String(), nullable=True))
                batch.create_foreign_key(
                    "fk_jobs_operator_id_users", "users", ["operator_id"], ["id"]
                )
        else:
            op.add_column("jobs", sa.Column("operator_id", sa.String(), nullable=True))
            op.create_foreign_key(
                "fk_jobs_operator_id_users", "jobs", "users", ["operator_id"], ["id"]
            )
    elif "fk_jobs_operator_id_users" not in foreign_keys:
        # Migration 001 builds from the current ORM metadata on fresh databases.
        # If that already included this column, it also included the FK; this
        # branch covers any intermediate schema where only the column exists.
        if context.get_context().dialect.name == "sqlite":
            with op.batch_alter_table("jobs", recreate="always") as batch:
                batch.create_foreign_key(
                    "fk_jobs_operator_id_users", "users", ["operator_id"], ["id"]
                )
        else:
            op.create_foreign_key(
                "fk_jobs_operator_id_users", "jobs", "users", ["operator_id"], ["id"]
            )


def downgrade():
    if context.get_context().dialect.name == "sqlite":
        with op.batch_alter_table("jobs", recreate="always") as batch:
            batch.drop_constraint("fk_jobs_operator_id_users", type_="foreignkey")
            batch.drop_column("operator_id")
    else:
        op.drop_constraint("fk_jobs_operator_id_users", "jobs", type_="foreignkey")
        op.drop_column("jobs", "operator_id")
