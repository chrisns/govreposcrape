# Cloud Run Job - Scheduled Ingestion

## Overview

The govreposcrape ingestion container runs as a **Cloud Run Job** with scheduled execution via **Cloud Scheduler**.

### Architecture

```
Cloud Scheduler (Daily at 2 AM UTC)
    ↓ HTTP POST
Cloud Run Job (govreposcrape-ingestion)
    ↓ Reads repos.json
    ↓ Processes with gitingest
    ↓ Uploads to GCS
Google Cloud Storage (govreposcrape-summaries)
    ↓ Auto-indexes
Vertex AI Search
```

### Why Cloud Run Jobs?

- **Run-to-completion**: Perfect for batch processing (vs always-on services)
- **Serverless**: No infrastructure management
- **Cost-effective**: Pay only when running (6 hour job once per day)
- **Scalable**: Handles long-running jobs (up to 24 hours)
- **Integrated**: Built-in logging, monitoring, and scheduling

## Deployment

### One-time setup

```bash
# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  containerregistry.googleapis.com

# Ensure service account has permissions
gcloud projects add-iam-policy-binding govreposcrape \
  --member="serviceAccount:govreposcrape-sa@govreposcrape.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding govreposcrape \
  --member="serviceAccount:govreposcrape-sa@govreposcrape.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### Deploy the job

```bash
cd container
./deploy-job.sh
```

This will:
1. Build Docker image
2. Push to Google Container Registry
3. Create/update Cloud Run Job
4. Set up Cloud Scheduler (daily at 2 AM UTC)

## Manual Execution

### Run the job immediately

```bash
gcloud run jobs execute govreposcrape-ingestion --region=us-central1
```

### Run with custom parameters

```bash
# Test with 10 repos
gcloud run jobs execute govreposcrape-ingestion \
  --region=us-central1 \
  --args="--limit=10"

# Process specific batch
gcloud run jobs execute govreposcrape-ingestion \
  --region=us-central1 \
  --args="--batch-size=4,--offset=0"
```

## Monitoring

### View job executions

```bash
# List all executions
gcloud run jobs executions list --job=govreposcrape-ingestion --region=us-central1

# Describe specific execution
gcloud run jobs executions describe <execution-name> --region=us-central1
```

### View logs

```bash
# Real-time logs for latest execution
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=govreposcrape-ingestion" --format=json

# Recent logs (last 50 entries)
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=govreposcrape-ingestion" --limit=50

# Search for errors
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=govreposcrape-ingestion AND severity>=ERROR" --limit=20
```

### Check scheduler status

```bash
# List scheduled jobs
gcloud scheduler jobs list --location=us-central1

# Describe scheduler
gcloud scheduler jobs describe govreposcrape-daily-ingest --location=us-central1

# View scheduler logs
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_name=govreposcrape-daily-ingest" --limit=10
```

## Scheduler Management

### Pause scheduled runs

```bash
gcloud scheduler jobs pause govreposcrape-daily-ingest --location=us-central1
```

### Resume scheduled runs

```bash
gcloud scheduler jobs resume govreposcrape-daily-ingest --location=us-central1
```

### Change schedule

```bash
# Run twice daily (2 AM and 2 PM UTC)
gcloud scheduler jobs update http govreposcrape-daily-ingest \
  --location=us-central1 \
  --schedule="0 2,14 * * *"

# Run weekly (Sundays at 2 AM UTC)
gcloud scheduler jobs update http govreposcrape-daily-ingest \
  --location=us-central1 \
  --schedule="0 2 * * 0"
