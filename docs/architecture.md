# Architecture

## Executive Summary

govscraperepo is a Google Cloud Platform-based MCP API server providing semantic code search over ~21k UK government repositories. The architecture follows a **write path / read path separation** pattern: a Python containerized ingestion pipeline (gitingest) processes repositories, stores summaries as Markdown files in Google Cloud Storage with custom metadata (one file per repo: `{org}/{repo}.md`), which are automatically indexed by Vertex AI Search (managed service), and exposed via a TypeScript MCP v2 API deployed on Cloud Run. The architecture prioritizes managed services, incremental updates (based on `pushedAt` timestamp comparison), and simple URI-based metadata extraction.

## Project Initialization

**First implementation story must execute:**

```bash
npm init -y
npm install typescript @types/node --save-dev
npm install @google-cloud/discoveryengine @google-cloud/storage express --save
```

This establishes the base Google Cloud Platform architecture with these decisions:

### Provided by Setup

| Decision | Value | Notes |
|----------|-------|-------|
| Language | TypeScript | Strict typing with @types/node |
| Build Tool | tsc | TypeScript compiler |
| Runtime | Node.js 20 | Cloud Run managed runtime |
| Dev Server | npm run dev | Local development at localhost:8080 |
| Deployment | gcloud run deploy | CLI-based deployment |
| Project Structure | api/ pattern | Entry point: api/src/index.ts |
| Config File | package.json | Node.js configuration |

## Decision Summary

| Category | Decision | Version | Affects Epics | Rationale |
| -------- | -------- | ------- | ------------- | --------- |
| Platform | Google Cloud Platform | Latest | All | Managed services, Cloud Run, Vertex AI Search |
| Language | TypeScript | 5.9+ | All | Type safety, Node.js 20+, strict mode |
| API Runtime | Cloud Run (Node 20) | 20+ | Epic 4 | Managed Node.js runtime, auto-scaling |
| Build Tool | esbuild (via tsc) | Latest | All | Fast TypeScript compilation |
| Test Framework | Vitest | 4.0+ | All | Fast, ESM native, Node.js compatible |
| Container Runtime | Docker + Python 3.11 | 3.11+ | Epic 2 | gitingest library requirement |
| Data Storage | Google Cloud Storage | Managed | Epic 2, 3 | Object storage for Markdown summaries (`{org}/{repo}.md`) |
| Metadata Storage | GCS Custom Metadata | Managed | Epic 2, 3 | org, repo, url, pushedAt, processedAt (no separate DB) |
| Search | Vertex AI Search | Managed | Epic 3, 4 | Semantic search with content schema |
| API Protocol | MCP v2 | v2 | Epic 4 | Standards compliance, Claude/Copilot compatible |
| TypeScript Config | strict: true, target: ES2022 | 5.9+ | All | Maximum type safety, modern JS features |
| Error Handling | Custom error classes + retry | - | All | 3 attempts, exponential backoff (1s, 2s, 4s) |
| Logging | Structured JSON | - | All | Cloud Run logging, requestId correlation |
| API Response Format | Typed MCP SearchResult | - | Epic 4 | Type-safe metadata from GCS URI parsing |
| File Naming | kebab-case.ts | - | All | Consistency for AI agents |
| Function Naming | camelCase | - | All | JavaScript convention |
| Module Pattern | Named exports | - | All | Tree-shaking, explicit imports |

## Project Structure

```
govreposcrape/
├── api/                      # Epic 4: MCP API (Cloud Run)
│   ├── src/
│   │   ├── index.ts          # Express server entry point
│   │   ├── services/
│   │   │   └── vertexSearchService.ts  # Vertex AI Search integration
│   │   └── types/
│   │       └── mcp.ts        # MCP protocol types
│   ├── scripts/
│   │   ├── trigger-import.ts  # Vertex AI import operations
│   │   └── deploy-setup.sh    # Cloud Run deployment script
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile            # Cloud Run container
├── container/                # Epic 2: Python gitingest (Docker)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── orchestrator.py       # Main ingestion orchestrator
│   ├── gcs_client.py         # GCS upload with metadata
│   └── test_gcs_client.py    # Unit tests
├── docs/                     # Epic 5: Documentation
│   ├── architecture.md       # This file
│   ├── epics.md              # Epic breakdown
│   ├── google-file-search-testing-results.md
│   └── vertex-ai-migration-results.md
├── scripts/                  # Epic 6: Operations
│   ├── import-jsonl-to-vertex.py
│   └── smoke-test.sh
├── .bmad-ephemeral/          # Development tracking (not deployed)
│   ├── stories/
│   └── sprint-status.yaml
├── package.json              # Root package.json (workspace)
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── SECURITY.md
└── DEPLOYMENT.md
```

