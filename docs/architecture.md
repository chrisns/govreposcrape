# Architecture

## Executive Summary

govscraperepo is a Cloudflare Workers-based MCP API server providing semantic code search over ~21k UK government repositories. The architecture follows a **write path / read path separation** pattern: a Python containerized ingestion pipeline (gitingest) processes repositories with smart caching (90%+ hit rate), stores summaries in R2, which are automatically indexed by Cloudflare AI Search (managed service), and exposed via a TypeScript MCP v2 API with no authentication. The architecture prioritizes managed services, cost efficiency (<£50/month), and AI agent implementation consistency through strict naming conventions and typed interfaces.

## Project Initialization

**First implementation story must execute:**

```bash
npm create cloudflare@latest govreposcrape -- --type hello-world --ts
cd govreposcrape
npm install
```

This establishes the base Cloudflare Workers architecture with these decisions:

### Provided by Starter Template

| Decision | Value | Notes |
|----------|-------|-------|
| Language | TypeScript | Strict typing with @cloudflare/workers-types |
| Build Tool | esbuild | Via wrangler CLI |
| Runtime | workerd | Cloudflare Workers runtime |
| Dev Server | wrangler dev | Local development at localhost:8787 |
| Deployment | wrangler deploy | CLI-based deployment |
| Project Structure | src/ pattern | Entry point: src/index.ts |
| Config File | wrangler.toml | Workers configuration |

## Decision Summary

| Category | Decision | Version | Affects Epics | Rationale |
| -------- | -------- | ------- | ------------- | --------- |
| Platform | Cloudflare Workers | Latest | All | Edge compute, <£50/month target, managed services |
| Language | TypeScript | 5.9+ | All | Type safety, @cloudflare/workers-types, strict mode |
| Starter Template | create-cloudflare hello-world | @latest | Epic 1 | Standard Workers setup with TypeScript |
| Build Tool | esbuild (via wrangler) | 4.47.0+ | All | Fast builds, tree-shaking, Workers-optimized |
| Test Framework | Vitest | 4.0+ | All | Fast, ESM native, @cloudflare/vitest-pool-workers |
| Container Runtime | Docker + Python 3.11 | 3.11+ | Epic 2 | gitingest library requirement |
| Data Storage | Cloudflare R2 | Managed | Epic 2, 3 | Object storage for gitingest summaries |
| Cache | Cloudflare KV | Managed | Epic 2 | Smart caching, 90%+ hit rate target |
| Search | Cloudflare AI Search | Managed | Epic 3, 4 | Zero-code semantic search, validates hypothesis |
| API Protocol | MCP v2 | v2 | Epic 4 | Standards compliance, Claude/Copilot compatible |
| TypeScript Config | strict: true, target: ES2022 | 5.9+ | All | Maximum type safety, modern JS features |
| Error Handling | Custom error classes + retry | - | All | 3 attempts, exponential backoff (1s, 2s, 4s) |
| Logging | Structured JSON | - | All | Cloudflare log streaming, requestId correlation |
| API Response Format | Typed MCP SearchResult | - | Epic 4 | Type-safe metadata from repos.json |
| File Naming | kebab-case.ts | - | All | Consistency for AI agents |
| Function Naming | camelCase | - | All | JavaScript convention |
| Module Pattern | Named exports | - | All | Tree-shaking, explicit imports |

## Project Structure

