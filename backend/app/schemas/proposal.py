"""
Pydantic Schemas for Proposal Persistence API (/api/v1/proposals).
"""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict


class ProposalCreate(BaseModel):
    """Payload model for creating a new commercial solar proposal record."""

    customer_email: Optional[EmailStr] = Field(
        default=None,
        description="Optional customer email address",
        json_schema_extra={"example": "customer@example.com"}
    )
    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Site latitude coordinate (-90 to 90)",
        json_schema_extra={"example": 34.0522}
    )
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Site longitude coordinate (-180 to 180)",
        json_schema_extra={"example": -118.2437}
    )
    system_capacity_kw: float = Field(
        ...,
        gt=0.0,
        description="Installed system capacity in kW (> 0)",
        json_schema_extra={"example": 10.0}
    )
    annual_generation_kwh: float = Field(
        ...,
        gt=0.0,
        description="Annual energy generation in kWh (> 0)",
        json_schema_extra={"example": 14000.0}
    )
    total_system_cost: float = Field(
        ...,
        gt=0.0,
        description="Total gross system cost in USD (> 0)",
        json_schema_extra={"example": 25000.00}
    )
    estimated_annual_savings: float = Field(
        ...,
        ge=0.0,
        description="Estimated annual utility savings in USD (>= 0)",
        json_schema_extra={"example": 3120.50}
    )
    roi_25_years_percent: float = Field(
        ...,
        description="25-year Return on Investment percentage",
        json_schema_extra={"example": 212.05}
    )


class ProposalRead(ProposalCreate):
    """Response model for reading a saved proposal record."""

    id: uuid.UUID = Field(
        ...,
        description="Unique proposal UUID identifier",
        json_schema_extra={"example": "1796efdb-f016-4407-aeb3-65e78f5ec458"}
    )
    created_at: datetime = Field(
        ...,
        description="Timestamp when proposal record was created"
    )

    model_config = ConfigDict(from_attributes=True)