```

## Configuration

### Job resources

- **Memory**: 4 GiB (handles large repositories)
- **CPU**: 2 vCPUs (speeds up gitingest processing)
- **Timeout**: 6 hours (21,600 seconds)
- **Max retries**: 0 (manual intervention on failure)

### Environment variables

- `GCS_BUCKET_NAME`: govreposcrape-summaries
- `GOOGLE_APPLICATION_CREDENTIALS`: Set automatically via service account

### Service account

- **Name**: govreposcrape-sa@govreposcrape.iam.gserviceaccount.com
- **Roles**:
  - `roles/storage.objectAdmin` (GCS read/write)
  - `roles/run.invoker` (Cloud Run execution)

## Cost Estimation

### Cloud Run Job pricing (us-central1)

- **CPU**: $0.00002400 per vCPU-second
- **Memory**: $0.00000250 per GiB-second
- **Requests**: Free (1st million per month)

### Daily run cost

```
6 hour job × 1 run/day:
- CPU: 2 vCPUs × 21,600s × $0.000024 = $1.04/day
- Memory: 4 GiB × 21,600s × $0.0000025 = $0.22/day
Total: ~$1.26/day = ~$38/month
```

### Cloud Scheduler pricing

- **Jobs**: $0.10/month per job
- **Total**: $0.10/month

### Combined estimate

- **Cloud Run Job**: ~$38/month
- **Cloud Scheduler**: $0.10/month
- **GCS storage**: ~$0.02/month (1 GB)
- **Vertex AI Search**: Variable (per query)
- **Total infrastructure**: ~$38/month

## Troubleshooting

### Job fails immediately

```bash
# Check job configuration
gcloud run jobs describe govreposcrape-ingestion --region=us-central1

# Check service account permissions
gcloud projects get-iam-policy govreposcrape \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:govreposcrape-sa@govreposcrape.iam.gserviceaccount.com"
```

### Job times out

- Increase timeout: `gcloud run jobs update govreposcrape-ingestion --task-timeout=43200s --region=us-central1` (12 hours)
- Or split into batches with `--batch-size` and `--offset`

### Scheduler not triggering

```bash
# Check scheduler status
gcloud scheduler jobs describe govreposcrape-daily-ingest --location=us-central1

# Manually trigger to test
gcloud scheduler jobs run govreposcrape-daily-ingest --location=us-central1
```

### Out of memory

- Increase memory: `gcloud run jobs update govreposcrape-ingestion --memory=8Gi --region=us-central1`

## Development

### Build and test locally

```bash
# Build image
docker build -t govreposcrape-ingestion .

# Test with 5 repos
docker run --rm \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json \
  -e GCS_BUCKET_NAME=govreposcrape-summaries \
  -v "$PWD/../google-credentials.json:/app/google-credentials.json:ro" \
  govreposcrape-ingestion python orchestrator.py --limit=5
```

### Update and redeploy

```bash
# Make code changes
vim orchestrator.py

# Redeploy (rebuilds and updates job)
./deploy-job.sh
```

## Parallel Processing

To speed up processing, run multiple jobs in parallel with batch splitting:

```bash
# Job 1: Process repos 0-5000 (batch 1 of 4)
gcloud run jobs execute govreposcrape-ingestion \
  --region=us-central1 \
  --args="--batch-size=4,--offset=0"

# Job 2: Process repos 5001-10000 (batch 2 of 4)
gcloud run jobs execute govreposcrape-ingestion \
  --region=us-central1 \
  --args="--batch-size=4,--offset=1"

# Job 3: Process repos 10001-15000 (batch 3 of 4)
gcloud run jobs execute govreposcrape-ingestion \
  --region=us-central1 \
  --args="--batch-size=4,--offset=2"

# Job 4: Process repos 15001-20576 (batch 4 of 4)
gcloud run jobs execute govreposcrape-ingestion \
  --region=us-central1 \
  --args="--batch-size=4,--offset=3"
```

This processes all 20k repos in ~6 hours instead of 24+ hours.

## References

- [Cloud Run Jobs documentation](https://cloud.google.com/run/docs/create-jobs)
- [Cloud Scheduler documentation](https://cloud.google.com/scheduler/docs)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
