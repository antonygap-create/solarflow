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


class SystemArchitecture(str, Enum):
    """System architecture types (Grid-tied vs Hybrid vs Off-grid)."""
    GRID_TIED = "GRID_TIED"
    HYBRID_BATTERY = "HYBRID_BATTERY"
    OFF_GRID = "OFF_GRID"


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
    system_architecture: SystemArchitecture = Field(
        default=SystemArchitecture.GRID_TIED,
        description="System configuration (GRID_TIED, HYBRID_BATTERY, OFF_GRID)",
        json_schema_extra={"example": "HYBRID_BATTERY"}
    )
    battery_capacity_kwh: float = Field(
        default=0.0,
        ge=0.0,
        description="Battery storage capacity in kWh (e.g. 13.5 kWh Tesla Powerwall)",
        json_schema_extra={"example": 13.5}
    )
    ev_charger_enabled: bool = Field(
        default=False,
        description="Whether Level 2 EV Charger is included in the installation proposal",
        json_schema_extra={"example": True}
    )
    hourly_generation: Optional[List[float]] = Field(
        default=None,
        description="Optional 8760-hour array of solar generation values in kWh."
    )
    hourly_consumption: Optional[List[float]] = Field(
        default=None,
        description="Optional 8760-hour array of consumption values in kWh."
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
        description="Total turn-key gross system cost in USD, rounded to 2 decimal places"
    )
    battery_cost_usd: float = Field(
        default=0.0,
        description="Battery storage hardware & installation cost in USD"
    )
    annual_om_cost_usd: float = Field(
        default=0.0,
        description="Annual operations & maintenance cost ($30/kW/yr) in USD"
    )
    inverter_replacement_cost_usd: float = Field(
        default=0.0,
        description="Inverter replacement cost at Year 12 ($150/kW) in USD"
    )
    co2_saved_tons_25_years: float = Field(
        default=0.0,
        description="Estimated 25-year CO2 offset in metric tons (0.385 kg/kWh)"
    )
    estimated_annual_savings: float = Field(
        ...,
        description="Estimated Year 1 annual utility bill savings in USD, rounded to 2 decimal places"
    )
    payback_period_years: float = Field(
        ...,
        description="Simple payback period in years, rounded to 1 decimal place"
    )
    roi_25_years_percent: float = Field(
        ...,
        description="25-year Return on Investment percentage, rounded to 2 decimal places"
    )
    self_consumption_ratio: float = Field(
        ...,
        description="Ratio of generated solar energy consumed on-site (0.0 to 1.0), rounded to 4 decimal places"
    )
    assumptions: Dict[str, Any] = Field(
        ...,
        description="Financial and physical constants used in calculation"
    )
