"""
Financial Economics Service (8760-Hour NEM 3.0 & TOU Modeling Service)
----------------------------------------------------------------------
Calculates system turnkey cost, 8760-hour hourly energy offset savings,
payback period, 25-year ROI %, and self-consumption ratio.
"""

import math
from typing import List
from app.schemas.economics import EconomicsRequest, EconomicsResponse, TariffType

# Financial & Tariff Constants
DEFAULT_COST_PER_KW_USD: float = 2500.0   # $2,500 per kW installed
DEFAULT_IMPORT_RATE_USD: float = 0.25     # $0.25 / kWh retail rate
DEFAULT_EXPORT_RATE_USD: float = 0.08     # $0.08 / kWh NEM 3.0 avoided cost export credit
SYSTEM_LIFESPAN_YEARS: int = 25           # 25-year solar PV warranty period
HOURS_PER_YEAR: int = 8760                # 365 days * 24 hours


def generate_mock_hourly_profile(annual_total: float, profile_type: str) -> List[float]:
    """
    Generates a realistic 8760-hour annual profile array summing to annual_total.
    
    :param annual_total: Total annual energy in kWh
    :param profile_type: "generation" (daytime solar bell curve) or "consumption" (dual peak residential load)
    :return: List of 8760 float values in kWh
    """
    raw_weights: List[float] = []

    if profile_type.lower() == "generation":
        # Simulate solar generation: 0 at night (18:00 - 6:00), bell curve in daytime (6:00 - 18:00)
        for h in range(HOURS_PER_YEAR):
            hour_of_day = h % 24
            if 6 <= hour_of_day <= 18:
                # Sine bell curve peaking at 12:00 noon
                weight = math.sin((hour_of_day - 6) * math.pi / 12.0)
            else:
                weight = 0.0
            raw_weights.append(weight)
    else:
        # Simulate residential load: base load 0.3, morning peak 8:00 (1.0), evening peak 19:00 (1.5)
        for h in range(HOURS_PER_YEAR):
            hour_of_day = h % 24
            # Base load
            weight = 0.3
            # Morning peak
            weight += 0.5 * math.exp(-((hour_of_day - 8) ** 2) / 4.0)
            # Evening peak
            weight += 1.0 * math.exp(-((hour_of_day - 19) ** 2) / 6.0)
            raw_weights.append(weight)

    total_weight = sum(raw_weights)
    if total_weight <= 0:
        return [annual_total / HOURS_PER_YEAR] * HOURS_PER_YEAR

    # Normalize weights to exactly sum to annual_total
    scale_factor = annual_total / total_weight
    return [w * scale_factor for w in raw_weights]


def calculate_economics(req: EconomicsRequest) -> EconomicsResponse:
    """
    Calculates system cost, 8760-hour annual utility savings, payback period, and 25-year ROI.
    
    :param req: EconomicsRequest containing system capacity, generation, consumption, and optional hourly profiles.
    :return: EconomicsResponse model with rounded financial metrics.
    :raises ValueError: If custom hourly arrays are provided but do not contain 8760 values.
    """
    # 1. Resolve 8760-hour generation and consumption profiles
    if req.hourly_generation is not None:
        if len(req.hourly_generation) != HOURS_PER_YEAR:
            raise ValueError(f"Hourly generation profile must contain exactly {HOURS_PER_YEAR} values.")
        gen_profile = req.hourly_generation
    else:
        gen_profile = generate_mock_hourly_profile(req.annual_energy_kwh, "generation")

    if req.hourly_consumption is not None:
        if len(req.hourly_consumption) != HOURS_PER_YEAR:
            raise ValueError(f"Hourly consumption profile must contain exactly {HOURS_PER_YEAR} values.")
        cons_profile = req.hourly_consumption
    else:
        cons_profile = generate_mock_hourly_profile(req.annual_consumption_kwh, "consumption")

    # 2. System Cost
    cost_per_kw = DEFAULT_COST_PER_KW_USD
    import_rate = DEFAULT_IMPORT_RATE_USD
    export_rate = DEFAULT_EXPORT_RATE_USD

    total_system_cost = req.system_capacity_kw * cost_per_kw

    # 3. Hourly 8760 Financial Simulation
    annual_savings: float = 0.0
    total_self_consumed_kwh: float = 0.0
    total_generated_kwh: float = 0.0

    for h in range(HOURS_PER_YEAR):
        gen = gen_profile[h]
        cons = cons_profile[h]
        total_generated_kwh += gen

        if gen > cons:
            # Excess generation: cover consumption + export surplus
            self_consumed = cons
            exported = gen - cons
            hourly_saving = (self_consumed * import_rate) + (exported * export_rate)
        else:
            # Deficit: 100% of generation is self-consumed
            self_consumed = gen
            hourly_saving = gen * import_rate

        total_self_consumed_kwh += self_consumed
        annual_savings += hourly_saving

    # 4. Metrics & Ratios
    self_consumption_ratio = (
        total_self_consumed_kwh / total_generated_kwh
        if total_generated_kwh > 0 else 0.0
    )

    if annual_savings > 0:
        payback_period_years = total_system_cost / annual_savings
    else:
        payback_period_years = 99.9

    roi_25_years = (
        ((annual_savings * SYSTEM_LIFESPAN_YEARS - total_system_cost) / total_system_cost) * 100.0
        if total_system_cost > 0 else 0.0
    )

    return EconomicsResponse(
        total_system_cost=round(total_system_cost, 2),
        estimated_annual_savings=round(annual_savings, 2),
        payback_period_years=round(payback_period_years, 1),
        roi_25_years_percent=round(roi_25_years, 2),
        self_consumption_ratio=round(self_consumption_ratio, 4),
        assumptions={
            "cost_per_kw_usd": cost_per_kw,
            "import_rate_usd_kwh": import_rate,
            "export_rate_usd_kwh": export_rate,
            "system_lifespan_years": SYSTEM_LIFESPAN_YEARS,
            "tariff_type": req.tariff_type.value
        }
    )
