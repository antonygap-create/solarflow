"""
Google Solar API Integration Service (services/solar_api.py)
------------------------------------------------------------
Interfaces with Google Solar API (buildingInsights:findClosest)
to extract roof segment area, pitch, azimuth, and solar potential.
"""

from typing import Dict, Any
import requests
from app.core.config import settings
from app.schemas.solar_generation import SolarGenerationRequest
from app.services.solar_generation import calculate_solar_generation
from app.schemas.solar import SolarInsightsResponse

GOOGLE_SOLAR_API_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest"


def fetch_building_insights(latitude: float, longitude: float) -> SolarInsightsResponse:
    """
    Queries Google Solar API for building insights at (latitude, longitude).
    Gracefully falls back to default roof estimations if API key is unconfigured
    or imagery is unavailable for the target location.
    
    :param latitude: Target latitude
    :param longitude: Target longitude
    :return: SolarInsightsResponse model
    """
    api_key = settings.GOOGLE_MAPS_API_KEY

    roof_area: float = 50.0
    pitch: float = 20.0
    azimuth: float = 180.0
    max_panels: int = 30
    is_fallback: bool = True
    imagery_urls = None

    if api_key:
        try:
            params = {
                "location.latitude": latitude,
                "location.longitude": longitude,
                "requiredQuality": "HIGH",
                "key": api_key
            }
            resp = requests.get(GOOGLE_SOLAR_API_URL, params=params, timeout=5.0)
            if resp.status_code == 200:
                data: Dict[str, Any] = resp.json()
                potential = data.get("solarPotential", {})
                
                area_meters = potential.get("maxArrayAreaMeters2")
                if area_meters and area_meters > 0:
                    roof_area = float(area_meters)

                panels_count = potential.get("maxArrayPanelsCount")
                if panels_count and panels_count > 0:
                    max_panels = int(panels_count)

                segments = potential.get("roofSegmentStats", [])
                if segments:
                    pitch = float(segments[0].get("pitchDegrees", 20.0))
                    azimuth = float(segments[0].get("azimuthDegrees", 180.0))

                is_fallback = False
        except Exception:
            is_fallback = True

    # Calculate annual energy yield via physical formula (E = A * r * H * PR)
    gen_req = SolarGenerationRequest(
        latitude=latitude,
        longitude=longitude,
        roof_area_sqm=roof_area,
        azimuth=azimuth,
        tilt=pitch
    )
    gen_res = calculate_solar_generation(gen_req)

    return SolarInsightsResponse(
        latitude=latitude,
        longitude=longitude,
        roof_area_sqm=round(roof_area, 2),
        max_panels_count=max_panels,
        pitch_degrees=round(pitch, 1),
        azimuth_degrees=round(azimuth, 1),
        estimated_annual_kwh=gen_res.estimated_annual_kwh,
        is_fallback=is_fallback,
        solar_imagery_urls=imagery_urls
    )
