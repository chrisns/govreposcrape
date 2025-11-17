# govreposcrape - gitingest Processing Container

**Stories:** 2.3 (gitingest Processing) + 2.4 (R2 Storage) + 2.5 (Parallel Execution) + 2.6 (Pipeline Orchestrator)

Docker container for processing GitHub repositories using the gitingest Python library to generate LLM-ready code summaries and upload them to Cloudflare R2 for semantic search.

**NEW in Story 2.6:** Pipeline orchestrator (`orchestrator.py`) that coordinates the complete ingestion workflow: fetch repos.json → check cache → process uncached → upload to R2, with progress reporting and graceful shutdown.

## Overview

This container implements the data ingestion pipeline for govreposcrape, processing UK government repository URLs and generating comprehensive code summaries. It handles:

- **Pipeline Orchestrator:** Coordinates complete workflow: fetch → cache → process → upload (Story 2.6)
- **gitingest Library Integration:** Python-based code summarization
- **R2 Storage Upload:** Automatic upload to Cloudflare R2 with metadata (Story 2.4)
- **Parallel Execution:** Modulo arithmetic filtering for 10× speedup (Story 2.5)
- **Progress Reporting:** Every 100 repos with cache hit rate and ETA (Story 2.6)
- **Graceful Shutdown:** SIGTERM handling with state persistence (Story 2.6)
- **Retry Logic:** 3 attempts with exponential backoff [1s, 2s, 4s]
- **Timeout Enforcement:** 5 minutes max per repository
- **Fail-Safe Error Handling:** Continue processing despite individual failures
- **Structured JSON Logging:** Matches TypeScript logger pattern in `src/utils/logger.ts`
- **Statistics Tracking:** Success/failure counts, average processing time, upload statistics, batch context
- **Dry-Run Mode:** Test pipeline without actual processing (Story 2.6)

## Architecture

**Role in Pipeline:**
- **Input:** Repository URLs from `src/ingestion/repos-fetcher.ts` (Story 2.1)
- **Filter:** Only processes repos marked "needs processing" by `src/ingestion/cache.ts` (Story 2.2)
- **Output:** gitingest summaries stored in R2 (Story 2.4)
- **Orchestration:** Invoked by Worker orchestrator (Story 2.6)

**Why Separate Container:**
Cloudflare Workers cannot run Python or Docker containers, so gitingest processing requires separate compute infrastructure.

## Docker Build

### Prerequisites

- Docker installed (`docker --version`)
- Python 3.11+ base image available

### Build Instructions

```bash
# Build image
docker build -t govreposcrape-ingest ./container

# Verify build
docker images | grep govreposcrape-ingest
```

## Usage

### Pipeline Orchestrator (Story 2.6) - RECOMMENDED

The orchestrator coordinates the complete ingestion pipeline: fetch repos.json → check cache → process uncached → upload to R2.

```bash
# Sequential (process all repos from repos.json feed)
docker run \
  -e R2_BUCKET="your-bucket" \
  -e R2_ENDPOINT="https://your-account.r2.cloudflarestorage.com" \
  -e R2_ACCESS_KEY="your-access-key" \
  -e R2_SECRET_KEY="your-secret-key" \
  govreposcrape-ingest \
  python orchestrator.py

# Parallel (10 containers for 10× speedup)
docker run govreposcrape-ingest python orchestrator.py --batch-size=10 --offset=0  # Container 0
docker run govreposcrape-ingest python orchestrator.py --batch-size=10 --offset=1  # Container 1
...
docker run govreposcrape-ingest python orchestrator.py --batch-size=10 --offset=9  # Container 9

# Dry run (test without actual processing)
docker run govreposcrape-ingest python orchestrator.py --batch-size=10 --offset=0 --dry-run
```

**Features:**
- ✅ Automatic repos.json fetching with retry logic
- ✅ Cache checking (MVP: marks all as needing processing for initial seeding)
- ✅ Progress reporting every 100 repos: "Processed 500/21,000 (2.4%), cache hit: 91.2%, elapsed: 15m, ETA: 5h 30m"
- ✅ Final statistics: "Pipeline complete: 21,000 total, 19,000 cached (90.5%), 1,800 processed, 200 failed, completed in 5h 47m"
- ✅ Graceful shutdown on SIGTERM (saves progress to `/tmp/orchestrator-state.json`)
- ✅ Fail-safe: errors logged, processing continues

