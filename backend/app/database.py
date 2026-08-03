"""
Cloud SQL & PostgreSQL Database Connection Engine (database.py)
-----------------------------------------------------------------
Production-ready database initialization and connection pool configuration 
supporting Google Cloud SQL Python Connector, Unix Socket, PostgreSQL TCP, 
and local/in-memory SQLite fallback for testing environments.

Tuned for Serverless Google Cloud Run execution.

Author: Senior Cloud Architect
"""

import os
import sys
from pathlib import Path
from typing import Generator

# Automatically inject local vendor directory if present
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if not vendor_dir.exists():
    vendor_dir = Path(__file__).resolve().parent.parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, Session
from app.models import Base


def get_db_url() -> str:
    """
    Constructs database URL based on GCP environment configuration.
    """
    if os.environ.get("TESTING", "false").lower() == "true":
        return "sqlite:///:memory:"

    if os.environ.get("USE_SQLITE", "false").lower() == "true" or os.environ.get("DB_ENGINE") == "sqlite":
        db_file = os.environ.get("SQLITE_FILE", "./solarflow_dev.db")
        return f"sqlite:///{db_file}"

    db_user = os.environ.get("DB_USER", "postgres")
    db_pass = os.environ.get("DB_PASS", "postgres_password")
    db_name = os.environ.get("DB_NAME", "solarflow_db")
    
    # 1. Cloud SQL Unix Socket (Preferred for Cloud Run)
    socket_dir = os.environ.get("DB_SOCKET_DIR", "/cloudsql")
    instance_connection_name = os.environ.get("INSTANCE_CONNECTION_NAME")
    
    if instance_connection_name:
        unix_socket_path = f"{socket_dir}/{instance_connection_name}"
        return f"postgresql+psycopg2://{db_user}:{db_pass}@/{db_name}?host={unix_socket_path}"

    # 2. Standard TCP Connection
    db_host = os.environ.get("DB_HOST", "127.0.0.1")
    db_port = os.environ.get("DB_PORT", "5432")
    return f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"


def create_cloud_run_engine() -> Engine:
    """
    Creates SQLAlchemy Engine with connection pool parameters 
    tuned specifically for serverless Cloud Run scaling.
    """
    db_url = get_db_url()

    # In SQLite local dev/testing, fallback cleanly with StaticPool if in-memory
    if "sqlite" in db_url:
        if ":memory:" in db_url:
            from sqlalchemy.pool import StaticPool
            return create_engine(
                db_url,
                connect_args={"check_same_thread": False},
                poolclass=StaticPool
            )
        return create_engine(db_url, connect_args={"check_same_thread": False})

    return create_engine(
        db_url,
        pool_size=int(os.environ.get("DB_POOL_SIZE", "5")),
        max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "10")),
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=True,
        echo=os.environ.get("SQL_ECHO", "false").lower() == "true"
    )


# Instantiate Engine & SessionFactory
engine = create_cloud_run_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initializes database tables (Schema DDL creation for dev/testing)."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI Dependency for database session management."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if __name__ == "__main__":
    print("Database Engine URL:", get_db_url())
