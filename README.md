# SolarFlow B2B SaaS Enterprise Platform

**SolarFlow** is a B2B SaaS platform for solar installers in the US residential and commercial market. It features a dual-interface architecture:
1. **Public B2C Lead Generation Flow (`/estimate`):** Automated AI roof analysis, 3D polygon packing with US IFC/NFPA fire setbacks, and state-specific financial ROI calculation (California NEM 3.0 vs. Florida 1:1 Net Metering).
2. **Protected B2B Manager Dashboard (`/dashboard`):** Role-based JWT authentication, multi-tenant lead management, and manual solar layout editing.

---

## 🏗️ Repository Architecture & Directory Structure

```text
solar-calculator-us-google/
├── backend/                        # FastAPI Backend Application & GIS Engine
│   ├── app/
│   │   ├── __init__.py
│   │   ├── api.py                  # Dual Router FastAPI Service (/api/public & /api/dashboard)
│   │   ├── auth.py                 # JWT Authentication & Bcrypt Password Hashing
│   │   ├── database.py             # SQLAlchemy 2.0 Engine & Cloud SQL Connection Pool
│   │   ├── energy_yield.py         # NREL PVWatts Energy Yield & Shading Engine
│   │   ├── financials.py           # US Solar Financial ROI & Tariff Models (CA NEM 3.0 vs FL 1:1)
│   │   ├── models.py               # SQLAlchemy 2.0 Multi-Tenant Schema (Tenant, User, Lead, Project, SolarLayout)
│   │   ├── solar_packer.py         # 2D/3D Polygon Packing Algorithm with NFPA Fire Setbacks
│   │   └── validators.py           # Authoritative US E.164 Phone Normalization & Validation
│   ├── alembic/                    # Database DDL Migrations
│   │   ├── versions/
│   │   │   └── 001_initial_baseline.py
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── tests/                      # Pytest Unit & Integration Test Suite
│   │   ├── test_multi_tenancy.py   # Multi-Tenant Data Bleed Isolation Tests (404 enforcement)
│   │   ├── test_financials.py      # CA NEM 3.0 vs FL 1:1 Tariff Tests
│   │   ├── test_phone_validation.py# US Phone E.164 Normalization Tests
│   │   └── test_geometry.py        # NFPA Fire Setback Geometry Tests
│   ├── alembic.ini
│   ├── Dockerfile                  # Multi-Stage Python 3.11 + GDAL/GEOS Dockerfile
│   ├── requirements.txt
│   └── .env.example
├── frontend/                       # React 18 + TypeScript + Tailwind CSS Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── DashboardLayout.tsx # B2B Manager Sidebar Navigation & Protected Route Guard
│   │   │   ├── LeadCaptureWidget.tsx # B2C Homeowner Inquiry Widget
│   │   │   ├── LeadsTable.tsx      # B2B Lead Inbox Table
│   │   │   ├── LoginPage.tsx       # B2B Agent Authentication Form
│   │   │   ├── ProjectManagerView.tsx # Interactive Vector Roof Layout Editor
│   │   │   ├── RoiChart.tsx        # Recharts 25-Year Cash Flow Chart
│   │   │   └── SolarMap.tsx        # Satellite Map Vector SVG Overlay
│   │   ├── context/
│   │   │   ├── AuthContext.tsx     # JWT Token & User State Persistence
│   │   │   └── SolarContext.tsx    # Reactive Solar Layout State
│   │   ├── types/
│   │   │   └── solar.ts            # Strict TypeScript Payload Schemas
│   │   ├── App.tsx                 # React Router 7 Navigation Routes
│   │   └── main.tsx
│   ├── Dockerfile                  # Multi-Stage Node 20 + Nginx SPA Dockerfile
│   ├── nginx.conf                  # Nginx Security Headers & SPA Routing
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml                  # GitHub Actions CI Quality Pipeline
├── docker-compose.yml              # Local Multi-Container Dev Environment
└── README.md
```

---

## 🚀 Local Development Setup

### Option 1: Docker Compose (Recommended)
```bash
# Start PostgreSQL, FastAPI Backend, and React Frontend containers
docker-compose up --build
```
- **React Frontend:** `http://localhost:3000`
- **FastAPI Backend:** `http://localhost:8000`
- **PostgreSQL Database:** `localhost:5432`

---

## 🔒 Multi-Tenant Data Isolation & Security

1. **Strict 404 Data Bleed Protection:** All `/api/dashboard/*` endpoints verify `Project.tenant_id == current_user.tenant_id`. Access attempts across tenant boundaries return `HTTP 404 Not Found` (not 403) to prevent resource ID enumeration.
2. **CORS Restrictions:** Production environment strictly restricts `allow_origins` to explicit frontend domain URLs defined in `CORS_ORIGINS`.
3. **JWT Authentication:** Tokens expire after a maximum of 7 days and require a 32-byte secret key (`JWT_SECRET_KEY`).

---

## 💰 US Financial Models (CA NEM 3.0 vs FL 1:1)

- **California (CA):** Implements **NEM 3.0 Avoided Cost / Time-of-Use (TOU)** export compensation principles. Exports are credited at avoided cost (~$0.05/kWh) while self-consumption offsets retail tariff (~$0.35/kWh).
- **Florida (FL):** Implements **1:1 Full Retail Rate Net Metering** crediting exported energy at 100% retail utility rate ($0.15/kWh).

---

## 🔄 Database Migrations (Alembic)

```bash
cd backend

# Run pending migrations
alembic upgrade head

# Generate a new migration script
alembic revision --autogenerate -m "Add custom index"
```

---

## ☁️ Production GCP Cloud Run & Cloud SQL Deployment

### 1. Generate JWT Production Secret
```bash
openssl rand -hex 32
```

### 2. Build & Deploy Backend Container to Cloud Run
```bash
cd backend
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/solarflow-repo/solarflow-backend:v1.0.0-rc.1 .

gcloud run deploy solarflow-backend \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/solarflow-repo/solarflow-backend:v1.0.0-rc.1 \
  --region=us-central1 \
  --add-cloudsql-instances=YOUR_PROJECT_ID:us-central1:solarflow-postgres \
  --set-env-vars="INSTANCE_CONNECTION_NAME=YOUR_PROJECT_ID:us-central1:solarflow-postgres,DB_USER=postgres,DB_PASS=SECURE_PASS,DB_NAME=solarflow_db,JWT_SECRET_KEY=YOUR_JWT_SECRET,CORS_ORIGINS=https://solarflow-app.run.app" \
  --memory=1Gi \
  --port=8080
```

---

## 🔁 Rollback Procedures

### Cloud Run Service Rollback
To immediately rollback the backend to a previous stable revision:
```bash
# List previous Cloud Run revisions
gcloud run revisions list --service=solarflow-backend --region=us-central1

# Route 100% traffic back to previous stable revision
gcloud run services update-traffic solarflow-backend \
  --to-revisions=solarflow-backend-00001-abc=100 \
  --region=us-central1
```

### Cloud SQL Database Rollback (Alembic)
To rollback database schema migrations:
```bash
cd backend
alembic downgrade -1
```
