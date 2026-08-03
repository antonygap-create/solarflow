#!/usr/bin/env bash
# =====================================================================
# SolarFlow GCP Automated Infrastructure Provisioning Script
# =====================================================================
set -eo pipefail

echo "==> 1. Resolving Active GCP Project ID..."
PROJECT_ID=$(gcloud config get-value project --quiet)

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    echo "ERROR: GCP project is not set. Run 'gcloud config set project YOUR_PROJECT_ID' first."
    exit 1
fi

echo "Active GCP Project: ${PROJECT_ID}"

echo "==> 2. Enabling Required GCP Service APIs..."
gcloud services enable \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  --project="${PROJECT_ID}" \
  --quiet

echo "==> 3. Required GCP APIs Enabled Successfully!"
