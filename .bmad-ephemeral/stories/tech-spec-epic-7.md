# Epic Technical Specification: Google Cloud Platform Migration

Date: 2025-11-18
Author: cns
Epic ID: 7
Status: Draft

---

## Overview

Epic 7 represents a strategic platform migration from Cloudflare infrastructure to Google Cloud Platform, triggered by reliability issues with Cloudflare AI Search AutoRAG indexing during Epic 3 implementation. The Cloudflare AI Search service exhibited indefinite stalling with no completion guarantees, making it unsuitable for production deployment. This epic migrates all core infrastructure components: container-based ingestion pipeline from Cloudflare R2/KV to Google Cloud Storage with custom metadata, semantic search from Cloudflare AI Search to Vertex AI Search (99.9% SLA), and API layer from Cloudflare Workers to Google Cloud Run.

The migration maintains the core product functionality (semantic code search over UK government repositories) while establishing production-grade reliability. The architecture evolves from a mixed Cloudflare/Docker approach to a unified Google Cloud Platform deployment, simplifying operations and enabling enterprise-level SLAs. Cost increases from target <£50/month to £50-80/month, justified by 99.9% uptime guarantees and elimination of experimental Preview services.

## Objectives and Scope

**In Scope:**
- Container layer migration: Python gitingest pipeline uploads to Google Cloud Storage with custom metadata (`pushedAt`, `url`, `org`, `repo`, `processedAt`, `size`)
- Search infrastructure: Vertex AI Search replaces Cloudflare AI Search for semantic search with auto-indexing from GCS bucket
- API migration: Google Cloud Run (Node.js 20, Express) replaces Cloudflare Workers for MCP v2 protocol compliance
- Smart caching via GCS metadata: Compare `pushedAt` timestamps to skip unchanged repositories (90%+ skip rate target)
- Documentation updates: PRD, architecture, epics, README reflect Google Cloud Platform implementation
- Testing validation: Small batch testing (10-100 repos) before full 21k repository processing
- Deployment automation: Cloud Run deployment scripts, container orchestration CLI arguments

**Out of Scope:**
- Web interface (Phase 2 feature, Epic 5 dependency)
- Procurement intelligence features (Phase 3, Epic 6)
- GitHub Actions automation (deferred to post-MVP)
- Custom embedding models (Vertex AI Search managed embeddings sufficient for MVP)
- Multi-region deployment (US-central1 regional deployment only)
- Authentication/authorization (open access MCP API for MVP)

**Success Criteria:**
- All 21,000 repositories successfully ingested to Google Cloud Storage
- Vertex AI Search indexes all repository summaries with <15 minute lag
- Cloud Run API achieves <2s query response time (p95)
- 90%+ cache hit rate on incremental updates (only reprocess changed repos)
- Infrastructure costs remain within £50-80/month budget
- Zero Cloudflare service dependencies (complete migration)

## System Architecture Alignment

**Architecture Pattern:** Write Path / Read Path Separation

**Write Path (Ingestion Pipeline):**
- Python container (Docker) processes repos.json feed with gitingest library
- Google Cloud Storage stores Markdown summaries (`{org}/{repo}.md` pattern)
- Custom metadata enables incremental updates via `pushedAt` timestamp comparison
- Batch processing via CLI arguments (`--batch-size`, `--offset`) enables parallelization
- No separate cache database: GCS metadata serves as cache (architectural simplification)

**Read Path (Search API):**
- Vertex AI Search auto-indexes GCS bucket contents (`**/*.md` content schema)
- Cloud Run API (Node.js 20, Express) provides MCP v2 protocol endpoints
- Thin wrapper around Vertex AI Search: query translation and response formatting
- Metadata extraction from GCS URI patterns (regex-based org/repo parsing)
- Regional deployment (us-central1) optimized for low latency to Vertex AI Search

**Key Architectural Changes from Cloudflare:**
- **Storage:** Cloudflare R2 → Google Cloud Storage (unified platform, custom metadata support)
- **Cache:** Cloudflare KV → GCS custom metadata (eliminates separate cache layer, Story 2.2 obsoleted)
- **Search:** Cloudflare AI Search → Vertex AI Search (99.9% SLA, production-grade)
- **API Runtime:** Cloudflare Workers (edge) → Cloud Run (regional, managed Node.js)
- **Deployment Model:** Mixed Cloudflare/Docker → Unified Google Cloud Platform

**Alignment with PRD NFRs:**
- NFR-1.1 (Query Response Time <2s): Cloud Run regional deployment + Vertex AI Search managed service
- NFR-1.3 (21k repos in <6 hours): Container parallelization via `--batch-size`/`--offset` CLI arguments
- NFR-2.1 (NCSC Secure Coding): Cloud Run IAM + service account authentication + input validation
- NFR-6.1 (99.9% Uptime): Vertex AI Search SLA + Cloud Run auto-scaling + GCS 99.9% availability
- NFR-7.1 (Cost <£50-80/month): GCS minimal storage cost + Cloud Run free tier + Vertex AI Search pay-per-query

**Technology Stack Compatibility:**
- TypeScript 5.9+ strict mode for API layer (Cloud Run)
- Python 3.11+ for container layer (gitingest dependency)
- Docker containerization enables local development and Cloud Run Jobs deployment
- Google Cloud SDK (@google-cloud/storage, @google-cloud/discoveryengine) with full TypeScript types

## Detailed Design

### Services and Modules

