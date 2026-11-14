"""AgroMind API. Each module mounts its own router here.

Run from backend/:  uvicorn app.main:app --reload
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.modules.simulator.router import router as simulator_router

app = FastAPI(title="AgroMind API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("AGROMIND_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simulator_router)
# CropTwin and CropDoctor routers go here when they exist.


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
