"""Alembic environment: one metadata (app.models) and the URL from app settings."""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context

from app.core.config import get_settings
from app.models import metadata
from app.shared.db import make_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

URL = config.attributes.get("url") or get_settings().database_url


def include_name(name, type_, parent_names) -> bool:
    """Only manage our own tables. The PostGIS image ships extension tables (spatial_ref_sys,
    TIGER geocoder, topology) that autogenerate would otherwise offer to drop."""
    if type_ == "schema":
        return name in (None, "public")
    if type_ == "table":
        return name in metadata.tables
    return True


def run_offline() -> None:
    context.configure(url=URL, target_metadata=metadata, literal_binds=True, render_as_batch=True, include_name=include_name,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    engine = make_engine(URL)
    with engine.connect() as connection:
        # Batch mode lets ALTER TABLE migrations also work on SQLite.
        context.configure(connection=connection, target_metadata=metadata, render_as_batch=True,
                          compare_type=True, include_name=include_name)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_offline()
else:
    run_online()