| Service/Module | Responsibilities | Inputs | Outputs | Owner/Location |
|----------------|-----------------|--------|---------|----------------|
| **Container Orchestrator** | Fetch repos.json, coordinate gitingest processing, upload to GCS | repos.json feed URL, CLI args (--batch-size, --offset, --limit) | GCS objects with metadata, processing statistics | container/orchestrator.py |
| **GCS Client** | Upload Markdown summaries with custom metadata, check existing files | Gitingest summary (string), repo metadata (org, repo, url, pushedAt) | GCS blob with metadata, skip/update/create status | container/gcs_client.py |
| **Vertex AI Search Engine** | Auto-index GCS content, semantic search queries | GCS bucket (`gs://govreposcrape-summaries/**/*.md`) | Search results with snippets and similarity scores | Managed service (Google Cloud) |
| **Cloud Run API** | MCP v2 protocol endpoints, query translation | HTTP POST /search (query, limit) | JSON SearchResult[] with metadata | api/src/index.ts |
| **Vertex Search Service** | Query Vertex AI Search, extract grounding metadata | Natural language query, limit parameter | Raw search results from Vertex AI | api/src/services/vertexSearchService.ts |
| **Metadata Extractor** | Parse GCS URIs to extract org/repo | GCS URI string (gs://bucket/{org}/{repo}.md) | Structured metadata (org, repo) | api/src/services/vertexSearchService.ts (inline) |
| **Error Handler** | Centralized error handling, retry logic | Operations (fetch, upload, query) | Retry attempts, structured errors | Shared across container/ and api/ |
| **Logger** | Structured JSON logging | Log level, message, context | Cloud Run logs, Cloud Logging | api/src/utils/logger.ts (future) |

**Service Dependencies:**
- Container → GCS (upload summaries)
- Vertex AI Search → GCS (auto-index .md files)
- Cloud Run API → Vertex AI Search (query semantic search)
- All services → Google Cloud IAM (service account authentication)

### Data Models and Contracts

**Repository Metadata (repos.json feed):**
```typescript
interface RepoMetadata {
  url: string;         // "https://github.com/alphagov/govuk-frontend"
  pushedAt: string;    // ISO8601: "2025-10-15T14:30:00Z"
  org: string;         // "alphagov"
  name: string;        // "govuk-frontend"
}
```

**GCS Custom Metadata (attached to each blob):**
```python
{
  'org': 'alphagov',                                    # Organization name
  'repo': 'govuk-frontend',                             # Repository name
  'url': 'https://github.com/alphagov/govuk-frontend', # Full GitHub URL
  'pushedAt': '2025-10-15T14:30:00Z',                  # Last push timestamp from repos.json
  'processedAt': '2025-11-17T10:45:00Z',               # Processing timestamp
  'size': '12345'                                       # Content size in bytes
}
```

**GCS Object Storage Pattern:**
```
Bucket: govreposcrape-summaries (us-central1)
Path: {org}/{repo}.md
Example: alphagov/govuk-frontend.md
Content-Type: text/markdown; charset=utf-8
```

**Vertex AI Search Result (raw):**
```typescript
interface VertexSearchResult {
  document: {
    name: string;           // Full resource name
    structData: {
      content: string;      // Indexed content (gitingest summary)
      uri: string;          // "gs://govreposcrape-summaries/alphagov/govuk-frontend.md"
    };
  };
  snippet: {
    snippet: string;        // Relevant code snippet
    snippetStatus: string;  // "SUCCESS"
  };
}
```

**MCP SearchResult (API response):**
```typescript
interface SearchResult {
  title: string;              // "{org}/{repo}" e.g. "alphagov/govuk-frontend"
  url: string;                // "https://github.com/alphagov/govuk-frontend"
  snippet: string;            // Code snippet from Vertex AI Search
  metadata: {
    org: string;              // Extracted from GCS URI
    repo: string;             // Extracted from GCS URI
    pushedAt?: string;        // Optional (not in current implementation)
    processedAt?: string;     // Optional (not in current implementation)
  };
}
```

**Container Processing Status:**
```python
{
  'total_repos': 21000,
  'processed': 2100,
  'skipped': 18900,          # Cache hits (pushedAt unchanged)
  'failed': 0,
  'cache_hit_rate': 0.90,    # 90% skip rate
  'total_bytes': 1048576000  # ~1GB total storage
}
```

### APIs and Interfaces

**POST /search (MCP v2 Search Endpoint):**

Request:
```http
POST /search HTTP/1.1
Host: <cloud-run-url>.run.app
Content-Type: application/json

{
  "query": "authentication methods",
  "limit": 20
}
```

Response (200 OK):
```json
{
  "results": [
    {
      "title": "alphagov/govuk-frontend",
      "url": "https://github.com/alphagov/govuk-frontend",
      "snippet": "// Authentication middleware implementation...",
      "metadata": {
        "org": "alphagov",
        "repo": "govuk-frontend"
      }
    }
  ]
}
```

Error Response (400 Bad Request):
```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Query must be between 3 and 500 characters"
  }
}
```

Error Response (500 Internal Server Error):
```json
{
  "error": {
    "code": "SEARCH_ERROR",
    "message": "Vertex AI Search service temporarily unavailable"
  }
}
```

**Container CLI Interface:**
```bash
python orchestrator.py [--batch-size=N] [--offset=M] [--limit=L]

Arguments:
  --batch-size=N   Process every Nth repository (default: 1, sequential)
  --offset=M       Starting offset (0 to batch-size-1)
  --limit=L        Maximum repositories to process (for testing)

Examples:
  # Test with 10 repos
  python orchestrator.py --limit=10

  # Parallel execution (10 containers)
  python orchestrator.py --batch-size=10 --offset=0  # Container 1
  python orchestrator.py --batch-size=10 --offset=1  # Container 2
  ...
  python orchestrator.py --batch-size=10 --offset=9  # Container 10
```

**Google Cloud Storage API (Python SDK):**
```python
from google.cloud import storage

# Upload with metadata
bucket = client.bucket('govreposcrape-summaries')
blob = bucket.blob(f'{org}/{repo}.md')
blob.metadata = {
    'org': org,
    'repo': repo,
    'url': url,
    'pushedAt': pushed_at,
    'processedAt': datetime.now().isoformat(),
    'size': str(len(content))
}
blob.upload_from_string(content, content_type='text/markdown; charset=utf-8')
```

**Vertex AI Search API (TypeScript SDK):**
```typescript
import { SearchServiceClient } from '@google-cloud/discoveryengine';

const client = new SearchServiceClient();
const response = await client.search({
  servingConfig: VERTEX_AI_SEARCH_ENGINE_ID,
  query: userQuery,
  pageSize: limit,
  contentSearchSpec: {
    snippetSpec: { returnSnippet: true },
    summarySpec: { summaryResultCount: 3 }
  }
});
```

### Workflows and Sequencing

**Initial Ingestion Workflow (First Run):**
```
1. Container Orchestrator starts
   ├─ Fetch repos.json from GitHub feed
   ├─ Parse JSON → RepoMetadata[]
   └─ Log: "Fetched 21,000 repositories"

2. For each repository (with --batch-size/--offset filtering):
   ├─ Check GCS for existing file: blob.exists()
   │  └─ If exists: blob.reload() to fetch metadata
   │     └─ Compare existing.pushedAt with new pushedAt
   │        ├─ If equal: Skip (⊘) - log cache hit
   │        └─ If different: Continue to step 3
   ├─ Process with gitingest (if needed)
   │  ├─ Call gitingest.ingest(repo_url, max_file_size=512KB)
   │  ├─ Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
   │  ├─ Timeout: 5 minutes per repository
   │  └─ Extract summary from IngestionResult.summary
   ├─ Upload to GCS
   │  ├─ Path: {org}/{repo}.md
   │  ├─ Content: Gitingest summary (Markdown)
   │  ├─ Metadata: org, repo, url, pushedAt, processedAt, size
   │  └─ Content-Type: text/markdown; charset=utf-8
   └─ Log status: + (new), ↻ (updated), ⊘ (skipped), ✗ (failed)

3. Statistics Logging
   ├─ Total repositories processed
   ├─ Cache hit rate (skipped / total)
   ├─ Total storage size
   └─ Processing duration

4. Vertex AI Search Auto-Indexing (async, managed by Google)
   ├─ Monitors GCS bucket for new/updated .md files
   ├─ Generates embeddings automatically
   ├─ Updates search index (5-15 minute lag)
   └─ Ready for queries via API
```

**Incremental Update Workflow (Subsequent Runs):**
```
1. Container Orchestrator starts
   └─ Fetch repos.json (same as initial)

2. For each repository:
   ├─ GCS metadata check (fast HEAD request)
   │  ├─ blob.reload() fetches existing metadata
   │  └─ Compare pushedAt timestamps
   ├─ If pushedAt unchanged:
   │  └─ Skip processing (⊘) - 90%+ of repos
   ├─ If pushedAt changed or blob not found:
   │  └─ Full processing (same as initial workflow)
   └─ Result: 90%+ skip rate, ~10% actual processing

3. Only changed repositories trigger Vertex AI Search reindexing
```

**Search Query Workflow (Read Path):**
```
1. Client sends POST /search request to Cloud Run API
   ├─ Input validation: query length (3-500 chars), limit (1-20)
   └─ Generate requestId for correlation

2. Cloud Run API calls Vertex AI Search
   ├─ Translate MCP query to Vertex AI Search request
   ├─ Query Vertex AI Search engine via SearchServiceClient
   ├─ Receive results with snippets and URIs
   └─ Extract grounding metadata from results

3. Metadata Extraction (URI parsing)
   ├─ Parse GCS URI: gs://govreposcrape-summaries/{org}/{repo}.md
   ├─ Regex pattern: \/([^\/]+)\/([^\/]+)\.md$
   ├─ Extract org and repo
   └─ Build GitHub URL: https://github.com/{org}/{repo}

4. Format MCP SearchResult[]
   ├─ title: "{org}/{repo}"
   ├─ url: GitHub URL
   ├─ snippet: From Vertex AI Search
   └─ metadata: { org, repo }

5. Return JSON response to client
   └─ Log: requestId, query, result count, duration
```

**Parallel Container Execution (10 containers):**
```
Container 1: --batch-size=10 --offset=0 → processes repos [0, 10, 20, 30, ...]
Container 2: --batch-size=10 --offset=1 → processes repos [1, 11, 21, 31, ...]
Container 3: --batch-size=10 --offset=2 → processes repos [2, 12, 22, 32, ...]
...
Container 10: --batch-size=10 --offset=9 → processes repos [9, 19, 29, 39, ...]

Result: 10× speedup (58 hours ÷ 10 = 5.8 hours)
Each container is independent, no coordination needed
```

## Non-Functional Requirements

### Performance

**NFR-1.1: Query Response Time (PRD NFR-1.1)**
- Target: <2 seconds (p95) end-to-end query response
- Breakdown:
  - Vertex AI Search query: <1500ms (managed service, regional deployment)
  - Metadata extraction (URI parsing): <50ms (regex operation, no API calls)
  - JSON serialization: <50ms
  - Network latency: <300ms (us-central1 regional deployment)
  - Buffer: ~100ms for variance
- Measurement: Cloud Run request latency metrics, custom timing logs
- Optimization: Regional deployment (us-central1) for low latency to Vertex AI Search, thin API wrapper minimizes processing overhead

**NFR-1.3: Ingestion Throughput (PRD NFR-1.3)**
- Target: Process 21,000 repositories in <6 hours (initial seeding)
- Sequential baseline: 21k repos × 10s avg = 58 hours (unacceptable)
- Parallel execution: 10 containers × --batch-size=10 = 10× speedup → 5.8 hours ✓
- Container performance:
  - gitingest timeout: 5 minutes per repository
  - Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s delays)
  - Fail-safe: Log failures, continue processing (no cascading failures)
