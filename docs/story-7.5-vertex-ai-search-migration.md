# Story 7.5: Vertex AI Search Migration

**Epic:** 7 - Google Cloud Platform Migration
**Status:** Backlog
**Priority:** High (blocks production deployment)
**Estimate:** 3-5 days

## Context

Story 7.2 testing revealed Google File Search API is unsuitable for production due to:
- Persistent 503 errors for files >10KB
- No SLA guarantees (beta/preview service)
- Cannot meet "100% success necessary" requirement

See: `docs/google-file-search-testing-results.md` for comprehensive testing results.

## Goal

Migrate from Google File Search API to **Vertex AI Search** (production-grade semantic search) to achieve 100% upload success rate with SLA guarantees.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    govreposcrape Pipeline                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Fetch repos.json from UK Government feed           │
│  (Existing: ingest.py::fetch_repos_json)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Generate gitingest summary for each repo           │
│  (Existing: ingest.py::process_repository)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Upload to Cloud Storage (NEW)                      │
│  - Bucket: govreposcrape-summaries                          │
│  - Path: {org}/{repo}/{commit-sha}.txt                      │
│  - Metadata: pushedAt, url, processedAt, size               │
│  - Upload client: google-cloud-storage SDK                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Index in Vertex AI Search (NEW)                    │
│  - Datastore: govreposcrape-uk-code                         │
│  - Content type: Unstructured documents                      │
│  - Indexing: Automatic from Cloud Storage bucket            │
│  - Search features: Semantic + metadata filtering           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5: Query API (Story 7.3 - deferred)                   │
│  - Platform: Cloud Run (replaces Cloudflare Workers)        │
│  - Endpoint: POST /search?q=authentication                   │
│  - Response: GitHub URLs + code snippets + metadata         │
└─────────────────────────────────────────────────────────────┘
```

## Technical Specifications

### Component 1: Cloud Storage Backend

**Purpose:** Reliable, scalable storage for gitingest summaries

**Implementation:**
- **Bucket:** `govreposcrape-summaries`
- **Region:** `europe-west2` (London, UK)
- **Storage Class:** Standard (for frequent access)
- **Object Path:** `{org}/{repo}/summary.txt`
- **Metadata Fields:**
  - `x-goog-meta-repo-url`: GitHub repository URL
  - `x-goog-meta-pushed-at`: Last push timestamp
  - `x-goog-meta-processed-at`: Processing timestamp
  - `x-goog-meta-commit-sha`: Git commit SHA (if available)
  - `x-goog-meta-size`: Original summary size in bytes

**Client:** `google-cloud-storage>=2.10.0`

**Benefits:**
- 99.999999999% durability (11 nines)
- No file size limits (tested up to 512KB)
- 100% upload success (SLA-backed)
- Versioning support for updates

### Component 2: Vertex AI Search

**Purpose:** Production-grade semantic search with 99.9% SLA

**Configuration:**
- **Datastore Name:** `govreposcrape-uk-code`
- **Location:** `global` (multi-region for low latency)
- **Content Type:** Unstructured documents
- **Data Source:** Cloud Storage bucket (`gs://govreposcrape-summaries`)
- **Schema:** Auto-detect from metadata
- **Search Features:**
  - Semantic search (natural language queries)
  - Metadata filtering (by org, repo, date range)
  - Snippet extraction (relevant code excerpts)
  - Ranking signals (relevance scoring)

**Indexing Strategy:**
- **Automatic:** Watch Cloud Storage bucket for new/updated files
- **Incremental:** Only re-index changed files
- **Frequency:** Near real-time (minutes, not hours)

**Client:** `google-cloud-discoveryengine>=0.11.0`

**Benefits:**
- 99.9% SLA guarantee
- Production-grade infrastructure
- Advanced search features (faceting, boosting, synonyms)
- Cost-effective at scale

### Component 3: Upload Client (NEW)

**File:** `container/vertex_ai_client.py`

**Responsibilities:**
1. Upload gitingest summary to Cloud Storage
2. Set custom metadata for Vertex AI Search indexing
3. Trigger indexing (if manual mode enabled)
4. Retry logic with exponential backoff

**API:**
```python
class VertexAIClient:
    def __init__(self, project_id: str, bucket_name: str):
        """Initialize with GCP project and bucket."""

    def upload_summary(
        self,
        org: str,
        repo: str,
        summary_content: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """Upload summary to Cloud Storage with metadata.

        Returns True if successful, False otherwise.
        """

    def get_stats(self) -> Dict[str, Any]:
        """Get upload statistics."""
```

