"""
Financial Economics Service (8760-Hour NEM 3.0 & TOU Modeling Service)
----------------------------------------------------------------------
Calculates system turnkey cost, 8760-hour hourly energy offset savings,
O&M lifecycle costs ($30/kW/yr), Year 12 Inverter Replacement ($150/kW),
25-year CO2 offset, payback period, 25-year ROI %, and self-consumption ratio.
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
OM_COST_PER_KW_YEAR_USD: float = 30.0     # $30 per kW per year O&M benchmark (DOE/NREL Q1 2024)
INVERTER_REPLACEMENT_PER_KW_USD: float = 150.0  # $150 per kW inverter replacement at Year 12
PANEL_DEGRADATION_PER_YEAR: float = 0.005 # 0.5% annual PV degradation
CO2_KG_PER_KWH_US: float = 0.385           # 0.385 kg CO2 offset per kWh generated
SYSTEM_LIFESPAN_YEARS: int = 25           # 25-year solar PV warranty period
HOURS_PER_YEAR: int = 8760                # 365 days * 24 hours


def generate_mock_hourly_profile(annual_total: float, profile_type: str) -> List[float]:
    """
    Generates a realistic 8760-hour annual profile array summing to annual_total.
    """
    raw_weights: List[float] = []

    if profile_type.lower() == "generation":
        for h in range(HOURS_PER_YEAR):
            hour_of_day = h % 24
            if 6 <= hour_of_day <= 18:
                weight = math.sin((hour_of_day - 6) * math.pi / 12.0)
            else:
                weight = 0.0
            raw_weights.append(weight)
    else:
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
    Calculates system cost, O&M lifecycle costs, 8760-hour annual utility savings, payback period, and 25-year ROI.
    """
    # 1. Resolve 8760-hour generation and consumption profiles
    if req.hourly_generation is not None:
        if len(req.hourly_generation) != HOURS_PER_YEAR:
            raise ValueError(f"Hourly generation profile must contain exactly {HOURS_PER_YEAR} values.")
        gen_profile = req.hourly_generation
    else:
        gen_profile = generate_mock_hourly_profile(req.annual_energy_kwh, "generation")

    effective_consumption = req.annual_consumption_kwh + (3200.0 if req.ev_charger_enabled else 0.0)

    if req.hourly_consumption is not None:
        if len(req.hourly_consumption) != HOURS_PER_YEAR:
            raise ValueError(f"Hourly consumption profile must contain exactly {HOURS_PER_YEAR} values.")
        cons_profile = req.hourly_consumption
    else:
        cons_profile = generate_mock_hourly_profile(effective_consumption, "consumption")

    # 2. System Hardware & Lifecycle Cost Breakdown
    pv_cost = req.system_capacity_kw * DEFAULT_COST_PER_KW_USD
    battery_cost = req.battery_capacity_kwh * BATTERY_COST_PER_KWH_USD
    ev_charger_cost = EV_CHARGER_COST_USD if req.ev_charger_enabled else 0.0

    total_system_cost = pv_cost + battery_cost + ev_charger_cost
    annual_om_cost = req.system_capacity_kw * OM_COST_PER_KW_YEAR_USD
    inverter_replacement_cost = req.system_capacity_kw * INVERTER_REPLACEMENT_PER_KW_USD

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
            self_consumed = cons
            surplus = gen - cons

            if battery_max_kwh > 0:
                charge_space = battery_max_kwh - battery_state_kwh
                charge_amount = min(surplus, charge_space)
                battery_state_kwh += charge_amount
                exported = surplus - charge_amount
            else:
                exported = surplus

            hourly_saving = (self_consumed * import_rate) + (exported * export_rate)
        else:
            self_consumed = gen
            deficit = cons - gen

            if battery_max_kwh > 0 and battery_state_kwh > 0:
                discharge_amount = min(deficit, battery_state_kwh)
                battery_state_kwh -= discharge_amount
                self_consumed += discharge_amount

            hourly_saving = self_consumed * import_rate

        total_self_consumed_kwh += self_consumed
        annual_savings += hourly_saving

    # Net Year 1 savings after annual O&M
    net_annual_savings = max(0.0, annual_savings - annual_om_cost)

    # 25-Year Lifecycle Cash Flows with 0.5%/yr degradation & Year 12 inverter replacement
    total_25_year_savings = 0.0
    total_25_year_generation_kwh = 0.0

    for yr in range(1, SYSTEM_LIFESPAN_YEARS + 1):
        degradation_factor = (1.0 - PANEL_DEGRADATION_PER_YEAR) ** (yr - 1)
        yr_gen = req.annual_energy_kwh * degradation_factor
        total_25_year_generation_kwh += yr_gen

        yr_savings = net_annual_savings * degradation_factor
        if yr == 12:
            yr_savings -= inverter_replacement_cost

        total_25_year_savings += yr_savings

    # CO2 Offset in Metric Tons (1000 kg = 1 Metric Ton)
    co2_saved_metric_tons = (total_25_year_generation_kwh * CO2_KG_PER_KWH_US) / 1000.0

    self_consumption_ratio = (
        total_self_consumed_kwh / total_generated_kwh
        if total_generated_kwh > 0 else 0.0
    )

    if net_annual_savings > 0:
        payback_period_years = total_system_cost / net_annual_savings
    else:
        payback_period_years = 99.9

    roi_25_years = (
        ((total_25_year_savings - total_system_cost) / total_system_cost) * 100.0
        if total_system_cost > 0 else 0.0
    )

    return EconomicsResponse(
        total_system_cost=round(total_system_cost, 2),
        battery_cost_usd=round(battery_cost, 2),
        annual_om_cost_usd=round(annual_om_cost, 2),
        inverter_replacement_cost_usd=round(inverter_replacement_cost, 2),
        co2_saved_tons_25_years=round(co2_saved_metric_tons, 1),
        estimated_annual_savings=round(net_annual_savings, 2),
        payback_period_years=round(payback_period_years, 1),
        roi_25_years_percent=round(roi_25_years, 2),
        self_consumption_ratio=round(min(1.0, self_consumption_ratio), 4),
        assumptions={
            "cost_per_kw_usd": DEFAULT_COST_PER_KW_USD,
            "battery_cost_per_kwh_usd": BATTERY_COST_PER_KWH_USD,
            "annual_om_per_kw_usd": OM_COST_PER_KW_YEAR_USD,
            "inverter_replacement_year": 12,
            "inverter_replacement_per_kw_usd": INVERTER_REPLACEMENT_PER_KW_USD,
            "panel_degradation_per_year": PANEL_DEGRADATION_PER_YEAR,
            "co2_kg_per_kwh": CO2_KG_PER_KWH_US,
            "system_architecture": req.system_architecture.value,
            "battery_capacity_kwh": req.battery_capacity_kwh,
            "ev_charger_enabled": req.ev_charger_enabled,
            "tariff_type": req.tariff_type.value
        }
    )