- Incremental updates: 90%+ skip rate on subsequent runs (only reprocess changed repos)
- Measurement: Container logs (total_repos, processed, skipped, cache_hit_rate, duration)

**NFR-1.4: Cache Hit Rate (PRD NFR-1.4)**
- Target: 90%+ cache hit rate on incremental update runs
- Implementation: GCS metadata comparison (pushedAt timestamp check via blob.reload())
- Rationale: Only 10-15% of repositories update daily (observed from GitHub activity)
- Impact: Reduces gitingest processing by 90%, keeps costs minimal
- Measurement: Container statistics (skipped / total ratio)

**NFR-3.3: Storage Capacity (PRD NFR-3.3)**
- Current: ~21,000 repos × 50KB avg gitingest summary = ~1GB
- Target (30,000 repos): ~1.5GB
- GCS cost: 1-2GB × $0.020/GB = $0.02-0.04/month (negligible)
- Vertex AI Search: Managed storage, included in query pricing
- Scaling: Linear storage growth acceptable at this cost profile

### Security

**NFR-2.1: NCSC Secure Coding Standards Compliance (PRD NFR-2.1)**
- Input validation:
  - Query length: 3-500 characters (reject outside range)
  - Limit parameter: 1-20 results (type check: integer)
  - Sanitization: Trim whitespace, validate UTF-8 encoding
- Output encoding: JSON only (no HTML rendering, no XSS risk)
- No dynamic code execution: No eval(), Function(), exec() in codebase
- Dependency scanning:
  - npm audit run weekly via CI/CD (block deployment on high/critical CVEs)
  - Dependabot enabled for automated security updates
  - Python: pip-audit for container dependencies
- Security checklist: Documented in SECURITY.md

**NFR-2.2: Read-Only Access Pattern (PRD NFR-2.2)**
- GitHub access: Read-only (fetch repos.json feed via HTTPS, no authentication required)
- No write operations to GitHub repositories
- GCS access: Service account with roles/storage.objectAdmin (limited to govreposcrape-summaries bucket)
- Vertex AI Search: Query-only access (no admin operations)
- Principle of least privilege: IAM roles scoped to minimal required permissions

**NFR-2.3: Audit Logging (PRD NFR-2.3)**
- 100% of API queries logged with structured metadata:
  - Fields: timestamp, requestId (UUID), query text, limit, result count, response time (ms)
  - Procurement-related queries flagged (keywords: "contract", "tender", "procurement")
