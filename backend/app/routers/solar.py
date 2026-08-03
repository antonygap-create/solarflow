"""
FastAPI Router for Google Solar API Insights (/api/v1/solar/insights).
"""

from fastapi import APIRouter, Query, HTTPException, status
from app.schemas.solar import SolarInsightsResponse
from app.services.solar_api import fetch_building_insights

router = APIRouter(
    prefix="/api/v1/solar",
    tags=["Google Solar API Insights"]
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
