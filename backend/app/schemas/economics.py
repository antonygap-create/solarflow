"""
Pydantic Schemas for Financial Economics API (/api/v1/estimate/economics).
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, field_validator


class TariffType(str, Enum):
    """Tariff structure types for billing calculation."""
    FLAT = "FLAT"
    TOU = "TOU"
    NEM3 = "NEM3"


class EconomicsRequest(BaseModel):
    """Input request model for financial economics and 8760-hour NEM 3.0 calculation."""

    system_capacity_kw: float = Field(
        ...,
        gt=0.0,
        description="Installed system capacity in kW (must be > 0)",
        json_schema_extra={"example": 10.0}
    )
    annual_energy_kwh: float = Field(
        ...,
        gt=0.0,
        description="Annual solar energy generation in kWh (must be > 0)",
        json_schema_extra={"example": 14000.0}
    )
    annual_consumption_kwh: float = Field(
        ...,
        gt=0.0,
        description="Annual facility electricity consumption in kWh (must be > 0)",
        json_schema_extra={"example": 12000.0}
    )
    tariff_type: TariffType = Field(
        default=TariffType.FLAT,
        description="Tariff compensation model (FLAT, TOU, NEM3)",
        json_schema_extra={"example": "NEM3"}
    )
    hourly_generation: Optional[List[float]] = Field(
        default=None,
        description="Optional 8760-hour array of solar generation values in kWh. Must contain exactly 8760 elements if provided."
    )
    hourly_consumption: Optional[List[float]] = Field(
        default=None,
        description="Optional 8760-hour array of consumption values in kWh. Must contain exactly 8760 elements if provided."
    )

    @field_validator("hourly_generation", "hourly_consumption")
    @classmethod
    def validate_hourly_array_length(cls, v: Optional[List[float]]) -> Optional[List[float]]:
        if v is not None and len(v) != 8760:
            raise ValueError(f"Hourly profile array must contain exactly 8760 values, but got {len(v)}.")
        return v


class EconomicsResponse(BaseModel):
    """Output response model for financial economics metrics."""

    total_system_cost: float = Field(
        ...,
        description="Total turn-key gross system cost in USD, rounded to 2 decimal places",
        json_schema_extra={"example": 25000.00}
    )
    estimated_annual_savings: float = Field(
        ...,
        description="Estimated Year 1 annual utility bill savings in USD, rounded to 2 decimal places",
        json_schema_extra={"example": 3120.50}
    )
    payback_period_years: float = Field(
        ...,
        description="Simple payback period in years, rounded to 1 decimal place",
        json_schema_extra={"example": 8.0}
    )
    roi_25_years_percent: float = Field(
        ...,
        description="25-year Return on Investment percentage, rounded to 2 decimal places",
        json_schema_extra={"example": 212.05}
    )
    self_consumption_ratio: float = Field(
        ...,
        description="Ratio of generated solar energy consumed on-site (0.0 to 1.0), rounded to 4 decimal places",
        json_schema_extra={"example": 0.7250}
    )
    assumptions: Dict[str, Any] = Field(
        ...,
        description="Financial and physical constants used in calculation",
        json_schema_extra={
            "example": {
                "cost_per_kw_usd": 2500.0,
                "import_rate_usd_kwh": 0.25,
                "export_rate_usd_kwh": 0.08,
                "system_lifespan_years": 25,
                "tariff_type": "NEM3"
            }
        }
    )