- Container logs: Processing statistics, cache hit rate, errors
- Retention: Cloud Logging retention (90 days default, configurable)
- Export capability: Cloud Logging export to BigQuery for analysis
- No secrets in logs: API keys, service account credentials excluded from all logs

**NFR-2.5: Dependency Security (PRD NFR-2.5)**
- Zero high/critical CVEs in production dependencies
- Weekly scanning process:
  - npm audit (Node.js dependencies)
  - pip-audit (Python dependencies)
  - Dependabot pull requests for security updates
- Patching SLA: 48 hours for critical vulnerabilities
- Dependency lock files: package-lock.json, requirements.txt (version pinning)

### Reliability/Availability

**NFR-6.1: API Uptime (PRD NFR-6.1)**
- Target: 99.9% uptime (MVP validated, 99.95% future target)
- Downtime budget: ~43 minutes/month (99.9%)
- Google Cloud SLAs:
  - Cloud Run: 99.95% uptime SLA
  - Vertex AI Search: 99.9% uptime SLA
  - Cloud Storage: 99.9% availability SLA
- Measurement: Cloud Run uptime checks, alerting policies, uptime monitoring dashboards
- Graceful degradation: Return cached results with staleness warning if Vertex AI Search unavailable

**NFR-6.2: Data Freshness (PRD NFR-6.2)**
- Target: Index updated every 24 hours (daily incremental runs)
- Vertex AI Search indexing lag: 5-15 minutes after GCS upload
- Staleness alert: Flag if last update >48 hours (2× expected interval)
- Validation: Check Cloud Storage bucket last modified timestamps
- User transparency: Last updated timestamp visible in API metadata (future enhancement)

**NFR-6.3: Error Rate (PRD NFR-6.3)**
- Target: <0.1% API error rate (5xx responses)
- Monitoring: Cloud Run error logging, Error Reporting integration
- Alerting: PagerDuty/Cloud Monitoring for error rate >1%
- Retry logic: Container operations retry 3× with exponential backoff
- Circuit breaker: Future enhancement to prevent cascading failures

**NFR-6.4: Disaster Recovery (PRD NFR-6.4)**
- RTO (Recovery Time Objective): 24 hours for full rebuild
- RPO (Recovery Point Objective): 24 hours (last successful ingestion run)
- Backup strategy:
  - GCS object versioning: 30-day retention (enabled on govreposcrape-summaries bucket)
  - repos.json feed: Externally hosted (GitHub, not our responsibility)
  - Vertex AI Search index: Rebuildable from GCS bucket contents (automatic reindexing)
- Recovery procedure:
  1. Restore GCS bucket from object versioning (if corrupted)
  2. Re-run container orchestrator (full ingestion)
  3. Vertex AI Search auto-reindexes from restored GCS bucket
  4. Validate API queries return expected results

### Observability

**Cloud Run Metrics (Built-in):**
- Request volume: Total requests/minute, requests/second
- Latency distribution: p50, p90, p95, p99 response times
- Error rates: 4xx (client errors), 5xx (server errors)
- Container metrics: CPU utilization, memory usage, instance count
- Billable time: Total compute time for cost tracking

**Custom Metrics (Container Logs):**
- Ingestion statistics:
  - Total repositories processed
  - Cache hit rate (skipped / total)
  - Processing duration (wall-clock time)
  - Total storage size (bytes uploaded)
  - Error count by type (gitingest timeout, GCS upload failure, etc.)
- Query metrics:
  - Query text (hashed for privacy if sensitive)
  - Result count
  - Response time breakdown (Vertex AI Search time vs total time)
  - Metadata extraction success rate

**Alerting Policies (Future Implementation):**
- Error rate >1%: PagerDuty notification
- p95 response time >2s: Warning alert
- Container failures: Email notification
- GCS upload failures: Slack channel alert
- Daily ingestion not completed: Manual investigation required

**Dashboards (Cloud Monitoring):**
- API Health Dashboard:
  - Request volume (24h, 7d, 30d trends)
  - Latency percentiles (p50, p95, p99)
  - Error rate by status code
- Ingestion Dashboard:
  - Cache hit rate trend
  - Processing throughput (repos/hour)
  - Storage growth over time
- Cost Dashboard:
  - Cloud Run compute costs
  - Vertex AI Search query costs
  - Cloud Storage costs
  - Total monthly spend vs £50-80 budget

## Dependencies and Integrations

### External Dependencies (Production)

**Node.js API Dependencies (api/package.json):**
| Package | Version | Purpose | Criticality |
|---------|---------|---------|------------|
| express | ^4.18.2 | HTTP server framework | Critical |
| cors | ^2.8.5 | CORS middleware for cross-origin requests | Medium |
| @google-cloud/discoveryengine | ^2.5.2 | Vertex AI Search client | Critical |
| @types/express | ^4.17.21 (dev) | TypeScript types for Express | High |
| @types/cors | ^2.8.17 (dev) | TypeScript types for CORS | Medium |
| @types/node | ^20.10.0 (dev) | Node.js 20 type definitions | High |
| typescript | ^5.3.3 (dev) | TypeScript compiler | Critical |
| ts-node | ^10.9.2 (dev) | TypeScript execution for development | Medium |
| vitest | ^1.0.4 (dev) | Testing framework | High |
| supertest | ^6.3.3 (dev) | HTTP integration testing | Medium |

**Python Container Dependencies (container/requirements.txt):**
| Package | Version | Purpose | Criticality |
|---------|---------|---------|------------|
| gitingest | latest | LLM-ready code summary generation | Critical |
| google-cloud-storage | >=2.10.0 | GCS upload with custom metadata | Critical |
| google-genai | >=0.3.0 | Google GenAI SDK (legacy, to be removed) | Low |
| requests | >=2.31.0 | HTTP client for repos.json fetch | High |
| pytest | >=8.0.0 | Testing framework | High |
| pytest-mock | >=3.12.0 | Mocking for tests | Medium |

**Root Project Dependencies (package.json - Legacy Cloudflare):**
| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| @modelcontextprotocol/sdk | ^1.22.0 | MCP protocol types | To be removed (moved to API) |
| @cloudflare/vitest-pool-workers | ^0.8.19 (dev) | Cloudflare Workers testing | Deprecated (migration complete) |
| wrangler | ^4.47.0 (dev) | Cloudflare deployment CLI | Deprecated (migration complete) |

### Google Cloud Platform Integrations

**Google Cloud Storage (GCS):**
- Bucket: `govreposcrape-summaries` (us-central1)
- Authentication: Service account key (roles/storage.objectAdmin)
- Operations:
  - Upload: `blob.upload_from_string()` with custom metadata
  - Metadata check: `blob.reload()` for incremental update logic
  - Object versioning: 30-day retention for disaster recovery
