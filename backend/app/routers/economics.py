"""
FastAPI Router for Financial Economics Estimation (/api/v1/estimate/economics).
"""

from fastapi import APIRouter, HTTPException, status
from app.schemas.economics import EconomicsRequest, EconomicsResponse
from app.services.economics import calculate_economics

router = APIRouter(
    prefix="/api/v1/estimate",
    tags=["Financial Economics"]
)


@router.post(
    "/economics",
    response_model=EconomicsResponse,
    status_code=status.HTTP_200_OK,
    summary="Estimate Financial Economics & Payback",
    description=(
        "Calculates 8760-hour NEM 3.0 annual utility bill savings, turnkey system cost, "
        "simple payback period in years, 25-year ROI %, and self-consumption ratio."
    )
)
async def estimate_financial_economics(payload: EconomicsRequest) -> EconomicsResponse:
    """
    HTTP POST endpoint for calculating financial economics.
    
    - **system_capacity_kw**: System capacity in kW (> 0)
    - **annual_energy_kwh**: Annual generation in kWh (> 0)
    - **annual_consumption_kwh**: Annual consumption in kWh (> 0)
    - **tariff_type**: Billing model (FLAT, TOU, NEM3)
    - **hourly_generation**: Optional 8760-hour array of solar generation values
    - **hourly_consumption**: Optional 8760-hour array of consumption values
    
    Returns financial metrics including total system cost, annual savings, payback period, and 25-year ROI.
    """
    try:
        return calculate_economics(payload)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err)
        )
