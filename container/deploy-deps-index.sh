#!/usr/bin/env bash
#
# deploy-deps-index.sh — build the ingestion image and create the daily Cloud Run
# Job + Cloud Scheduler trigger that rebuilds the structured dependency index
# (BigQuery govreposcrape_deps) from the aggregate CycloneDX SBOM.
#
# Idempotent: safe to re-run. Requires roles to build images, create Cloud Run
# jobs, and create Cloud Scheduler jobs. The job runs as the default compute
# service account (which has roles/editor → BigQuery + GCS).
#
# Usage:  ./deploy-deps-index.sh
set -euo pipefail

PROJECT_ID="${GOOGLE_PROJECT_ID:-govreposcrape}"
REGION="${REGION:-us-central1}"
IMAGE="gcr.io/${PROJECT_ID}/govreposcrape-ingestion:latest"
JOB_NAME="govreposcrape-deps-index"
SCHEDULER_NAME="govreposcrape-deps-index-daily"
# 04:00 UTC daily — after the upstream scraper regenerates the aggregate SBOM and
# after the existing gitingest job (02:00) so they don't contend.
SCHEDULE="${SCHEDULE:-0 4 * * *}"

echo "==> Building ingestion image (includes build_deps_index.py + version_keys.py)"
gcloud builds submit "$(dirname "$0")" \
  --project "$PROJECT_ID" \
  --tag "$IMAGE"

echo "==> Creating/updating Cloud Run Job ${JOB_NAME}"
if gcloud run jobs describe "$JOB_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
  gcloud run jobs update "$JOB_NAME" \
    --project "$PROJECT_ID" --region "$REGION" \
    --image "$IMAGE" \
    --command python \
    --args build_deps_index.py \
    --memory 4Gi --cpu 2 --task-timeout 1800 --max-retries 1 \
    --set-env-vars "GOOGLE_PROJECT_ID=${PROJECT_ID},DEPS_DATASET=govreposcrape_deps"
else
  gcloud run jobs create "$JOB_NAME" \
    --project "$PROJECT_ID" --region "$REGION" \
    --image "$IMAGE" \
    --command python \
    --args build_deps_index.py \
    --memory 4Gi --cpu 2 --task-timeout 1800 --max-retries 1 \
    --set-env-vars "GOOGLE_PROJECT_ID=${PROJECT_ID},DEPS_DATASET=govreposcrape_deps"
fi

echo "==> Creating/updating Cloud Scheduler trigger ${SCHEDULER_NAME} (${SCHEDULE})"
RUN_URL="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run"
COMPUTE_SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
if gcloud scheduler jobs describe "$SCHEDULER_NAME" --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$SCHEDULER_NAME" \
    --project "$PROJECT_ID" --location "$REGION" \
    --schedule "$SCHEDULE" --uri "$RUN_URL" --http-method POST \
    --oauth-service-account-email "$COMPUTE_SA"
else
  gcloud scheduler jobs create http "$SCHEDULER_NAME" \
    --project "$PROJECT_ID" --location "$REGION" \
    --schedule "$SCHEDULE" --uri "$RUN_URL" --http-method POST \
    --oauth-service-account-email "$COMPUTE_SA"
fi

echo "==> Done. Trigger a manual run with:"
echo "    gcloud run jobs execute ${JOB_NAME} --project ${PROJECT_ID} --region ${REGION}"
