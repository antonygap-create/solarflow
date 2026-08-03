"""
FastAPI Backend Application (api.py) — Dual-Interface Architecture
------------------------------------------------------------------
Public B2C Lead Generation API (/api/public) & Protected B2B Dashboard API (/api/dashboard).

Author: Senior Python/FastAPI Developer & Cloud Architect
Language: Python 3.10+
Dependencies: fastapi, uvicorn, pydantic, sqlalchemy, httpx, shapely, numpy
"""

import math
import os
import sys
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# Automatically inject local vendor directory if present
vendor_dir = Path(__file__).resolve().parent / "vendor"
if vendor_dir.exists():
    sys.path.insert(0, str(vendor_dir))

import httpx
import numpy as np
from affine import Affine
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session
from shapely.geometry import Polygon, box

# Import domain modules & DB schemas
from models import Tenant, User, Lead, Project, SolarLayout
from database import get_db, init_db
from auth import (
    create_access_token, 
    verify_password, 
    get_password_hash, 
    get_current_active_user
)
from solar_packer import SolarPacker, PanelConfig
from energy_yield import EnergyYieldCalculator, SystemSpecs

# Initialize FastAPI app
app = FastAPI(
    title="SolarFlow B2B/B2C Engineering Platform",
    description="Dual-interface API: Public B2C Homeowner Lead Generation & Protected B2B Manager Dashboard.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize DB Schema DDL on startup
@app.on_event("startup")
def on_startup():
    try:
        init_db()
        db = next(get_db())
        
        # 1. Seed or fetch default installer tenant
        stmt = select(Tenant).where(Tenant.slug == "default-installer")
        tenant = db.execute(stmt).scalar_one_or_none()
        if not tenant:
            tenant = Tenant(
                name="SolarFlow Engineering Inc.",
                slug="default-installer",
                default_electricity_rate=0.15,
                default_cost_per_watt=2.50,
                default_tax_credit_itc=30.0
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)

        # 2. Seed or update default admin user
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
    """B2C Public Inquiry Request Schema."""
    tenant_slug: str = Field(..., example="default-installer", description="Unique installer company slug.")
    address: str = Field(..., example="123 Solar Way, Los Angeles, CA", description="Building address.")
    latitude: float = Field(..., example=34.0522)
    longitude: float = Field(..., example=-118.2437)
    first_name: str = Field(..., example="John")
    last_name: str = Field(..., example="Doe")
    email: EmailStr = Field(..., example="john.doe@example.com")
    phone: str = Field(..., example="+1 (555) 019-2834")


class B2CEstimateResponse(BaseModel):
    """Simplified B2C Savings Estimate Response Schema."""
    lead_id: str
    project_id: str
    tenant_name: str
    roof_area_sqm: float
    max_capacity_kwp: float
    total_panels: int
    estimated_yearly_generation_kwh: float
    estimated_yearly_savings_usd_min: float
    estimated_yearly_savings_usd_max: float
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
    latitude: float
    longitude: float
    tenant_id: str
    lead: Optional[Dict[str, Any]] = None
    layout: Optional[Dict[str, Any]] = None


class ProjectUpdateRequest(BaseModel):
    """Update Payload for Manager Adjustments."""
    name: Optional[str] = None
    notes: Optional[str] = None
    toggled_geojson: Optional[Dict[str, Any]] = None
    custom_cost_per_watt: Optional[float] = None


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
    1. Validates installer company by tenant_slug.
    2. Runs automated SolarPacker & EnergyYield calculation.
    3. Saves Lead & Project records into database.
    4. Returns simplified homeowner savings estimate.
    """
    # 1. Fetch Tenant using SQLAlchemy 2.0
    stmt = select(Tenant).where(Tenant.slug == request.tenant_slug, Tenant.is_active == True)
    tenant = db.execute(stmt).scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Installer company with slug '{request.tenant_slug}' not found or inactive."
        )

    # 2. Run Solar Geometry & Yield Pipeline
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

    # 3. Create Lead Entity
    new_lead = Lead(
        tenant_id=tenant.id,
        first_name=request.first_name,
        last_name=request.last_name,
        email=request.email,
        phone=request.phone,
        status="NEW"
    )
    db.add(new_lead)
    db.flush()

    # 4. Create Project Entity
    new_project = Project(
        tenant_id=tenant.id,
        lead_id=new_lead.id,
        name=f"Home Estimate - {request.first_name} {request.last_name}",
        address=request.address,
        latitude=request.latitude,
        longitude=request.longitude
    )
    db.add(new_project)
    db.flush()

    # 5. GeoJSON Feature Collection
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
                "capacity_kwp": 0.4
            }
        })

    geojson_collection = {"type": "FeatureCollection", "features": geojson_features}

    # 6. Create SolarLayout Entity
    annual_gen = yield_result.total_annual_generation_kwh
    yearly_savings_est = annual_gen * tenant.default_electricity_rate

    new_layout = SolarLayout(
        project_id=new_project.id,
        total_panels=yield_result.total_panels_installed,
        total_capacity_kwp=yield_result.total_capacity_kwp,
        annual_generation_kwh=annual_gen,
        performance_ratio=yield_result.system_performance_ratio,
        pruned_panels_count=len(yield_result.pruned_panels),
        geojson_data=geojson_collection,
        financial_metrics={
            "cost_per_watt": tenant.default_cost_per_watt,
            "electricity_rate": tenant.default_electricity_rate,
            "tax_credit_itc": tenant.default_tax_credit_itc,
            "estimated_annual_savings": round(yearly_savings_est, 2)
        }
    )
    db.add(new_layout)
    db.commit()

    return B2CEstimateResponse(
        lead_id=str(new_lead.id),
        project_id=str(new_project.id),
        tenant_name=tenant.name,
        roof_area_sqm=round(roof_metric_poly.area, 1),
        max_capacity_kwp=yield_result.total_capacity_kwp,
        total_panels=yield_result.total_panels_installed,
        estimated_yearly_generation_kwh=annual_gen,
        estimated_yearly_savings_usd_min=round(yearly_savings_est * 0.9, 2),
        estimated_yearly_savings_usd_max=round(yearly_savings_est * 1.1, 2),
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

    # Fetch Tenant name
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
    Returns all B2C leads scoped strictly to current user's Tenant.
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
    Returns full project details, lead info, and GeoJSON panel layout scoped to Tenant.
    """
    try:
        proj_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project_id UUID format.")

    stmt = select(Project).where(Project.id == proj_uuid, Project.tenant_id == current_user.tenant_id)
    project = db.execute(stmt).scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied."
        )

    # Fetch associated Lead & SolarLayout
    lead_data = None
    if project.lead_id:
        lead_stmt = select(Lead).where(Lead.id == project.lead_id)
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
    Saves manager manual adjustments (toggled off panels, pricing updates).
    """
    try:
        proj_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project_id UUID format.")

    stmt = select(Project).where(Project.id == proj_uuid, Project.tenant_id == current_user.tenant_id)
    project = db.execute(stmt).scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    if payload.name:
        project.name = payload.name
    if payload.notes:
        project.notes = payload.notes

    # Update SolarLayout if updated GeoJSON is supplied
    if payload.toggled_geojson:
        layout_stmt = select(SolarLayout).where(SolarLayout.project_id == project.id).order_by(SolarLayout.created_at.desc())
        layout_obj = db.execute(layout_stmt).scalars().first()

        if layout_obj:
            features = payload.toggled_geojson.get("features", [])
            active_features = [f for f in features if f.get("properties", {}).get("active", True) is not False]
            
            new_panel_count = len(active_features)
            new_capacity_kwp = round(new_panel_count * 0.4, 2)
            
            # Sum yields of active features
            new_yield_kwh = sum(f.get("properties", {}).get("annual_yield_kwh", 442.11) for f in active_features)

            layout_obj.total_panels = new_panel_count
            layout_obj.total_capacity_kwp = new_capacity_kwp
            layout_obj.annual_generation_kwh = round(new_yield_kwh, 2)
            layout_obj.geojson_data = payload.toggled_geojson
            
            if payload.custom_cost_per_watt:
                metrics = dict(layout_obj.financial_metrics or {})
                metrics["cost_per_watt"] = payload.custom_cost_per_watt
                layout_obj.financial_metrics = metrics

    db.commit()
    return {"status": "success", "message": "Project layout adjustments saved successfully."}


# Mount Dual Routers
app.include_router(public_router)
app.include_router(dashboard_router)


# Maintain backward compatibility with original endpoint
@app.post("/api/v1/solar/generate-layout", tags=["Legacy Compatibility"])
async def legacy_generate_layout(
    latitude: float = Query(...),
    longitude: float = Query(...),
    db: Session = Depends(get_db)
):
    """Backward compatibility wrapper."""
    req = B2CEstimateRequest(
        tenant_slug="default-installer",
        address="34.0522, -118.2437",
        latitude=latitude,
        longitude=longitude,
        first_name="Guest",
        last_name="User",
        email="guest@solarflow.com",
        phone="+15550000000"
    )
    return await create_public_b2c_estimate(req, db)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
