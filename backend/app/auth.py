"""
JWT Authentication & Authorization Utilities (auth.py)
-------------------------------------------------------
Handles password hashing (bcrypt), JWT token creation/verification (PyJWT),
and FastAPI security dependencies for protected B2B dashboard routes.

Author: Senior Python/FastAPI Developer
"""

import os
import sys
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, Dict

# Inject vendor directory
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if not vendor_dir.exists():
    vendor_dir = Path(__file__).resolve().parent.parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User, Tenant
from app.database import get_db

# Security Configuration
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "solarflow_b2b_saas_production_jwt_secret_key_998877")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 Days max token validity

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/dashboard/token")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain-text password against the hashed password using bcrypt."""
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hashes a password using bcrypt."""
    hashed_bytes = bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    )
    return hashed_bytes.decode('utf-8')


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed JWT access token containing claims."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency that validates the JWT token and fetches 
    the current authenticated User from the database using SQLAlchemy 2.0.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or token expired.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str: Optional[str] = payload.get("sub")
        if not user_id_str:
            raise credentials_exception
        user_uuid = uuid.UUID(user_id_str)
    except (jwt.PyJWTError, ValueError, TypeError):
        raise credentials_exception

    # Execute SQLAlchemy 2.0 query to fetch user
    stmt = select(User).where(User.id == user_uuid, User.is_active == True)
    user = db.execute(stmt).scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Dependency verifying that the user account is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account."
        )
    return current_user
