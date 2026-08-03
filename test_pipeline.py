"""
Verification test script for api.py FastAPI endpoint
"""

import sys
from pathlib import Path
vendor_dir = Path(__file__).resolve().parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

from starlette.testclient import TestClient
from api import app

def test_api_endpoint():
    client = TestClient(app)
    
    # 1. Health check
    res_health = client.get("/health")
    assert res_health.status_code == 200
    print("Health check response:", res_health.json())

    # 2. Solar layout generation request
    payload = {
        "latitude": 34.0522,
        "longitude": -118.2437
    }
    res_layout = client.post("/api/v1/solar/generate-layout", json=payload)
    assert res_layout.status_code == 200, f"Expected 200, got {res_layout.status_code}: {res_layout.text}"
    
    data = res_layout.json()
    print("\nAPI Response Summary:")
    print("  • Total Panels Installed  :", data["summary"]["total_panels"])
    print("  • Total Installed Capacity:", data["summary"]["total_capacity_kwp"], "kWp")
    print("  • Total Annual Yield      :", data["summary"]["total_annual_generation_kwh"], "kWh/year")
    print("  • Performance Ratio (PR)  :", data["summary"]["system_performance_ratio"])
    print("  • GeoJSON Features Count  :", len(data["geojson"]["features"]))

    if data["geojson"]["features"]:
        sample_feature = data["geojson"]["features"][0]
        print("\nSample GeoJSON Feature:")
        print("  • Geometry Type :", sample_feature["geometry"]["type"])
        print("  • Panel ID      :", sample_feature["properties"]["panel_id"])
        print("  • Orientation   :", sample_feature["properties"]["orientation"])
        print("  • Annual Yield  :", sample_feature["properties"]["annual_yield_kwh"], "kWh")
        print("  • Coordinates   :", sample_feature["geometry"]["coordinates"][0][:2])

    print("\nALL API PIPELINE TESTS PASSED 100%!")

if __name__ == "__main__":
    test_api_endpoint()
