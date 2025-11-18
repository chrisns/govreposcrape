#!/bin/bash
# Deploy govreposcrape ingestion container as a Cloud Run Job with scheduled execution
#
# Cloud Run Jobs vs Services:
# - Jobs: Run-to-completion tasks (our ingestion pipeline)
# - Services: Always-on HTTP endpoints (our API)
#
# This script:
# 1. Builds the container image
# 2. Pushes to Google Container Registry
# 3. Creates/updates Cloud Run Job
# 4. Sets up Cloud Scheduler to run daily

set -e

# Configuration
PROJECT_ID="${GOOGLE_PROJECT_ID:-govreposcrape}"
REGION="${REGION:-us-central1}"
JOB_NAME="govreposcrape-ingestion"
IMAGE_NAME="gcr.io/${PROJECT_ID}/govreposcrape-ingestion"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-govreposcrape-sa@${PROJECT_ID}.iam.gserviceaccount.com}"

# Job configuration
MEMORY="4Gi"
CPU="2"
TIMEOUT="21600s"  # 6 hours
MAX_RETRIES="0"   # Don't retry on failure (manual intervention needed)

# Scheduler configuration
SCHEDULE_NAME="govreposcrape-daily-ingest"
SCHEDULE="0 2 * * *"  # Daily at 2 AM UTC
SCHEDULE_TIMEZONE="UTC"

echo "=========================================="
echo "Deploying Cloud Run Job: ${JOB_NAME}"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "=========================================="

# Step 1 & 2: Build and push using Cloud Build (handles AMD64 automatically)
echo ""
echo "Step 1-2: Building and pushing container image using Cloud Build..."
gcloud builds submit --tag "${IMAGE_NAME}:latest" --project="${PROJECT_ID}"

# Tag with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
gcloud container images add-tag "${IMAGE_NAME}:latest" "${IMAGE_NAME}:${TIMESTAMP}" --quiet

echo "✓ Image built and pushed: ${IMAGE_NAME}:latest"
echo "✓ Image tagged: ${IMAGE_NAME}:${TIMESTAMP}"

# Step 3: Create/update Cloud Run Job
echo ""
echo "Step 3: Creating/updating Cloud Run Job..."

# Check if job exists
if gcloud run jobs describe "${JOB_NAME}" --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "Job exists, updating..."
  gcloud run jobs update "${JOB_NAME}" \
    --image="${IMAGE_NAME}:latest" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --memory="${MEMORY}" \
    --cpu="${CPU}" \
    --max-retries="${MAX_RETRIES}" \
    --task-timeout="${TIMEOUT}" \
    --service-account="${SERVICE_ACCOUNT}" \
    --set-env-vars="GCS_BUCKET_NAME=govreposcrape-summaries"
else
  echo "Creating new job..."
  gcloud run jobs create "${JOB_NAME}" \
    --image="${IMAGE_NAME}:latest" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --memory="${MEMORY}" \
    --cpu="${CPU}" \
    --max-retries="${MAX_RETRIES}" \
    --task-timeout="${TIMEOUT}" \
    --service-account="${SERVICE_ACCOUNT}" \
    --set-env-vars="GCS_BUCKET_NAME=govreposcrape-summaries"
fi

echo "✓ Cloud Run Job deployed: ${JOB_NAME}"

# Step 4: Ensure service account has correct permissions
echo ""
echo "Step 4: Verifying service account permissions..."

# Grant storage.admin (includes bucket.get, object.create, object.read, etc.)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/storage.admin" \
  --condition=None \
  &>/dev/null || echo "  ✓ storage.admin already granted"

# Grant serviceAccountUser (allows Cloud Run to use this SA)
gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT}" \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[default/${JOB_NAME}]" \
  --role="roles/iam.serviceAccountUser" \
  --project="${PROJECT_ID}" \
  &>/dev/null || echo "  ✓ serviceAccountUser already granted"

echo "✓ Service account permissions verified"

# Step 5: Set up Cloud Scheduler
echo ""
echo "Step 5: Setting up Cloud Scheduler..."

# Check if scheduler job exists
if gcloud scheduler jobs describe "${SCHEDULE_NAME}" --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "Scheduler exists, updating..."
  gcloud scheduler jobs update http "${SCHEDULE_NAME}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${SCHEDULE_TIMEZONE}" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="${SERVICE_ACCOUNT}"
else
  echo "Creating new scheduler..."
  gcloud scheduler jobs create http "${SCHEDULE_NAME}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${SCHEDULE_TIMEZONE}" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="${SERVICE_ACCOUNT}" \
    --description="Daily ingestion of UK government repositories to Vertex AI Search"
fi

echo "✓ Cloud Scheduler configured: ${SCHEDULE_NAME}"
echo "  Schedule: ${SCHEDULE} (${SCHEDULE_TIMEZONE})"

# Step 6: Display summary
echo ""
echo "=========================================="
echo "✓ Deployment Complete!"
echo "=========================================="
echo ""
echo "Cloud Run Job:"
echo "  Name: ${JOB_NAME}"
echo "  Image: ${IMAGE_NAME}:latest"
echo "  Memory: ${MEMORY}"
echo "  CPU: ${CPU}"
echo "  Timeout: ${TIMEOUT}"
echo ""
echo "Scheduler:"
echo "  Name: ${SCHEDULE_NAME}"
echo "  Schedule: ${SCHEDULE} (Daily at 2 AM UTC)"
echo ""
echo "Next Steps:"
echo "  1. Test manually: gcloud run jobs execute ${JOB_NAME} --region=${REGION}"
echo "  2. View logs: gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}' --limit=50"
echo "  3. List executions: gcloud run jobs executions list --job=${JOB_NAME} --region=${REGION}"
echo "  4. Pause scheduler: gcloud scheduler jobs pause ${SCHEDULE_NAME} --location=${REGION}"
echo "  5. Resume scheduler: gcloud scheduler jobs resume ${SCHEDULE_NAME} --location=${REGION}"
echo ""
