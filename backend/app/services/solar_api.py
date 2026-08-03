"""
Google Solar API & Geocoding Integration Service (services/solar_api.py)
-----------------------------------------------------------------------
Interfaces with Google Solar API (buildingInsights:findClosest) & Geocoding API
to convert user addresses into lat/lng coordinates and extract roof insights.
"""

from typing import Dict, Any, Tuple
import requests
from app.core.config import settings
from app.schemas.solar_generation import SolarGenerationRequest
from app.services.solar_generation import calculate_solar_generation
from app.schemas.solar import SolarInsightsResponse

GOOGLE_SOLAR_API_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest"
GOOGLE_GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json"
NOMINATIM_GEOCODING_URL = "https://nominatim.openstreetmap.org/search"


def geocode_address(address: str) -> Dict[str, Any]:
    """
    Geocodes an address string into (latitude, longitude, formatted_address).
    Uses Google Maps Geocoding API if GOOGLE_MAPS_API_KEY is configured,
    or OpenStreetMap Nominatim API as a reliable fallback.
    
    :param address: Address string entered by user
    :return: Dict containing latitude, longitude, and formatted_address
    """
    api_key = settings.GOOGLE_MAPS_API_KEY

    # 1. Try Google Maps Geocoding API if key is present
    if api_key:
        try:
            params = {"address": address, "key": api_key}
            resp = requests.get(GOOGLE_GEOCODING_API_URL, params=params, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "OK" and data.get("results"):
                    first_result = data["results"][0]
                    location = first_result["geometry"]["location"]
                    return {
                        "latitude": float(location["lat"]),
                        "longitude": float(location["lng"]),
                        "formatted_address": first_result.get("formatted_address", address)
                    }
        except Exception:
            pass

    # 2. Fallback to OpenStreetMap Nominatim API
    try:
        headers = {"User-Agent": "SolarFlow-Calculator/2.0"}
        params = {"q": address, "format": "json", "limit": 1}
        resp = requests.get(NOMINATIM_GEOCODING_URL, params=params, headers=headers, timeout=5.0)
        if resp.status_code == 200:
            results = resp.json()
            if results and len(results) > 0:
                first = results[0]
                return {
                    "latitude": float(first["lat"]),
                    "longitude": float(first["lon"]),
                    "formatted_address": first.get("display_name", address)
                }
    except Exception:
        pass

    # 3. Default fallback to Los Angeles, CA if address search yields no results
    return {
        "latitude": 34.0522,
        "longitude": -118.2437,
        "formatted_address": f"{address} (Default Fallback: Los Angeles, CA)"
    }


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
