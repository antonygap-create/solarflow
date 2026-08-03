"""
Multi-Tenant Database Schema Definition (models.py)
-----------------------------------------------------
Production-ready SQLAlchemy 2.0 ORM models supporting multi-tenancy,
B2C Lead Generation inquiries, B2B SaaS installer accounts, user RBAC, 
and JSON layout storage (PostgreSQL JSONB compatible).

Author: Senior Full-Stack Engineer & Database Architect
ORM Version: SQLAlchemy 2.0+
"""

import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Any, Dict

from sqlalchemy import (
    String, 
    Float, 
    Integer, 
    Boolean, 
    DateTime, 
    ForeignKey, 
    Text, 
    JSON,
    func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import (
    DeclarativeBase, 
    Mapped, 
    mapped_column, 
    relationship
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy 2.0 declarative models."""
    pass


# Cross-database JSON field variant (JSONB on PostgreSQL, JSON on SQLite)
JSONType = JSON().with_variant(JSONB, "postgresql")


class Tenant(Base):
    """
    Tenant Entity (Solar Installation Company / Account).
    Represents an installer company in the multi-tenant SaaS architecture.
    """
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    
    # Commercial defaults for installer proposal generation
    default_electricity_rate: Mapped[float] = mapped_column(Float, default=0.15, nullable=False) # $/kWh
    default_cost_per_watt: Mapped[float] = mapped_column(Float, default=2.50, nullable=False)   # $/Wp
    default_tax_credit_itc: Mapped[float] = mapped_column(Float, default=30.0, nullable=False)  # 30% Federal ITC
    default_state_code: Mapped[str] = mapped_column(String(10), default="CA", nullable=False)    # 'CA' or 'FL'
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    users: Mapped[List["User"]] = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    leads: Mapped[List["Lead"]] = relationship("Lead", back_populates="tenant", cascade="all, delete-orphan")
    projects: Mapped[List["Project"]] = relationship("Project", back_populates="tenant", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Tenant(name='{self.name}', slug='{self.slug}')>"


class User(Base):
    """
    User Entity (Installer Sales Rep / Manager).
    Belongs to a specific Tenant account with Role-Based Access Control (RBAC).
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("tenants.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="engineer", nullable=False) # 'admin', 'engineer', 'sales'
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")
    projects: Mapped[List["Project"]] = relationship("Project", back_populates="user")

    def __repr__(self) -> str:
        return f"<User(email='{self.email}', role='{self.role}')>"


class Lead(Base):
    """
    Lead Entity (B2C Homeowner Inquiry).
    Created during the public B2C estimation flow.
    """
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("tenants.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False) # Normalized E.164 format (+1XXXXXXXXXX)
    status: Mapped[str] = mapped_column(String(50), default="NEW", nullable=False) # 'NEW', 'CONTACTED', 'CLOSED'

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="leads")
    project: Mapped[Optional["Project"]] = relationship("Project", back_populates="lead", uselist=False, cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Lead(name='{self.first_name} {self.last_name}', phone='{self.phone}', status='{self.status}')>"


class Project(Base):
    """
    Project Entity (Solar Installation Site).
    Represents a specific building site, linked to a B2C Lead or created by B2B Rep.
    """
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("tenants.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="SET NULL"), 
        nullable=True, 
        index=True
    )
    lead_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("leads.id", ondelete="SET NULL"), 
        nullable=True, 
        unique=True, 
        index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    state_code: Mapped[str] = mapped_column(String(10), default="CA", nullable=False) # 'CA' or 'FL'
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="projects")
    user: Mapped[Optional["User"]] = relationship("User", back_populates="projects")
    lead: Mapped[Optional["Lead"]] = relationship("Lead", back_populates="project")
    layouts: Mapped[List["SolarLayout"]] = relationship("SolarLayout", back_populates="project", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Project(name='{self.name}', state='{self.state_code}', address='{self.address[:30]}...')>"


class SolarLayout(Base):
    """
    SolarLayout Entity (Generated Roof Configuration & Yield Outputs).
    Stores GeoJSON panel geometries, system capacity, and NREL yield metrics.
    """
    __tablename__ = "solar_layouts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey("projects.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )

    total_panels: Mapped[int] = mapped_column(Integer, nullable=False)
    total_capacity_kwp: Mapped[float] = mapped_column(Float, nullable=False)
    annual_generation_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    performance_ratio: Mapped[float] = mapped_column(Float, nullable=False)
    pruned_panels_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # GeoJSON FeatureCollection storing placed panel polygons
    geojson_data: Mapped[Dict[str, Any]] = mapped_column(JSONType, nullable=False)

    # Financial ROI & Payback parameters breakdown
    financial_metrics: Mapped[Dict[str, Any]] = mapped_column(JSONType, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="layouts")

    def __repr__(self) -> str:
        return f"<SolarLayout(panels={self.total_panels}, capacity={self.total_capacity_kwp}kWp, yield={self.annual_generation_kwh}kWh)>"