## Epic to Architecture Mapping

| Epic | Primary Modules/Services | Technologies |
|------|-------------------------|--------------|
| Epic 1: Foundation & Infrastructure | api/src/, package.json, tsconfig.json | TypeScript, Node.js 20, Cloud Run |
| Epic 2: Data Ingestion Pipeline | container/ | Python 3.11 (Docker), GCS, gitingest |
| Epic 3: AI Search Integration | api/src/services/ | Vertex AI Search, GCS auto-indexing |
| Epic 4: MCP API Server | api/src/index.ts | MCP v2, TypeScript, Express, Cloud Run |
| Epic 5: Developer Experience | docs/, scripts/ | Markdown, gcloud CLI, bash scripts |
| Epic 6: Operational Excellence | scripts/, SECURITY.md, DEPLOYMENT.md | Cloud Run metrics, npm audit, documentation |

## Technology Stack Details

### Core Technologies

**Cloud Run Runtime:**
- Platform: Google Cloud Run (managed containers)
- Runtime: Node.js 20 (managed runtime)
- Deployment: gcloud run deploy
- Configuration: Dockerfile + package.json

**TypeScript 5.9+:**
- strict: true (strictNullChecks, noImplicitAny, etc.)
- target: ES2022
- module: ESNext
- Types: @types/node, @google-cloud/discoveryengine

**Python 3.11+ (Container):**
- Runtime: Docker container
- Library: gitingest (pip install gitingest)
- Dependencies: google-cloud-storage, requests
- Orchestration: Manual docker run for MVP, automated batch processing for Phase 2

### Google Cloud Services

**Google Cloud Storage (Object Storage):**
- Bucket: `govreposcrape-summaries` (us-central1)
- Path structure: `{org}/{repo}.md` (one Markdown file per repository)
- Content: Plain text gitingest summary (Markdown format)
- Custom metadata: org, repo, url, pushedAt, processedAt, size
- Content-Type: text/markdown; charset=utf-8
- Incremental updates: Compare `pushedAt` timestamp, skip if unchanged
- Auto-indexing by Vertex AI Search (content schema)

**Vertex AI Search (Managed Semantic Search):**
- Data Store ID: `govreposcrape-summaries`
- Search Engine: `govreposcrape-search`
- Source: GCS bucket auto-monitoring (`gs://govreposcrape-summaries/**/*.md`)
- Data Schema: `content` (plain text/markdown indexing)
- Embedding: Automatic (managed by Vertex AI)
- Index: Real-time (5-15 minutes after GCS upload)
- Query: Natural language semantic search via SearchServiceClient
- Import: Incremental mode (add/update documents without full reindex)

### Testing Stack

**Python Testing:**
- Framework: pytest
- Location: container/test_*.py
- Scope: gitingest processing, GCS uploads, incremental update logic
- Commands: `pytest container/`

**TypeScript Testing (Future):**
- Framework: Jest or Vitest
- Location: Co-located `*.test.ts` files
- Scope: Vertex AI Search service, MCP API endpoints
- Commands: `npm test`

### Integration Points

**Data Flow:**
```
repos.json feed → Container (gitingest) → GCS (upload .md with metadata)
  → Vertex AI Search (auto-index) → Cloud Run API (query)
  → MCP API (response with org/repo from URI parsing)
```

**Incremental Update Flow:**
```
1. Container reads repos.json
2. For each repo: Check GCS for existing file
3. Compare existing pushedAt metadata with new value
4. If unchanged: Skip (⊘ symbol)
5. If changed: Update file (↻ symbol)
6. If new: Create file (+ symbol)
7. Vertex AI Search auto-detects changes and reindexes
```

