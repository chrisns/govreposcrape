# Epic Technical Specification: Foundation & Infrastructure Setup

Date: 2025-11-12
Author: cns
Epic ID: 1
Status: Draft

---

## Overview

Epic 1 establishes the foundational infrastructure for govscraperepo on Cloudflare's platform. This epic transforms an empty repository into a deployable Cloudflare Workers project with all necessary service integrations configured and validated. It includes Workers project initialization, service bindings configuration (D1, KV, R2, Vectorize, Workers AI), TypeScript development environment setup, structured logging infrastructure, error handling utilities, and deployment pipeline with environment separation.

This epic is the prerequisite for all subsequent development work. Without this foundation, no other stories can be implemented. The architecture is optimized for the <£50/month cost constraint using Cloudflare's edge compute and managed services.

## Objectives and Scope

**In Scope:**
- Cloudflare Workers project initialization using official starter template
- Service provisioning: D1 database, KV namespace, R2 bucket, Vectorize index, Workers AI binding
- TypeScript 5.9+ configuration with strict mode enabled
- Project folder structure: src/ingestion, src/search, src/api, src/utils
- Shared TypeScript types for repos, search results, API responses
- Structured JSON logging utility with correlation IDs
- Custom error classes: ValidationError, ServiceError, APIError
- Deployment pipeline with staging and production environments
- wrangler configuration for environment-specific service bindings
- Basic health check validation
- Documentation: README, .env.example, setup instructions

**Out of Scope:**
- Container infrastructure (Epic 2: Story 2.3)
- AI Search configuration (Epic 3)
- MCP API implementation (Epic 4)
- Actual data ingestion logic (Epic 2)
- Cost monitoring dashboard (Epic 6: Story 6.1)
- Security compliance validation (Epic 6: Story 6.2)

## System Architecture Alignment

This epic implements the architectural foundation documented in `docs/architecture.md`:

**Aligned Architectural Decisions:**
- **ADR-001:** Cloudflare Workers as Primary Platform - Story 1.1 initializes Workers project
- **Decision 2:** TypeScript 5.9+ with strict mode - Story 1.2 configures tsconfig.json
- **Decision 4:** Wrangler 4.47.0+ deployment - Story 1.4 sets up deployment pipeline
- **Decision 6:** R2 + KV + D1 + Vectorize bindings - Story 1.1 provisions all services
- **Decision 7:** Error Handling with 3 error classes - Story 1.3 implements error utilities
- **Decision 8:** Structured JSON logging - Story 1.3 implements logger utility
- **Implementation Patterns:** Files (kebab-case.ts), Functions (camelCase), Constants (UPPER_SNAKE_CASE)

**Constraints Addressed:**
- Cost optimization: <£50/month target (NFR-7.1) - Cloudflare free tiers utilized
- Performance: Edge deployment foundation for <2s query latency (NFR-1.1)
- Security: HTTPS-only, no secrets in code, read-only access patterns
- TypeScript strict mode ensures type safety across entire codebase

**Project Structure Established:**
```
govreposcrape/
├── src/
│   ├── ingestion/     # Epic 2 modules
│   ├── search/        # Epic 3 modules
│   ├── api/           # Epic 4 modules
│   └── utils/         # Shared utilities (logger, errors)
├── container/         # Epic 2: Python gitingest
├── docs/              # All planning documents
├── wrangler.toml      # Service bindings configuration
├── tsconfig.json      # TypeScript configuration
├── package.json       # Dependencies
└── vitest.config.ts   # Test configuration
```

## Detailed Design

### Services and Modules

| Service/Module | Responsibility | Inputs | Outputs | Owner |
|----------------|---------------|---------|---------|-------|
| **Cloudflare Workers Project** | Core runtime environment | HTTP requests | HTTP responses | Story 1.1 |
| **D1 Database Binding** | Future: User accounts, analytics | - | Database connection | Story 1.1 |
| **KV Namespace** | Smart caching for repo metadata | Cache keys | Cached values | Story 1.1 |
| **R2 Bucket** | Store gitingest summaries | Objects | Object storage | Story 1.1 |
| **Vectorize Index** | Future: Custom embeddings fallback | Vectors | Similarity search | Story 1.1 |
| **Workers AI Binding** | Future: AI Search queries | - | AI capabilities | Story 1.1 |
| **TypeScript Configuration** | Type safety, code quality | .ts files | Compiled .js | Story 1.2 |
| **Logger Utility** | Structured logging | Log events | JSON logs | Story 1.3 |
| **Error Classes** | Error handling | Errors | Typed exceptions | Story 1.3 |
| **Deployment Pipeline** | Environment management | Code changes | Deployed Workers | Story 1.4 |

