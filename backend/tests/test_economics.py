"""
Unit & Integration Tests for Financial Economics API (/api/v1/estimate/economics).
"""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Inject vendor directory for pytest environment
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

from app.api import app
from app.schemas.economics import EconomicsRequest, TariffType
from app.services.economics import (
    calculate_economics,
    generate_mock_hourly_profile,
    DEFAULT_COST_PER_KW_USD,
    HOURS_PER_YEAR
)

client = TestClient(app)


def test_generate_mock_hourly_profile():
    """Verify mock profile generation sums to total annual energy across 8760 hours."""
    annual_gen = 14000.0
    profile_gen = generate_mock_hourly_profile(annual_gen, "generation")
    assert len(profile_gen) == HOURS_PER_YEAR
    assert sum(profile_gen) == pytest.approx(annual_gen, 1e-3)

    annual_cons = 12000.0
    profile_cons = generate_mock_hourly_profile(annual_cons, "consumption")
    assert len(profile_cons) == HOURS_PER_YEAR
    assert sum(profile_cons) == pytest.approx(annual_cons, 1e-3)


def test_economics_service_calculation():
    """Verify 8760-hour NEM 3.0 financial economics calculation."""
    req = EconomicsRequest(
        system_capacity_kw=10.0,
        annual_energy_kwh=14000.0,
        annual_consumption_kwh=12000.0,
        tariff_type=TariffType.NEM3
    )
    res = calculate_economics(req)

    # System cost: 10.0 * 2500.0 = 25000.00
    assert res.total_system_cost == 25000.00
    assert res.estimated_annual_savings > 0.0
    assert res.payback_period_years > 0.0
    assert 0.0 <= res.self_consumption_ratio <= 1.0
    assert res.assumptions["cost_per_kw_usd"] == DEFAULT_COST_PER_KW_USD
    assert res.assumptions["tariff_type"] == "NEM3"


def test_economics_service_custom_array_validation():
    """Verify ValueError is raised when custom hourly profile does not have 8760 elements."""
    invalid_hourly = [1.0] * 100  # Only 100 elements instead of 8760
    with pytest.raises(Exception):
        EconomicsRequest(
            system_capacity_kw=10.0,
            annual_energy_kwh=14000.0,
            annual_consumption_kwh=12000.0,
            tariff_type=TariffType.FLAT,
            hourly_generation=invalid_hourly
        )


def test_api_endpoint_estimate_economics_success():
    """Verify POST /api/v1/estimate/economics returns 200 OK and valid JSON response."""
    payload = {
        "system_capacity_kw": 10.0,
        "annual_energy_kwh": 14000.0,
        "annual_consumption_kwh": 12000.0,
        "tariff_type": "NEM3"
    }
    response = client.post("/api/v1/estimate/economics", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["total_system_cost"] == 25000.00
    assert data["estimated_annual_savings"] > 0
    assert "payback_period_years" in data
    assert "roi_25_years_percent" in data
    assert "self_consumption_ratio" in data


def test_api_endpoint_estimate_economics_invalid_payload():
    """Verify POST /api/v1/estimate/economics returns 422 for invalid negative capacity."""
    payload = {
        "system_capacity_kw": -5.0,  # Must be > 0
        "annual_energy_kwh": 14000.0,
        "annual_consumption_kwh": 12000.0,
        "tariff_type": "NEM3"
    }
    response = client.post("/api/v1/estimate/economics", json=payload)
    assert response.status_code == 422
