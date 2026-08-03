"""
US Phone Validation & Normalization Test Suite (test_phone_validation.py)
-------------------------------------------------------------------------
Authoritative server-side validation tests for US phone numbers using `phonenumbers`.

Author: QA Lead & Backend Engineer
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

vendor_dir = backend_dir.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import pytest
from app.validators import validate_and_normalize_us_phone


def test_valid_us_phone_formatting_variations():
    """Verifies that standard valid US phone formats normalize correctly to E.164."""
    valid_inputs = [
        ("+1 (415) 555-2671", "+14155552671"),
        ("415-555-2671", "+14155552671"),
        ("(415) 555-2671", "+14155552671"),
        ("4155552671", "+14155552671"),
        ("14155552671", "+14155552671"),
        ("+1 415 555 2671", "+14155552671"),
    ]

    for raw, expected in valid_inputs:
        normalized = validate_and_normalize_us_phone(raw)
        assert normalized == expected, f"Failed for raw input '{raw}': expected {expected}, got {normalized}"


def test_invalid_us_phone_numbers_rejected():
    """Verifies that invalid, fake, or non-numeric numbers raise ValueError."""
    invalid_inputs = [
        "123456",         # Too short
        "abc-def-ghij",   # Non-numeric
        "0000000000",     # Invalid area code
        "1111111111",     # Invalid area code
        "9999999999",     # Fake repetitive digits
        "",               # Empty string
    ]

    for raw in invalid_inputs:
        with pytest.raises(ValueError):
            validate_and_normalize_us_phone(raw)
