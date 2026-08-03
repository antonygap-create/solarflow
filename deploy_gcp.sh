#!/usr/bin/env bash
# =====================================================================
# Google Cloud Platform (GCP) Deployment Script for SolarFlow B2B SaaS
# Microservices: Artifact Registry -> Cloud Build -> Cloud SQL -> Cloud Run
# =====================================================================

set -eo pipefail

# ---------------------------------------------------------------------
# Configuration Variables (Modify these for your GCP Environment)
# ---------------------------------------------------------------------
GCP_PROJECT_ID="${GCP_PROJECT_ID:-your-gcp-project-id}"
GCP_REGION="${GCP_REGION:-us-central1}"
ARTIFACT_REPO="${ARTIFACT_REPO:-solarflow-repo}"
IMAGE_NAME="${IMAGE_NAME:-solarflow-backend}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-solarflow-backend}"
DB_INSTANCE_NAME="${DB_INSTANCE_NAME:-solarflow-postgres}"
DB_NAME="${DB_NAME:-solarflow_db}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-ChangeMeSecurePassword123!}"

echo "====================================================================="
echo "STARTING GCP DEPLOYMENT FOR PROJECT: ${GCP_PROJECT_ID}"
echo "Region: ${GCP_REGION} | Service: ${CLOUD_RUN_SERVICE}"
echo "====================================================================="

# Step 0: Set active GCP project
gcloud config set project "${GCP_PROJECT_ID}"

# Step 1: Enable required GCP Services & APIs
echo "[1/5] Enabling GCP APIs (Cloud Run, Cloud SQL, Artifact Registry, Cloud Build)..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com

# Step 2: Create Artifact Registry Docker Repository (if not existing)
echo "[2/5] Creating Artifact Registry Repository..."
gcloud artifacts repositories describe "${ARTIFACT_REPO}" --location="${GCP_REGION}" 2>/dev/null || \
gcloud artifacts repositories create "${ARTIFACT_REPO}" \
  --repository-format=docker \
  --location="${GCP_REGION}" \
  --description="Docker repository for SolarFlow B2B SaaS microservices"

# Step 3: Build & Push Container Image via Google Cloud Build
IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${IMAGE_NAME}:${IMAGE_TAG}"
echo "[3/5] Submitting Docker build to Cloud Build..."
echo "  Target Image URI: ${IMAGE_URI}"
gcloud builds submit --tag "${IMAGE_URI}" .

# Step 4: Create Cloud SQL Instance & Database (if not existing)
echo "[4/5] Checking Cloud SQL PostgreSQL Instance..."
gcloud sql instances describe "${DB_INSTANCE_NAME}" 2>/dev/null || \
gcloud sql instances create "${DB_INSTANCE_NAME}" \
  --database-version=POSTGRES_15 \
  --tier=db-custom-1-3840 \
  --region="${GCP_REGION}" \
  --storage-size=10GB \
  --storage-type=SSD

# Create Database inside Cloud SQL Instance
gcloud sql databases describe "${DB_NAME}" --instance="${DB_INSTANCE_NAME}" 2>/dev/null || \
gcloud sql databases create "${DB_NAME}" --instance="${DB_INSTANCE_NAME}"

# Set DB User Password
gcloud sql users set-password "${DB_USER}" --instance="${DB_INSTANCE_NAME}" --password="${DB_PASS}"

# Extract Cloud SQL Instance Connection Name (project:region:instance)
INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe "${DB_INSTANCE_NAME}" --format="value(connectionName)")
echo "  Cloud SQL Connection Name: ${INSTANCE_CONNECTION_NAME}"

# Step 5: Deploy Service to Google Cloud Run
echo "[5/5] Deploying container image to Google Cloud Run..."
gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --image="${IMAGE_URI}" \
  --region="${GCP_REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances="${INSTANCE_CONNECTION_NAME}" \
  --set-env-vars="INSTANCE_CONNECTION_NAME=${INSTANCE_CONNECTION_NAME},DB_USER=${DB_USER},DB_PASS=${DB_PASS},DB_NAME=${DB_NAME},DB_SOCKET_DIR=/cloudsql" \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --port=8080

SERVICE_URL=$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" --format="value(status.url)")

echo "====================================================================="
echo "DEPLOYMENT COMPLETE!"
echo "Cloud Run Service URL: ${SERVICE_URL}"
echo "API Health Check     : ${SERVICE_URL}/health"
echo "====================================================================="