- Integration pattern: Python SDK (google-cloud-storage)
- Data flow: Container → GCS upload → Vertex AI Search auto-indexing

**Vertex AI Search:**
- Engine ID: `projects/1060386346356/locations/global/collections/default_collection/engines/govreposcrape-search`
- Authentication: Service account key (roles/discoveryengine.user)
- Operations:
  - Query: `SearchServiceClient.search()` with natural language queries
  - Auto-indexing: Monitors GCS bucket for new/updated .md files (5-15 min lag)
  - Content schema: Plain text/markdown indexing (no structured data)
- Integration pattern: TypeScript SDK (@google-cloud/discoveryengine)
- Data flow: Cloud Run API → Vertex AI Search query → SearchResult[]

**Cloud Run (API Hosting):**
- Service: `govreposcrape-api` (us-central1)
- Runtime: Node.js 20 managed runtime
- Authentication: Unauthenticated access (open MCP API)
- Deployment: `gcloud run deploy` via gcloud CLI
- Environment variables:
  - VERTEX_AI_SEARCH_ENGINE_ID (search engine resource name)
  - GOOGLE_APPLICATION_CREDENTIALS (service account key path)
  - PORT (default: 8080, auto-configured by Cloud Run)
- Integration pattern: Express HTTP server, automatic HTTPS, auto-scaling

**Cloud Run Jobs (Future - Container Automation):**
- Planned for GitHub Actions replacement
- Scheduled daily runs for incremental updates
- Current: Manual docker run execution (MVP acceptable)

### External Service Integrations

**repos.json Feed (GitHub):**
- Source: https://github.com/uk-x-gov-software-community/xgov-opensource-repo-scraper
- Format: JSON array of repository metadata (url, pushedAt, org, name)
- Access: HTTPS GET request, no authentication required
- Update frequency: Daily (GitHub Actions in source repo)
- Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
- Fallback: Manual fetch if feed unavailable (operational resilience)

**gitingest Library (Python Package):**
- Package: pip install gitingest
- API: `gitingest.ingest(repo_url, max_file_size=512KB)` → IngestionResult
- Return type: Named tuple with `.summary` attribute (Markdown string)
- Timeout: 5 minutes per repository (large repo handling)
- Error handling: Retry 3× with exponential backoff, log failures, continue processing
- Known issues: Some repos >100MB may timeout (acceptable: edge case, log and skip)

### Dependency Management Strategy

**Version Pinning:**
- package-lock.json: Exact versions for Node.js dependencies (reproducible builds)
- requirements.txt: Minimum versions with `>=` (Python flexibility, security updates)
- Rationale: Node.js ecosystem benefits from exact versions, Python allows patch updates

**Security Scanning:**
- Weekly automated scans: npm audit (Node.js), pip-audit (Python)
- Dependabot: Enabled for both package.json and requirements.txt
- CI/CD gates: Block deployment on high/critical CVEs
- Patching SLA: 48 hours for critical vulnerabilities

**Update Strategy:**
- Minor/patch updates: Automated via Dependabot (review + merge weekly)
- Major updates: Manual review (breaking changes assessment)
- Security updates: Expedited review (24-48 hour SLA)
- Testing: All updates validated via vitest (API) + pytest (container)

### Integration Points Summary

```
External Services:
├─ repos.json feed (GitHub) → Container orchestrator
├─ gitingest library (PyPI) → Container processing
└─ MCP clients (Claude Desktop, etc.) → Cloud Run API

Google Cloud Platform:
├─ Cloud Storage ← Container uploads
├─ Vertex AI Search ← GCS auto-indexing
├─ Cloud Run → Vertex AI Search queries
└─ Cloud Logging → All services (observability)

Data Flow:
repos.json → Container (gitingest) → GCS → Vertex AI Search → Cloud Run API → MCP Client
```

## Acceptance Criteria (Authoritative)