### Basic Usage (Single Repository)

For processing a single repository URL directly (bypasses orchestrator):

```bash
docker run \
  -e R2_BUCKET="your-bucket" \
  -e R2_ENDPOINT="https://your-account.r2.cloudflarestorage.com" \
  -e R2_ACCESS_KEY="your-access-key" \
  -e R2_SECRET_KEY="your-secret-key" \
  govreposcrape-ingest \
  python ingest.py https://github.com/alphagov/govuk-frontend
```

### Parallel Execution (Story 2.5)

Process repositories in parallel using batch-size and offset:

```bash
# Container 1: Process repos 0, 10, 20, 30...
docker run govreposcrape-ingest \
  python ingest.py <repo-url> --batch-size=10 --offset=0

# Container 2: Process repos 1, 11, 21, 31...
docker run govreposcrape-ingest \
  python ingest.py <repo-url> --batch-size=10 --offset=1

# ... up to offset 9 for 10 parallel containers
```

**Performance:** 10 parallel containers = ~6 hours for 21k repos (vs. 58 hours sequential)

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `R2_BUCKET` | Cloudflare R2 bucket name | Yes |
| `R2_ENDPOINT` | R2 endpoint URL | Yes |
| `R2_ACCESS_KEY` | R2 access key ID | Yes |
| `R2_SECRET_KEY` | R2 secret access key | Yes |

## CLI Interface

```bash
python ingest.py [OPTIONS]

Options:
  --batch-size N        Process every Nth repository (for parallel execution, default: 1)
  --offset M            Offset within batch (0 to batch-size-1, default: 0)
  --dry-run             Simulate processing without running gitingest
  --help                Show help message with examples

Examples:
  # Sequential (process all repos)
  python ingest.py

  # Parallel (10 containers)
  python ingest.py --batch-size=10 --offset=0  # Container 0
  python ingest.py --batch-size=10 --offset=1  # Container 1
  ...
  python ingest.py --batch-size=10 --offset=9  # Container 9

  # Dry run
  python ingest.py --batch-size=10 --offset=0 --dry-run

Exit Codes:
  0                     Success - summary generated
  1                     Failure - see logs for details
```

## Implementation Details

### Retry Logic

**Pattern:** 3 attempts with exponential backoff matching `src/utils/retry.ts`

```python
retry_with_backoff(
    func,
    max_attempts=3,
    delays=[1, 2, 4]  # seconds
)
```

**Retries on:**
- Network errors
- Transient gitingest failures
- Repository access issues

**Does NOT retry:**
- Timeout errors (5 minute limit exceeded)
- Invalid repository URLs

### Timeout Enforcement

```python
# Set 5 minute timeout (300 seconds)
signal.alarm(5 * 60)
try:
    summary = ingest_repository(repo_url)
finally:
    signal.alarm(0)  # Cancel alarm
```

Large repositories (100MB+) may take several minutes. Timeout prevents runaway processes.

### Fail-Safe Error Handling

Processing continues on failure - errors are logged but don't halt the pipeline:

```python
try:
    result = process_repository(repo_url)
except Exception as e:
    logger.error("Processing failed", error=e)
    # Continue to next repository (no raise)
```

### Structured Logging

JSON-formatted logs matching TypeScript logger pattern:

```json
{
  "timestamp": "2025-11-13T10:00:00.000Z",
  "level": "info",
  "message": "Processing repository",
  "context": {
    "operation": "gitingest-container",
    "metadata": {
      "repo_url": "https://github.com/alphagov/govuk-frontend"
    }
  }
}
```

### Statistics Tracking

Tracks per-run statistics:
- **Successful:** Count of successfully processed repos
- **Failed:** Count of failed repos
- **Average Time:** Mean processing time across successful repos

Example log output:
```json
{
  "message": "Processing statistics",
  "metadata": {
    "total": 100,
    "successful": 95,
    "failed": 5,
    "average_time_seconds": 9.8
  }
}
```

## Testing

### Run Tests

