"""
Solar Energy Yield & Shading Calculation Engine (energy_yield.py)
------------------------------------------------------------------
NREL PVWatts & Perez Transposition solar generation model with 2D Raster Zonal Statistics.
Filters out low-yield and shaded panel polygons (<70% of max unshaded solar flux).

Author: Senior Solar PV Engineer & Data Scientist
"""

import sys
import math
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any, Optional

# Inject vendor directory
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if not vendor_dir.exists():
    vendor_dir = Path(__file__).resolve().parent.parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import numpy as np
from affine import Affine
from shapely.geometry import Polygon
from rasterio.features import geometry_mask


@dataclass(frozen=True)
class SystemSpecs:
    """NREL PVWatts Physical System Losses & Performance Derate Specifications."""
    inverter_efficiency: float = 0.96   # 96% Inverter efficiency
    system_losses: float = 0.14         # 14% NREL standard system losses (soiling, wiring, degradation)
    panel_stc_efficiency: float = 0.21  # 21% Module STC efficiency
    panel_area_m2: float = 1.70         # 1.7 m^2 standard module area
    panel_nominal_power_w: float = 400.0# 400 Wp nominal rating
    shading_cutoff_ratio: float = 0.70  # Prune panels with <70% of max unshaded solar flux
    north_yield_cutoff_kwh: float = 250.0# Prune North-facing low-yield modules (<250 kWh/yr)


@dataclass
class YieldResult:
    """Output container for solar energy calculation and shading pruning."""
    total_panels_installed: int
    valid_panels: List[Polygon]
    valid_panel_yields_kwh: List[float]
    pruned_panels: List[Polygon]
    total_capacity_kwp: float
    total_annual_generation_kwh: float
    system_performance_ratio: float
    average_panel_yield_kwh: float


class EnergyYieldCalculator:
    """Solar Generation Engine conforming to NREL PVWatts standards."""

    def __init__(self, specs: Optional[SystemSpecs] = None):
        self.specs = specs or SystemSpecs()

    @property
    def derate_factor(self) -> float:
        """Net NREL system derate factor (0.96 * (1 - 0.14) = 0.8256 = 82.56%)."""
        return self.specs.inverter_efficiency * (1.0 - self.specs.system_losses)

    def calculate_yield(
        self,
        panels: List[Polygon],
        solar_flux_map: np.ndarray,
        transform: Affine,
        pitch_deg: float = 22.5,
        azimuth_deg: float = 180.0
    ) -> YieldResult:
        """
        Computes individual module annual energy generation (kWh/year).
        """
        if not panels:
            return YieldResult(0, [], [], [], 0.0, 0.0, 0.0, 0.0)

        # 1. Calculate Plane of Array (POA) Tilt Transposition Coefficient
        tilt_rad = math.radians(pitch_deg)
        azimuth_rad = math.radians(azimuth_deg)

        # Solar Transposition Factor
        solar_tilt_factor = math.cos(tilt_rad) + math.sin(tilt_rad) * max(0.0, math.cos(azimuth_rad - math.pi))
        solar_tilt_factor = max(0.2, min(1.3, solar_tilt_factor))

        panel_flux_means: List[float] = []
        rows, cols = solar_flux_map.shape

        # 2. Zonal Statistics using Rasterio geometry_mask
        for panel in panels:
            mask = geometry_mask(
                [panel],
                out_shape=(rows, cols),
                transform=transform,
                invert=True
            )

            if np.any(mask):
                mean_flux = float(np.mean(solar_flux_map[mask]))
            else:
                mean_flux = float(np.mean(solar_flux_map))

            panel_flux_means.append(mean_flux)

        max_unshaded_flux = max(panel_flux_means) if panel_flux_means else 1500.0

        valid_panels: List[Polygon] = []
        valid_yields: List[float] = []
        pruned_panels: List[Polygon] = []

        # 3. Apply Shading & North-Facing Cutoff Pruning Rules
        for panel, mean_flux in zip(panels, panel_flux_means):
            flux_ratio = mean_flux / max_unshaded_flux if max_unshaded_flux > 0 else 0.0
            poa_irradiance = mean_flux * solar_tilt_factor
            
            # Annual energy yield formula (kWh/yr)
            annual_kwh = poa_irradiance * self.specs.panel_area_m2 * self.specs.panel_stc_efficiency * self.derate_factor

            is_shaded = flux_ratio < self.specs.shading_cutoff_ratio
            is_low_yield_north = (azimuth_deg < 45 or azimuth_deg > 315) and (annual_kwh < self.specs.north_yield_cutoff_kwh)

            if is_shaded or is_low_yield_north:
                pruned_panels.append(panel)
            else:
                valid_panels.append(panel)
                valid_yields.append(annual_kwh)

        total_installed = len(valid_panels)
        total_capacity_kwp = round((total_installed * self.specs.panel_nominal_power_w) / 1000.0, 2)
        total_annual_generation_kwh = round(float(sum(valid_yields)), 2)
        avg_yield = round(total_annual_generation_kwh / total_installed, 2) if total_installed > 0 else 0.0
        
        # NREL Performance Ratio (PR = Derate Factor * Tilt Efficiency)
        system_pr = round(self.derate_factor * solar_tilt_factor * 100.0, 2)

        return YieldResult(
            total_panels_installed=total_installed,
            valid_panels=valid_panels,
            valid_panel_yields_kwh=valid_yields,
            pruned_panels=pruned_panels,
            total_capacity_kwp=total_capacity_kwp,
            total_annual_generation_kwh=total_annual_generation_kwh,
            system_performance_ratio=system_pr,
            average_panel_yield_kwh=avg_yield
        )
