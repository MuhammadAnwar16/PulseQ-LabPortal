"""Integration-specific configuration loaded from environment variables.

All settings have safe defaults so the lab portal boots cleanly even when
INTEGRATION_MODE is not set — the module simply won't be mounted.
"""
from __future__ import annotations

import os
from functools import lru_cache


class PulseQIntegrationSettings:
    """Settings specific to the PulseQ ↔ Lab Portal bridge."""

    # Gate: only mount integration routes when this equals "pulseq_connected"
    INTEGRATION_MODE: str = os.getenv("INTEGRATION_MODE", "standalone")

    # PulseQ backend base URL (for outbound API/notification calls)
    PULSEQ_API_BASE_URL: str = os.getenv(
        "PULSEQ_API_BASE_URL", "http://localhost:10000/api/v1"
    )

    # Shared HMAC secret used to sign/verify webhook requests between the two
    # systems. Must be identical on both sides.
    PULSEQ_SHARED_SECRET: str = os.getenv(
        "PULSEQ_SHARED_SECRET", "dev-shared-secret-change-me"
    )

    @property
    def is_active(self) -> bool:
        return self.INTEGRATION_MODE == "pulseq_connected"


@lru_cache
def get_integration_settings() -> PulseQIntegrationSettings:
    return PulseQIntegrationSettings()


integration_settings = get_integration_settings()