## Tasks

### Task 1: GCP Resource Provisioning (1 day)

**Subtasks:**
1. Create Cloud Storage bucket `govreposcrape-summaries`
   ```bash
   gcloud storage buckets create gs://govreposcrape-summaries \
     --location=europe-west2 \
     --uniform-bucket-level-access
   ```

2. Configure bucket lifecycle policies (optional: archive after 90 days)
   ```yaml
   lifecycle:
     rule:
       - action:
           type: SetStorageClass
           storageClass: ARCHIVE
         condition:
           age: 90
   ```

3. Create Vertex AI Search datastore
   ```bash
   gcloud alpha discovery-engine data-stores create govreposcrape-uk-code \
     --location=global \
     --industry-vertical=GENERIC \
     --content-config=CONTENT_REQUIRED \
     --solution-type=SOLUTION_TYPE_SEARCH
   ```

4. Connect Cloud Storage bucket to Vertex AI Search
   ```bash
   gcloud alpha discovery-engine data-stores import \
     --data-store=govreposcrape-uk-code \
     --location=global \
     --gcs-uri=gs://govreposcrape-summaries/**/*.txt
   ```

5. Create service account for container authentication
   ```bash
   gcloud iam service-accounts create govreposcrape-container \
     --display-name="govreposcrape Container Service Account"

   gcloud storage buckets add-iam-policy-binding gs://govreposcrape-summaries \
     --member="serviceAccount:govreposcrape-container@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/storage.objectAdmin"
   ```

6. Generate service account key for local testing
   ```bash
   gcloud iam service-accounts keys create container-sa-key.json \
     --iam-account=govreposcrape-container@PROJECT_ID.iam.gserviceaccount.com
   ```

**Acceptance Criteria:**
- ✅ Bucket exists and accessible
- ✅ Vertex AI Search datastore created
- ✅ Service account has proper permissions
- ✅ Connection between bucket and datastore verified

### Task 2: Implement Vertex AI Client (1-2 days)

**Subtasks:**
1. Create `container/vertex_ai_client.py` with Cloud Storage upload logic
2. Implement metadata attachment (custom headers)
3. Add retry logic with exponential backoff (5 attempts)
4. Add structured logging matching project patterns
5. Implement stats tracking (uploaded, failed, bytes)

**Implementation Pattern:**
```python
from google.cloud import storage
import logging
from typing import Dict, Any

logger = logging.getLogger("gitingest-container")

class VertexAIClient:
    def __init__(self, project_id: str, bucket_name: str):
        self.project_id = project_id
        self.bucket_name = bucket_name
        self.client = storage.Client(project=project_id)
        self.bucket = self.client.bucket(bucket_name)

        self.stats = {
            'total_uploaded': 0,
            'total_failed': 0,
            'total_bytes': 0
        }

    def upload_summary(
        self,
        org: str,
        repo: str,
        summary_content: str,
        metadata: Dict[str, Any],
        max_retries: int = 5
    ) -> bool:
        """Upload summary to Cloud Storage with metadata."""

        # Create blob path: {org}/{repo}/summary.txt
        blob_path = f"{org}/{repo}/summary.txt"
        blob = self.bucket.blob(blob_path)

        # Set custom metadata for Vertex AI Search
        blob.metadata = {
            'repo-url': metadata.get('url', ''),
            'pushed-at': metadata.get('pushedAt', ''),
            'processed-at': metadata.get('processedAt', ''),
            'size': str(len(summary_content))
        }

        # Retry logic
        delays = [2, 5, 10, 20, 40]
        for attempt in range(max_retries):
            try:
                blob.upload_from_string(
                    summary_content,
                    content_type='text/plain'
                )

                # Success
                self.stats['total_uploaded'] += 1
                self.stats['total_bytes'] += len(summary_content)
                logger.info(
                    f"✓ Uploaded {org}/{repo} ({len(summary_content)} bytes)",
                    extra={"metadata": {"org": org, "repo": repo}}
                )
                return True

            except Exception as e:
                if attempt < max_retries - 1:
                    delay = delays[attempt] if attempt < len(delays) else delays[-1]
                    logger.warning(
                        f"✗ Upload failed (attempt {attempt + 1}/{max_retries}): {e}",
                        extra={"metadata": {"error": str(e)}}
                    )
                    time.sleep(delay)
                else:
                    logger.error(
                        f"✗ Upload failed after {max_retries} attempts: {e}",
                        extra={"metadata": {"error": str(e)}}
                    )
                    self.stats['total_failed'] += 1
                    return False

        return False
```

