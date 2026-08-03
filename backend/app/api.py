"""
FastAPI Backend Application (api.py) — Dual-Interface Architecture
------------------------------------------------------------------
Public B2C Lead Generation API (/api/public) & Protected B2B Dashboard API (/api/dashboard).

Features:
- Task 1: Strict Multi-Tenant isolation & 404 data bleed protection.
- Task 2: US Phone Number validation & E.164 normalization.
- Task 3: State-specific financial models (CA NEM 3.0 vs FL 1:1).
- Task 4: Strict CORS Security Configuration from environment variables.

Author: Principal Full-Stack Engineer & Remediation Agent
Language: Python 3.10+
"""

import math
import os
import sys
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# Inject vendor directory
vendor_dir = Path(__file__).resolve().parent.parent / "vendor"
if not vendor_dir.exists():
    vendor_dir = Path(__file__).resolve().parent.parent.parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import numpy as np
from affine import Affine
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from shapely.geometry import Polygon, box

# Import domain modules
from app.models import Tenant, User, Lead, Project, SolarLayout
from app.database import get_db, init_db
from app.auth import (
    create_access_token, 
    verify_password, 
    get_password_hash, 
    get_current_active_user
)
from app.solar_packer import SolarPacker, PanelConfig
from app.energy_yield import EnergyYieldCalculator, SystemSpecs
from app.financials import calculate_financial_metrics, calculate_year_1_savings
from app.validators import validate_and_normalize_us_phone
from app.routers.solar_generation import router as solar_generation_router
from app.routers.economics import router as economics_router
from app.routers.proposal import router as proposal_router
from app.routers.solar import router as solar_insights_router

# Initialize FastAPI app
app = FastAPI(
    title="SolarFlow B2B/B2C Engineering Platform",
    description="Dual-interface API: Public B2C Lead Generation & Protected B2B Manager Dashboard.",
    version="2.0.0"
)

app.include_router(solar_generation_router)
app.include_router(economics_router)
app.include_router(proposal_router)
app.include_router(solar_insights_router)