### AC-1: Complete Cloudflare Service Removal
**Given** the project originally used Cloudflare infrastructure (R2, KV, AI Search, Workers)
**When** Epic 7 migration is complete
**Then** zero Cloudflare service dependencies remain in production codebase
**And** wrangler.toml, src/ directory (Workers code), container/r2_client.py, container/cache.py are removed
**And** package.json no longer includes @cloudflare/* dependencies or wrangler deployment scripts
**And** all deployment documentation references Google Cloud Platform only

### AC-2: Google Cloud Storage Ingestion
**Given** repos.json feed contains 21,000+ UK government repositories
**When** container orchestrator runs with incremental update logic
**Then** all repositories are processed (initial run) or checked for updates (subsequent runs)
**And** gitingest summaries uploaded to GCS bucket `govreposcrape-summaries` at path `{org}/{repo}.md`
**And** custom metadata attached to each blob: org, repo, url, pushedAt, processedAt, size
**And** content-type set to `text/markdown; charset=utf-8` for Vertex AI Search compatibility
**And** 90%+ cache hit rate achieved on incremental runs (skip unchanged repos via pushedAt comparison)
**And** processing completes in <6 hours with 10 parallel containers (--batch-size=10, --offset=0-9)

### AC-3: Vertex AI Search Integration
**Given** GCS bucket contains gitingest summaries for all repositories
**When** Vertex AI Search auto-indexing completes
**Then** all .md files are indexed with content schema (plain text/markdown)
**And** indexing lag <15 minutes after GCS upload
**And** search queries return relevant results with code snippets
**And** grounding metadata includes GCS URI (gs://govreposcrape-summaries/{org}/{repo}.md)
**And** Vertex AI Search engine accessible via SearchServiceClient with engine ID

### AC-4: Cloud Run API MCP Compliance
**Given** Cloud Run API deployed to us-central1 region
**When** client sends POST /search request with query and limit
**Then** API validates input (query 3-500 chars, limit 1-20 results)
**And** queries Vertex AI Search with natural language query
**And** extracts org/repo from GCS URI via regex pattern
**And** formats response as MCP SearchResult[] with title, url, snippet, metadata
**And** returns 200 OK with JSON response in <2s (p95 response time)
**And** handles errors gracefully (400 Bad Request, 500 Internal Server Error with error codes)

### AC-5: Documentation Accuracy
**Given** migration to Google Cloud Platform is complete
**When** reviewing all project documentation
**Then** PRD reflects Google Cloud costs (£50-80/month), Vertex AI Search (not Cloudflare AI Search)
**And** architecture.md documents Google Cloud services (GCS, Vertex AI Search, Cloud Run)
**And** epics.md marks Story 2.2 (KV caching) as obsolete/migrated
**And** epics.md updates Story 2.4 to "Cloud Storage (GCS) Upload with Metadata"
**And** epics.md marks Epic 3 stories as migrated to Vertex AI Search
**And** README.md provides Google Cloud setup instructions (gcloud CLI, service accounts, GCS bucket)
**And** DEPLOYMENT.md describes Cloud Run deployment process (not Cloudflare Workers)

### AC-6: Testing Validation
**Given** container migration and API implementation complete
**When** running small batch tests (--limit=10, --limit=100)
**Then** container processes test repositories successfully
**And** GCS uploads complete with correct metadata
**And** Vertex AI Search indexes test data within 15 minutes
**And** Cloud Run API returns search results for test queries
**And** no memory leaks, timeouts, or unhandled errors in logs
**And** test results documented in docs/vertex-ai-migration-results.md

### AC-7: Cost Compliance
**Given** infrastructure migrated to Google Cloud Platform
**When** monitoring monthly costs for 21k repos + 100-1000 queries/day
**Then** total monthly spend remains within £50-80 budget
**And** cost breakdown available: Cloud Run (<£15), GCS (<£1), Vertex AI Search (£20-40), operations (<£10)
**And** cost monitoring dashboard accessible via Cloud Monitoring
**And** alerts configured for spend >£2/day (warning threshold)

### AC-8: Performance Compliance
**Given** all infrastructure migrated and operational
**When** measuring API response times under typical load
**Then** p95 query response time <2 seconds (NFR-1.1)
**And** p99 query response time <3 seconds
**And** Vertex AI Search query time <1500ms (majority of response time)
**And** metadata extraction <50ms (URI regex parsing, no API calls)
**And** no performance degradation under 100 queries/day sustained load

### AC-9: Reliability Validation
**Given** production deployment to Google Cloud Platform
**When** observing uptime over 7-day period
**Then** API achieves 99.9%+ uptime (NFR-6.1)
**And** error rate <0.1% (5xx responses)
**And** Vertex AI Search indexing completes successfully (no stuck operations)
**And** GCS upload success rate >99.9%
**And** graceful degradation if Vertex AI Search unavailable (cached results with staleness warning)

### AC-10: Security Compliance
**Given** NCSC secure coding standards requirements (NFR-2.1)
**When** security audit checklist reviewed
**Then** input validation implemented on all API endpoints (query, limit parameters)
**And** no secrets in logs or error messages
**And** service account authentication via GOOGLE_APPLICATION_CREDENTIALS
**And** IAM roles follow least privilege (roles/storage.objectAdmin, roles/discoveryengine.user)
**And** npm audit and pip-audit show zero high/critical CVEs
**And** Dependabot enabled for automated security updates

## Traceability Mapping

| Acceptance Criteria | Epic 7 Story | Architecture Component | Test Strategy |
|---------------------|-------------|----------------------|---------------|
| **AC-1: Cloudflare Removal** | Story 7.1, 7.4 | Migration: Remove wrangler.toml, src/, container/r2_client.py, container/cache.py | Manual verification: grep for Cloudflare references, package.json inspection |
| **AC-2: GCS Ingestion** | Story 7.1, 7.2 | container/orchestrator.py, container/gcs_client.py | Integration test: --limit=100, verify GCS uploads, check metadata |
| **AC-3: Vertex AI Search** | Story 7.5 | Vertex AI Search engine (managed service), GCS bucket auto-indexing | Integration test: Upload sample .md files, verify indexing, query search |
| **AC-4: Cloud Run API** | Story 7.3 | api/src/index.ts, api/src/services/vertexSearchService.ts | API test: POST /search with test queries, validate response format |
| **AC-5: Documentation** | Story 7.4 | docs/PRD.md, docs/architecture.md, docs/epics.md, README.md | Manual review: Check all Cloudflare references replaced with Google Cloud |
| **AC-6: Testing** | Story 7.2 | container/ (Python tests), api/ (TypeScript tests future) | Batch testing: --limit=10, --limit=100, document results |
| **AC-7: Cost** | Story 7.1-7.5 (all) | Cloud Monitoring billing dashboard | Monitor: 30-day cost tracking, validate <£80/month budget |
| **AC-8: Performance** | Story 7.3 | Cloud Run API, Vertex AI Search | Load testing: 100 queries/day, measure p95/p99 latency |
| **AC-9: Reliability** | Story 7.3, 7.5 | Cloud Run (99.95% SLA), Vertex AI Search (99.9% SLA), GCS (99.9% SLA) | Uptime monitoring: 7-day observation, error rate tracking |
| **AC-10: Security** | All stories | NCSC compliance checklist, IAM roles, service accounts | Security audit: npm audit, pip-audit, checklist review |

### PRD Requirements Traceability

| PRD Requirement | Epic 7 Implementation | Acceptance Criteria | Validation Method |
|-----------------|----------------------|-------------------|-------------------|
| **FR-1.3: Smart Caching** | GCS custom metadata comparison (pushedAt timestamps) | AC-2 (90%+ cache hit rate) | Container statistics: skipped / total ratio |
| **FR-2.1: Vertex AI Search Integration** | Vertex AI Search with GCS auto-indexing (content schema) | AC-3 (indexing lag <15 min) | Search queries return results, indexing dashboard |
| **FR-2.2: Semantic Search API** | Cloud Run API with Vertex AI Search queries | AC-4 (MCP v2 compliance) | API integration tests, response format validation |
| **NFR-1.1: Query Response Time <2s** | Cloud Run regional deployment, Vertex AI Search managed service | AC-8 (p95 <2s) | Cloud Run request latency metrics, custom timing logs |
| **NFR-1.3: 21k repos in <6 hours** | Container parallelization (--batch-size, --offset CLI args) | AC-2 (processing complete <6h) | Wall-clock time measurement, 10 parallel containers |
| **NFR-2.1: NCSC Secure Coding** | Input validation, IAM roles, service accounts | AC-10 (security compliance) | npm audit, pip-audit, security checklist |
| **NFR-6.1: 99.9% Uptime** | Google Cloud SLAs (Cloud Run 99.95%, Vertex AI Search 99.9%, GCS 99.9%) | AC-9 (uptime validation) | Cloud Monitoring uptime checks, 7-day observation |
| **NFR-7.1: Cost <£50-80/month** | GCS minimal storage, Cloud Run free tier, Vertex AI Search pay-per-query | AC-7 (monthly spend <£80) | Cloud Monitoring billing dashboard, 30-day tracking |

### Story-Level Traceability

**Story 7.1: Container Layer Migration to Google File Search**
- Acceptance Criteria: AC-1 (Cloudflare removal), AC-2 (GCS ingestion)
- Components: container/orchestrator.py, container/gcs_client.py
- Tests: Integration tests with --limit=10, verify GCS uploads
- Status: COMPLETED (commit e779851)

**Story 7.2: Container Testing and Validation**
- Acceptance Criteria: AC-6 (testing validation), AC-2 (cache hit rate)
- Components: container/, docs/google-file-search-testing-results.md
- Tests: Small batch (10 repos), medium batch (100 repos)
- Status: COMPLETED (findings led to Story 7.5 Vertex AI Search migration)

**Story 7.3: Cloud Run API Implementation**
- Acceptance Criteria: AC-4 (MCP compliance), AC-8 (performance)
- Components: api/src/index.ts, api/src/services/vertexSearchService.ts
- Tests: API integration tests, response format validation
- Status: COMPLETED (MCP API operational)

**Story 7.4: Documentation Updates**
- Acceptance Criteria: AC-5 (documentation accuracy)
- Components: docs/PRD.md, docs/architecture.md, docs/epics.md, README.md
- Tests: Manual review, grep for Cloudflare references
- Status: COMPLETED (all docs updated)

**Story 7.5: Vertex AI Search Migration**
- Acceptance Criteria: AC-3 (Vertex AI Search), AC-9 (reliability)
- Components: Vertex AI Search engine, GCS bucket, api/src/services/
- Tests: Search queries, indexing validation
- Status: COMPLETED (production-grade 99.9% SLA)

## Risks, Assumptions, Open Questions

### Risks

**RISK-1: Vertex AI Search Quality Insufficient**
- Description: Vertex AI Search may not provide adequate search relevance for UK government code discovery
- Probability: Medium (managed service, validated in Story 7.5 testing)
- Impact: High (core product value depends on search quality)
- Mitigation: MVP testing validates 80%+ relevance target; fallback to custom embeddings if needed (Phase 2)
- Status: MITIGATED (Story 7.5 testing shows acceptable relevance)

**RISK-2: Google Cloud Cost Exceeds £80/month Budget**
- Description: Vertex AI Search query costs or Cloud Run compute may exceed budget projections
- Probability: Low (pay-per-query pricing model, Cloud Run free tier generous)
- Impact: Medium (requires budget justification or cost optimization)
- Mitigation: Cost monitoring dashboard with £2/day alerts; incremental updates reduce processing costs by 90%
- Status: MONITORING (30-day cost tracking validates projections)

**RISK-3: Vertex AI Search Indexing Lag Impacts User Experience**
- Description: 5-15 minute indexing lag may cause confusion (newly uploaded repos not immediately searchable)
- Probability: Medium (managed service characteristic, not configurable)
- Impact: Low (daily incremental updates acceptable for MVP)
- Mitigation: User communication: "Index updated daily" messaging; future: real-time update notification
- Status: ACCEPTED (manageable for MVP use case)

**RISK-4: Container Parallelization Coordination Complexity**
- Description: Manual execution of 10 parallel containers error-prone (human error risk)
- Probability: Medium (manual process for MVP)
- Impact: Low (can re-run if errors occur, no data loss)
- Mitigation: Phase 2 automation via GitHub Actions matrix; for MVP: detailed runbook documentation
- Status: ACCEPTED (MVP manual execution acceptable, automation planned)

**RISK-5: Service Account Key Security**
- Description: GOOGLE_APPLICATION_CREDENTIALS file contains sensitive credentials
- Probability: Low (access controls in place)
- Impact: High (unauthorized GCS/Vertex AI Search access)
- Mitigation: .gitignore excludes credentials; Google Cloud IAM roles scoped to minimal permissions; key rotation schedule
- Status: MITIGATED (security best practices implemented)

### Assumptions

**ASSUMPTION-1: 90%+ Cache Hit Rate Sustainable**
- Assumption: Only 10-15% of UK government repositories update daily
- Validation: Observed GitHub activity patterns (confirmed in testing)
- Impact if Wrong: Higher gitingest processing costs, slower incremental updates
- Contingency: Batch processing optimization; Cloud Run Jobs scheduled runs

**ASSUMPTION-2: Vertex AI Search Handles 30k+ Repos at Scale**
- Assumption: Vertex AI Search can scale to 30,000+ repositories without performance degradation
- Validation: Google Cloud documentation indicates enterprise scale support
- Impact if Wrong: Search quality degrades, response time increases
- Contingency: Partition into multiple search engines by sector (health, justice, etc.)

**ASSUMPTION-3: gitingest Quality Sufficient for Semantic Search**
- Assumption: gitingest-generated summaries provide adequate context for Vertex AI Search embeddings
- Validation: Story 7.5 testing confirms search relevance
- Impact if Wrong: Poor search results, low user adoption
- Contingency: Custom chunking strategy; AST-based function-level splitting (Phase 2)

**ASSUMPTION-4: repos.json Feed Remains Available**
- Assumption: uk-x-gov-software-community/xgov-opensource-repo-scraper feed maintained by community
- Validation: Active GitHub repository with recent commits
- Impact if Wrong: Cannot discover new repositories
- Contingency: Manual repos.json generation; alternative data sources (GitHub API direct scraping)

**ASSUMPTION-5: MCP v2 Protocol Stability**
- Assumption: MCP v2 protocol specification remains stable (no breaking changes)
- Validation: Emerging standard (2024-2025), Claude Desktop adoption
- Impact if Wrong: API incompatibility, client integration breaks
- Contingency: Version negotiation support; backward compatibility layer

### Open Questions

**QUESTION-1: Should we implement real-time indexing notifications?**
- Context: Users may expect newly uploaded repos to be searchable immediately
- Options:
  - A) Accept 5-15 minute lag, communicate clearly in UI (MVP approach)
  - B) Implement polling mechanism to check Vertex AI Search index status
  - C) Add "Last indexed" timestamp to search results
- Decision Needed By: Phase 2 (web UI implementation)
- Owner: Product owner (user experience decision)

**QUESTION-2: How to handle repositories >100MB that timeout?**
- Context: Some large repositories may exceed 5-minute gitingest timeout
- Options:
  - A) Log failure and skip (current MVP approach)
  - B) Increase timeout to 10 minutes for large repos
  - C) Implement partial processing (summary of top-level structure only)
- Decision Needed By: After MVP usage data collection
- Owner: Technical lead (performance vs completeness tradeoff)

**QUESTION-3: Should we enable Vertex AI Search summary generation?**
- Context: Vertex AI Search can generate AI summaries of search results
- Options:
  - A) Enable for richer result context (may increase query costs)
  - B) Disable to minimize costs (current MVP approach)
  - C) Enable as optional parameter (user choice)
- Decision Needed By: Phase 2 (based on user feedback and cost analysis)
- Owner: Product owner + technical lead (cost vs value decision)

**QUESTION-4: Migration cleanup - when to remove Cloudflare dependencies?**
- Context: Root package.json still contains deprecated Cloudflare packages
- Options:
  - A) Remove immediately (clean break, may break local development scripts)
  - B) Deprecate gradually (mark as deprecated, remove in Phase 2)
  - C) Keep for historical reference (document migration path)
- Decision Needed By: Post-Epic 7 (cleanup sprint)
- Owner: Technical lead (repository maintenance decision)

**QUESTION-5: Should we implement authentication for production API?**
- Context: MVP uses open access (no auth), potential for abuse
- Options:
  - A) Keep open access (simplest developer experience)
  - B) Add API key authentication (controlled access, usage tracking)
  - C) Add Google Cloud IAM authentication (enterprise-grade security)
- Decision Needed By: Before production launch (security review)
- Owner: Security team + product owner (security vs accessibility tradeoff)

## Test Strategy Summary

### Unit Testing

**Container (Python - pytest):**
- Location: container/test_*.py
- Coverage: GCS client (upload, metadata, incremental logic), orchestrator (repos.json parsing, batch processing)
- Mocking: google.cloud.storage, gitingest library, HTTP requests
- Test Data: Synthetic repository metadata, mock gitingest summaries
- Execution: `pytest container/` (local development), CI/CD pipeline
- Target Coverage: >80% for critical paths (GCS upload, metadata comparison)

**API (TypeScript - vitest, future):**
- Location: api/src/**/*.test.ts (to be implemented)
- Coverage: Vertex Search Service (query translation, URI parsing), MCP endpoints (validation, error handling)
- Mocking: @google-cloud/discoveryengine, Express request/response
- Test Data: Mock Vertex AI Search responses, test queries
- Execution: `npm test` (local development), CI/CD pipeline
- Target Coverage: >80% for API layer, 100% for validation logic