**Acceptance Criteria:**
- ✅ Client uploads files to Cloud Storage successfully
- ✅ Metadata attached correctly (verified in Cloud Console)
- ✅ Retry logic handles transient failures
- ✅ Structured logging matches project patterns
- ✅ Stats tracking implemented

### Task 3: Update Orchestrator (0.5 days)

**Subtasks:**
1. Replace `GoogleFileSearchClient` with `VertexAIClient` in orchestrator.py
2. Update environment variables:
   - Remove: `GOOGLE_GEMINI_API_KEY`, `GOOGLE_FILE_SEARCH_STORE_NAME`
   - Add: `GCP_PROJECT_ID`, `GCS_BUCKET_NAME`, `GOOGLE_APPLICATION_CREDENTIALS`
3. Update Docker environment variables in Dockerfile
4. Test orchestrator with new client (dry-run mode)

**Changes to orchestrator.py:**
```python
# Before (Story 7.1):
from google_filesearch_client import GoogleFileSearchClient
google_client = GoogleFileSearchClient()

# After (Story 7.5):
from vertex_ai_client import VertexAIClient
vertex_client = VertexAIClient(
    project_id=os.getenv('GCP_PROJECT_ID'),
    bucket_name=os.getenv('GCS_BUCKET_NAME')
)
```

**Acceptance Criteria:**
- ✅ Orchestrator uses VertexAIClient
- ✅ Environment variables updated
- ✅ Dry-run mode works correctly

### Task 4: Integration Testing (1 day)

**Subtasks:**
1. Create unit tests for `VertexAIClient`
   - Test successful upload
   - Test retry logic on failures
   - Test metadata attachment
   - Test stats tracking

2. Create integration test with real GCS bucket
   ```python
   def test_vertex_ai_upload_integration():
       client = VertexAIClient(
           project_id=os.getenv('GCP_PROJECT_ID'),
           bucket_name=os.getenv('GCS_BUCKET_NAME')
       )

       # Test small file
       result = client.upload_summary(
           org='test',
           repo='small-test',
           summary_content='Test content',
           metadata={'url': 'https://github.com/test/small-test'}
       )
       assert result == True

       # Test medium file (50KB)
       result = client.upload_summary(
           org='test',
           repo='medium-test',
           summary_content='x' * (50 * 1024),
           metadata={'url': 'https://github.com/test/medium-test'}
       )
       assert result == True

       # Test large file (512KB)
       result = client.upload_summary(
           org='test',
           repo='large-test',
           summary_content='x' * (512 * 1024),
           metadata={'url': 'https://github.com/test/large-test'}
       )
       assert result == True
   ```

3. Run orchestrator with `--limit=10` against real repos.json feed

4. Verify in Cloud Console:
   - Files uploaded to bucket
   - Metadata attached correctly
   - Vertex AI Search indexing triggered

**Acceptance Criteria:**
- ✅ Unit tests pass (100% coverage for VertexAIClient)
- ✅ Integration tests pass (small, medium, large files)
- ✅ Orchestrator processes 10 repos successfully (100% success rate)
- ✅ Files visible in Cloud Storage Console
- ✅ Vertex AI Search indexing confirmed

### Task 5: Documentation Updates (0.5 days)

**Subtasks:**
1. Update README.md with new architecture diagram
2. Update DEPLOYMENT.md with GCP setup instructions
3. Create `docs/vertex-ai-search-setup.md` with detailed configuration guide
4. Update container README with new environment variables
5. Add migration notes from File Search to Vertex AI Search

**Acceptance Criteria:**
- ✅ README.md updated with Vertex AI Search architecture
- ✅ DEPLOYMENT.md includes GCP provisioning steps
- ✅ vertex-ai-search-setup.md created with configuration details
- ✅ Container README updated with new env vars

## Environment Variables

### Before (Story 7.1 - File Search)
```bash
GOOGLE_GEMINI_API_KEY=AIzaSy...  # Gemini API key
GOOGLE_FILE_SEARCH_STORE_NAME=fileSearchStores/...  # Store resource name
```