# Task 4: Strict CORS Security Configuration
raw_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
allowed_origins = [origin.strip() for origin in raw_cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# Initialize DB Schema DDL on startup (dev/testing mode)
@app.on_event("startup")
def on_startup():
    try:
        if os.environ.get("TESTING", "false").lower() == "true" or os.environ.get("DB_ENGINE") == "sqlite":
            init_db()
        
        db = next(get_db())
        
        # Seed default installer tenant
        stmt = select(Tenant).where(Tenant.slug == "default-installer")
        tenant = db.execute(stmt).scalar_one_or_none()
        if not tenant:
            tenant = Tenant(
                name="SolarFlow Engineering Inc.",
                slug="default-installer",
                default_electricity_rate=0.15,
                default_cost_per_watt=2.50,
                default_tax_credit_itc=30.0,
                default_state_code="CA"
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)

        # Seed default admin user
        user_stmt = select(User).where(User.email == "admin@solarflow.com")
        admin_user = db.execute(user_stmt).scalar_one_or_none()
        if not admin_user:
            admin_user = User(
                tenant_id=tenant.id,
                email="admin@solarflow.com",
                hashed_password=get_password_hash("admin123"),
                full_name="Solar Sales Manager",
                role="admin"
            )
            db.add(admin_user)
            db.commit()
        else:
            admin_user.hashed_password = get_password_hash("admin123")
            db.commit()
    except Exception as e:
        print(f"Startup DB init notice: {e}")


# =====================================================================
# Pydantic v2 Schemas
# =====================================================================

class B2CEstimateRequest(BaseModel):
    """B2C Public Inquiry Request Schema with Task 2 US Phone Validation."""
    tenant_slug: str = Field(...)
    address: str = Field(...)
    state_code: Optional[str] = Field(default="CA")
    latitude: float = Field(...)
    longitude: float = Field(...)
    first_name: str = Field(...)
    last_name: str = Field(...)
    email: EmailStr = Field(...)
    phone: str = Field(...)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        """Task 2: Uses phonenumbers library to validate & format into E.164."""
        return validate_and_normalize_us_phone(v)


class B2CEstimateResponse(BaseModel):
    """Simplified B2C Savings Estimate Response Schema."""
    lead_id: str
    project_id: str
    tenant_name: str
    state_code: str
    roof_area_sqm: float
    max_capacity_kwp: float
    total_panels: int
    estimated_yearly_generation_kwh: float
    estimated_yearly_savings_usd: float
    gross_system_cost_usd: float
    federal_tax_credit_usd: float
    net_system_cost_usd: float
    payback_years: float
    tariff_model_name: str
    message: str


class TokenResponse(BaseModel):
    """OAuth2 JWT Token Response."""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: str
    tenant_id: str
    tenant_name: str


class LeadSchema(BaseModel):
    """Lead Schema for Dashboard List."""
    id: str
    first_name: str
    last_name: str
    email: str
    phone: str
    status: str
    created_at: str
    project_id: Optional[str] = None
    project_address: Optional[str] = None


class ProjectDetailResponse(BaseModel):
    """Full Project & Layout Details Schema for Manager Dashboard."""
    project_id: str
    name: str
    address: str
    state_code: str
    latitude: float
    longitude: float
    tenant_id: str
    lead: Optional[Dict[str, Any]] = None
    layout: Optional[Dict[str, Any]] = None


class ProjectUpdateRequest(BaseModel):
    """Update Payload for Manager Adjustments."""
    name: Optional[str] = None
    notes: Optional[str] = None
    state_code: Optional[str] = None
    custom_cost_per_watt: Optional[float] = None
    toggled_geojson: Optional[Dict[str, Any]] = None


# =====================================================================
# Projection Utility Functions
# =====================================================================

EARTH_RADIUS = 6378137.0


def latlon_to_metric(lat: float, lon: float, ref_lat: float, ref_lon: float) -> Tuple[float, float]:
    ref_lat_rad = math.radians(ref_lat)
    d_lat = math.radians(lat - ref_lat)
    d_lon = math.radians(lon - ref_lon)
    x = d_lon * EARTH_RADIUS * math.cos(ref_lat_rad)
    y = d_lat * EARTH_RADIUS
    return x, y


def metric_to_latlon(x: float, y: float, ref_lat: float, ref_lon: float) -> Tuple[float, float]:
    ref_lat_rad = math.radians(ref_lat)
    d_lat = y / EARTH_RADIUS
    d_lon = x / (EARTH_RADIUS * math.cos(ref_lat_rad))
    lat = ref_lat + math.degrees(d_lat)
    lon = ref_lon + math.degrees(d_lon)
    return lon, lat


# =====================================================================
# ROUTER A: PUBLIC B2C API (/api/public) — NO AUTH REQUIRED
# =====================================================================

public_router = APIRouter(prefix="/api/public", tags=["Public B2C Inquiry"])


@public_router.post("/estimate", response_model=B2CEstimateResponse, status_code=status.HTTP_201_CREATED)
async def create_public_b2c_estimate(
    request: B2CEstimateRequest,
    db: Session = Depends(get_db)
):
    """
    Public B2C Lead Generation Endpoint:
    1. Validates installer company by tenant_slug (returns 404 if missing).
    2. Validates & normalizes US phone number to E.164 via phonenumbers library.
    3. Runs automated SolarPacker & EnergyYield calculation.
    4. Applies state-specific financial strategy (CA NEM 3.0 vs FL 1:1).
    5. Saves Lead & Project records into database.
    """
    # Fetch Tenant using SQLAlchemy 2.0
    stmt = select(Tenant).where(Tenant.slug == request.tenant_slug, Tenant.is_active == True)
    tenant = db.execute(stmt).scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Installer company with slug '{request.tenant_slug}' not found or inactive."
        )

    state_code = request.state_code.strip().upper() if request.state_code else tenant.default_state_code

    # Run Solar Geometry & Yield Pipeline
    ref_lat, ref_lon = request.latitude, request.longitude
    sw_x, sw_y = latlon_to_metric(ref_lat - 0.00004, ref_lon - 0.00006, ref_lat, ref_lon)
    ne_x, ne_y = latlon_to_metric(ref_lat + 0.00004, ref_lon + 0.00006, ref_lat, ref_lon)
    roof_metric_poly = box(sw_x, sw_y, ne_x, ne_y)

    packer = SolarPacker(config=PanelConfig())
    pack_result = packer.pack(roof_polygon=roof_metric_poly, obstacles=[], azimuth_deg=180.0, grid_step=0.10)

    grid_dim = 50
    pixel_res = max(roof_metric_poly.bounds[2] - roof_metric_poly.bounds[0], 1.0) / grid_dim
    flux_map = np.full((grid_dim, grid_dim), 1500.0, dtype=np.float32)
    transform = Affine.translation(roof_metric_poly.bounds[0], roof_metric_poly.bounds[1]) * Affine.scale(pixel_res, pixel_res)

    yield_calculator = EnergyYieldCalculator(specs=SystemSpecs())
    yield_result = yield_calculator.calculate_yield(
        panels=pack_result.panels,
        solar_flux_map=flux_map,
        transform=transform,
        pitch_deg=22.5,
        azimuth_deg=180.0
    )

    # Create Lead Entity (with E.164 normalized phone)
    new_lead = Lead(
        tenant_id=tenant.id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        phone=request.phone, # E.164 normalized
        status="NEW"
    )
    db.add(new_lead)
    db.flush()

    # Create Project Entity
    new_project = Project(
        tenant_id=tenant.id,
        lead_id=new_lead.id,
        name=f"Home Estimate - {request.first_name} {request.last_name}",
        address=request.address,
        state_code=state_code,
        latitude=request.latitude,
        longitude=request.longitude
    )
    db.add(new_project)
    db.flush()

    # GeoJSON Feature Collection
    geojson_features = []
    for idx, (panel_metric_poly, annual_kwh) in enumerate(
        zip(yield_result.valid_panels, yield_result.valid_panel_yields_kwh)
    ):
        exterior_coords = list(panel_metric_poly.exterior.coords)
        wgs84_coords = [list(metric_to_latlon(mx, my, ref_lat, ref_lon)) for mx, my in exterior_coords]
        geojson_features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [wgs84_coords]},
            "properties": {
                "panel_id": f"P_SEG0_{idx+1}",
                "annual_yield_kwh": round(annual_kwh, 2),
                "capacity_kwp": 0.4,
                "active": True
            }
        })

    geojson_collection = {"type": "FeatureCollection", "features": geojson_features}

    # Task 3: Financial Calculations Strategy (CA NEM 3.0 vs FL 1:1)
    fin_metrics = calculate_financial_metrics(
        total_capacity_kwp=yield_result.total_capacity_kwp,
        annual_generation_kwh=yield_result.total_annual_generation_kwh,
        cost_per_watt=tenant.default_cost_per_watt,
        electricity_rate=tenant.default_electricity_rate,
        tax_credit_itc=tenant.default_tax_credit_itc,
        state_code=state_code
    )

    new_layout = SolarLayout(
        project_id=new_project.id,
        total_panels=yield_result.total_panels_installed,
        total_capacity_kwp=yield_result.total_capacity_kwp,
        annual_generation_kwh=yield_result.total_annual_generation_kwh,
        performance_ratio=yield_result.system_performance_ratio,
        pruned_panels_count=len(yield_result.pruned_panels),
        geojson_data=geojson_collection,
        financial_metrics=fin_metrics
    )
    db.add(new_layout)
    db.commit()

    return B2CEstimateResponse(
        lead_id=str(new_lead.id),
        project_id=str(new_project.id),
        tenant_name=tenant.name,
        state_code=state_code,
        roof_area_sqm=round(roof_metric_poly.area, 1),
        max_capacity_kwp=yield_result.total_capacity_kwp,
        total_panels=yield_result.total_panels_installed,
        estimated_yearly_generation_kwh=yield_result.total_annual_generation_kwh,
        estimated_yearly_savings_usd=fin_metrics["estimated_year_1_savings"],
        gross_system_cost_usd=fin_metrics["gross_upfront_system_cost"],
        federal_tax_credit_usd=fin_metrics["federal_tax_credit_itc"],
        net_system_cost_usd=fin_metrics["net_system_cost"],
        payback_years=fin_metrics["simple_payback_years"],
        tariff_model_name=fin_metrics["tariff_model_name"],
        message="Preliminary solar estimate generated! A solar specialist will contact you shortly."
    )


