"""
Solar Panel Packing Algorithm (solar_packer.py)
-----------------------------------------------
Vectorized polygon layout optimizer using Shapely 2.0+ and NumPy.
Calculates maximum high-density panel placement respecting US IFC / NFPA fire setbacks:
- 3ft (~0.914m) edge setback along roof perimeter and ridge line.
- 1.5ft (~0.457m) obstacle clearance buffer around chimneys, HVAC, skylights.

Author: Computational Geometry Specialist
"""

import sys
import math
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple, Optional

# Inject vendor directory
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if not vendor_dir.exists():
    vendor_dir = Path(__file__).resolve().parent.parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import numpy as np
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.affinity import rotate, translate
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree


@dataclass(frozen=True)
class PanelConfig:
    """Standard PV Solar Panel Hardware Dimensions & NFPA Regulations (US Market)."""
    width: float = 1.70           # Panel height/length in meters (1.7m)
    height: float = 1.00          # Panel width in meters (1.0m)
    wattage: float = 400.0        # Module rating in Watts (400 Wp)
    rail_gap: float = 0.02        # Inter-panel mounting gap (2 cm)
    edge_setback: float = 0.914   # US IFC/NFPA Fire setback: 3 ft = 0.914 m
    obstacle_buffer: float = 0.457# Obstacle clearance buffer: 1.5 ft = 0.457 m


@dataclass
class PackingResult:
    """Encapsulates the geometry result of a panel placement computation."""
    panels: List[Polygon]
    orientation: str              # 'Portrait' or 'Landscape'
    total_count: int
    total_capacity_kwp: float
    usable_area_m2: float
    coverage_ratio: float


class SolarPacker:
    """2D Vectorized Solar Panel Packing Optimization Engine."""

    def __init__(self, config: Optional[PanelConfig] = None):
        self.config = config or PanelConfig()

    def pack(
        self,
        roof_polygon: Polygon,
        obstacles: Optional[List[Polygon]] = None,
        azimuth_deg: float = 180.0,
        grid_step: float = 0.10
    ) -> PackingResult:
        """
        Executes grid matrix packing over a roof segment.
        """
        obstacles = obstacles or []
        
        # 1. Enforce US NFPA Fire Setbacks
        usable_roof = roof_polygon.buffer(-self.config.edge_setback)
        if usable_roof.is_empty:
            return PackingResult([], "Portrait", 0, 0.0, 0.0, 0.0)

        # 2. Subtract Obstacle Buffers
        if obstacles:
            buffered_obstacles = unary_union([obs.buffer(self.config.obstacle_buffer) for obs in obstacles])
            usable_roof = usable_roof.difference(buffered_obstacles)

        if usable_roof.is_empty:
            return PackingResult([], "Portrait", 0, 0.0, 0.0, 0.0)

        # Extract usable polygons
        if isinstance(usable_roof, MultiPolygon):
            polygons = list(usable_roof.geoms)
        else:
            polygons = [usable_roof]

        best_result = PackingResult([], "Portrait", 0, 0.0, usable_roof.area, 0.0)

        # 3. Evaluate Orientation & Rotation Angle Search Space
        orientations = [
            ("Portrait", self.config.width, self.config.height),
            ("Landscape", self.config.height, self.config.width)
        ]

        candidate_angles = [0.0, azimuth_deg]
        for poly in polygons:
            coords = list(poly.exterior.coords)
            for i in range(len(coords) - 1):
                dx = coords[i+1][0] - coords[i][0]
                dy = coords[i+1][1] - coords[i][1]
                edge_angle = math.degrees(math.atan2(dy, dx))
                candidate_angles.append(edge_angle)

        for poly in polygons:
            prepared_poly = prep(poly)

            for orient_name, p_w, p_h in orientations:
                cell_w = p_w + self.config.rail_gap
                cell_h = p_h + self.config.rail_gap

                for angle in candidate_angles:
                    rot_poly = rotate(poly, -angle, origin='center')
                    minx, miny, maxx, maxy = rot_poly.bounds

                    for shift_x in np.arange(0, cell_w, grid_step * cell_w):
                        for shift_y in np.arange(0, cell_h, grid_step * cell_h):
                            candidate_panels = []

                            x_coords = np.arange(minx + shift_x, maxx, cell_w)
                            y_coords = np.arange(miny + shift_y, maxy, cell_h)

                            for x in x_coords:
                                for y in y_coords:
                                    raw_box = box(x, y, x + p_w, y + p_h)
                                    world_box = rotate(raw_box, angle, origin=rot_poly.centroid)
                                    
                                    if prepared_poly.contains(world_box):
                                        candidate_panels.append(world_box)

                            if len(candidate_panels) > best_result.total_count:
                                total_cap = (len(candidate_panels) * self.config.wattage) / 1000.0
                                total_panel_area = len(candidate_panels) * (p_w * p_h)
                                cov_ratio = total_panel_area / usable_roof.area if usable_roof.area > 0 else 0.0

                                best_result = PackingResult(
                                    panels=candidate_panels,
                                    orientation=orient_name,
                                    total_count=len(candidate_panels),
                                    total_capacity_kwp=round(total_cap, 2),
                                    usable_area_m2=round(usable_roof.area, 2),
                                    coverage_ratio=round(cov_ratio, 4)
                                )

        return best_result