### Integration Testing

**Container Integration (Small Batch):**
- Test: `docker run govreposcrape-container --limit=10`
- Validates: repos.json fetch, gitingest processing, GCS upload with metadata, incremental update logic
- Success Criteria: 10 repositories processed, GCS blobs created, metadata accurate, logs show statistics
- Environment: Development GCS bucket (govreposcrape-summaries-dev)
- Frequency: Before each deployment

**Container Integration (Medium Batch):**
- Test: `docker run govreposcrape-container --limit=100`
- Validates: Cache hit rate (90%+ on second run), error handling (retries), parallel execution simulation
- Success Criteria: 100 repositories processed, cache hit rate >90%, no cascading failures
- Environment: Development GCS bucket
- Frequency: Weekly (regression testing)

**Vertex AI Search Integration:**
- Test: Upload test .md files to GCS, wait 15 minutes, query Vertex AI Search
- Validates: Auto-indexing from GCS bucket, search query returns expected results, grounding metadata correct
- Success Criteria: Test queries return relevant results, URIs match GCS paths, indexing lag <15 minutes
- Environment: Development Vertex AI Search engine
- Frequency: After container batch uploads, before API deployment

**API Integration (MCP Protocol):**
- Test: `curl -X POST /search -d '{"query":"test","limit":5}'`
- Validates: MCP request validation, Vertex AI Search query, response formatting, error handling
- Success Criteria: 200 OK response, SearchResult[] format correct, metadata extracted from URIs
- Environment: Cloud Run staging service (govreposcrape-api-staging)
- Frequency: Before production deployment, after API changes