```bash
# Run all tests
pytest container/

# Run ingest tests only
pytest container/test_ingest.py

# Run R2 client tests only
pytest container/test_r2_client.py

# Run with coverage
pytest --cov=ingest --cov=r2_client --cov-report=html container/

# Run specific test
pytest container/test_ingest.py::TestGitingestProcessing::test_successful_processing
pytest container/test_r2_client.py::TestR2Upload::test_successful_upload
```

### Test Coverage

**Target:** 80%+ on core logic

**Coverage Areas:**

**gitingest Processing (test_ingest.py):**
- ✅ gitingest processing (successful and failed)
- ✅ Timeout enforcement (5 minute limit)
- ✅ Retry logic (3 attempts with exponential backoff)
- ✅ Retry exhaustion (final failure after 3 attempts)
- ✅ Fail-safe behavior (continue on failure)
- ✅ Statistics tracking (successful, failed, average time)
- ✅ CLI interface (argument parsing, exit codes)

**R2 Storage (test_r2_client.py - Story 2.4):**
- ✅ R2 upload with correct object path (gitingest/{org}/{repo}/summary.txt)
- ✅ Custom metadata attachment (pushedAt, url, processedAt)
- ✅ Content-type validation (text/plain)
- ✅ Retry logic with exponential backoff
- ✅ Retry exhaustion handling
- ✅ getSummary retrieval method
- ✅ Environment variable validation
- ✅ Upload statistics tracking
- ✅ Fail-safe error handling

## Error Scenarios

| Scenario | Behavior | Exit Code |
|----------|----------|-----------|
| Repository not found (404) | Log error, mark failed, continue | 1 |
| Network timeout | Retry with backoff (3 attempts) | 1 (if all fail) |
| gitingest timeout (5 min) | Log error, mark failed, continue | 1 |
| Malformed repository | Log error, mark failed, continue | 1 |
| gitingest library crash | Retry (3 attempts), log error | 1 (if all fail) |

## Troubleshooting

### Container won't start

```bash
# Check Docker is running
docker ps

# Check image exists
docker images | grep govreposcrape-ingest

# Rebuild if needed
docker build -t govreposcrape-ingest ./container
```

### gitingest library not found

```bash
# Verify requirements.txt includes gitingest
cat container/requirements.txt | grep gitingest

# Rebuild container to install dependencies
docker build --no-cache -t govreposcrape-ingest ./container
```

### Timeout errors

Large repositories (100MB+) may timeout. Considerations:
- **5 minute timeout is intentional** to prevent runaway processes
- Failed repos are logged and skipped (fail-safe)
- Review logs to identify problematic repositories
- Consider excluding extremely large repos from processing

### Environment variable errors

```bash
# Verify all required env vars are set
docker run govreposcrape-ingest env | grep R2_

# Pass env vars explicitly
docker run \
  -e R2_BUCKET="..." \
  -e R2_ENDPOINT="..." \
  -e R2_ACCESS_KEY="..." \
  -e R2_SECRET_KEY="..." \
  govreposcrape-ingest python ingest.py <url>
```

## Dependencies

- **Python:** 3.11 (base image)
- **gitingest:** Latest (LLM-ready code summarization)
- **boto3:** ^1.34 (R2/S3-compatible storage client)
- **pytest:** ^8.0 (testing framework)

## Integration with Orchestrator (Story 2.6)

**Expected Input:** Repository URL from Worker orchestrator
**Expected Output:** Exit code 0 (success) or 1 (failure)
**Invocation Pattern:** Docker run with repository URL argument

```typescript
// Worker orchestrator (Story 2.6) invokes container:
const result = await invokeContainer({
  image: "govreposcrape-ingest",
  command: ["python", "ingest.py", repoUrl],
  env: { R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY }
});
```

## Performance Characteristics

- **Average Processing Time:** ~10 seconds per repo
- **Large Repos (100MB+):** Up to 5 minutes (timeout limit)
- **Retry Overhead:** +7 seconds max (1s + 2s + 4s delays)
- **Sequential (21k repos):** ~58 hours
- **Parallel (10 containers):** ~6 hours

## R2 Storage Integration (Story 2.4)

### Object Path Structure

Summaries are stored in R2 with this path structure:

