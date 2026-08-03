"""
US Phone Number Validation & E.164 Normalization (validators.py)
---------------------------------------------------------------
Authoritative server-side validator for US phone numbers using the Google `phonenumbers` library.
Enforces NANP rules and returns normalized E.164 format (+1XXXXXXXXXX).

Author: Senior Backend Engineer
"""

import sys
from pathlib import Path

# Inject vendor directory
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if not vendor_dir.exists():
    vendor_dir = Path(__file__).resolve().parent.parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import phonenumbers


def validate_and_normalize_us_phone(phone_str: str) -> str:
    """
    Parses, validates, and normalizes a US phone number into E.164 format using `phonenumbers`.
    
    :param phone_str: Raw input phone string.
    :return: E.164 formatted string (e.g. +15552345678).
    :raises ValueError: If the phone number is invalid, empty, or unparseable.
    """
    if not phone_str or not isinstance(phone_str, str):
        raise ValueError("Phone number must be a non-empty string.")

    try:
        # Parse phone number expecting 'US' region
        parsed_number = phonenumbers.parse(phone_str, "US")
    except phonenumbers.NumberParseException as e:
        raise ValueError(f"Failed to parse phone number: {str(e)}")

    # Verify validity of parsed phone number
    if not phonenumbers.is_valid_number(parsed_number):
        raise ValueError("Invalid US phone number.")

    # Format to E.164 (+1XXXXXXXXXX)
    return phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.E164)
