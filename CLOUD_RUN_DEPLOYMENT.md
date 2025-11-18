# Cloud Run Job Deployment - Complete

## ✅ Successfully Deployed!

The govreposcrape ingestion pipeline is now running as a scheduled serverless Cloud Run Job.

### Infrastructure Summary

**Cloud Run Job**: `govreposcrape-ingestion`
- **Image**: `gcr.io/govreposcrape/govreposcrape-ingestion:latest`
- **Resources**: 4 GB memory, 2 CPU cores
- **Timeout**: 6 hours (21,600 seconds)
- **Region**: us-central1
- **Service Account**: `govreposcrape-sa@govreposcrape.iam.gserviceaccount.com`

**Cloud Scheduler**: `govreposcrape-daily-ingest`
- **Schedule**: Daily at 2 AM UTC (`0 2 * * *`)
- **Status**: ENABLED
- **Next run**: Tomorrow at 02:00 UTC

**Permissions**:
- `roles/storage.admin` - Full GCS bucket access (includes bucket.get, object operations)
- `roles/iam.serviceAccountUser` - Allows Cloud Run to use the service account

### Key Fixes Applied

1. **✅ Removed 512KB Truncation Limit**
   - Previously truncated summaries at 524,288 bytes (lost 86% of BathApp content)
   - Now uploads full gitingest summaries without truncation
   - Vertex AI Search handles large documents natively

2. **✅ Fixed Service Account Permissions**
   - Added `storage.admin` role for `storage.buckets.get` access
   - Container now works correctly in Cloud Run environment

3. **✅ Fixed Container Startup in Cloud Run**
   - Removed `GOOGLE_APPLICATION_CREDENTIALS` env var from Dockerfile
   - Cloud Run uses service account metadata automatically

4. **✅ Fixed AMD64 Architecture**
   - Switched from local `docker build` to `gcloud builds submit`
   - Cloud Build handles AMD64 platform automatically

### Current Status

**Full Ingestion Started**: `govreposcrape-ingestion-xdk9x`
- Started: 2025-11-18 (just now)
- Processing: 20,576 repositories
- Expected duration: ~5-6 hours (based on 1 repo/second average)

You can monitor progress with:
```bash
# View latest logs
gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=govreposcrape-ingestion' --limit=50

# Check execution status
gcloud run jobs executions describe govreposcrape-ingestion-xdk9x --region=us-central1

# List all executions
gcloud run jobs executions list --job=govreposcrape-ingestion --region=us-central1
```

### Management Commands

#### Manual Execution
```bash
# Trigger full ingestion manually (async)
gcloud run jobs execute govreposcrape-ingestion --region=us-central1 --async

# Trigger with limit (for testing)
gcloud run jobs execute govreposcrape-ingestion --region=us-central1 --args="--limit=100" --async
```

#### Monitoring
```bash
# Real-time logs (last 50 entries)
gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=govreposcrape-ingestion' --limit=50

# Filter for processing stats
gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=govreposcrape-ingestion' --limit=100 --format='value(textPayload)' | grep -E "(Uploaded|Pipeline complete|processed|failed)"

# View execution details
gcloud run jobs executions describe <EXECUTION_ID> --region=us-central1
```

#### Scheduler Management
```bash
# Pause scheduled runs
gcloud scheduler jobs pause govreposcrape-daily-ingest --location=us-central1

# Resume scheduled runs
gcloud scheduler jobs resume govreposcrape-daily-ingest --location=us-central1

# Trigger scheduler manually (for testing)
gcloud scheduler jobs run govreposcrape-daily-ingest --location=us-central1
```

#### Cloud Storage Verification
```bash
# List uploaded files
gcloud storage ls gs://govreposcrape-summaries/ --recursive | head -20

# Count total files
gcloud storage ls gs://govreposcrape-summaries/**/*.md | wc -l

# Check file metadata
gcloud storage objects describe gs://govreposcrape-summaries/BathnesDevelopment/BathApp.md
```

### Cost Estimates

**Cloud Run Job** (6 hours/day):
- Memory: 4 GB × 6 hours × 30 days × $0.0025/GB-hour = $1.80/month
- CPU: 2 vCPU × 6 hours × 30 days × $0.024/vCPU-hour = $8.64/month
- **Total**: ~$10.44/month

**Cloud Storage** (20,576 files, ~10 GB total):
- Storage: 10 GB × $0.020/GB-month = $0.20/month
- Class A operations (uploads): 20,576 × $0.05/10,000 = $0.10/month
- **Total**: ~$0.30/month

**Cloud Scheduler**:
- 1 job × $0.10/month = $0.10/month

**Grand Total**: ~$10.84/month

### Next Steps

1. ✅ **Full ingestion running** - Started execution `govreposcrape-ingestion-xdk9x`
2. ⏳ **Wait for completion** - Expected in 5-6 hours
3. ⏳ **Verify Vertex AI Search indexing** - Check if new documents appear in search results
4. ⏳ **Monitor scheduled run** - First automatic run tomorrow at 2 AM UTC

### Troubleshooting

**If job fails:**
1. Check logs: `gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=govreposcrape-ingestion' --limit=100`
2. Check execution status: `gcloud run jobs executions describe <EXECUTION_ID> --region=us-central1`
3. Review service account permissions
4. Verify GCS bucket exists and is accessible

**If uploads fail:**
- Check service account has `storage.admin` role
- Verify bucket `govreposcrape-summaries` exists in us-central1
- Check Cloud Storage quota limits

**If timeout occurs:**
- Consider increasing parallelization with `--batch-size` and `--offset`
- Increase timeout beyond 6 hours (currently at max recommended)
- Split into multiple jobs running in parallel

### Files Modified

- `container/ingest.py` - Removed 512KB truncation limit (lines 360-376)
- `container/Dockerfile` - Removed GOOGLE_APPLICATION_CREDENTIALS env var
- `container/deploy-job.sh` - Added permission verification step
- `container/orchestrator.py` - Added startup logging for debugging
- `container/gcs_client.py` - Updated error messages for Cloud Run
- `container/test_cloudrun.py` - Created minimal test script

### Documentation

Full deployment documentation available in:
- `container/CLOUD_RUN_JOB.md` - Comprehensive Cloud Run Job guide
- `container/deploy-job.sh` - Automated deployment script
- This file - Deployment summary and quick reference
