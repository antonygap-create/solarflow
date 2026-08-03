"""
Unit & Integration Tests for Solar Generation Estimation API (/api/v1/estimate/generation).
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
from app.services.solar_generation import (
    calculate_solar_generation,
    get_mock_insolation,
    DEFAULT_SYSTEM_EFFICIENCY,
    DEFAULT_PERFORMANCE_RATIO,
    MIN_ROOF_AREA_SQM
)
from app.schemas.solar_generation import SolarGenerationRequest

client = TestClient(app)


def test_solar_generation_service_success():
    """Verify physical math model E = A * r * H * PR calculation in service layer."""
    req = SolarGenerationRequest(
        latitude=34.0522,
        longitude=-118.2437,
        roof_area_sqm=50.0,
        azimuth=180.0,
        tilt=20.0
    )
    res = calculate_solar_generation(req)

    # 50.0 * 0.20 * 1300.0 * 0.80 = 10400.00
    expected_kwh = 50.0 * 0.20 * 1300.0 * 0.80
    assert res.estimated_annual_kwh == pytest.approx(expected_kwh, 0.01)
    assert res.assumptions["system_efficiency"] == DEFAULT_SYSTEM_EFFICIENCY
    assert res.assumptions["performance_ratio"] == DEFAULT_PERFORMANCE_RATIO
    assert res.assumptions["insolation_kwh_m2"] == 1300.0


def test_solar_generation_service_too_small_roof_area():
    """Verify ValueError is raised when roof_area_sqm is below MIN_ROOF_AREA_SQM."""
    req = SolarGenerationRequest(
        latitude=34.0522,
        longitude=-118.2437,
        roof_area_sqm=1.0,  # Below 1.6 m²
        azimuth=180.0,
        tilt=20.0
    )
    with pytest.raises(ValueError) as exc_info:
        calculate_solar_generation(req)
    assert "too small" in str(exc_info.value)


def test_api_endpoint_estimate_generation_success():
    """Verify POST /api/v1/estimate/generation endpoint returns 200 OK and valid payload."""
    payload = {
        "latitude": 34.0522,
        "longitude": -118.2437,
        "roof_area_sqm": 50.0,
        "azimuth": 180.0,
        "tilt": 20.0
    }
    response = client.post("/api/v1/estimate/generation", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["estimated_annual_kwh"] == 10400.00
    assert data["assumptions"]["system_efficiency"] == 0.20
    assert data["assumptions"]["performance_ratio"] == 0.80
    assert data["assumptions"]["insolation_kwh_m2"] == 1300.0


def test_api_endpoint_estimate_generation_small_area_error():
    """Verify POST /api/v1/estimate/generation returns HTTP 400 when area is too small."""
    payload = {
        "latitude": 34.0522,
        "longitude": -118.2437,
        "roof_area_sqm": 0.5,
        "azimuth": 180.0,
        "tilt": 20.0
    }
    response = client.post("/api/v1/estimate/generation", json=payload)
    assert response.status_code == 400
    assert "too small" in response.json()["detail"]


def test_api_endpoint_estimate_generation_pydantic_validation_error():
    """Verify POST /api/v1/estimate/generation returns HTTP 422 for invalid latitude (> 90)."""
    payload = {
        "latitude": 150.0,  # Invalid latitude
        "longitude": -118.2437,
        "roof_area_sqm": 50.0,
        "azimuth": 180.0,
        "tilt": 20.0
    }
    response = client.post("/api/v1/estimate/generation", json=payload)
    assert response.status_code == 422
