"""
FastAPI Router for Solar Generation Estimation (/api/v1/estimate/generation).
"""

from fastapi import APIRouter, HTTPException, status
from app.schemas.solar_generation import SolarGenerationRequest, SolarGenerationResponse
from app.services.solar_generation import calculate_solar_generation

router = APIRouter(
    prefix="/api/v1/estimate",
    tags=["Solar Generation"]
)


@router.post(
    "/generation",
    response_model=SolarGenerationResponse,
    status_code=status.HTTP_200_OK,
    summary="Estimate Annual Solar Energy Generation",
    description=(
        "Calculates expected annual energy yield (kWh) for a given roof area and location "
        "using the mathematical physics model E = A * r * H * PR."
    )
)
async def estimate_solar_generation(payload: SolarGenerationRequest) -> SolarGenerationResponse:
    """
    HTTP POST endpoint for calculating solar energy generation.
    
    - **latitude**: Latitude in degrees (-90 to 90)
    - **longitude**: Longitude in degrees (-180 to 180)
    - **roof_area_sqm**: Roof area in square meters (> 0)
    - **azimuth**: Orientation azimuth in degrees (0 to 360, 180 is South)
    - **tilt**: Inclination tilt in degrees (0 to 90)
    
    Returns estimated annual kWh yield and physical calculation assumptions.
    """
    try:
        return calculate_solar_generation(payload)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err)
        )
