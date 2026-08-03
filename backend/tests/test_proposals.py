"""
Unit & Integration Tests for Proposal Persistence API (/api/v1/proposals).
"""

import sys
import uuid
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Inject vendor directory for pytest environment
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

from app.api import app

client = TestClient(app)


def test_create_and_get_proposal_workflow():
    """Verify creating a proposal record and retrieving it by UUID."""
    payload = {
        "customer_email": "test.customer@example.com",
        "latitude": 34.0522,
        "longitude": -118.2437,
        "system_capacity_kw": 10.0,
        "annual_generation_kwh": 14000.0,
        "total_system_cost": 25000.0,
        "estimated_annual_savings": 3120.50,
        "roi_25_years_percent": 212.05
    }

    # 1. Create Proposal
    create_res = client.post("/api/v1/proposals/", json=payload)
    assert create_res.status_code == 201
    proposal_data = create_res.json()
    assert "id" in proposal_data
    proposal_id = proposal_data["id"]
    assert proposal_data["customer_email"] == "test.customer@example.com"
    assert proposal_data["system_capacity_kw"] == 10.0

    # 2. Get Proposal by ID
    get_res = client.get(f"/api/v1/proposals/{proposal_id}")
    assert get_res.status_code == 200
    retrieved = get_res.json()
    assert retrieved["id"] == proposal_id
    assert retrieved["annual_generation_kwh"] == 14000.0
    assert retrieved["total_system_cost"] == 25000.0


def test_get_nonexistent_proposal():
    """Verify GET /api/v1/proposals/{id} returns 404 for unknown UUID."""
    random_id = str(uuid.uuid4())
    response = client.get(f"/api/v1/proposals/{random_id}")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