```
govreposcrape/
├── src/
│   ├── index.ts              # Workers entry point
│   ├── ingestion/            # Epic 2: Data pipeline
│   │   ├── repos-fetcher.ts
│   │   ├── cache.ts
│   │   └── orchestrator.ts
│   ├── search/               # Epic 3: AI Search integration
│   │   ├── ai-search-client.ts
│   │   └── result-enricher.ts
│   ├── api/                  # Epic 4: MCP API
│   │   ├── mcp-handler.ts
│   │   ├── search-endpoint.ts
│   │   └── health.ts
│   ├── utils/                # Epic 1, 6: Shared utilities
│   │   ├── logger.ts
│   │   ├── error-handler.ts
│   │   └── types.ts
│   └── types.ts              # Shared TypeScript types
├── container/                # Epic 2: Python gitingest
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── ingest.py
│   ├── r2_client.py
│   └── orchestrator.py
├── examples/                 # Epic 5: Integration examples
│   ├── curl.sh
│   ├── node.js
│   └── python.py
├── docs/                     # Epic 5: Documentation
│   ├── integration/
│   │   ├── claude-desktop.md
│   │   └── github-copilot.md
│   └── usage-guide.md
├── static/                   # Epic 5: OpenAPI spec
│   └── openapi.json
├── scripts/                  # Epic 6: Operations
│   ├── cost-monitoring.ts
│   └── security-audit.sh
├── wrangler.toml            # Cloudflare Workers config
├── package.json
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
| Epic 1: Foundation & Infrastructure | src/utils/, wrangler.toml, package.json | TypeScript, Cloudflare Workers, wrangler CLI |
| Epic 2: Data Ingestion Pipeline | src/ingestion/, container/ | TypeScript (Workers), Python 3.11 (container), KV, R2, gitingest |
| Epic 3: AI Search Integration | src/search/ | Cloudflare AI Search, R2 auto-indexing |
| Epic 4: MCP API Server | src/api/, src/index.ts | MCP v2, TypeScript, Workers fetch API |
| Epic 5: Developer Experience | docs/, examples/, static/ | Markdown, OpenAPI 3.0, bash/node/python examples |
| Epic 6: Operational Excellence | scripts/, SECURITY.md, DEPLOYMENT.md | Cloudflare Analytics, npm audit, documentation |

## Technology Stack Details

### Core Technologies

**Cloudflare Workers Runtime:**
- Platform: Cloudflare Workers (edge compute)
- Runtime: workerd (V8-based)
- Deployment: wrangler CLI 4.47.0+
- Configuration: wrangler.toml

**TypeScript 5.9+:**
- strict: true (strictNullChecks, noImplicitAny, etc.)
- target: ES2022
- module: ESNext
- Types: @cloudflare/workers-types

**Python 3.11+ (Container):**
- Runtime: Docker container
- Library: gitingest (pip install gitingest)
- Dependencies: boto3 (R2 access), requests
- Orchestration: Manual CLI execution for MVP, GitHub Actions for Phase 2

### Cloudflare Services

**R2 (Object Storage):**
- Path structure: `gitingest/{org}/{repo}/summary.txt`
- Custom metadata: pushedAt, url, processedAt
- Content-Type: text/plain (AI Search compatibility)
- Auto-indexing by AI Search

**KV (Key-Value Store):**
- Cache keys: `repo:{org}/{name}`
- Cache values: `{ pushedAt, processedAt, status: "complete" }`
- TTL: Not set (cache persists, invalidated by pushedAt comparison)
- Hit rate target: 90%+

**AI Search (Managed RAG):**
- Source: R2 bucket auto-monitoring
- Embedding: Automatic (managed by Cloudflare)
- Index: Real-time (minutes after R2 upload)
- Query: Natural language semantic search

### Testing Stack

**Vitest 4.0+:**
- Test runner: Vitest with @cloudflare/vitest-pool-workers
- Location: Co-located `*.test.ts` files
- Coverage: 80%+ target for core logic
- Commands: `npm test`, `npm run test:coverage`

**Python Testing:**
- Framework: pytest
- Location: container/tests/
- Scope: gitingest processing, R2 uploads

### Integration Points

**Data Flow:**
```
repos.json feed → Workers (fetch) → KV (cache check)
  → Container (gitingest) → R2 (upload) → AI Search (auto-index)
  → Workers (query) → MCP API (response)
```

**Service Bindings (wrangler.toml):**
```toml
[[r2_buckets]]
binding = "R2"
bucket_name = "govscraperepo-gitingest"

[[kv_namespaces]]
binding = "KV"
id = "..."