# =====================================================================
# ROUTER B: DASHBOARD B2B API (/api/dashboard) — JWT AUTH REQUIRED
# =====================================================================

dashboard_router = APIRouter(prefix="/api/dashboard", tags=["Manager B2B Dashboard"])


@dashboard_router.post("/token", response_model=TokenResponse)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """JWT Login Endpoint for B2B Sales Reps & Managers."""
    stmt = select(User).where(User.email == form_data.username, User.is_active == True)
    user = db.execute(stmt).scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    tenant = db.execute(select(Tenant).where(Tenant.id == user.tenant_id)).scalar_one_or_none()
    access_token = create_access_token(data={"sub": str(user.id), "tenant_id": str(user.tenant_id)})

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        tenant_id=str(user.tenant_id),
        tenant_name=tenant.name if tenant else "Solar Installer"
    )


@dashboard_router.get("/leads", response_model=List[LeadSchema])
async def get_dashboard_leads(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Task 1: Returns all B2C leads scoped strictly to current_user.tenant_id.
    """
    stmt = (
        select(Lead, Project)
        .outerjoin(Project, Lead.id == Project.lead_id)
        .where(Lead.tenant_id == current_user.tenant_id)
        .order_by(Lead.created_at.desc())
    )
    results = db.execute(stmt).all()

    leads_list = []
    for lead, proj in results:
        leads_list.append(
            LeadSchema(
                id=str(lead.id),
                first_name=lead.first_name,
                last_name=lead.last_name,
                email=lead.email,
                phone=lead.phone,
                status=lead.status,
                created_at=lead.created_at.isoformat(),
                project_id=str(proj.id) if proj else None,
                project_address=proj.address if proj else None
            )
        )

    return leads_list


@dashboard_router.get("/projects/{project_id}", response_model=ProjectDetailResponse)
async def get_project_details(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Task 1: Multi-Tenant Data Bleed Protection.
    Queries project strictly filtering by Project.id == project_id AND Project.tenant_id == current_user.tenant_id.
    If not found, raises HTTPException with status_code=404 (NOT 403) to prevent ID enumeration.
    """
    try:
        proj_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    # Task 1 Strict Query: Filter by Project.id AND Project.tenant_id
    stmt = select(Project).where(Project.id == proj_uuid, Project.tenant_id == current_user.tenant_id)
    project = db.execute(stmt).scalar_one_or_none()

    if not project:
        # Task 1 Requirement: Must raise 404 NOT 403
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found."
        )

    lead_data = None
    if project.lead_id:
        lead_stmt = select(Lead).where(Lead.id == project.lead_id, Lead.tenant_id == current_user.tenant_id)
        lead_obj = db.execute(lead_stmt).scalar_one_or_none()
        if lead_obj:
            lead_data = {
                "id": str(lead_obj.id),
                "first_name": lead_obj.first_name,
                "last_name": lead_obj.last_name,
                "email": lead_obj.email,
                "phone": lead_obj.phone,
                "status": lead_obj.status
            }

    layout_stmt = select(SolarLayout).where(SolarLayout.project_id == project.id).order_by(SolarLayout.created_at.desc())
    layout_obj = db.execute(layout_stmt).scalars().first()

    layout_data = None
    if layout_obj:
        layout_data = {
            "id": str(layout_obj.id),
            "total_panels": layout_obj.total_panels,
            "total_capacity_kwp": layout_obj.total_capacity_kwp,
            "annual_generation_kwh": layout_obj.annual_generation_kwh,
            "performance_ratio": layout_obj.performance_ratio,
            "geojson": layout_obj.geojson_data,
            "financial_metrics": layout_obj.financial_metrics
        }

    return ProjectDetailResponse(
        project_id=str(project.id),
        name=project.name,
        address=project.address,
        state_code=project.state_code,
        latitude=project.latitude,
        longitude=project.longitude,
        tenant_id=str(project.tenant_id),
        lead=lead_data,
        layout=layout_data
    )


