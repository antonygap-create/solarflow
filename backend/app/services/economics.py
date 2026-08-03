"""
Financial Economics Service (8760-Hour NEM 3.0 & TOU Modeling Service)
----------------------------------------------------------------------
Calculates system turnkey cost, 8760-hour hourly energy offset savings,
payback period, 25-year ROI %, battery storage backup, and self-consumption ratio.
"""

import math
from typing import List
from app.schemas.economics import EconomicsRequest, EconomicsResponse, TariffType, SystemArchitecture

# Financial & Tariff Constants
DEFAULT_COST_PER_KW_USD: float = 2500.0   # $2,500 per kW installed
BATTERY_COST_PER_KWH_USD: float = 700.0    # $700 per kWh battery capacity
EV_CHARGER_COST_USD: float = 1200.0        # Level 2 EV Charger installation cost
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
                weight = math.sin((hour_of_day - 6) * math.pi / 12.0)
            else:
                weight = 0.0
            raw_weights.append(weight)
    else:
        # Simulate residential load: base load 0.3, morning peak 8:00 (1.0), evening peak 19:00 (1.5)
        for h in range(HOURS_PER_YEAR):
            hour_of_day = h % 24
            weight = 0.3
            weight += 0.5 * math.exp(-((hour_of_day - 8) ** 2) / 4.0)
            weight += 1.0 * math.exp(-((hour_of_day - 19) ** 2) / 6.0)
            raw_weights.append(weight)

    total_weight = sum(raw_weights)
    if total_weight <= 0:
        return [annual_total / HOURS_PER_YEAR] * HOURS_PER_YEAR

    scale_factor = annual_total / total_weight
    return [w * scale_factor for w in raw_weights]


def calculate_economics(req: EconomicsRequest) -> EconomicsResponse:
    """
    Calculates system cost, 8760-hour annual utility savings, payback period, and 25-year ROI.
    Supports battery storage capacity and EV charger add-on options.
    
    :param req: EconomicsRequest containing system capacity, battery options, generation, consumption.
    :return: EconomicsResponse model with rounded financial metrics.
    """
    # 1. Resolve 8760-hour generation and consumption profiles
    if req.hourly_generation is not None:
        if len(req.hourly_generation) != HOURS_PER_YEAR:
            raise ValueError(f"Hourly generation profile must contain exactly {HOURS_PER_YEAR} values.")
        gen_profile = req.hourly_generation
    else:
        gen_profile = generate_mock_hourly_profile(req.annual_energy_kwh, "generation")

    # If EV charger is enabled, add ~3,200 kWh/yr annual consumption
    effective_consumption = req.annual_consumption_kwh + (3200.0 if req.ev_charger_enabled else 0.0)

    if req.hourly_consumption is not None:
        if len(req.hourly_consumption) != HOURS_PER_YEAR:
            raise ValueError(f"Hourly consumption profile must contain exactly {HOURS_PER_YEAR} values.")
        cons_profile = req.hourly_consumption
    else:
        cons_profile = generate_mock_hourly_profile(effective_consumption, "consumption")

    # 2. System Hardware & Battery Cost Breakdown
    pv_cost = req.system_capacity_kw * DEFAULT_COST_PER_KW_USD
    battery_cost = req.battery_capacity_kwh * BATTERY_COST_PER_KWH_USD
    ev_charger_cost = EV_CHARGER_COST_USD if req.ev_charger_enabled else 0.0

    total_system_cost = pv_cost + battery_cost + ev_charger_cost

    # 3. Hourly 8760 Financial Simulation with Battery Storage Model
    annual_savings: float = 0.0
    total_self_consumed_kwh: float = 0.0
    total_generated_kwh: float = 0.0

    battery_state_kwh = 0.0
    battery_max_kwh = req.battery_capacity_kwh

    import_rate = DEFAULT_IMPORT_RATE_USD
    export_rate = DEFAULT_EXPORT_RATE_USD

    for h in range(HOURS_PER_YEAR):
        gen = gen_profile[h]
        cons = cons_profile[h]
        total_generated_kwh += gen

        if gen >= cons:
            # Solar covers 100% of consumption
            self_consumed = cons
            surplus = gen - cons

            # Store surplus solar into battery up to capacity
            if battery_max_kwh > 0:
                charge_space = battery_max_kwh - battery_state_kwh
                charge_amount = min(surplus, charge_space)
                battery_state_kwh += charge_amount
                exported = surplus - charge_amount
            else:
                exported = surplus

            hourly_saving = (self_consumed * import_rate) + (exported * export_rate)
        else:
            # Solar covers partial consumption
            self_consumed = gen
            deficit = cons - gen

            # Discharge battery to cover deficit
            if battery_max_kwh > 0 and battery_state_kwh > 0:
                discharge_amount = min(deficit, battery_state_kwh)
                battery_state_kwh -= discharge_amount
                self_consumed += discharge_amount

            hourly_saving = self_consumed * import_rate

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
        battery_cost_usd=round(battery_cost, 2),
        estimated_annual_savings=round(annual_savings, 2),
        payback_period_years=round(payback_period_years, 1),
        roi_25_years_percent=round(roi_25_years, 2),
        self_consumption_ratio=round(min(1.0, self_consumption_ratio), 4),
        assumptions={
            "cost_per_kw_usd": DEFAULT_COST_PER_KW_USD,
            "battery_cost_per_kwh_usd": BATTERY_COST_PER_KWH_USD,
            "system_architecture": req.system_architecture.value,
            "battery_capacity_kwh": req.battery_capacity_kwh,
            "ev_charger_enabled": req.ev_charger_enabled,
            "tariff_type": req.tariff_type.value
        }
    )
