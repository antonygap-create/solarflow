"""
FastAPI Router for Google Solar API Insights & Geocoding (/api/v1/solar).
"""

from typing import Dict, Any
from fastapi import APIRouter, Query, HTTPException, status
from app.schemas.solar import SolarInsightsResponse
from app.services.solar_api import fetch_building_insights, geocode_address

router = APIRouter(
    prefix="/api/v1/solar",
    tags=["Google Solar & Geocoding API"]
)


@router.get(
    "/geocode",
    response_model=Dict[str, Any],
    status_code=status.HTTP_200_OK,
    summary="Geocode Address to Coordinates",
    description="Converts a user-entered address string into geographic coordinates (latitude, longitude) and formatted address."
)
async def geocode_user_address(
    address: str = Query(..., min_length=2, description="Target address query string")
) -> Dict[str, Any]:
    """
    HTTP GET endpoint to geocode address queries.
    """
    try:
        return geocode_address(address=address)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Geocoding failed for address '{address}': {str(err)}"
        )


@router.get(
    "/insights",
    response_model=SolarInsightsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Google Solar Building Insights",
    description=(
        "Retrieves roof segment area, pitch, azimuth, and solar yield potential "
        "from Google Solar API by geographic coordinates (latitude & longitude)."
    )
)
async def get_solar_insights(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Target latitude coordinate"),
    lng: float = Query(..., ge=-180.0, le=180.0, description="Target longitude coordinate")
) -> SolarInsightsResponse:
    """
    HTTP GET endpoint for solar building insights.
    """
    try:
        return fetch_building_insights(latitude=lat, longitude=lng)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to retrieve solar building insights: {str(err)}"
        )
