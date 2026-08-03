"""
Core Configuration Module (core/config.py)
-------------------------------------------
Reads environment configuration including Google Maps / Solar API Key.
"""

import os
from pydantic import BaseModel


class Settings(BaseModel):
    """Application Settings and Environment Variable Configuration."""

    PROJECT_NAME: str = "SolarFlow Engineering Platform"
    VERSION: str = "2.0.0"

    # Google Maps & Solar API Key
    GOOGLE_MAPS_API_KEY: str = os.environ.get(
        "GOOGLE_MAPS_API_KEY",
        os.environ.get("GOOGLE_SOLAR_API_KEY", "")
    )

    # Database & Environment Configuration
    CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "http://localhost:3000")


settings = Settings()