### Data Models and Contracts

**Core Types (Story 1.2: src/types.ts):**

```typescript
/**
 * Repository metadata from repos.json feed
 * Used by Epic 2: Data Ingestion
 */
export interface RepoMetadata {
  url: string;           // GitHub repository URL
  pushedAt: string;      // ISO 8601 timestamp
  org: string;           // Organization name
  name: string;          // Repository name
}

/**
 * Search result format for MCP API responses
 * Used by Epic 3-4: AI Search and MCP API
 */
export interface SearchResult {
  repo_url: string;
  repo_org: string;
  repo_name: string;
  snippet: string;
  last_updated: string;
  language?: string;
  similarity_score: number;
  github_link: string;
  codespaces_link: string;
  metadata: RepoMetadata;  // Typed per user feedback
}

/**
 * API error response format
 * Used by Epic 4: MCP API error handling
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    retry_after?: number;
  };
}
```

**Error Classes (Story 1.3: src/utils/errors.ts):**

```typescript
/**
 * Validation errors (HTTP 400)
 * Used for invalid query parameters, malformed requests
 */
export class ValidationError extends Error {
  statusCode = 400;
  code: string;

  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

/**
 * Service errors (HTTP 500/503)
 * Used for internal service failures, dependency unavailability
 */
export class ServiceError extends Error {
  statusCode: number;
  code: string;
  retryAfter?: number;

  constructor(message: string, statusCode = 500, code = 'SERVICE_ERROR', retryAfter?: number) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

/**
 * Generic API errors with custom status codes
 * Used for specific HTTP error scenarios
 */
export class APIError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
```

**Logger Context (Story 1.3: src/utils/logger.ts):**

```typescript
export interface LogContext {
  requestId?: string;      // Correlation ID for request tracing
  operation: string;        // Function/operation name
  metadata?: Record<string, unknown>;  // Additional context
}

export interface LogEntry {
  timestamp: string;        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context: LogContext;
}
```

### APIs and Interfaces

**wrangler.toml Configuration (Story 1.1):**

```toml
name = "govscraperepo"
main = "src/index.ts"
compatibility_date = "2025-11-12"
node_compat = true

# Service Bindings
[[d1_databases]]
binding = "DB"
database_name = "govscraperepo-db"
database_id = "<provisioned-id>"
# Prepared for Phase 2 user accounts/analytics

[[kv_namespaces]]
binding = "CACHE"
id = "<provisioned-id>"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "govscraperepo-gitingest"

[[vectorize]]
binding = "VECTORS"
index_name = "govscraperepo-code-index"

[[ai]]
binding = "AI"

# Environment-specific configuration
[env.staging]
name = "govscraperepo-staging"
# Separate service bindings for staging

[env.production]
name = "govscraperepo"
# Production service bindings
```

**Logger API (Story 1.3):**

```typescript
// src/utils/logger.ts

export function createLogger(baseContext: Partial<LogContext>) {
  return {
    debug(message: string, metadata?: Record<string, unknown>): void;
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
    error(message: string, metadata?: Record<string, unknown>): void;
  };
}

// Usage example:
const logger = createLogger({ operation: 'fetchRepos' });
logger.info('Fetching repositories', { count: 21000 });
```

**Retry Utility API (Story 1.3):**

```typescript
// src/utils/retry.ts

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delays = [1000, 2000, 4000]
): Promise<T>;

// Usage example:
const data = await withRetry(
  () => fetch('https://example.com/repos.json'),
  3,
  [1000, 2000, 4000]
);
```

### Workflows and Sequencing

**Story Execution Sequence:**

```
Story 1.1: Project Initialization & Service Provisioning
  ↓ (provides: wrangler.toml, service bindings, package.json)

Story 1.2: Core Project Structure & TypeScript Configuration
  ↓ (provides: folder structure, tsconfig.json, types.ts, ESLint, Prettier)

Story 1.3: Structured Logging & Error Handling Foundation
  ↓ (provides: logger.ts, errors.ts, retry.ts utilities)

Story 1.4: Deployment Pipeline & Environment Management
  ↓ (provides: deployment scripts, environment configs, health check)

→ Epic 1 Complete: Foundation ready for Epic 2 data ingestion
```

