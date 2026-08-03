"""
State-Specific Solar Financial Model Test Suite (test_financials.py)
---------------------------------------------------------------------
Verifies California NEM 3.0 Avoided Cost vs Florida 1:1 Net Metering ROI calculations
and ValueError checking for unsupported state codes.

Author: Solar Financial Modeling Engineer
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

vendor_dir = backend_dir.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import pytest
from app.financials import calculate_year_1_savings, calculate_financial_metrics


def test_california_nem_3_financial_model():
    """Verifies CA NEM 3.0 calculation: (gen * 0.65 * rate) + (gen * 0.35 * 0.05)."""
    generation = 14000.0
    utility_rate = 0.35

    savings = calculate_year_1_savings(generation, utility_rate, "CA")
    expected = (14000.0 * 0.65 * 0.35) + (14000.0 * 0.35 * 0.05) # 3185.0 + 245.0 = $3430.00
    assert savings == round(expected, 2)


def test_florida_1_to_1_net_metering_model():
    """Verifies FL 1:1 Net Metering calculation: gen * rate."""
    generation = 14000.0
    utility_rate = 0.15

    savings = calculate_year_1_savings(generation, utility_rate, "FL")
    expected = 14000.0 * 0.15 # $2100.00
    assert savings == expected


def test_unsupported_state_raises_value_error():
    """Verifies that an unsupported state code raises ValueError."""
    with pytest.raises(ValueError) as exc_info:
        calculate_year_1_savings(10000.0, 0.20, "NY")
    assert "unsupported" in str(exc_info.value).lower()
