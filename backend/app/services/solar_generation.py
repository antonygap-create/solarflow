"""
Solar Generation Calculation Service (Business Logic Layer)
-----------------------------------------------------------
Implements physical solar yield model: E = A * r * H * PR

Formula Parameters:
- E: Annual Energy Yield (kWh)
- A: roof_area_sqm (m²)
- r: System Efficiency (constant 0.20 for modern PV panels)
- H: Annual Solar Insolation (kWh/m² via mock function get_mock_insolation)
- PR: Performance Ratio (constant 0.80)
"""

from typing import Tuple
from app.schemas.solar_generation import SolarGenerationRequest, SolarGenerationResponse

# Physical Constants
DEFAULT_SYSTEM_EFFICIENCY: float = 0.20  # 20% modern panel efficiency
DEFAULT_PERFORMANCE_RATIO: float = 0.80   # 80% system losses & inverter factor
MIN_ROOF_AREA_SQM: float = 1.6            # Minimum area required for at least 1 standard panel


def get_mock_insolation(lat: float, lon: float) -> float:
    """
    Mock function returning average annual solar insolation in kWh/m².
    
    In future iterations, this will query raster GIS layers or external NREL API.
    
    :param lat: Latitude in degrees
    :param lon: Longitude in degrees
    :return: Annual insolation in kWh/m² (default 1300.0)
    """
    return 1300.0


def calculate_solar_generation(req: SolarGenerationRequest) -> SolarGenerationResponse:
    """
    Calculates estimated annual solar energy generation (kWh) for given roof parameters.
    
    :param req: SolarGenerationRequest containing roof_area_sqm, lat, lon, azimuth, tilt
    :return: SolarGenerationResponse with rounded kWh yield and calculation assumptions
    :raises ValueError: If roof area is too small to install solar panels (< MIN_ROOF_AREA_SQM)
    """
    if req.roof_area_sqm < MIN_ROOF_AREA_SQM:
        raise ValueError(
            f"Roof area ({req.roof_area_sqm:.2f} m²) is too small to install solar panels. "
            f"Minimum required area is {MIN_ROOF_AREA_SQM} m²."
        )

    # Physical calculation formula: E = A * r * H * PR
    area: float = req.roof_area_sqm
    efficiency: float = DEFAULT_SYSTEM_EFFICIENCY
    insolation: float = get_mock_insolation(req.latitude, req.longitude)
    performance_ratio: float = DEFAULT_PERFORMANCE_RATIO

    annual_energy_yield_kwh: float = area * efficiency * insolation * performance_ratio
    rounded_yield: float = round(annual_energy_yield_kwh, 2)

    return SolarGenerationResponse(
        estimated_annual_kwh=rounded_yield,
        assumptions={
            "system_efficiency": efficiency,
            "performance_ratio": performance_ratio,
            "insolation_kwh_m2": insolation,
            "azimuth": req.azimuth,
            "tilt": req.tilt
        }
    )