**Deployment Workflow (Story 1.4):**

```
Developer Change → Git Commit
  ↓
npm run lint && npm test
  ↓
wrangler deploy --env staging
  ↓
Staging Validation (health check, smoke tests)
  ↓
wrangler deploy --env production
  ↓
Production Health Check
  ↓
Monitor logs for errors
```

**Health Check Flow (Story 1.4):**

```
GET /health
  ↓
Validate service connectivity:
  - KV namespace accessible
  - R2 bucket accessible
  - Vectorize index accessible
  - D1 database accessible (if used)
  ↓
Return 200 OK with service status
  OR
Return 503 Service Unavailable with failed services
```

## Non-Functional Requirements

### Performance

**NFR-1.1: Query Response Time (<2s p95)**
- **Foundation Impact:** Epic 1 establishes edge deployment via Cloudflare Workers
- **Edge Compute:** Workers execute at Cloudflare's 330+ data centers globally
- **Cold Start:** Workers cold start <10ms (faster than container-based platforms)
- **Target:** Foundation supports <2s end-to-end latency goal (most latency in Epic 3: AI Search)

**NFR-1.3: Initial Seeding Time (<6 hours for 21k repos)**
- **Foundation Impact:** Not directly addressed (Epic 2: parallelization)
- **Preparation:** Epic 1 provisioning enables future Epic 2 container execution

**Measurement:**
- Story 1.4: Health check endpoint measures service response times
- Logging framework captures all operation durations

### Security

**NFR-2.1: NCSC Secure Coding Standards**
- **TypeScript Strict Mode:** Story 1.2 enables strict type checking (prevents type-related vulnerabilities)
- **Input Validation:** Error classes (Story 1.3) enable structured validation
- **No eval/exec:** TypeScript configuration prevents dangerous patterns
- **HTTPS-only:** Cloudflare Workers enforce HTTPS (Story 1.1)
- **Secrets Management:** Story 1.1 documents environment variables in .env.example (not committed)
- **Read-only Access:** Architecture pattern (no write operations to GitHub)

**NFR-2.3: Audit Logging**
- **Structured Logging:** Story 1.3 implements JSON logging with correlation IDs
- **Log Retention:** Cloudflare Workers logs (7 days default), exportable to long-term storage
- **Log Format:** ISO 8601 timestamps, operation names, request IDs, metadata

**NFR-2.5: Dependency Security**
- **Package Lock:** Story 1.1 generates package-lock.json for reproducible builds
- **Security Scanning:** Story 6.2 (Epic 6) will configure npm audit and Dependabot
- **Version Pinning:** Dependencies specified with minimum versions (e.g., typescript@^5.9.0)

### Reliability/Availability

**NFR-6.1: 99.9% Uptime Target**
- **Cloudflare Workers SLA:** 99.99% uptime (exceeds requirement)
- **No Single Point of Failure:** Workers execute across multiple data centers
- **Automatic Failover:** Cloudflare routing handles data center failures
- **Managed Services:** D1, KV, R2, Vectorize all have high availability guarantees

**NFR-6.2: Error Handling**
- **Story 1.3 Implementation:**
  - Exponential backoff retry logic (3 attempts: 1s, 2s, 4s)
  - Graceful degradation (log errors, return partial results when possible)
  - Clear error messages for debugging

**Deployment Safety (Story 1.4):**
- **Blue-Green Deployment:** wrangler supports instant rollback
- **Health Checks:** Validate deployment before routing traffic
- **Environment Separation:** Staging validates changes before production

### Observability

**NFR-8.2: Operational Excellence**
- **Structured JSON Logs:** Story 1.3 enables log aggregation and parsing
- **Correlation IDs:** Trace requests across distributed services
- **Log Levels:** debug (development), info (production), warn, error
- **Cloudflare Workers Analytics:** Built-in metrics (requests, latency, errors)

**Required Signals:**
- Request count (per endpoint, per environment)
- Response time (p50, p95, p99)
- Error rate (percentage of failed requests)
- Service availability (health check results)
- Cache hit rate (Epic 2: KV cache performance)