```
R2 Bucket: govreposcrape-gitingest
├── gitingest/
│   ├── alphagov/
│   │   └── govuk-frontend/
│   │       └── summary.txt
│   ├── nhsdigital/
│   │   └── nhs-login/
│   │       └── summary.txt
│   └── hmrc/
│       └── making-tax-digital/
│           └── summary.txt
```

### Custom Metadata

Each R2 object includes custom metadata for smart caching:

```json
{
  "pushedat": "2025-10-15T14:30:00Z",
  "url": "https://github.com/alphagov/govuk-frontend",
  "processedat": "2025-11-13T10:05:23Z"
}
```

**Note:** R2 metadata keys are lowercase (boto3 S3 API convention)

### Upload Process

1. gitingest generates code summary
2. Summary uploaded to R2 with metadata
3. Upload retries on failure (3 attempts, exponential backoff)
4. Upload failure logged but doesn't block processing (fail-safe)
5. Statistics track: total uploaded, failed, storage size

### Content-Type

All summaries use `content-type: text/plain` for AI Search automatic indexing compatibility.

## Parallel Execution Guide (Story 2.5)

### Overview

Parallel execution uses **modulo arithmetic filtering** to distribute ~21k repositories across multiple containers:
- Each container processes every Nth repository starting at offset M
- No cross-container coordination required (independent execution)
- Statistics aggregated via log parsing

### Quick Start

```bash
# 1. Create .env file with R2 credentials
cat > .env <<EOF
R2_BUCKET=govscraperepo-gitingest
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
EOF

# 2. Build container
docker build -t govscraperepo-ingest ./container

# 3. Run parallel execution (10 containers)
./scripts/run-parallel.sh 10
```

### How Modulo Arithmetic Works

**Example: batch_size=10, offset=0**
- Processes repos at indices: 0, 10, 20, 30, 40, ...

**Example: batch_size=10, offset=5**
- Processes repos at indices: 5, 15, 25, 35, 45, ...

**Result:** All 21,000 repos processed exactly once across 10 containers, no duplicates, no gaps.

### Performance Characteristics

| Scenario | Time | Speedup |
|----------|------|---------|
| Sequential (1 container) | ~58 hours | 1× |
| Parallel (10 containers) | ~6 hours | 10× |

**Note:** Each repo takes ~10 seconds avg; parallel containers run simultaneously but each processes 1/10th of repos.

### Manual Parallel Execution

```bash
# Launch 10 containers manually
for offset in {0..9}; do
  docker run \
    --env-file .env \
    --name "govscraperepo-ingest-$offset" \
    --rm \
    govscraperepo-ingest \
    python ingest.py --batch-size=10 --offset=$offset &
done

# Wait for all to complete
wait

# Aggregate statistics (example)
docker logs govscraperepo-ingest-0 | grep "Batch.*complete"
docker logs govscraperepo-ingest-1 | grep "Batch.*complete"
...
```

### Batch Context Logging

All logs include batch context for filtering and aggregation:

```json
{
  "timestamp": "2025-11-13T10:05:23Z",
  "level": "info",
  "message": "Batch 10, offset 3 complete: 210 successful, 0 failed",
  "context": {
    "operation": "gitingest-container",
    "metadata": {
      "batch_size": 10,
      "offset": 3,
      "total": 210,
      "successful": 210,
      "failed": 0,
      "average_time_seconds": 9.8
    }
  }
}
```

### Troubleshooting

**Offset validation error:**
```
error: offset (10) must be less than batch-size (10)
```
→ Offset must be 0 to batch_size-1 (e.g., for batch_size=10, offset can be 0-9)

**Duplicate processing detected:**
→ Verify each container uses unique offset (0-9 for 10 containers)

**Statistics don't add up:**
→ Check all containers completed successfully; aggregate logs from all offsets

### Future Enhancements (Not MVP)

- Cache update signaling (Story 2.2 integration)
- Metrics export to monitoring dashboard
- Support for GitHub API token (rate limit mitigation)
- GitHub Actions matrix for automated parallel execution

## Module Documentation

### orchestrator.py (Story 2.6)

Pipeline orchestrator that coordinates the complete ingestion workflow. This is the recommended entry point for production use.