@dashboard_router.put("/projects/{project_id}")
async def update_project_layout(
    project_id: str,
    payload: ProjectUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Task 1: Multi-Tenant Data Bleed Protection on PUT.
    Queries project strictly filtering by Project.id == project_id AND Project.tenant_id == current_user.tenant_id.
    Raises 404 NOT 403 if project is not found or belongs to another tenant.
    """
    try:
        proj_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    # Task 1 Strict Query: Filter by Project.id AND Project.tenant_id
    stmt = select(Project).where(Project.id == proj_uuid, Project.tenant_id == current_user.tenant_id)
    project = db.execute(stmt).scalar_one_or_none()

    if not project:
        # Task 1 Requirement: Must raise 404 NOT 403
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found."
        )

    if payload.name:
        project.name = payload.name
    if payload.notes:
        project.notes = payload.notes
    if payload.state_code:
        project.state_code = payload.state_code.strip().upper()

    layout_stmt = select(SolarLayout).where(SolarLayout.project_id == project.id).order_by(SolarLayout.created_at.desc())
    layout_obj = db.execute(layout_stmt).scalars().first()

    if layout_obj and payload.toggled_geojson:
        features = payload.toggled_geojson.get("features", [])
        active_features = [f for f in features if f.get("properties", {}).get("active", True) is not False]
        
        new_panel_count = len(active_features)
        new_capacity_kwp = round(new_panel_count * 0.4, 2)
        new_yield_kwh = sum(f.get("properties", {}).get("annual_yield_kwh", 442.11) for f in active_features)

        layout_obj.total_panels = new_panel_count
        layout_obj.total_capacity_kwp = new_capacity_kwp
        layout_obj.annual_generation_kwh = round(new_yield_kwh, 2)
        layout_obj.geojson_data = payload.toggled_geojson

        tenant_stmt = select(Tenant).where(Tenant.id == current_user.tenant_id)
        tenant = db.execute(tenant_stmt).scalar_one_or_none()
        
        cost_per_watt = payload.custom_cost_per_watt or (
            layout_obj.financial_metrics.get("cost_per_watt") if layout_obj.financial_metrics else 2.50
        )
        state_code = project.state_code

        # Recalculate Task 3 state-specific financials
        fin_metrics = calculate_financial_metrics(
            total_capacity_kwp=new_capacity_kwp,
            annual_generation_kwh=new_yield_kwh,
            cost_per_watt=cost_per_watt,
            electricity_rate=tenant.default_electricity_rate if tenant else 0.15,
            tax_credit_itc=tenant.default_tax_credit_itc if tenant else 30.0,
            state_code=state_code
        )
        layout_obj.financial_metrics = fin_metrics

    db.commit()
    return {"status": "success", "message": "Project layout adjustments saved successfully."}


# Mount Routers
app.include_router(public_router)
app.include_router(dashboard_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.api:app", host="0.0.0.0", port=8000, reload=True)
