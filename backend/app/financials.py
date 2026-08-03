"""
US Solar Financial Modeling & State Tariff Engine (financials.py)
------------------------------------------------------------------
Calculates US commercial/residential solar ROI, system CAPEX, Federal ITC, 
and state-specific electricity tariff compensation profiles:
1. California (CA - NEM 3.0): 65% self-consumption ratio + avoided cost export credit ($0.05/kWh).
2. Florida (FL - 1:1 Net Metering): 1:1 full retail rate credit.

Author: Solar Financial Modeling Engineer
"""

from typing import Dict, Any


def calculate_year_1_savings(generation: float, utility_rate: float, state_code: str) -> float:
    """
    Calculates Year 1 avoided electricity savings based on US state tariff regulations.
    
    :param generation: Annual solar generation in kWh.
    :param utility_rate: Base utility electricity tariff rate ($/kWh).
    :param state_code: State postal abbreviation ('CA' or 'FL').
    :return: Estimated Year 1 avoided electricity cost ($).
    :raises ValueError: If state_code is not supported.
    """
    if not state_code or not isinstance(state_code, str):
        raise ValueError("state_code must be a non-empty string.")

    state_clean = state_code.strip().upper()

    if state_clean == "CA":
        # California NEM 3.0: 65% self-consumption ratio + 35% avoided cost export credit ($0.05/kWh)
        savings = (generation * 0.65 * utility_rate) + (generation * 0.35 * 0.05)
        return round(savings, 2)
    elif state_clean == "FL":
        # Florida 1:1 Net Metering: 100% full retail utility rate credit
        savings = generation * utility_rate
        return round(savings, 2)
    else:
        raise ValueError(f"Unsupported state code '{state_code}'. Supported states: CA, FL.")


def calculate_financial_metrics(
    total_capacity_kwp: float,
    annual_generation_kwh: float,
    cost_per_watt: float = 2.50,
    electricity_rate: float = 0.15,
    tax_credit_itc: float = 30.0,
    state_code: str = "CA"
) -> Dict[str, Any]:
    """
    Computes complete 25-year financial ROI breakdown for a solar layout.
    """
    state_clean = state_code.strip().upper() if state_code else "CA"
    system_watts = total_capacity_kwp * 1000.0

    # 1. Gross Upfront System Cost ($)
    gross_cost = system_watts * cost_per_watt

    # 2. Federal ITC Tax Credit ($)
    itc_savings = gross_cost * (tax_credit_itc / 100.0)

    # 3. Net System Cost ($)
    net_cost = gross_cost - itc_savings

    # 4. State-Specific Year 1 Savings ($)
    year_1_savings = calculate_year_1_savings(annual_generation_kwh, electricity_rate, state_clean)
    tariff_model_name = "California NEM 3.0 (Avoided Cost / TOU Credit)" if state_clean == "CA" else "Florida 1:1 Retail Net Metering"

    # 5. Simple Payback Period (Years)
    payback_years = round(net_cost / year_1_savings, 1) if year_1_savings > 0 else 99.9

    return {
        "cost_per_watt": round(cost_per_watt, 2),
        "electricity_rate": round(electricity_rate, 4),
        "tax_credit_itc": round(tax_credit_itc, 1),
        "state_code": state_clean,
        "tariff_model_name": tariff_model_name,
        "gross_upfront_system_cost": round(gross_cost, 2),
        "federal_tax_credit_itc": round(itc_savings, 2),
        "net_system_cost": round(net_cost, 2),
        "estimated_year_1_savings": round(year_1_savings, 2),
        "simple_payback_years": payback_years
    }
