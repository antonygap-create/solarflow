"""
Pydantic Schemas for Google Solar API Integration (/api/v1/solar/insights).
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class SolarInsightsResponse(BaseModel):
    """Response model returning roof insights and solar energy potential."""

    latitude: float = Field(..., description="Target latitude coordinate")
    longitude: float = Field(..., description="Target longitude coordinate")
    roof_area_sqm: float = Field(..., description="Available solar roof area in m²")
    max_panels_count: int = Field(..., description="Maximum panel capacity count")
    pitch_degrees: float = Field(..., description="Optimal panel tilt/pitch angle in degrees (0-90)")
    azimuth_degrees: float = Field(..., description="Panel orientation azimuth in degrees (0-360)")
    estimated_annual_kwh: float = Field(..., description="Calculated annual energy yield in kWh")
    is_fallback: bool = Field(
        default=False,
        description="True if building imagery coverage was unavailable and estimated default roof parameters were applied"
    )
    solar_imagery_urls: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Data layer map overlay imagery URLs (mask, dsm, rgb)"
    )
