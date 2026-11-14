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
from app.modules.croptwin.router import router as croptwin_router
from app.modules.simulator.router import router as simulator_router
from app.shared.db import check_connection


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="AgroMind API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(croptwin_router)
    app.include_router(simulator_router)
    # CropDoctor (/api/farms/{farm_id}/health) and the advisor (/api/advisor) mount here when they exist.

    @app.get("/api/health", tags=["meta"])
    def health() -> dict:
        db_ok = check_connection()
        return {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "unreachable",
                "environment": settings.environment}

    return app


app = create_app()
