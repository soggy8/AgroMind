"""Imports every module's ORM models so `Base.metadata` knows all tables.

Used by Alembic (migrations/env.py) and the test database. When a module adds a models.py,
import it here. This file sits at app level, so shared/ still never imports a module.
"""
from app.modules.croptwin import models as croptwin_models  # noqa: F401
from app.modules.simulator import models as simulator_models  # noqa: F401
from app.shared.db import Base

metadata = Base.metadata