**Google Cloud Configuration:**
```bash
# Project ID
GOOGLE_PROJECT_ID=govreposcrape

# GCS Bucket
GCS_BUCKET_NAME=govreposcrape-summaries

# Vertex AI Search
VERTEX_AI_SEARCH_ENGINE_ID=projects/1060386346356/locations/global/collections/default_collection/engines/govreposcrape-search

# Authentication
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

**External Integrations:**
- repos.json feed: HTTPS fetch from GitHub
- gitingest: Python library (containerized with Docker)
- MCP clients: Claude Desktop, GitHub Copilot (via Cloud Run URL)

## Implementation Patterns

These patterns ensure consistent implementation across all AI agents:

### File and Module Patterns

**File Naming:**
- TypeScript files: `kebab-case.ts` (e.g., `search-endpoint.ts`, `repos-fetcher.ts`)
- Test files: `kebab-case.test.ts` (e.g., `search-endpoint.test.ts`)
- Python files: `snake_case.py` (e.g., `gcs_client.py`, `orchestrator.py`)

**Module Exports:**
- **Prefer named exports** for tree-shaking and explicit imports
- Default export **only** for API entry point (api/src/index.ts)
- Example: `export { searchCode, enrichResult }` not `export default`

**Import Organization:**
1. Node/external modules (e.g., `import { parse } from 'node:url'`)
2. @google-cloud/* modules (e.g., `import { SearchServiceClient } from '@google-cloud/discoveryengine'`)
3. Internal imports (relative paths, e.g., `import { logger } from '../utils/logger'`)
4. Type imports last (e.g., `import type { SearchResult } from './types'`)

### Naming Conventions

**Functions and Methods:**
- **camelCase** for all functions/methods
- Examples: `searchCode()`, `fetchRepos()`, `updateCache()`
- Async functions: No special prefix (return type indicates Promise)

**Classes:**
- **PascalCase** for all classes
- Examples: `ValidationError`, `MCPHandler`, `ReposFetcher`

**Constants:**
- **UPPER_SNAKE_CASE** for true constants
- Examples: `MAX_RETRIES = 3`, `DEFAULT_LIMIT = 5`, `CACHE_HIT_THRESHOLD = 0.9`

**Variables:**
- **camelCase** for variables
- Examples: `repoUrl`, `resultCount`, `cacheKey`

**Interfaces and Types:**
- **PascalCase** for interfaces and types
- Examples: `SearchResult`, `RepoMetadata`, `MCPRequest`

### API and Endpoint Patterns

**Endpoint Naming:**
- Lowercase, no trailing slash
- Pattern: `/mcp/search` (not `/mcp/search/` or `/MCP/Search`)
- HTTP methods: POST for search (body required), GET for health

**Route Parameters:**
- Not used in MVP (all data via POST body or query params)

### Code Organization

**Test Files:**
- Python: `test_*.py` in container/ (e.g., `test_gcs_client.py`)
- TypeScript (future): Co-located `*.test.ts` files
- Test structure: pytest for Python, describe/it blocks for TypeScript
- Mock external services (GCS, Vertex AI Search) in tests

**Utility Functions:**
- Place in `api/src/utils/` when used across multiple modules
- Keep module-specific helpers within the module

**Configuration:**
- Environment-specific: .env files (dev/staging/production)
- Secrets: Google Cloud Secret Manager or environment variables
- No hardcoded secrets in code
- Service account authentication via GOOGLE_APPLICATION_CREDENTIALS

## Consistency Rules

### Error Handling

**Error Classes:**
```typescript
class ValidationError extends Error {
  statusCode = 400;
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

class ServiceError extends Error {
  statusCode = 500;
  constructor(message: string) {
    super(message);
  }
}

class APIError extends Error {
  statusCode: number;
  code: string;
  retryAfter?: number;
  constructor(statusCode: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
```

**Error Response Format:**
```typescript
{
  error: {
    code: "INVALID_QUERY",      // Machine-readable
    message: "Query too short",   // Human-readable
    retry_after?: 60              // Optional: seconds to wait
  }
}
```

**Retry Logic Pattern:**
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delays = [1000, 2000, 4000]
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(delays[i]);
      }
    }
  }
  throw lastError;
}
```

**Where to Apply Retries:**
- repos.json fetch
- gitingest container processing
- GCS uploads (handled by google-cloud-storage library with retry.Retry)
- Vertex AI Search queries (with shorter timeout)

### Logging Strategy

**Structured Log Format:**
```typescript
interface LogEntry {
  timestamp: string;  // ISO8601
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context: {
    requestId: string;  // UUID v4
    operation: string;  // e.g., "search", "ingest", "cache_check"
    duration?: number;  // milliseconds
    metadata?: Record<string, any>;
  };
}
```

**Log Levels by Environment:**
- **Development:** debug (all logs)
- **Production:** info (info, warn, error only)

**Logger Usage:**
```typescript
import { logger } from './utils/logger';

logger.info('Query processed', {
  requestId: req.headers.get('x-request-id'),
  operation: 'search',
  duration: Date.now() - startTime,
  metadata: { query: 'auth', resultCount: 5 }
});
```

**What to Log:**
- All API requests/responses (requestId, duration, status)
- Cache hits/misses
- Errors with full context
- Performance metrics (query time, AI Search time)

**What NOT to Log:**
- Secrets (API keys, tokens)
- Full query text if contains sensitive terms (log hash instead)
- Large payloads (log size/count instead)

## Data Architecture

### Data Models

**RepoMetadata (from repos.json):**
```typescript
interface RepoMetadata {
  url: string;         // GitHub repository URL
  pushedAt: string;    // ISO8601 timestamp
  org: string;         // GitHub organization
  name: string;        // Repository name
}
```

**GCS Custom Metadata:**
```python
metadata = {
  'org': 'alphagov',
  'repo': 'govuk-frontend',
  'url': 'https://github.com/alphagov/govuk-frontend',
  'pushedAt': '2025-10-15T14:30:00Z',
  'processedAt': '2025-11-17T10:45:00Z',
  'size': '12345'  # Content size in bytes
}
```

**SearchResult (API Response):**
```typescript
interface SearchResult {
  title: string;              // "{org}/{repo}"
  url: string;                // Full GitHub URL
  snippet: string;            // Code snippet from Vertex AI Search
  metadata: {
    org: string;              // Extracted from GCS URI
    repo: string;             // Extracted from GCS URI
    pushedAt?: string;        // Optional (not in current implementation)
    processedAt?: string;     // Optional (not in current implementation)
  };
}
```

**MCPRequest:**
```typescript
interface MCPRequest {
  query: string;     // Required: 3-500 chars
  limit?: number;    // Optional: 1-20, default 5
}
```

**MCPResponse:**
```typescript
interface MCPResponse {
  results: SearchResult[];
  took_ms: number;
}
```

### Data Flow

**Write Path (Ingestion):**
1. Fetch repos.json → Parse JSON → Extract RepoMetadata[]
2. For each repo: Check GCS for existing file (`{org}/{repo}.md`)
3. Compare pushedAt metadata: Skip if unchanged, update if changed
4. Process with gitingest (if needed)
5. Upload to GCS (`{org}/{repo}.md`) with custom metadata
6. Vertex AI Search auto-indexes new/updated content (5-15 min)

**Read Path (Query):**
1. Receive MCP search request via Cloud Run API
2. Query Vertex AI Search with natural language
3. Vertex AI Search returns results with snippets
4. Extract org/repo from GCS URI using regex pattern
5. Format as MCP SearchResult
6. Return to client

### Storage Patterns

**GCS Object Naming:**
- Pattern: `{org}/{repo}.md` (one file per repository)
- Example: `alphagov/govuk-frontend.md`
- Content-Type: `text/markdown; charset=utf-8`
- Metadata: Stored in GCS custom metadata (org, repo, url, pushedAt, processedAt, size)

**Incremental Update Logic:**
- Check existing file with `blob.reload()` to fetch metadata
- Compare `pushedAt` values (existing vs new from repos.json)
- Skip if equal (⊘), update if different (↻), create if not exists (+)
- No separate cache DB needed - GCS metadata serves as cache

## API Contracts

### POST /mcp/search

**Request:**
```http
POST /search HTTP/1.1
Host: <cloud-run-url>
Content-Type: application/json

{
  "query": "authentication methods",
  "limit": 20
}
```

**Success Response (200 OK):**
```json
{
  "results": [
    {
      "title": "alphagov/govuk-frontend",
      "url": "https://github.com/alphagov/govuk-frontend",
      "snippet": "// Authentication middleware...",
      "metadata": {
        "org": "alphagov",
        "repo": "govuk-frontend"
      }
    }
  ]
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Query must be between 3 and 500 characters"
  }
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "error": {
    "code": "SEARCH_ERROR",
    "message": "Vertex AI Search service temporarily unavailable"
  }
}
```

### MCP Protocol Compliance

**Headers:**
- `Content-Type: application/json`
- Standard HTTP headers

**CORS:**
- Configured via Cloud Run service settings
- Allow methods: POST, OPTIONS, GET
- Allow headers: Content-Type

## Security Architecture

### Authentication and Authorization

**No Authentication Required (MVP):**
- MCP API is open access (no JWT, no API keys)
- Cloud Run handles rate limiting via platform-level controls
- Future: API key authentication for production use

### Input Validation

**Query Validation:**
- Length: 3-500 characters
- Sanitization: Trim whitespace, validate UTF-8
- No SQL injection risk (no direct DB queries)
- No XSS risk (API-only, no HTML rendering)

**Limit Validation:**
- Range: 1-20 results
- Default: 5 if not specified
- Type check: must be integer

### Data Security

**Data Classification:**
- All data is public (GitHub public repositories)
- No PII, no sensitive information
- No user data stored (stateless API)

**Transport Security:**
- HTTPS only (TLS 1.3)
- Cloud Run automatic HTTPS enforcement
- No unencrypted connections

**Secrets Management:**
- Google Cloud Secret Manager for API keys (if needed)
- Service account authentication via GOOGLE_APPLICATION_CREDENTIALS
- Environment variables for non-sensitive config
- No secrets in code or logs

### NCSC Compliance (NFR-2.1)

**Secure Coding Standards:**
- Input validation on all API endpoints
- Output encoding (JSON only, no HTML)
- No eval(), Function(), or dynamic code execution
- Dependency scanning: `npm audit` in CI/CD
- Dependabot enabled for automated security updates

**Audit Logging:**
- All API requests logged with requestId, query, response time
- Log retention: Cloud Run logs (configurable via Cloud Logging)
- No secrets in logs

**Access Controls:**
- Read-only access to GitHub (no write operations)
- GCS and Vertex AI: Service account access with least privilege IAM roles
- Principle of least privilege

### Dependency Security

**npm audit:**
- Run weekly via GitHub Actions
- Block deployment on high/critical vulnerabilities
- Document: scripts/security-audit.sh

**Dependabot:**
- Enabled for package.json
- Auto-create PRs for security updates
- Review and merge promptly

## Performance Considerations

### Response Time Targets (NFR-1.1)

**Target: <2s end-to-end (p95)**
- Vertex AI Search query: <1500ms (managed service)
- Metadata extraction: <50ms (URI regex parsing)
- Network latency: <300ms (Cloud Run regional deployment)
- Serialization: <50ms (JSON response)
- Buffer: ~100ms for variance

**Optimization Strategies:**
- Regional deployment (us-central1 for low latency to Vertex AI)
- Minimal processing (thin API wrapper around Vertex AI Search)
- URI parsing instead of metadata fetches (no additional API calls)

### Ingestion Performance (NFR-1.3)

**Target: Process 21k repos in <6 hours**
- Sequential: ~10s per repo × 21k = 58 hours
- **Solution: Parallelization with --batch-size and --offset**
- 10 parallel containers: 58 hours ÷ 10 = 5.8 hours ✓

**Container Performance:**
- gitingest timeout: 5 minutes per repo
- Retry logic: 3 attempts with exponential backoff
- Fail-safe: Log failures, continue with next repo

### Caching Strategy

**Smart Incremental Updates (90%+ skip rate):**
- GCS metadata comparison: pushedAt timestamp check before processing
- Observation: 10-15% of repos update daily → 85-90% skip on re-runs
- No separate cache DB: GCS custom metadata serves as cache
- Logic: Skip (⊘) if pushedAt unchanged, Update (↻) if changed, Create (+) if new

### Cost Optimization (NFR-7.1)

**Target: <£50/month**
- Cloud Run: Free tier (2 million requests/month) + minimal compute
- GCS: ~1GB storage × $0.020/GB = $0.02/month
- Vertex AI Search: Pay-per-query (pricing validated during MVP)
- Data transfer: Minimal (within us-central1 region)
- **Key:** Incremental updates reduce gitingest processing by 90%

## Deployment Architecture

### Environments

**Development (Local):**
- `npm run dev` on localhost:8080
- Uses local service account credentials
- Debug logging enabled
- Docker containers for gitingest testing

**Staging (Google Cloud):**
- Cloud Run service: govreposcrape-api-staging
- Separate GCS bucket and Vertex AI Search instance
- Production-like config, test data (100 repos)

**Production (Google Cloud):**
- Cloud Run service: govreposcrape-api
- Production GCS bucket (govreposcrape-summaries)
- Production Vertex AI Search engine
- Info-level logging only
- Monitoring and alerting active

### Deployment Process

**CI/CD Pipeline (Future):**
- GitHub Actions
- On push to main: Run tests → Build container → Deploy to staging → Manual approval → Deploy to production
- Rollback: `gcloud run services update-traffic` to previous revision

**Manual Deployment (Current):**
```bash
# Build and deploy API to Cloud Run
cd api
gcloud builds submit --tag gcr.io/govreposcrape/api
gcloud run deploy govreposcrape-api \
  --image gcr.io/govreposcrape/api \
  --region us-central1 \
  --allow-unauthenticated

# Build and run ingestion container
cd container
docker build -t govreposcrape-container .
docker run --rm \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json \
  -e GCS_BUCKET_NAME=govreposcrape-summaries \
  -v "$PWD/google-credentials.json:/app/google-credentials.json:ro" \
  govreposcrape-container python orchestrator.py --limit=100
```

### Infrastructure as Code

**Configuration Files:**
- package.json: Node.js dependencies and scripts
- Dockerfile: Cloud Run container definition
- .env.example: Environment variable template
- Version controlled

**Secrets:**
- Service account key: google-credentials.json (not in version control)
- Environment variables: GOOGLE_APPLICATION_CREDENTIALS, GCS_BUCKET_NAME, VERTEX_AI_SEARCH_ENGINE_ID
- Managed via Cloud Run environment variables

### Monitoring and Alerting

**Cloud Run Metrics:**
- Request volume, latency, error rates
- Built-in Cloud Monitoring dashboard
- Container CPU and memory usage

**Custom Metrics (Future):**
- Cost per query
- Incremental update skip rate
- Query response time distribution
- Vertex AI Search indexing lag

**Alerts (Future):**
- Error rate >1%
- p95 response time >2s
- Container failures
- GCS upload failures

## Development Environment

### Prerequisites

**Required:**
- Node.js 20+ (LTS)
- npm 10+ or pnpm 8+
- Docker 24+ (for gitingest container)
- Google Cloud account with billing enabled
- gcloud CLI (latest version)
- Python 3.11+ (for container development)

**Optional:**
- VS Code with TypeScript ESLint extension
- Google Cloud Code extension for VS Code

### Setup Commands

```bash
# Clone repository
git clone <repository-url> govreposcrape
cd govreposcrape

# Install API dependencies
cd api
npm install

# Configure TypeScript (already in tsconfig.json)
# - strict: true
# - target: ES2022
# - module: ESNext

# Install Python dependencies for container
cd ../container
pip3 install -r requirements.txt

# Authenticate with Google Cloud
gcloud auth login
gcloud auth application-default login
gcloud config set project govreposcrape

# Create GCS bucket (if not exists)
gcloud storage buckets create gs://govreposcrape-summaries \
  --location=us-central1

# Set up Vertex AI Search (via Console or gcloud)
# 1. Enable Discovery Engine API
# 2. Create data store (govreposcrape-summaries)
# 3. Create search engine (govreposcrape-search)

# Create service account and download credentials
gcloud iam service-accounts create govreposcrape-sa
gcloud projects add-iam-policy-binding govreposcrape \
  --member="serviceAccount:govreposcrape-sa@govreposcrape.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
gcloud iam service-accounts keys create google-credentials.json \
  --iam-account=govreposcrape-sa@govreposcrape.iam.gserviceaccount.com

# Create .env file
cat > .env << 'EOF'
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
GCS_BUCKET_NAME=govreposcrape-summaries
VERTEX_AI_SEARCH_ENGINE_ID=projects/1060386346356/locations/global/collections/default_collection/engines/govreposcrape-search
EOF

# Run development server (API)
cd api
npm run dev

# Run ingestion container (test)
cd container
docker build -t govreposcrape-container .
docker run --rm \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json \
  -e GCS_BUCKET_NAME=govreposcrape-summaries \
  -v "$PWD/google-credentials.json:/app/google-credentials.json:ro" \
  govreposcrape-container python orchestrator.py --limit=5
```

### Local Development Workflow

1. **Start API dev server:** `cd api && npm run dev` (localhost:8080)
2. **Edit code:** Changes require restart (or use nodemon)
3. **Run tests:** `cd container && pytest` (Python tests)
4. **Test API:** `curl http://localhost:8080/search -X POST -d '{"query":"test","limit":5}' -H "Content-Type: application/json"`
5. **Deploy to Cloud Run:** `cd api && gcloud run deploy`

## Architecture Decision Records (ADRs)

### ADR-001: Google Cloud Platform as Primary Platform

**Context:** Need managed cloud platform with semantic search, object storage, and container runtime for ~21k UK government repositories.

**Decision:** Migrate from Cloudflare to Google Cloud Platform with Cloud Run, GCS, and Vertex AI Search.

**Rationale:**
- **Enterprise Reliability:** 99.9% SLA for Vertex AI Search vs Cloudflare AI Search experimental service
- **Unified Platform:** Single cloud provider (GCP) instead of mixed Cloudflare/Docker architecture
- **Cost Justification:** £50-80/month (Google Cloud) vs <£50/month (Cloudflare) - justified by production-grade reliability
- **Managed Services:** Cloud Run (auto-scaling), GCS (object storage), Vertex AI Search (semantic search with auto-indexing)
- **Container Support:** Cloud Run Jobs for Python gitingest pipeline (scheduled daily runs)
- **Incremental Updates:** GCS custom metadata enables 90%+ skip rate (only reprocess changed repos)
- **Strong TypeScript Support:** @google-cloud/* SDKs with comprehensive type definitions

**Migration Timeline:**
- **Phase 1 (Story 7.1):** Container migrated to Google File Search (interim solution)
- **Phase 2 (Story 7.2):** Testing revealed Google File Search limitations (503 errors on files >10KB)
- **Phase 3 (Story 7.5):** Migrated to Cloud Storage + Vertex AI Search (production-grade, 99.9% SLA)
- **Phase 4 (Story 7.3):** Cloud Run API updated to integrate with Vertex AI Search

**Consequences:**
- Migrated from Cloudflare R2/KV/AI Search to GCS/Vertex AI Search
- Cloud Run provides managed Node.js runtime (regional deployment vs global edge)
- Regional deployment (us-central1) optimized for low latency to Vertex AI Search
- Simplified architecture: one platform instead of mixed Cloudflare/Docker infrastructure
- Google File Search deprecated (interim solution, not production-ready)

### ADR-002: No Authentication for MCP API

**Context:** MCP protocol integration with Claude Desktop and GitHub Copilot.

**Decision:** Open access API with no JWT/API keys. Cloud Run handles rate limiting.

**Rationale:**
- Simplifies integration (<5 minute setup time)
- All data is public (GitHub public repos)
- No PII or sensitive information
- Cloud Run platform-level rate limiting prevents abuse

**Consequences:**
- No user tracking or usage attribution
- Potential for abuse (mitigated by Cloud Run rate limiting)
- Easier developer adoption

### ADR-003: Vertex AI Search vs Custom Embeddings

**Context:** Need semantic search over 21k repositories with metadata extraction.

**Decision:** Use Vertex AI Search (managed service) with "content" schema and URI-based metadata extraction.

**Rationale:**
- Auto-indexing from GCS bucket (`**/*.md` pattern)
- Validates gitingest quality hypothesis before infrastructure investment
- Saves weeks of development time
- Simple metadata extraction via URI regex parsing (no structured data complexity)
- Can migrate to custom embeddings if quality insufficient

**Consequences:**
- Dependent on Vertex AI Search quality (validated in Story 7.5)
- Less control over embedding model
- 5-15 minute indexing lag after GCS uploads
- Metadata extraction from URI instead of structured fields

### ADR-004: GCS Custom Metadata for Incremental Updates

**Context:** Reprocessing 21k repos daily with gitingest is expensive and slow.

**Decision:** Store metadata (org, repo, pushedAt) as GCS custom metadata and use pushedAt comparison for incremental updates.

**Rationale:**
- 90%+ skip rate (only 10-15% of repos update daily)
- Reduces gitingest processing by 90%
- Keeps costs <£50/month
- No separate cache DB needed (GCS metadata serves as cache)
- Simple invalidation logic (timestamp comparison)

**Consequences:**
- No stale data: only updated repos are reprocessed
- GCS metadata access requires `blob.reload()` call
- Simplified architecture (one storage system instead of two)

### ADR-005: Containerized Python for gitingest

**Context:** gitingest is a Python library, Cloud Run API is Node.js/TypeScript.

**Decision:** Run gitingest in Docker container, separate from Cloud Run API.

**Rationale:**
- gitingest requires Python runtime
- Cloud Run API uses Node.js 20 (different runtime)
- Container enables local development and CI/CD
- Manual orchestration acceptable for MVP (automated batch processing in Phase 2)
- Both containers and API can run on Cloud Run if needed

**Consequences:**
- Two runtime environments (Node.js API + Python container)
- Manual container execution for MVP (docker run)
- Requires Docker in development environment

### ADR-006: Markdown Files with One File Per Repo

**Context:** Need to store gitingest summaries in GCS for Vertex AI Search indexing.

**Decision:** Use `{org}/{repo}.md` path pattern (one Markdown file per repository) instead of commit-based paths.

**Rationale:**
- Simplifies storage: one file per repo instead of multiple per commit
- Natural incremental updates: compare pushedAt metadata, update file if changed
- Markdown format makes sense for code summaries
- Cleaner GCS bucket structure
- Easier metadata extraction from URI (regex: `\/([^\/]+)\/([^\/]+)\.md$`)

**Consequences:**
- Only stores latest state of each repository (not historical commits)
- File updates replace previous content (acceptable: only latest needed for search)
- Incremental update logic required to avoid re-processing unchanged repos

### ADR-007: Vertex AI Search Migration (Production-Grade Search)

**Context:** Initial migration to Google Cloud used Google File Search (Story 7.1) as interim solution, but testing (Story 7.2) revealed critical limitations: 503 errors on files >10KB, affecting 86% of content (e.g., BathApp truncated from 512KB to 86KB).

**Decision:** Migrate from Google File Search to Cloud Storage + Vertex AI Search for production deployment (Story 7.5).

**Rationale:**
- **Reliability:** 99.9% SLA vs unreliable Google File Search (503 errors on large files)
- **No Size Limits:** Vertex AI Search handles full gitingest summaries (100KB-500KB) without truncation
- **Auto-Indexing:** Monitors Cloud Storage bucket for new/updated files, automatic reindexing (5-15 min lag)
- **Managed RAG Pipeline:** Zero custom embedding code, Vertex AI handles vectorization and similarity search
- **Enterprise-Grade:** Production-ready service vs deprecated Google File Search (interim solution)
- **Cost Justified:** £20-40/month for Vertex AI Search (within £50-80/month budget) justified by reliability

**Consequences:**
- Cloud Storage bucket: `govreposcrape-summaries` (us-central1) stores full gitingest summaries
- Vertex AI Search: Auto-indexes `**/*.md` files with content schema
- No 512KB truncation limit (removed from container/ingest.py:360-376)
- Google File Search deprecated: Interim solution only, not production-ready
- Migration completed: Story 7.2 findings → Story 7.5 resolution
- Testing validated: docs/vertex-ai-migration-results.md shows successful production deployment

---

_Originally generated by BMAD Decision Architecture Workflow v1.3.2_
_Last updated: 2025-11-18 (Vertex AI Search migration complete)_
_For: cns_
