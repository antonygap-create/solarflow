"""
Computational Geometry & Fire Code Test Suite (test_geometry.py)
-----------------------------------------------------------------
Verifies US NFPA fire setback rules and panel placement calculations.

Author: Computational Geometry Specialist
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

vendor_dir = backend_dir.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import pytest
from shapely.geometry import Polygon, box
from app.solar_packer import SolarPacker, PanelConfig


def test_nfpa_fire_setback_subtraction():
    """Verifies that 3ft (0.914m) edge setback subtracts perimeter area from roof polygon."""
    # 10m x 10m roof = 100m^2
    roof_poly = box(0, 0, 10, 10)
    config = PanelConfig(edge_setback=0.914, obstacle_buffer=0.457)
    packer = SolarPacker(config=config)

    res = packer.pack(roof_polygon=roof_poly, obstacles=[], azimuth_deg=180.0)

    # Inner usable rectangle = (10 - 2*0.914) x (10 - 2*0.914) = 8.172 x 8.172 = ~66.78 m^2
    assert res.total_count > 0
    assert res.usable_area_m2 < 100.0
    assert res.usable_area_m2 == pytest.approx(66.78, abs=0.5)

    # All panel polygons must be contained within usable area boundary
    usable_roof = roof_poly.buffer(-0.914)
    for panel in res.panels:
        assert usable_roof.contains(panel) or usable_roof.covers(panel)


def test_small_roof_returns_zero_panels_if_setback_exceeds_area():
    """Roof smaller than 3ft setbacks on each side should return 0 panels safely."""
    small_roof = box(0, 0, 1.5, 1.5) # 1.5m x 1.5m
    packer = SolarPacker()

    res = packer.pack(roof_polygon=small_roof, obstacles=[])
    assert res.total_count == 0
    assert len(res.panels) == 0