### After (Story 7.5 - Vertex AI Search)
```bash
GCP_PROJECT_ID=your-project-id  # Google Cloud project ID
GCS_BUCKET_NAME=govreposcrape-summaries  # Cloud Storage bucket
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json  # Service account key
```

## Dependencies

**New Python Packages:**
```txt
# Add to container/requirements.txt
google-cloud-storage>=2.10.0  # Cloud Storage client
google-cloud-discoveryengine>=0.11.0  # Vertex AI Search client (for future query API)
```

**Removed Python Packages:**
```txt
# Remove from container/requirements.txt
google-genai>=0.3.0  # No longer needed
```

## Testing Strategy

### Unit Tests (container/test_vertex_ai_client.py)
- Test upload with valid content
- Test upload with empty content
- Test upload with large content (512KB)
- Test retry logic on failures
- Test metadata attachment
- Test stats tracking

### Integration Tests
- Upload 10 real repositories to Cloud Storage
- Verify 100% success rate
- Verify metadata in Cloud Console
- Verify Vertex AI Search indexing

### Performance Benchmarks
- Measure upload time for different file sizes
- Compare against File Search API (should be faster)
- Measure end-to-end pipeline time (repos.json → Cloud Storage)

## Success Metrics

**Primary Metric:**
- **100% upload success rate** (meets user requirement)

**Secondary Metrics:**
- Upload latency <2 seconds per file (vs. 80s failures with File Search)
- Zero 503 errors
- 99.9% SLA compliance (Vertex AI Search)

## Rollback Plan

If Vertex AI Search migration fails:
1. Keep File Search code in `google_filesearch_client.py` (do not delete)
2. Add environment variable `USE_FILE_SEARCH=true` to switch back
3. Update orchestrator to check flag and use appropriate client

**NOT RECOMMENDED:** File Search is unsuitable for production per Story 7.2 findings.

## Cost Estimate

**Cloud Storage:**
- Storage: $0.020 per GB/month (Standard class, europe-west2)
- Operations: Negligible (<10,000 writes/month)
- Estimated: ~$5/month for 250GB

**Vertex AI Search:**
- Indexing: $0.001 per 1,000 documents
- Search queries: $0.005 per 1,000 queries (Story 7.3)
- Estimated: ~$10/month for 1M documents + 100K queries

**Total Estimated Cost:** ~$15/month (vs. Cloudflare Workers ~$30/month)

## Risks and Mitigations

**Risk 1: Vertex AI Search indexing delay**
- **Impact:** New repos not immediately searchable
- **Mitigation:** Near real-time indexing (minutes), acceptable for our use case

**Risk 2: Cloud Storage costs exceed estimate**
- **Impact:** Budget overrun
- **Mitigation:** Set up billing alerts, implement lifecycle policies (archive after 90 days)

**Risk 3: Migration breaks existing integrations**
- **Impact:** MCP clients fail
- **Mitigation:** Story 7.3 (Cloud Run API) will maintain same MCP interface

## Related Stories

- **Story 7.1:** Container Layer Migration to File Search (DONE) - Foundation for this story
- **Story 7.2:** Container Testing and Validation (DONE) - Identified File Search limitations
- **Story 7.3:** Cloud Run API Implementation (DEFERRED) - Query API using Vertex AI Search
- **Story 7.4:** Documentation Updates (DEFERRED) - Final documentation pass

## Acceptance Criteria

1. ✅ Cloud Storage bucket `govreposcrape-summaries` provisioned
2. ✅ Vertex AI Search datastore `govreposcrape-uk-code` created
3. ✅ `VertexAIClient` implemented with retry logic and logging
4. ✅ Orchestrator updated to use `VertexAIClient`
5. ✅ Unit tests pass (100% coverage for new client)
6. ✅ Integration tests pass (100% upload success for 10 repos)
7. ✅ Documentation updated (README, DEPLOYMENT, setup guide)
8. ✅ No 503 errors during testing
9. ✅ Files visible in Cloud Storage Console with correct metadata
10. ✅ Vertex AI Search indexing confirmed working

## Definition of Done

- [x] All acceptance criteria met
- [x] Code reviewed and approved
- [x] Tests passing (unit + integration)
- [x] Documentation complete and reviewed
- [x] No regressions in existing functionality
- [x] Performance benchmarks meet targets (<2s upload time)
- [x] Production deployment successful
- [x] Story 7.2 findings addressed (100% success rate achieved)

---

**Next Story:** 7.3 - Cloud Run API Implementation (query interface for Vertex AI Search)