**Key Functions:**
- `check_cache_status(repos)` - Check cache status for repositories (MVP: marks all as needing processing)
- `format_elapsed_time(seconds)` - Format elapsed time as human-readable string (e.g., "5h 47m")
- `log_progress(processed, total, cached, successful, failed, elapsed, batch_size, offset)` - Log progress every 100 repos
- `log_final_summary(total_repos, cached, processed, failed, elapsed, batch_size, offset)` - Log final statistics
- `graceful_shutdown(signum, frame)` - Handle SIGTERM for graceful shutdown with state persistence
- `main()` - Main orchestrator entry point

**Pipeline Flow:**
1. Fetch repos.json from feed (with retry logic)
2. Filter repos for this batch (parallel execution support)
3. Check cache status for batch repos (MVP: all need processing)
4. Process each repository with gitingest + upload to R2
5. Report progress every 100 repos
6. Log final statistics

**CLI Interface:**
```bash
python orchestrator.py [--batch-size=N] [--offset=M] [--dry-run]

Options:
  --batch-size N  Process every Nth repository (default: 1)
  --offset M      Offset within batch (0 to N-1, default: 0)
  --dry-run       Simulate processing without running gitingest

Examples:
  python orchestrator.py                              # Sequential
  python orchestrator.py --batch-size=10 --offset=0   # Parallel container 0
  python orchestrator.py --dry-run                    # Test mode
```

**Output Examples:**
- Progress: "Processed 500/21,000 (2.4%), cache hit: 91.2%, elapsed: 15m, ETA: 5h 30m"
- Final: "Pipeline complete: 21,000 total, 19,000 cached (90.5%), 1,800 processed, 200 failed, completed in 5h 47m"

**Graceful Shutdown:**
- Handles SIGTERM signal
- Saves progress to `/tmp/orchestrator-state.json`
- Includes: repos_processed, batch_size, offset, timestamp

### ingest.py

Main CLI entrypoint for single-repository gitingest processing. Handles repository processing with timeout, retry logic, parallel execution, and R2 upload integration. **Note:** For production use, prefer `orchestrator.py` which coordinates the full pipeline.

**Key Functions:**
- `fetch_repos_json(feed_url)` - Fetch and parse repos.json feed with retry (Story 2.5)
- `filter_repos_for_batch(repos, batch_size, offset)` - Modulo arithmetic filtering for parallel execution (Story 2.5)
- `process_repository(repo_url, upload_to_r2=True)` - Process repository and optionally upload to R2
- `upload_summary_to_r2(repo_url, summary)` - Extract org/repo from URL and upload to R2
- `retry_with_backoff(func, max_attempts, delays)` - Retry pattern with exponential backoff

**Classes:**
- `ProcessingStats` - Track processing statistics with batch context (extended in Story 2.5)

### r2_client.py (Story 2.4)

R2 storage client for uploading/retrieving gitingest summaries with custom metadata.

**Key Functions:**
- `upload_summary(org, repo, content, metadata)` - Upload summary with metadata to R2
- `get_summary(org, repo)` - Retrieve summary from R2
- `upload_with_retry(org, repo, content, metadata)` - Upload with retry logic
- `validate_environment()` - Validate required R2 environment variables
- `create_r2_client()` - Create boto3 S3 client configured for R2

**Classes:**
- `UploadStats` - Track upload statistics (uploaded, failed, storage size)
- `R2ConfigError` - Exception for missing/invalid R2 configuration

## References

- [Story 2.3 Definition](../docs/epics.md#Story-2.3) - gitingest Processing
- [Story 2.4 Definition](../docs/epics.md#Story-2.4) - R2 Storage with Metadata
- [Story 2.5 Definition](../docs/epics.md#Story-2.5) - Parallel Execution Support
- [PRD FR-1.2: gitingest Summary Generation](../docs/PRD.md#FR-1.2)
- [PRD FR-1.3: Smart Caching via R2 Metadata](../docs/PRD.md#FR-1.3)
- [PRD NFR-1.3: Initial Data Seeding Performance](../docs/PRD.md#NFR-1.3) - 21k repos in ~6 hours requirement
- [Architecture: Data Ingestion Pipeline](../docs/architecture.md#Epic-2)
- [gitingest Python Library](https://pypi.org/project/gitingest/)
- [Cloudflare R2 (boto3 S3 API)](https://developers.cloudflare.com/r2/api/s3/api/)
- [boto3 S3 Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3.html)
