"""
Unit & Integration Tests for Google Solar API Insights & Geocoding (/api/v1/solar).
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

# Inject vendor directory for pytest environment
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

from app.api import app

client = TestClient(app)


@patch("app.services.solar_api.requests.get")
@patch("app.services.solar_api.settings.GOOGLE_MAPS_API_KEY", "test_mock_api_key")
def test_get_solar_insights_success(mock_get):
    """Verify GET /api/v1/solar/insights returns parsed Google Solar API payload."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "solarPotential": {
            "maxArrayAreaMeters2": 120.5,
            "maxArrayPanelsCount": 42,
            "roofSegmentStats": [
                {
                    "pitchDegrees": 25.5,
                    "azimuthDegrees": 175.0
                }
            ]
        }
    }
    mock_get.return_value = mock_response

    response = client.get("/api/v1/solar/insights?lat=34.0522&lng=-118.2437")
    assert response.status_code == 200
    data = response.json()
    assert data["latitude"] == 34.0522
    assert data["longitude"] == -118.2437
    assert data["roof_area_sqm"] == 120.5
    assert data["max_panels_count"] == 42
    assert data["pitch_degrees"] == 25.5
    assert data["azimuth_degrees"] == 175.0
    assert data["is_fallback"] is False


@patch("app.services.solar_api.requests.get")
def test_get_solar_insights_fallback(mock_get):
    """Verify GET /api/v1/solar/insights falls back to default estimates when API fails."""
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_get.return_value = mock_response

    response = client.get("/api/v1/solar/insights?lat=0.0&lng=0.0")
    assert response.status_code == 200
    data = response.json()
    assert data["is_fallback"] is True
    assert data["roof_area_sqm"] == 50.0
    assert data["estimated_annual_kwh"] > 0


@patch("app.services.solar_api.requests.get")
def test_geocode_address_endpoint_success(mock_get):
    """Verify GET /api/v1/solar/geocode returns coordinates for address query."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [
        {
            "lat": "37.3361",
            "lon": "-121.8905",
            "display_name": "San Jose, CA"
        }
    ]
    mock_get.return_value = mock_response

    response = client.get("/api/v1/solar/geocode?address=San%20Jose,%20CA")
    assert response.status_code == 200
    data = response.json()
    assert "latitude" in data
    assert "longitude" in data
    assert "formatted_address" in data


def test_geocode_address_endpoint_validation():
    """Verify GET /api/v1/solar/geocode returns 422 for empty or single char query."""
    response = client.get("/api/v1/solar/geocode?address=a")
    assert response.status_code == 422