### Performance Testing

**Query Response Time (p95 <2s):**
- Method: Load testing tool (Apache Bench or custom script)
- Load: 100 queries/day sustained (1 query every 14 minutes)
- Metrics: p50, p90, p95, p99 latency, error rate
- Success Criteria: p95 <2s, p99 <3s, error rate <0.1%
- Environment: Cloud Run production service
- Frequency: Weekly (ongoing monitoring)

**Container Throughput (21k repos in <6 hours):**
- Method: 10 parallel containers with --batch-size=10, --offset=0-9
- Metrics: Wall-clock time, total repos processed, cache hit rate, failures
- Success Criteria: Processing completes in <6 hours, >90% cache hit rate on incremental runs
- Environment: Local development (Docker) or Cloud Run Jobs (future)
- Frequency: Monthly (full ingestion run)

### Security Testing

**Dependency Scanning:**
- npm audit: Run weekly, block deployment on high/critical CVEs
- pip-audit: Run weekly for Python dependencies
- Dependabot: Automated pull requests for security updates
- Success Criteria: Zero high/critical vulnerabilities in production

**NCSC Compliance Checklist:**
- Input validation: Manual testing with edge cases (empty query, query >500 chars, invalid limit)
- Output encoding: Verify JSON responses (no HTML injection possible)
- Secrets management: Grep codebase for hardcoded credentials, verify .gitignore
- IAM roles: Audit service account permissions (least privilege validation)
- Success Criteria: All checklist items pass (documented in SECURITY.md)

**Penetration Testing (Future):**
- Scope: API endpoints, service account permissions, GCS bucket access controls
- Method: External security audit (Phase 2)
- Frequency: Annually or before major release

### Acceptance Testing

**End-to-End User Scenario:**
1. Container processes 100 repositories with incremental updates
2. Vertex AI Search indexes all .md files (verify within 15 minutes)
3. Cloud Run API returns relevant results for test queries
4. MCP client (Claude Desktop) integration works end-to-end
5. Cost monitoring dashboard shows spend within £80/month budget

**Success Criteria for MVP Launch:**
- All 21,000 repositories processed and indexed
- API achieves <2s p95 response time
- Search relevance: 80%+ relevant results for test queries (manual assessment)
- Cost validation: 30-day period confirms <£80/month spend
- Security audit: Zero high/critical vulnerabilities
- Documentation: All Cloudflare references removed, Google Cloud setup documented

### Test Automation Roadmap

**Current (MVP):**
- Manual container execution (docker run)
- Manual API testing (curl, Postman)
- pytest unit tests (container)
- npm audit / pip-audit (weekly manual)

**Phase 2 (Automation):**
- GitHub Actions: Automated container batch processing (scheduled daily)
- CI/CD pipeline: vitest unit tests, integration tests, deployment gates
- Automated cost monitoring alerts (>£2/day threshold)
- Automated uptime checks (Cloud Monitoring alerting policies)

**Phase 3 (Advanced):**
- Load testing in CI/CD (prevent performance regressions)
- Canary deployments (gradual rollout with automatic rollback)
- Chaos engineering (resilience testing, service failure simulations)
