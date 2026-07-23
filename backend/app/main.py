"""FastAPI application entrypoint for the PulseQ Laboratory backend.

Run with: uvicorn app.main:app --reload  (from the backend/ directory)
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routes import auth, laboratory_portal

logger = logging.getLogger("pulseq.lab.main")


def create_app() -> FastAPI:
    app = FastAPI(title="PulseQ Laboratory API", version="0.1.0", redirect_slashes=False)

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Auth is shared; lab portal is mounted under /api/v1/staff/laboratory.
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(laboratory_portal.router, prefix="/api/v1")

    # ------------------------------------------------------------------
    # PulseQ Integration (conditional)
    # Only loaded when INTEGRATION_MODE=pulseq_connected — has zero
    # effect on the lab portal when running standalone.
    # ------------------------------------------------------------------
    _integration_mode = os.getenv("INTEGRATION_MODE", "standalone")
    if _integration_mode == "pulseq_connected":
        try:
            from integrations.pulseq.routes import router as pulseq_router  # noqa: WPS433
            from integrations.pulseq.id_mapping import PulseQIDMapping  # noqa: F401, WPS433 — registers table

            app.include_router(pulseq_router, prefix="/api/v1")
            logger.info("✅ PulseQ integration module loaded (INTEGRATION_MODE=pulseq_connected)")

        except Exception as e:
            logger.error("❌ Failed to load PulseQ integration module: %s", e)
    else:
        logger.info("PulseQ integration not active (INTEGRATION_MODE=%s)", _integration_mode)

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "laboratory",
            "integration": _integration_mode,
        }

    @app.on_event("startup")
    def _startup() -> None:
        init_db()

    return app


app = create_app()