**Log Examples:**
```json
{
  "timestamp": "2025-11-12T10:00:00.000Z",
  "level": "info",
  "message": "Health check passed",
  "context": {
    "requestId": "req-abc123",
    "operation": "healthCheck",
    "metadata": {
      "kvAccessible": true,
      "r2Accessible": true,
      "responseTimeMs": 45
    }
  }
}
```

## Dependencies and Integrations

**Core Dependencies (Story 1.1: package.json):**

```json
{
  "dependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "typescript": "^5.9.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "vitest": "^4.0.0",
    "wrangler": "^4.47.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

**Cloudflare Platform Services (Story 1.1):**
- **Workers Runtime:** JavaScript V8 isolates, edge compute
- **D1:** SQLite database (prepared for Phase 2)
- **KV:** Key-value store for caching (Epic 2)
- **R2:** Object storage for gitingest summaries (Epic 2)
- **Vectorize:** Vector database for future custom embeddings (Epic 3 fallback)
- **Workers AI:** Future AI Search integration (Epic 3)

**External Integrations (Future Epics):**
- **GitHub API:** Epic 2 (repos.json fetching)
- **gitingest Python Library:** Epic 2 (containerized processing)
- **Cloudflare AI Search:** Epic 3 (managed semantic search)
- **MCP v2 Protocol:** Epic 4 (AI assistant integration)

**Development Tools (Story 1.2):**
- **TypeScript 5.9+:** Type safety, strict mode
- **ESLint:** Code quality, style enforcement
- **Prettier:** Code formatting
- **Vitest 4.0+:** Testing framework with Workers pool
- **Husky + lint-staged (optional):** Pre-commit hooks

## Acceptance Criteria (Authoritative)

**AC-1.1.1:** Cloudflare Workers project initialized using `npm create cloudflare@latest`
**AC-1.1.2:** wrangler.toml contains valid configuration for all service bindings (D1, KV, R2, Vectorize, Workers AI)
**AC-1.1.3:** All Cloudflare services provisioned with appropriate names (govscraperepo-*)
**AC-1.1.4:** Service binding IDs documented in wrangler.toml
**AC-1.1.5:** Test Workers script validates connectivity to each service
**AC-1.1.6:** npm dependencies installed and package-lock.json generated
**AC-1.1.7:** README exists with setup instructions

**AC-1.2.1:** Folder structure created: src/ingestion, src/search, src/api, src/utils
**AC-1.2.2:** TypeScript configured with strict mode enabled in tsconfig.json
**AC-1.2.3:** @cloudflare/workers-types installed for Workers API types
**AC-1.2.4:** Shared types defined in src/types.ts (RepoMetadata, SearchResult, ErrorResponse)
**AC-1.2.5:** ESLint configured for code quality
**AC-1.2.6:** Prettier configured for consistent formatting
**AC-1.2.7:** All types include JSDoc comments for developer clarity

**AC-1.3.1:** Logger utility outputs JSON-formatted logs
**AC-1.3.2:** Log entries include: timestamp, level, message, context (requestId, operation, metadata)
**AC-1.3.3:** Logger supports correlation IDs for request tracing
**AC-1.3.4:** Custom error classes exist: ValidationError (400), ServiceError (500/503), APIError (custom)
**AC-1.3.5:** Error responses follow PRD format: `{ error: { code, message, retry_after? } }`
**AC-1.3.6:** Logger importable and usable across all modules
**AC-1.3.7:** Retry utility implements exponential backoff (3 attempts: 1s, 2s, 4s delays)

**AC-1.4.1:** npm scripts exist for: dev (local), deploy:staging, deploy:production
**AC-1.4.2:** wrangler.toml supports environment-specific configuration (staging, production)
**AC-1.4.3:** Staging and production use separate service bindings
**AC-1.4.4:** Health check endpoint returns 200 OK when services accessible
**AC-1.4.5:** Health check validates: KV, R2, Vectorize, D1 connectivity
**AC-1.4.6:** .env.example documents all required environment variables
**AC-1.4.7:** .gitignore excludes secrets and environment files
**AC-1.4.8:** Deployment process documented in README

## Traceability Mapping

| AC | Spec Section | Component/API | Test Idea |
|----|--------------|---------------|-----------|
| AC-1.1.1 | Detailed Design: Services | Cloudflare Workers Project | Verify wrangler.toml exists, npm install succeeds |
| AC-1.1.2 | APIs: wrangler.toml | wrangler.toml | Parse toml, validate all binding sections present |
| AC-1.1.3 | Detailed Design: Services | Service bindings | Run wrangler cli commands to list provisioned services |
| AC-1.1.4 | APIs: wrangler.toml | wrangler.toml | Check binding IDs are not placeholder values |
| AC-1.1.5 | Workflows: Health Check | Health check endpoint | Deploy test Worker, call each service, verify response |
| AC-1.1.6 | Dependencies | package.json, package-lock.json | Verify lock file exists, dependencies match package.json |
| AC-1.1.7 | Dependencies | README.md | Check README contains setup steps |
| AC-1.2.1 | System Architecture | Project structure | Check folders exist: src/ingestion, src/search, src/api, src/utils |
| AC-1.2.2 | NFR: Security | tsconfig.json | Parse tsconfig, verify strict: true |
| AC-1.2.3 | Dependencies | @cloudflare/workers-types | Check package.json includes dependency |
| AC-1.2.4 | Data Models | src/types.ts | Import types, verify RepoMetadata, SearchResult, ErrorResponse interfaces |
| AC-1.2.5 | Dependencies | ESLint config | Run eslint, verify no critical errors |
| AC-1.2.6 | Dependencies | Prettier config | Run prettier check, verify formatting |
| AC-1.2.7 | Data Models | src/types.ts | Parse types file, check for JSDoc comments |
| AC-1.3.1 | APIs: Logger | src/utils/logger.ts | Call logger, verify JSON output format |
| AC-1.3.2 | Data Models: LogEntry | src/utils/logger.ts | Parse log output, verify required fields present |
| AC-1.3.3 | APIs: Logger | LogContext interface | Call logger with requestId, verify included in output |
| AC-1.3.4 | Data Models: Error Classes | src/utils/errors.ts | Import classes, verify statusCode properties |
| AC-1.3.5 | APIs: Error Response | ErrorResponse interface | Throw error, catch, verify format matches PRD |
| AC-1.3.6 | Workflows: Module Import | Logger usage example | Import logger in different module, verify no errors |
| AC-1.3.7 | APIs: Retry Utility | src/utils/retry.ts | Call withRetry with failing function, verify 3 attempts with correct delays |
| AC-1.4.1 | Workflows: Deployment | package.json scripts | Check package.json scripts section |
| AC-1.4.2 | APIs: wrangler.toml | wrangler.toml environments | Parse toml, verify [env.staging] and [env.production] sections |
| AC-1.4.3 | APIs: wrangler.toml | Environment bindings | Verify staging/production have different service binding IDs |
| AC-1.4.4 | Workflows: Health Check | Health endpoint | Deploy Worker, GET /health, verify 200 OK |
| AC-1.4.5 | Workflows: Health Check | Service connectivity | Health check tests each binding, returns status per service |
| AC-1.4.6 | Dependencies | .env.example | Check file exists, contains CLOUDFLARE_ACCOUNT_ID, API token docs |
| AC-1.4.7 | NFR: Security | .gitignore | Verify .env, .env.local, secrets in .gitignore |
| AC-1.4.8 | Dependencies | README.md | Check deployment section in README |

## Risks, Assumptions, Open Questions

### Risks

**Risk-1:** Cloudflare service provisioning may fail due to account limits or regional restrictions
- **Mitigation:** Use personal Cloudflare account with sufficient limits, verify account status before provisioning
- **Probability:** Low
- **Impact:** High (blocks all development)

**Risk-2:** TypeScript strict mode may reveal type errors in Cloudflare Workers types
- **Mitigation:** Use latest @cloudflare/workers-types, add type assertions where necessary
- **Probability:** Medium
- **Impact:** Low (solvable with type definitions)

**Risk-3:** D1 database binding provisioned but unused in MVP (potential confusion)
- **Mitigation:** Add comment to wrangler.toml: "Prepared for Phase 2 user accounts/analytics"
- **Probability:** High (identified in implementation-readiness-report)
- **Impact:** Low (documentation issue, no cost impact)

**Risk-4:** Vectorize index provisioned but not directly used (AI Search manages vectors)
- **Mitigation:** Keep provisioned as fallback for Phase 2 custom embeddings if needed
- **Probability:** High (intentional forward-planning)
- **Impact:** None (Preview service, minimal/zero cost)

### Assumptions

**Assumption-1:** Cloudflare Workers free tier sufficient for MVP development (<100k requests/day)
- **Validation:** Story 6.1 (cost monitoring) will validate actual usage

**Assumption-2:** wrangler CLI 4.47.0+ available and compatible with TypeScript 5.9+
- **Validation:** Verified current versions during architecture workflow

**Assumption-3:** Development machine has Node.js 18+ and npm/pnpm installed
- **Validation:** Document in README prerequisites

**Assumption-4:** Health check endpoint provides sufficient deployment validation
- **Validation:** Story 1.4 will test connectivity to all services

**Assumption-5:** Separate service bindings for staging/production is acceptable cost
- **Validation:** Free tier allows multiple namespaces/buckets, confirmed in architecture

### Open Questions

**Question-1:** Should we implement pre-commit hooks (Husky + lint-staged) in Story 1.2 or defer?
- **Decision Needed:** Optional in current AC, could add if team prefers stricter enforcement
- **Recommendation:** Implement (low effort, high value for code quality)

**Question-2:** Should health check endpoint validate D1 database connectivity if unused in MVP?
- **Decision Needed:** Story 1.4 AC includes D1 validation, but it's unused
- **Recommendation:** Include validation to ensure forward compatibility for Phase 2

**Question-3:** Should we provision separate Vectorize indexes for staging/production?
- **Decision Needed:** Current AC doesn't specify environment separation for Vectorize
- **Recommendation:** Use single index for MVP (Preview service, likely free), separate in Phase 2

## Test Strategy Summary

### Test Levels

**Unit Tests (Vitest 4.0+):**
- **Coverage Target:** 80%+ for utility modules (logger, errors, retry)
- **Framework:** Vitest with @cloudflare/vitest-pool-workers for Workers environment
- **Files:** src/utils/logger.test.ts, src/utils/errors.test.ts, src/utils/retry.test.ts
- **Scope:** Individual functions, error class behavior, log formatting, retry logic

**Integration Tests:**
- **Coverage Target:** Service binding connectivity validation
- **Framework:** Vitest integration tests with Workers runtime
- **Files:** test/integration/service-bindings.test.ts
- **Scope:** KV read/write, R2 upload/download, Vectorize query, D1 query

**Deployment Tests:**
- **Coverage Target:** End-to-end deployment validation
- **Framework:** Manual testing + automated smoke tests
- **Files:** scripts/smoke-test.sh, test/deployment/health-check.test.ts
- **Scope:** wrangler deploy succeeds, health check passes, service connectivity

### Test Data

- **Mock Services:** Vitest mocks for KV/R2/Vectorize during unit tests
- **Test Bindings:** Separate Cloudflare services for staging environment
- **Sample Data:** Mock RepoMetadata objects, sample log entries

### Edge Cases to Cover

1. **Logger edge cases:**
   - Very long log messages (>1MB)
   - Missing correlation ID (should generate one)
   - Deeply nested metadata objects
   - Unicode characters in log messages

2. **Error handling edge cases:**
   - Error thrown during retry (verify exponential backoff)
   - Service timeout (verify ServiceError with 503)
   - Malformed API request (verify ValidationError with 400)

3. **Deployment edge cases:**
   - Health check when one service unavailable (verify 503 with details)
   - Deployment to staging without production credentials (verify environment separation)
   - Rollback scenario (verify wrangler rollback works)

### Framework Setup

**Vitest Configuration (vitest.config.ts):**
```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' }
      }
    }
  }
});
```

**Test Commands (Story 1.2):**
- `npm test` - Run all tests
- `npm run test:unit` - Unit tests only
- `npm run test:integration` - Integration tests (requires service bindings)
- `npm run test:coverage` - Generate coverage report

### Acceptance Criteria Test Mapping

Each AC has a corresponding test:
- AC-1.1.* → test/story-1.1.test.ts (project initialization tests)
- AC-1.2.* → test/story-1.2.test.ts (TypeScript config tests)
- AC-1.3.* → test/story-1.3.test.ts (logger and error tests)
- AC-1.4.* → test/story-1.4.test.ts (deployment tests)

**Test Success Criteria:**
- All unit tests pass (npm test)
- Code coverage ≥80% for utility modules
- Integration tests validate service connectivity
- Health check returns 200 OK in staging environment
- Deployment to production succeeds without errors
