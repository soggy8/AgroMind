"""AgroMind API. Each module mounts its own router here.

Run from backend/:
    alembic upgrade head                        # create / migrate tables
    python -m app.modules.croptwin.seed         # optional: demo farm
    uvicorn app.main:app --reload
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.modules.assistant.router import router as assistant_router
from app.modules.cropdoctor.router import router as cropdoctor_router
from app.modules.croptwin.router import router as croptwin_router
from app.modules.economics.router import router as economics_router
from app.modules.simulator.router import router as simulator_router
from app.shared.advisor.router import router as advisor_router
from app.modules.assistant import i18n_mk as assistant_mk
from app.modules.cropdoctor import i18n_mk as cropdoctor_mk
from app.modules.croptwin import i18n_mk as croptwin_mk
from app.modules.economics import i18n_mk as economics_mk
from app.modules.simulator import i18n_mk as simulator_mk
from app.shared import i18n
from app.shared import i18n_mk as shared_mk
from app.shared.db import check_connection


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="AgroMind API", version="0.1.0")

    # Sentences in responses follow the browser's Accept-Language (English or Macedonian); see app/shared/i18n.py.
    i18n.register("mk", {**shared_mk.CATALOG, **croptwin_mk.CATALOG, **cropdoctor_mk.CATALOG, **simulator_mk.CATALOG,
                         **economics_mk.CATALOG, **assistant_mk.CATALOG})
    app.add_middleware(i18n.TranslateResponses)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(croptwin_router)
    app.include_router(simulator_router)
    app.include_router(economics_router)
    app.include_router(cropdoctor_router)
    app.include_router(advisor_router)
    app.include_router(assistant_router)

    @app.get("/api/health", tags=["meta"])
    def health() -> dict:
        db_ok = check_connection()
        return {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "unreachable",
                "environment": settings.environment}

    return app


app = create_app()
