"""
End-to-End Verification Test for Dual-Interface Architecture (B2C Public & B2B Dashboard)
"""

import sys
from pathlib import Path
vendor_dir = Path(__file__).resolve().parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

from starlette.testclient import TestClient
from api import app, on_startup
from database import init_db

def test_dual_architecture():
    # Trigger DDL initialization & seed data
    init_db()
    on_startup()

    client = TestClient(app)

    print("=" * 70)
    print("SOLARFLOW DUAL-INTERFACE ARCHITECTURE — INTEGRATION TEST")
    print("=" * 70)

    # 1. TEST ROUTER A: PUBLIC B2C ESTIMATE ENDPOINT (/api/public/estimate)
    print("\n[1/4] Testing Public B2C Lead Generation Endpoint (/api/public/estimate)...")
    b2c_payload = {
        "tenant_slug": "default-installer",
        "address": "742 Evergreen Terrace, Springfield, OR",
        "latitude": 34.0522,
        "longitude": -118.2437,
        "first_name": "Homer",
        "last_name": "Simpson",
        "email": "homer.simpson@example.com",
        "phone": "+1 (555) 392-1044"
    }

    res_b2c = client.post("/api/public/estimate", json=b2c_payload)
    assert res_b2c.status_code == 201, f"B2C Estimate Failed: {res_b2c.text}"
    b2c_data = res_b2c.json()

    print("  ✓ B2C Lead Inquiry Created Successfully!")
    print(f"  • Lead ID      : {b2c_data['lead_id']}")
    print(f"  • Project ID   : {b2c_data['project_id']}")
    print(f"  • Tenant Name  : {b2c_data['tenant_name']}")
    print(f"  • Max Capacity : {b2c_data['max_capacity_kwp']} kWp ({b2c_data['total_panels']} panels)")
    print(f"  • Est. Savings : ${b2c_data['estimated_yearly_savings_usd_min']} - ${b2c_data['estimated_yearly_savings_usd_max']} / year")

    project_id = b2c_data['project_id']

    # 2. TEST ROUTER B: MANAGER JWT LOGIN (/api/dashboard/token)
    print("\n[2/4] Testing B2B Manager JWT Authentication (/api/dashboard/token)...")
    login_data = {
        "username": "admin@solarflow.com",
        "password": "admin123"
    }
    res_token = client.post("/api/dashboard/token", data=login_data)
    assert res_token.status_code == 200, f"Token Login Failed: {res_token.text}"
    token_data = res_token.json()
    token = token_data["access_token"]

    print("  ✓ Manager Authenticated Successfully!")
    print(f"  • User Name    : {token_data['full_name']} ({token_data['email']})")
    print(f"  • Tenant ID    : {token_data['tenant_id']} ({token_data['tenant_name']})")
    print(f"  • JWT Token    : {token[:25]}...")

    headers = {"Authorization": f"Bearer {token}"}

    # 3. TEST ROUTER B: GET LEADS LIST (/api/dashboard/leads)
    print("\n[3/4] Testing Protected Dashboard Leads Endpoint (/api/dashboard/leads)...")
    res_leads = client.get("/api/dashboard/leads", headers=headers)
    assert res_leads.status_code == 200, f"Get Leads Failed: {res_leads.text}"
    leads = res_leads.json()

    print(f"  ✓ Fetched {len(leads)} B2C Lead(s) for Current Tenant:")
    for l in leads:
        print(f"  • Lead #{l['id'][:8]}: {l['first_name']} {l['last_name']} ({l['email']}) | Status: {l['status']}")

    # 4. TEST ROUTER B: GET & PUT PROJECT DETAILS (/api/dashboard/projects/{project_id})
    print("\n[4/4] Testing Protected Dashboard Project Detail & Update Endpoints...")
    res_project = client.get(f"/api/dashboard/projects/{project_id}", headers=headers)
    assert res_project.status_code == 200, f"Get Project Detail Failed: {res_project.text}"
    proj_detail = res_project.json()

    print(f"  ✓ Project Details Fetched Successfully:")
    print(f"  • Project Name : {proj_detail['name']}")
    print(f"  • Address      : {proj_detail['address']}")
    print(f"  • Layout Panels: {proj_detail['layout']['total_panels']} panels ({proj_detail['layout']['total_capacity_kwp']} kWp)")

    # Update Project Notes & Custom Pricing
    update_payload = {
        "notes": "Customer interested in Tesla Powerwall battery integration.",
        "custom_cost_per_watt": 2.35
    }
    res_update = client.put(f"/api/dashboard/projects/{project_id}", json=update_payload, headers=headers)
    assert res_update.status_code == 200, f"Update Project Failed: {res_update.text}"

    print("  ✓ Manager Manual Layout Adjustments Saved Successfully!")

    print("\n" + "=" * 70)
    print("SUCCESS: ALL DUAL-INTERFACE ARCHITECTURE TESTS PASSED 100%!")
    print("=" * 70)

if __name__ == "__main__":
    test_dual_architecture()
