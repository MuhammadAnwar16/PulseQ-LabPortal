"""Application configuration loaded from environment variables.

Defaults are dev-friendly (SQLite, permissive CORS) so the portal can boot with
no setup. Production should override DATABASE_URL, JWT_SECRET, CORS_ORIGINS.
"""
from __future__ import annotations

import os
from functools import lru_cache


class Settings:
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./pulseq.db")

    # Auth / JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-me-in-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

    # CORS
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:4200,http://127.0.0.1:4200,http://localhost:4000",
        ).split(",")
        if o.strip()
    ]

    # Reports
    REPORTS_DIR: str = os.getenv("REPORTS_DIR", "./reports")

    # Realtime
    REALTTIME_ENABLED: bool = os.getenv("REALTIME_ENABLED", "true").lower() == "true"

    # Cloudflare R2 (S3 compatible)
    R2_ENDPOINT_URL: str = os.getenv("R2_ENDPOINT_URL", "http://localhost:9000")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "pulseq-reports")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "dev-key")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "dev-secret")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