[[ai]]
binding = "AI_SEARCH"
```

**External Integrations:**
- repos.json feed: HTTPS fetch from GitHub
- gitingest: Python library (containerized)
- MCP clients: Claude Desktop, GitHub Copilot (via https://govreposcrape.cloud.cns.me)

## Implementation Patterns

These patterns ensure consistent implementation across all AI agents:

### File and Module Patterns

**File Naming:**
- TypeScript files: `kebab-case.ts` (e.g., `search-endpoint.ts`, `repos-fetcher.ts`)
- Test files: `kebab-case.test.ts` (e.g., `search-endpoint.test.ts`)
- Python files: `snake_case.py` (e.g., `r2_client.py`, `orchestrator.py`)

**Module Exports:**
- **Prefer named exports** for tree-shaking and explicit imports
- Default export **only** for Workers entry point (src/index.ts)
- Example: `export { searchCode, enrichResult }` not `export default`

**Import Organization:**
1. Node/external modules (e.g., `import { parse } from 'node:url'`)
2. @cloudflare/* modules (e.g., `import type { Env } from '@cloudflare/workers-types'`)
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
- Co-located with source: `src/api/search-endpoint.ts` → `src/api/search-endpoint.test.ts`
- Test structure: describe blocks for grouping, it/test for cases
- Mock external services (R2, KV, AI Search) in tests

**Utility Functions:**
- Place in `src/utils/` when used across multiple modules
- Keep module-specific helpers within the module

**Configuration:**
- Environment-specific: wrangler.toml (dev/staging/production)
- Secrets: Cloudflare Workers secrets (JWT_SECRET, API keys)
- No hardcoded secrets in code

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
- R2 uploads
- AI Search queries (with shorter timeout)

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

**CacheEntry (KV):**
```typescript
interface CacheEntry {
  pushedAt: string;      // ISO8601 from repos.json
  processedAt: string;   // ISO8601 when gitingest completed
  status: "complete";    // Future: "processing", "failed"
}
```

**SearchResult (API Response):**
```typescript
interface SearchResult {
  repo_url: string;           // Full GitHub URL
  repo_org: string;           // Organization name
  repo_name: string;          // Repository name
  snippet: string;            // Code snippet from AI Search
  last_updated: string;       // ISO8601 (pushedAt)
  language?: string;          // Detected language (optional)
  similarity_score: number;   // 0.0-1.0 from AI Search
  github_link: string;        // https://github.com/{org}/{repo}
  codespaces_link: string;    // https://github.dev/{org}/{repo}
  metadata: RepoMetadata;     // Full repos.json entry
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
2. For each repo: Check KV cache (key: `repo:{org}/{name}`)
3. If pushedAt differs or no cache: Process with gitingest
4. Upload to R2 (`gitingest/{org}/{repo}/summary.txt`) with metadata
5. Update KV cache with new CacheEntry
6. AI Search auto-indexes R2 content

**Read Path (Query):**
1. Receive MCPRequest via POST /mcp/search
2. Query AI Search with natural language
3. AI Search returns results with similarity scores
4. Enrich results with metadata from R2 object metadata
5. Format as MCPResponse
6. Return to client

### Storage Patterns

**R2 Object Naming:**
- Pattern: `gitingest/{org}/{repo}/summary.txt`
- Example: `gitingest/alphagov/govuk-frontend/summary.txt`
- Metadata: Stored in R2 object custom metadata (no separate DB)

**KV Cache Keys:**
- Pattern: `repo:{org}/{name}`
- Example: `repo:alphagov/govuk-frontend`
- No TTL (persist indefinitely, invalidated by pushedAt comparison)

## API Contracts

### POST /mcp/search

**Request:**
```http
POST /mcp/search HTTP/1.1
Host: govreposcrape.cloud.cns.me
Content-Type: application/json

{
  "query": "authentication methods",
  "limit": 5
}
```

**Success Response (200 OK):**
```json
{
  "results": [
    {
      "repo_url": "https://github.com/alphagov/govuk-frontend",
      "repo_org": "alphagov",
      "repo_name": "govuk-frontend",
      "snippet": "// Authentication middleware...",
      "last_updated": "2025-10-15T14:30:00Z",
      "language": "TypeScript",
      "similarity_score": 0.92,
      "github_link": "https://github.com/alphagov/govuk-frontend",
      "codespaces_link": "https://github.dev/alphagov/govuk-frontend",
      "metadata": {
        "url": "https://github.com/alphagov/govuk-frontend",
        "pushedAt": "2025-10-15T14:30:00Z",
        "org": "alphagov",
        "name": "govuk-frontend"
      }
    }
  ],
  "took_ms": 234
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
    "message": "AI Search service temporarily unavailable",
    "retry_after": 60
  }
}
```

### MCP Protocol Compliance

**Headers:**
- `X-MCP-Version: 2` (protocol version negotiation)
- `Content-Type: application/json`
- `X-Request-ID: <uuid>` (correlation ID, optional but recommended)

**CORS:**
- `Access-Control-Allow-Origin: *` (open access)
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, X-MCP-Version`

## Security Architecture

### Authentication and Authorization

**No Authentication Required:**
- MCP API is open access (no JWT, no API keys)
- Cloudflare handles abuse prevention via platform-level rate limiting

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
- Cloudflare automatic HTTPS enforcement
- No unencrypted connections

**Secrets Management:**
- Cloudflare Workers secrets for API keys (if needed)
- Environment variables via wrangler.toml (non-sensitive config)
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
- Log retention: Cloudflare Workers logs (7 days), export for long-term storage
- No secrets in logs

**Access Controls:**
- Read-only access to GitHub (no write operations)
- R2 and KV: Workers-only access (service bindings)
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
- AI Search query: <800ms (managed service)
- Result enrichment: <100ms (R2 metadata fetch)
- Network latency: <500ms (edge deployment)
- Serialization: <50ms (JSON response)
- Buffer: ~550ms for variance

**Optimization Strategies:**
- Edge deployment (Cloudflare Workers global network)
- Minimal processing (thin API wrapper)
- Parallel operations where possible (future: concurrent AI Search + metadata fetch)

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

**Smart Caching (90%+ hit rate):**
- KV cache: pushedAt comparison (only reprocess on changes)
- Observation: 10-15% of repos update daily → 85-90% cache hits
- Cache invalidation: pushedAt timestamp comparison (no TTL)

### Cost Optimization (NFR-7.1)

**Target: <£50/month**
- Workers: Free tier (100k requests/day)
- R2: ~1GB storage × £0.015/GB = £0.015/month
- KV: Free tier (1GB storage, 100k reads/day)
- AI Search: Pay-per-query (validate pricing during MVP)
- **Key:** Smart caching reduces AI Search queries by 90%

## Deployment Architecture

### Environments

**Development (Local):**
- `wrangler dev` on localhost:8787
- Uses development service bindings
- Debug logging enabled

**Staging (Cloudflare):**
- Domain: staging.govreposcrape.cloud.cns.me
- Separate R2/KV/AI Search instances
- Production-like config, test data

**Production (Cloudflare):**
- Domain: govreposcrape.cloud.cns.me
- Production service bindings
- Info-level logging only
- Monitoring and alerting active

### Deployment Process

**CI/CD Pipeline:**
- GitHub Actions (Phase 2)
- On push to main: Run tests → Deploy to staging → Manual approval → Deploy to production
- Rollback: `wrangler rollback` or redeploy previous version

**Manual Deployment (MVP):**
```bash
# Staging
wrangler deploy --env staging

# Production (after validation)
wrangler deploy --env production
```

### Infrastructure as Code

**wrangler.toml:**
- All service bindings defined
- Environment-specific overrides
- Version controlled

**Secrets:**
- `wrangler secret put JWT_SECRET` (if needed in future)
- Not in version control

### Monitoring and Alerting

**Cloudflare Analytics:**
- Request volume, latency, error rates
- Built-in dashboard

**Custom Metrics:**
- Cost per query
- Cache hit rate
- Query response time distribution

**Alerts:**
- Error rate >1%
- p95 response time >2s
- Daily query volume <10 (low adoption)

## Development Environment

### Prerequisites

**Required:**
- Node.js 20+ (LTS)
- npm 10+ or pnpm 8+
- Docker 24+ (for gitingest container)
- Cloudflare account with Workers enabled
- wrangler CLI 4.47.0+

**Optional:**
- VS Code with TypeScript ESLint extension
- Cloudflare Workers extension for VS Code

### Setup Commands

```bash
# Clone and initialize
git clone <repository-url> govreposcrape
cd govreposcrape

# Run the starter template (Story 1.1)
npm create cloudflare@latest govreposcrape -- --type hello-world --ts
cd govreposcrape
npm install

# Install additional dependencies
npm install @cloudflare/workers-types --save-dev
npm install vitest @cloudflare/vitest-pool-workers --save-dev

# Configure TypeScript (tsconfig.json)
# - strict: true
# - target: ES2022
# - module: ESNext

# Provision Cloudflare services (via dashboard or wrangler)
wrangler d1 create govreposcrape-db
wrangler kv:namespace create govreposcrape-cache
wrangler r2 bucket create govreposcrape-gitingest
# (Configure AI Search via dashboard)

# Update wrangler.toml with service IDs
# (See Project Structure section for bindings)

# Create .env.example
cat > .env.example << 'EOF'
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
EOF

# Run development server
wrangler dev

# Run tests
npm test

# Build for production
wrangler deploy --env production --dry-run
```

### Local Development Workflow

1. **Start Workers dev server:** `wrangler dev`
2. **Edit code:** Changes auto-reload
3. **Run tests:** `npm test` (watch mode: `npm test -- --watch`)
4. **Test API:** `curl http://localhost:8787/mcp/search -X POST -d '{"query":"test"}'`
5. **Deploy to staging:** `wrangler deploy --env staging`

## Architecture Decision Records (ADRs)

### ADR-001: Cloudflare Workers as Primary Platform

**Context:** Need edge compute platform with global distribution, low cost, and managed services.

**Decision:** Use Cloudflare Workers with managed R2, KV, and AI Search.

**Rationale:**
- <£50/month cost target achievable with free/low-cost tiers
- Edge deployment for <2s response time globally
- Managed AI Search validates hypothesis before custom infrastructure
- Strong TypeScript support with @cloudflare/workers-types

**Consequences:**
- Locked into Cloudflare ecosystem (acceptable for MVP)
- Container processing separate from Workers (Python gitingest)
- Migration complexity if outgrowing platform (unlikely)

### ADR-002: No Authentication for MCP API

**Context:** MCP protocol integration with Claude Desktop and GitHub Copilot.

**Decision:** Open access API with no JWT/API keys. Cloudflare handles rate limiting.

**Rationale:**
- Simplifies integration (<5 minute setup time)
- All data is public (GitHub public repos)
- No PII or sensitive information
- Cloudflare platform-level rate limiting prevents abuse

**Consequences:**
- No user tracking or usage attribution
- Potential for abuse (mitigated by Cloudflare rate limiting)
- Easier developer adoption

### ADR-003: Managed AI Search vs Custom Embeddings

**Context:** Need semantic search over 21k repositories.

**Decision:** Use Cloudflare AI Search (managed service) for MVP, defer custom embeddings to Phase 2.

**Rationale:**
- Zero-code semantic search (auto-indexing from R2)
- Validates gitingest quality hypothesis before infrastructure investment
- Saves weeks of development time
- Can migrate to custom Vectorize + embeddings if quality insufficient

**Consequences:**
- Dependent on AI Search quality (validated in Epic 3.4)
- Less control over embedding model
- Potential cost scaling with queries (monitored in Epic 6.1)

### ADR-004: Smart Caching with KV

**Context:** Reprocessing 21k repos daily with gitingest is expensive and slow.

**Decision:** Use pushedAt timestamp comparison in KV to only reprocess changed repositories.

**Rationale:**
- 90%+ cache hit rate (only 10-15% of repos update daily)
- Reduces gitingest processing by 90%
- Keeps costs <£50/month
- Simple invalidation logic (timestamp comparison)

**Consequences:**
- Stale data for unchanged repos (acceptable: content reflects last update)
- KV storage costs (negligible: free tier covers 1GB)

### ADR-005: Containerized Python for gitingest

**Context:** gitingest is a Python library, Workers are JavaScript/TypeScript.

**Decision:** Run gitingest in Docker container, separate from Workers.

**Rationale:**
- gitingest requires Python runtime
- Workers can't run Python natively
- Container enables local development and CI/CD
- Manual orchestration acceptable for MVP (automated in Phase 2)

**Consequences:**
- Two runtime environments (Workers + Container)
- Manual container execution for MVP
- Requires Docker in development environment

---

_Generated by BMAD Decision Architecture Workflow v1.3.2_
_Date: 2025-11-12_
_For: cns_
