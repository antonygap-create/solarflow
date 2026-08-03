"""
Multi-Tenant Isolation Test Suite (test_multi_tenancy.py)
---------------------------------------------------------
Verifies strict data isolation boundaries between installer tenants.
Ensures 404 Not Found response when accessing or updating another tenant's data.

Author: QA Lead & Security Specialist
"""

import os
import sys
import uuid
from pathlib import Path

# Set testing env vars BEFORE importing app modules
os.environ["TESTING"] = "true"
os.environ["USE_SQLITE"] = "true"

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

vendor_dir = backend_dir.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import pytest
from starlette.testclient import TestClient
from app.database import init_db, get_db
from app.api import app, on_startup
from app.models import Tenant, User, Lead, Project, SolarLayout
from app.auth import get_password_hash, create_access_token


@pytest.fixture(scope="module")
def client_setup():
    init_db()
    on_startup()
    db = next(get_db())

    # Create Tenant A
    tenant_a = Tenant(
        name="SunPower Alpha Inc.",
        slug="tenant-alpha",
        default_electricity_rate=0.15,
        default_cost_per_watt=2.50,
        default_state_code="CA"
    )
    db.add(tenant_a)
    db.flush()

    user_a = User(
        tenant_id=tenant_a.id,
        email="manager@alpha.com",
        hashed_password=get_password_hash("password123"),
        full_name="Alpha Manager",
        role="admin"
    )
    db.add(user_a)

    # Create Tenant B
    tenant_b = Tenant(
        name="SunPower Beta Inc.",
        slug="tenant-beta",
        default_electricity_rate=0.15,
        default_cost_per_watt=2.50,
        default_state_code="FL"
    )
    db.add(tenant_b)
    db.flush()

    user_b = User(
        tenant_id=tenant_b.id,
        email="manager@beta.com",
        hashed_password=get_password_hash("password123"),
        full_name="Beta Manager",
        role="admin"
    )
    db.add(user_b)
    db.flush()

    # Create Project & Lead for Tenant B
    lead_b = Lead(
        tenant_id=tenant_b.id,
        first_name="Jane",
        last_name="Doe",
        email="jane.doe@example.com",
        phone="+14155552671",
        status="NEW"
    )
    db.add(lead_b)
    db.flush()

    project_b = Project(
        tenant_id=tenant_b.id,
        lead_id=lead_b.id,
        name="Beta Customer Roof",
        address="100 Miami Way, Miami, FL",
        state_code="FL",
        latitude=25.7617,
        longitude=-80.1918
    )
    db.add(project_b)
    db.commit()

    token_a = create_access_token({"sub": str(user_a.id), "tenant_id": str(tenant_a.id)})
    token_b = create_access_token({"sub": str(user_b.id), "tenant_id": str(tenant_b.id)})

    return {
        "client": TestClient(app),
        "user_a": user_a,
        "token_a": token_a,
        "user_b": user_b,
        "token_b": token_b,
        "project_b_id": str(project_b.id),
        "lead_b_id": str(lead_b.id)
    }


def test_public_b2c_nonexistent_tenant_slug(client_setup):
    """B2C Lead Creation with non-existent tenant_slug must return 404 Not Found."""
    client = client_setup["client"]
    res = client.post("/api/public/estimate", json={
        "tenant_slug": "non-existent-installer-slug-9999",
        "address": "123 Solar St, San Jose, CA",
        "latitude": 37.3382,
        "longitude": -121.8863,
        "first_name": "Test",
        "last_name": "User",
        "email": "test@example.com",
        "phone": "+1 (415) 555-2671"
    })
    assert res.status_code == 404, f"Expected 404 for missing tenant_slug, got {res.status_code}"
    assert "not found" in res.json()["detail"].lower()


def test_tenant_a_user_cannot_access_tenant_b_project(client_setup):
    """User from Tenant A attempting to access Project from Tenant B must get 404 Not Found."""
    client = client_setup["client"]
    token_a = client_setup["token_a"]
    project_b_id = client_setup["project_b_id"]

    res = client.get(f"/api/dashboard/projects/{project_b_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 404, f"Expected 404 Data Bleed Protection, got {res.status_code}"


def test_tenant_a_user_cannot_update_tenant_b_project(client_setup):
    """User from Tenant A attempting to update Project from Tenant B must get 404 Not Found."""
    client = client_setup["client"]
    token_a = client_setup["token_a"]
    project_b_id = client_setup["project_b_id"]

    res = client.put(f"/api/dashboard/projects/{project_b_id}", json={
        "notes": "Malicious modification attempt",
        "custom_cost_per_watt": 1.00
    }, headers={"Authorization": f"Bearer {token_a}"})

    assert res.status_code == 404, f"Expected 404 Data Bleed Protection on PUT, got {res.status_code}"


def test_tenant_b_user_can_access_own_project(client_setup):
    """User from Tenant B can access their own project successfully."""
    client = client_setup["client"]
    token_b = client_setup["token_b"]
    project_b_id = client_setup["project_b_id"]

    res = client.get(f"/api/dashboard/projects/{project_b_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 200
    data = res.json()
    assert data["project_id"] == project_b_id
    assert data["state_code"] == "FL"
