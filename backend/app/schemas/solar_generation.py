"""
Pydantic Schemas for Solar Generation Estimation API (/api/v1/estimate/generation).
"""

from typing import Dict, Any
from pydantic import BaseModel, Field


class SolarGenerationRequest(BaseModel):
    """Input payload for solar energy yield generation calculation."""

    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude coordinate in degrees (-90.0 to 90.0)",
        json_schema_extra={"example": 34.0522}
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude coordinate in degrees (-180.0 to 180.0)",
        json_schema_extra={"example": -118.2437}
    )
    roof_area_sqm: float = Field(
        ...,
        gt=0.0,
        description="Available roof area in square meters (must be > 0)",
        json_schema_extra={"example": 50.0}
    )
    azimuth: float = Field(
        default=180.0,
        ge=0.0,
        le=360.0,
        description="Solar panel orientation azimuth in degrees (0 to 360, 180 is South)",
        json_schema_extra={"example": 180.0}
    )
    tilt: float = Field(
        default=20.0,
        ge=0.0,
        le=90.0,
        description="Solar panel inclination tilt in degrees (0 to 90)",
        json_schema_extra={"example": 20.0}
    )


class SolarGenerationResponse(BaseModel):
    """Output response model containing calculated annual energy yield and calculation assumptions."""

    estimated_annual_kwh: float = Field(
        ...,
        description="Calculated annual energy generation yield in kWh, rounded to 2 decimal places",
        json_schema_extra={"example": 10400.00}
    )
    assumptions: Dict[str, Any] = Field(
        ...,
        description="Physical constants and parameters used during calculation",
        json_schema_extra={
            "example": {
                "system_efficiency": 0.20,
                "performance_ratio": 0.80,
                "insolation_kwh_m2": 1300.0,
                "azimuth": 180.0,
                "tilt": 20.0
            }
        }
    )
