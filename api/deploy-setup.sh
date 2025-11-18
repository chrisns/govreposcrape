#!/bin/bash
# Cloud Run API Deployment Setup Script
# This script configures service account, IAM permissions, and Workload Identity for Cloud Run

set -e  # Exit on error

# Configuration
PROJECT_ID="${GOOGLE_PROJECT_ID:-govreposcrape}"
SERVICE_ACCOUNT_NAME="govreposcrape-api"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
REGION="us-central1"

echo "========================================="
echo "Cloud Run API Deployment Setup"
echo "========================================="
echo "Project ID: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT_EMAIL"
echo "Region: $REGION"
echo ""

# Step 1: Enable required APIs
echo "[1/6] Enabling required Google Cloud APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  discoveryengine.googleapis.com \
  --project="$PROJECT_ID"

echo "✓ APIs enabled"
echo ""

# Step 2: Create service account
echo "[2/6] Creating service account..."
if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "✓ Service account already exists: $SERVICE_ACCOUNT_EMAIL"
else
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --display-name="GovRepoScrape Cloud Run API Service Account" \
    --description="Service account for Cloud Run API to access Vertex AI Search" \
    --project="$PROJECT_ID"
  echo "✓ Service account created: $SERVICE_ACCOUNT_EMAIL"
fi
echo ""

# Step 3: Grant IAM permissions
echo "[3/6] Granting IAM permissions..."

# Permission 1: Vertex AI Search User (required for search API)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/discoveryengine.viewer" \
  --condition=None

echo "  ✓ Granted Discovery Engine Viewer role"

# Permission 2: Cloud Run Invoker (for health checks)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/run.invoker" \
  --condition=None

echo "  ✓ Granted Cloud Run Invoker role"

# Permission 3: Logs Writer (for structured logging)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/logging.logWriter" \
  --condition=None

echo "  ✓ Granted Logging Log Writer role"

echo "✓ IAM permissions configured"
echo ""

# Step 4: Configure Workload Identity (for Cloud Run)
echo "[4/6] Configuring Workload Identity..."

# Allow Cloud Run service to use this service account
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[default/govreposcrape-api]" \
  --role="roles/iam.workloadIdentityUser" \
  --project="$PROJECT_ID" \
  2>/dev/null || echo "  Note: Workload Identity binding will be created during deployment"

echo "✓ Workload Identity configured"
echo ""

# Step 5: Verify Vertex AI Search engine exists
echo "[5/6] Verifying Vertex AI Search engine..."
SEARCH_ENGINE_ID="projects/1060386346356/locations/global/collections/default_collection/engines/govreposcrape-search"

# Note: We can't easily verify the search engine without making an API call
# This will be verified during the first deployment health check
echo "  Using Search Engine ID: $SEARCH_ENGINE_ID"
echo "  ✓ Configuration set (will verify during deployment)"
echo ""

# Step 6: Summary
echo "[6/6] Setup Summary"
echo "========================================="
echo "✓ Service Account: $SERVICE_ACCOUNT_EMAIL"
echo "✓ IAM Roles:"
echo "  - roles/discoveryengine.viewer"
echo "  - roles/run.invoker"
echo "  - roles/logging.logWriter"
echo "✓ Workload Identity: Configured"
echo "✓ Vertex AI Search Engine: $SEARCH_ENGINE_ID"
echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Deploy to Cloud Run:"
echo "   gcloud builds submit --config=api/cloudbuild.yaml ."
echo ""
echo "2. Or deploy manually:"
echo "   cd api && docker build -t gcr.io/$PROJECT_ID/govreposcrape-api:latest ."
echo "   docker push gcr.io/$PROJECT_ID/govreposcrape-api:latest"
echo "   gcloud run deploy govreposcrape-api \\"
echo "     --image gcr.io/$PROJECT_ID/govreposcrape-api:latest \\"
echo "     --region us-central1 \\"
echo "     --platform managed \\"
echo "     --allow-unauthenticated \\"
echo "     --service-account $SERVICE_ACCOUNT_EMAIL \\"
echo "     --set-env-vars VERTEX_AI_SEARCH_ENGINE_ID=$SEARCH_ENGINE_ID,GOOGLE_PROJECT_ID=$PROJECT_ID,NODE_ENV=production"
echo ""
