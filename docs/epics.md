# govreposcrape - Epic Breakdown

**Author:** cns
**Date:** 2025-11-12
**Project Level:** Greenfield
**Target Scale:** MVP - Weeks 1-2

---

## Overview

This document provides the complete epic and story breakdown for govreposcrape, decomposing the requirements from the [PRD](./PRD.md) into implementable stories.

### Epic Summary

This project follows a **write path / read path separation** architecture pattern optimized for Cloudflare's edge platform:

**Epic 1: Foundation & Infrastructure Setup** - Project initialization, Cloudflare Workers configuration, service bindings, deployment pipeline. Sets up the foundation that enables all subsequent development.

**Epic 2: Data Ingestion Pipeline (Write Path)** - Repository discovery from repos.json feed, gitingest container processing with parallelization, smart caching via R2 metadata, automated data pipeline.

**Epic 3: AI Search Integration (Managed Service)** - Cloudflare AI Search configuration to auto-index R2 bucket contents, query API integration, baseline performance validation.

**Epic 4: MCP API Server (Read Path)** - MCP v2 protocol compliance, semantic search endpoint, result formatting with rich metadata, error handling and logging.

**Epic 5: Developer Experience & Documentation** - MCP configuration guides for Claude Desktop, OpenAPI specification, integration examples, testing tools.

**Epic 6: Operational Excellence** - Structured logging, cost monitoring, security compliance (NCSC standards), error alerting, health checks.

**Sequencing Rationale:** Epic 1 establishes foundation (must be first for greenfield). Epics 2-3 build the data pipeline and search capability. Epic 4 exposes the read API. Epics 5-6 enable developer adoption and production readiness.

---

## Epic 1: Foundation & Infrastructure Setup

**Goal:** Establish the foundational infrastructure for govscraperepo on Cloudflare's platform, including Workers project initialization, service bindings configuration (Vectorize, D1, R2, KV, Workers AI), environment setup, and basic deployment pipeline. This epic creates the technical foundation that enables all subsequent development work.

**Value:** Without this foundation, no other stories can be implemented. This epic transforms an empty repository into a deployable Cloudflare Workers project with all necessary service integrations configured and validated.

---

### Story 1.1: Project Initialization & Cloudflare Service Provisioning

As a **platform engineer**,
I want **to initialize the Cloudflare Workers project with all required service bindings**,
So that **we have a working foundation for building the data ingestion and API layers**.

**Acceptance Criteria:**

**Given** a new repository with no existing infrastructure
**When** I initialize the project with Cloudflare Workers template
**Then** the project has a valid wrangler.toml configuration file
**And** npm dependencies are installed and locked
**And** the project can be deployed to Cloudflare Workers

**Given** the Workers project is initialized
**When** I provision Cloudflare services (D1, KV, Vectorize, R2)
**Then** all service bindings are created with appropriate names
**And** wrangler.toml contains all binding IDs
**And** I can verify connectivity to each service via test Workers script

**And** The project structure follows Cloudflare Workers best practices
**And** Environment variables are documented in .env.example
**And** Basic README exists with setup instructions

**Prerequisites:** None (this is Story 1.1 - the foundation)

**Technical Notes:**
- Use `npm create cloudflare@latest` for Workers template
- Provision services: D1 database, KV namespace, Vectorize index (768-dim, cosine), R2 bucket
- Service naming convention: `govscraperepo-*`
- wrangler.toml must include all bindings for type safety
- Document service IDs for team reference
- This story establishes the foundation for all subsequent work

---

### Story 1.2: Core Project Structure & TypeScript Configuration

As a **developer**,
I want **a well-organized project structure with TypeScript configuration**,
So that **the codebase is maintainable and type-safe from day one**.

**Acceptance Criteria:**

**Given** the Cloudflare Workers project is initialized (Story 1.1)
**When** I create the project folder structure
**Then** folders exist for: src/ingestion, src/search, src/api, src/utils
**And** TypeScript is configured with strict mode enabled
**And** @cloudflare/workers-types are installed for Workers APIs

**Given** the project structure exists
**When** I define shared types for repos, search results, and API responses
**Then** types are centralized in src/types.ts
**And** all types follow the schemas documented in PRD (search result format, error responses)
**And** Types include JSDoc comments for developer clarity

**And** ESLint is configured for code quality
**And** Prettier is configured for consistent formatting
**And** Git pre-commit hooks enforce linting (optional: husky + lint-staged)

**Prerequisites:** Story 1.1 (Project Initialization)

**Technical Notes:**
- Folder structure:
  - src/ingestion/ - Data pipeline code (repos fetcher, cache, orchestrator)
  - src/search/ - AI Search integration
  - src/api/ - MCP endpoints
  - src/utils/ - Logger, error handlers, helpers
- TypeScript strict mode for production quality
- Workers-specific types from @cloudflare/workers-types
- Shared types prevent duplication and ensure API consistency

---

### Story 1.3: Structured Logging & Error Handling Foundation

As a **developer**,
I want **a structured logging system and error handling utilities**,
So that **debugging and monitoring are effective from the start**.

**Acceptance Criteria:**

**Given** the core project structure exists (Story 1.2)
**When** I implement a structured logger utility
**Then** the logger outputs JSON-formatted logs
**And** log entries include: timestamp, level (debug/info/warn/error), message, context
**And** the logger supports correlation IDs for request tracing

**Given** the structured logger exists
**When** I create error handling utilities
**Then** custom error classes exist for: APIError, ValidationError, ServiceError
**And** errors include HTTP status codes and user-friendly messages
**And** error responses follow PRD format: `{ error: { code, message, retry_after? } }`

**And** Logger can be imported and used across all modules
**And** Examples demonstrate usage patterns
**And** Logs are compatible with Cloudflare Workers log streaming

**Prerequisites:** Story 1.2 (Project Structure)

**Technical Notes:**
- Structured JSON logs enable parsing by log aggregators
- Context fields: requestId, operation, metadata
- Error handling patterns from PRD (FR-3, API error codes)
- Cloudflare Workers supports console.log JSON streaming
- This logging foundation supports NFR-2.3 (audit logging) and NFR-8.2 (operational excellence)

---

### Story 1.4: Deployment Pipeline & Environment Management

As a **DevOps engineer**,
I want **a deployment pipeline with environment separation**,
So that **we can safely deploy changes without impacting production**.

**Acceptance Criteria:**

**Given** the Workers project is configured (Story 1.1-1.3)
**When** I set up deployment scripts
**Then** npm scripts exist for: dev (local), deploy:staging, deploy:production
**And** wrangler.toml supports environment-specific configuration
**And** Staging and production use separate service bindings

**Given** deployment scripts exist
**When** I deploy to staging environment
**Then** the Worker deploys successfully
**And** health check endpoint returns 200 OK
**And** Service bindings are accessible from the Worker

**And** .env.example documents all required environment variables
**And** .gitignore excludes secrets and environment files
**And** Deployment process is documented in README

**Prerequisites:** Story 1.1, 1.2, 1.3 (Complete foundation)

**Technical Notes:**
- Environments: development (local), staging (cloudflare), production (cloudflare)
- Use wrangler environments feature for separation
- Staging uses separate D1/KV/R2/Vectorize instances to avoid contaminating production
- Health check validates: Workers execution, service connectivity
- This enables safe iteration during MVP development
- Document CLOUDFLARE_ACCOUNT_ID and API token requirements

---

## Epic 2: Data Ingestion Pipeline (Write Path)

**Goal:** Build the automated data ingestion pipeline that fetches UK government repositories from repos.json feed, generates gitingest summaries, implements smart caching to avoid expensive regeneration, and stores processed data in Cloudflare R2. This epic implements the "write path" that prepares code for semantic search.

**Value:** Transforms raw repository URLs into searchable, LLM-ready code summaries. Smart caching keeps costs <£50/month by avoiding unnecessary gitingest regeneration (90%+ cache hit rate target). Parallelization support enables processing ~21k repos in <6 hours.

---

### Story 2.1: Repository Discovery - Fetch and Parse repos.json Feed

As a **data engineer**,
I want **to fetch and parse the repos.json feed from xgov-opensource-repo-scraper**,
So that **I have the authoritative list of UK government repositories to process**.

**Acceptance Criteria:**

**Given** the foundation infrastructure exists (Epic 1 complete)
**When** I implement the repos.json fetcher module
**Then** the module fetches repos.json over HTTPS from the feed URL
**And** JSON is parsed with error handling for malformed data
**And** required fields are extracted: url, pushedAt, org, repo name

**Given** the repos.json feed is unavailable (network error, timeout)
**When** the fetcher encounters an error
**Then** it retries with exponential backoff (3 attempts: 1s, 2s, 4s delays)
**And** structured logs record each retry attempt
**And** after 3 failures, it returns a clear error message

**And** The fetcher returns an array of repository objects with typed interfaces
**And** Basic validation ensures required fields are present
**And** Statistics are logged: total repos fetched, parse errors, validation failures

**Prerequisites:** Story 1.1, 1.2, 1.3 (Foundation complete)

**Technical Notes:**
- Feed URL: https://github.com/uk-x-gov-software-community/xgov-opensource-repo-scraper (repos.json location)
- Exponential backoff prevents hammering the feed on transient failures
- TypeScript interface: `Repository { url: string; pushedAt: string; org: string; name: string }`
- Consider fetch timeout (30s default)
- Module location: src/ingestion/repos-fetcher.ts
- This implements FR-1.1 from PRD

---

### Story 2.2: Smart Caching with KV - Avoid Unnecessary Reprocessing

As a **cost-conscious engineer**,
I want **to cache repository metadata in KV and only reprocess when pushedAt changes**,
So that **we achieve 90%+ cache hit rate and keep infrastructure costs minimal**.

**Acceptance Criteria:**

**Given** a repository with pushedAt timestamp from repos.json (Story 2.1)
**When** I check if the repository needs processing
**Then** the cache module queries KV for the repo's last processed timestamp
**And** if pushedAt matches cached value, the repo is marked as "cached" (skip processing)
**And** if pushedAt differs or no cache exists, the repo is marked as "needs processing"

**Given** a repository has been successfully processed
**When** I update the cache
**Then** the KV store records: repoKey → { pushedAt, processedAt, status: "complete" }
**And** KV keys follow pattern: `repo:{org}/{name}`
**And** cache writes are atomic and handle failures gracefully

**And** Cache statistics are tracked: total checks, hits, misses, hit rate %
**And** Logging reports cache performance: "Cache hit rate: 92.3% (18,450/20,000)"
**And** Cache module has methods: checkCache(), updateCache(), getCacheStats()

**Prerequisites:** Story 2.1 (Repository Discovery)

**Technical Notes:**
- KV namespace binding from wrangler.toml (Epic 1)
- Cache key structure: `repo:alphagov/govuk-frontend`
- Cached value JSON: `{ pushedAt: "2025-10-15T14:30:00Z", processedAt: "2025-11-12T10:00:00Z", status: "complete" }`
- 90%+ hit rate target based on observation: only 10-15% of repos update daily
- Module location: src/ingestion/cache.ts
- This implements FR-1.3 Smart Caching from PRD

---

### Story 2.3: Container-Based gitingest Processing with Retry Logic

As a **data pipeline engineer**,
I want **a containerized environment to run gitingest Python library on repository URLs**,
So that **we can generate LLM-ready code summaries for semantic search**.

**Acceptance Criteria:**

**Given** a repository marked as "needs processing" from cache check (Story 2.2)
**When** I execute gitingest processing on the repository URL
**Then** the container runs Python 3.11 with gitingest library installed
**And** gitingest generates a comprehensive code summary (structure, key files, dependencies)
**And** processing handles repositories of varying sizes (10KB to 100MB+)

**Given** gitingest processing may fail (timeout, network error, malformed repo)
**When** processing encounters an error
**Then** it retries up to 3 times with exponential backoff
**And** timeouts are enforced (5 minutes max per repo)
**And** failures are logged with repo URL and error details
**And** processing continues with next repository (fail-safe)

**And** Container has Dockerfile with: Python 3.11, gitingest, boto3 for R2 access
**And** Container accepts environment variables: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY
**And** Container has CLI entrypoint: `python ingest.py <repo-url>`
**And** Processing statistics are logged: successful, failed, average time per repo

**Prerequisites:** Story 2.1, 2.2 (Repository discovery and caching)

**Technical Notes:**
- Docker container separate from Cloudflare Workers (Workers can't run Python/gitingest)
- gitingest Python library: `pip install gitingest`
- Timeout handling critical: some large repos (100MB+) can take 5+ minutes
- Exponential backoff: 1s, 2s, 4s between retries
- Module location: container/ingest.py (separate from src/)
- This implements FR-1.2 gitingest Summary Generation from PRD
- NFR-1.3: Average ~10s per repo → 21k repos = 58 hours sequential (parallelization in Story 2.5)

---

### Story 2.4: R2 Storage with Metadata - Store Summaries and Tracking Data

As a **storage engineer**,
I want **to store gitingest summaries in R2 with custom metadata for tracking**,
So that **AI Search can index the content and we can validate caching logic**.

**Acceptance Criteria:**

**Given** a gitingest summary has been generated (Story 2.3)
**When** I upload the summary to R2
**Then** the object is stored at path: `gitingest/{org}/{repo}/summary.txt`
**And** custom metadata is attached: `pushedAt`, `url`, `processedAt` timestamp
**And** content-type is set to `text/plain` for AI Search compatibility

**Given** an R2 upload may fail (network error, service unavailable)
**When** upload encounters an error
**Then** it retries with exponential backoff (3 attempts)
**And** failure is logged with repo details and error message
**And** failed uploads don't block processing of other repositories

**And** R2 module has methods: uploadSummary(org, repo, content, metadata), getSummary(org, repo)
**And** R2 bindings use credentials from environment variables
**And** Upload statistics are logged: total uploaded, failed, total storage size

**Prerequisites:** Story 2.3 (gitingest processing)

**Technical Notes:**
- R2 bucket binding from wrangler.toml (Epic 1)
- Object path structure enables organization: `gitingest/alphagov/govuk-frontend/summary.txt`
- Custom metadata stored in R2 object metadata (no separate database needed)
- Metadata example: `{ pushedAt: "2025-10-15T14:30:00Z", url: "https://github.com/alphagov/govuk-frontend", processedAt: "2025-11-12T10:05:23Z" }`
- R2 storage cost: ~1GB for 21k repos × 50KB avg = effectively free tier
- Module location: container/r2_client.py (Python for container), src/storage/ (TypeScript for Workers read access)
- This completes FR-1.3 Smart Caching implementation

---

### Story 2.5: Parallel Execution Support - CLI Arguments for Batch Processing

As a **performance engineer**,
I want **CLI arguments for batch-size and offset to enable parallel container execution**,
So that **we can process ~21k repos in <6 hours instead of 58 hours sequential**.

**Acceptance Criteria:**

**Given** the container supports sequential processing (Story 2.3)
**When** I add CLI arguments `--batch-size=N --offset=M`
**Then** the container processes every Nth repository starting at offset M
**And** example: `--batch-size=10 --offset=0` processes repos [0, 10, 20, 30...]
**And** example: `--batch-size=10 --offset=1` processes repos [1, 11, 21, 31...]

**Given** I launch 10 containers in parallel with offsets 0-9
**When** all containers complete processing
**Then** all 21,000 repositories have been processed exactly once
**And** processing completes in ~6 hours (10× speedup from ~58 hours sequential)
**And** each container logs its progress: "Processing batch 10, offset 3: 2,100 repos"

**And** CLI usage is documented in README with examples
**And** Container has `--help` flag explaining arguments
**And** Parallel execution prevents duplicate processing (each container gets unique subset)
**And** Statistics aggregate across all containers: total processed, cache hits, failures

**Prerequisites:** Story 2.1, 2.2, 2.3, 2.4 (Complete pipeline)

**Technical Notes:**
- Parallelization strategy: Modulo arithmetic (batch-size=10, offset=0 → repos where index % 10 == 0)
- 10 parallel containers = 10× speedup → 58 hours ÷ 10 = ~5.8 hours
- Initial seeding: 21k repos × 10s avg ÷ 10 parallel = ~6 hours (within MVP timeline)
- Each container is independent (no coordination needed, fail-safe)
- Example command: `docker run govscraperepo-ingest --batch-size=10 --offset=0`
- Run locally for MVP (manual execution), migrate to GitHub Actions matrix in Phase 2
- This implements NFR-1.3 and NFR-3.4 from PRD (parallelization required for MVP)

---

### Story 2.6: Ingestion Orchestrator - End-to-End Pipeline Integration

As a **pipeline engineer**,
I want **an orchestrator that coordinates the full ingestion pipeline**,
So that **the complete workflow (fetch → cache check → gitingest → R2 upload) runs smoothly**.

**Acceptance Criteria:**

**Given** all pipeline components exist (Stories 2.1-2.5)
**When** I run the orchestrator
**Then** it executes the pipeline in order: fetch repos.json → check cache → process uncached → upload to R2
**And** progress is reported periodically: "Processed 500/21,000 repos (2.4%), cache hit rate: 91.2%"
**And** errors don't halt the entire pipeline (fail-safe: log and continue)

**Given** the pipeline completes
**When** I review the final statistics
**Then** logs show: total repos, cached (skipped), processed (gitingest), failed, cache hit rate, total time
**And** example: "Pipeline complete: 21,000 total, 19,000 cached (90.5%), 1,800 processed, 200 failed, completed in 5h 47m"

**And** Orchestrator supports dry-run mode: `--dry-run` (simulate without processing)
**And** Orchestrator has graceful shutdown on SIGTERM (save progress, cleanup)
**And** Final summary is logged in structured JSON for automated parsing

**Prerequisites:** All Story 2.1-2.5 (Complete pipeline components)

**Technical Notes:**
- Orchestrator coordinates: repos-fetcher → cache → gitingest → r2-storage
- Module location: container/orchestrator.py
- Entry point: `python orchestrator.py --batch-size=10 --offset=0 [--dry-run]`
- Progress logging every 100 repos processed
- Statistics tracking for observability: success rate, cache efficiency, processing time
- This completes Epic 2's data ingestion pipeline
- Pipeline runs on-demand for MVP, automated in Phase 2 (GitHub Actions)

---

### Epic 2: Lessons Learned & Architecture Decisions

**Architecture Decisions Made During Implementation:**

1. **Summary Size Limit: 512KB Maximum Per Repository**
   - **Decision:** Limit both individual file sizes and total summary size to 512KB (524288 bytes)
   - **Rationale:** Optimize for LLM context windows and prevent memory issues
   - **Implementation:** Two-layer approach:
     - Input layer: `max_file_size=524288` parameter in gitingest calls
     - Output layer: Post-processing truncation at 512KB boundary (container/ingest.py:360-376)
   - **Impact:** Ensures consistent performance across all 20,587 repos, prevents timeout/memory issues

2. **Gitingest API Contract: IngestionResult Named Tuple**
   - **Discovery:** gitingest library returns `IngestionResult` named tuple with `.summary` attribute (not plain string)
   - **Implementation:** Backwards-compatible handling with attribute detection (container/ingest.py:330-342)
   - **Code pattern:** `if hasattr(result, 'summary'): summary = result.summary`
   - **Documentation:** API contract now documented for future maintainers

3. **Parallel Execution Strategy: 40 Workers**
   - **Original Plan:** 10 parallel workers
   - **Actual Implementation:** 40 workers (4× increase from original plan)
   - **Rationale:** Better CPU utilization on multi-core systems
   - **Performance:** 40 workers × batch-size=10 = ~515 repos per worker (20,587 total)
   - **Execution time:** Projected ~5-7 hours for full ingestion run

**Lessons Learned:**

1. **Integration Tests Critical for Third-Party API Contracts**
   - **Issue:** Mocked unit tests didn't catch gitingest API contract change
   - **Impact:** Runtime discovery that `ingest()` returns `IngestionResult` named tuple, not string
   - **Resolution:** Added backwards-compatible handling with `.summary` attribute check
   - **Takeaway:** Integration tests with real library dependencies would have caught this earlier
   - **Action Item:** Consider integration test suite that runs against actual dependencies (not just mocks)

2. **Docker .env File Limitations**
   - **Issue:** Docker --env-file does not support variable substitution (e.g., `${VARIABLE}` syntax)
   - **Impact:** Cannot use `${CLOUDFLARE_ACCOUNT_ID}` in R2_ENDPOINT URL
   - **Resolution:** Use literal values in .env file
   - **Documentation:** Updated .env.example with clear instructions about this limitation
   - **Takeaway:** Document platform-specific configuration limitations early

3. **File Size Limits Essential for Production Reliability**
   - **Observation:** Some repos contain extremely large generated files (>10MB)
   - **Impact:** Without limits, could cause timeouts, memory exhaustion, and inconsistent performance
   - **Solution:** 512KB limit aligns with LLM token limits and ensures predictable performance
   - **Takeaway:** Always implement size limits when processing user-generated/external content

---

## Epic 3: AI Search Integration (Managed Service Layer)

**Goal:** Configure Cloudflare AI Search to automatically index R2 bucket contents, enabling semantic search over UK government code without writing custom embedding or vectorization code. This epic validates the managed service approach and establishes baseline search performance.

**Value:** Zero-code semantic search infrastructure. Cloudflare AI Search handles embedding generation, vectorization, indexing, and query rewriting automatically. This validates the gitingest quality hypothesis before investing in custom infrastructure. Saves weeks of development time and reduces operational complexity.

---

### Story 3.1: Cloudflare AI Search Configuration and R2 Bucket Connection

As a **search infrastructure engineer**,
I want **to configure Cloudflare AI Search to monitor the R2 bucket containing gitingest summaries**,
So that **code summaries are automatically indexed for semantic search without custom embedding code**.

**Acceptance Criteria:**

**Given** gitingest summaries are stored in R2 (Epic 2 complete)
**When** I configure Cloudflare AI Search
**Then** AI Search service is connected to the R2 bucket
**And** AI Search monitors the bucket for new/updated objects
**And** configuration specifies: bucket name, path prefix (`gitingest/`), file pattern (`*.txt`)

**Given** AI Search is configured
**When** new gitingest files are uploaded to R2
**Then** AI Search automatically detects and indexes new content
**And** indexing happens continuously without manual triggers
**And** indexed documents are searchable within minutes of upload

**And** Configuration is documented in wrangler.toml or separate config file
**And** AI Search service binding is added to Workers environment
**And** Setup instructions are documented for team reference

**Prerequisites:** Story 2.4 (R2 Storage with gitingest summaries)

**Technical Notes:**
- Cloudflare AI Search is a managed RAG service (Preview as of PRD date)
- Configuration via Cloudflare dashboard or API
- AI Search automatically generates embeddings from text content
- No custom embedding model needed (managed by Cloudflare)
- Service binding enables Workers to query AI Search API
- This implements FR-2.1 Cloudflare AI Search Integration from PRD
- Validates approach: gitingest quality sufficient for semantic search?

---

### Story 3.2: AI Search Query API Integration in Workers

As a **backend developer**,
I want **to integrate the AI Search query API into Cloudflare Workers**,
So that **I can execute semantic search queries and return relevant results**.

**Acceptance Criteria:**

**Given** AI Search is configured and indexing R2 content (Story 3.1)
**When** I implement the search query module in Workers
**Then** the module accepts natural language query strings
**And** queries are sent to AI Search API via service binding
**And** API returns top results with similarity scores and snippets

**Given** a semantic search query is executed
**When** I process the AI Search response
**Then** results include: repository identifier, code snippet, similarity score
**And** results are ranked by relevance (highest similarity first)
**And** metadata is extracted from R2 object paths (org, repo name)

**And** Search module handles API errors gracefully (timeout, service unavailable)
**And** Error responses follow PRD format: `{ error: { code, message } }`
**And** Query logging captures: query text, result count, response time
**And** Module location: src/search/ai-search-client.ts

**Prerequisites:** Story 3.1 (AI Search configuration)

**Technical Notes:**
- AI Search API binding from wrangler.toml (Epic 1)
- Query interface: `searchCode(query: string, limit: number): Promise<SearchResult[]>`
- SearchResult type includes: repoPath, snippet, score, metadata
- AI Search handles query rewriting and similarity caching automatically
- Response time target: <800ms (p95) for AI Search retrieval (NFR-1.1)
- This implements FR-2.2 Semantic Search API from PRD

---

### Story 3.3: Result Enrichment - Add Metadata and GitHub Links

As a **API developer**,
I want **to enrich search results with repository metadata and actionable links**,
So that **users can quickly evaluate and access relevant code**.

**Acceptance Criteria:**

**Given** raw search results from AI Search API (Story 3.2)
**When** I enrich the results
**Then** each result includes: full GitHub URL, organization name, repository name
**And** direct links to GitHub repository and specific file (if available)
**And** quick-launch links: GitHub Codespaces, Gitpod

**Given** metadata is stored in R2 object custom metadata (from Epic 2)
**When** I retrieve additional context
**Then** results include: pushedAt timestamp (last updated), language (if detectable)
**And** snippet context shows surrounding code lines (configurable, default 5 lines)

**And** Result enrichment module has clear interfaces: `enrichResult(rawResult): EnrichedResult`
**And** GitHub links follow format: `https://github.com/{org}/{repo}`
**And** Codespaces link: `https://github.dev/{org}/{repo}`
**And** Module location: src/search/result-enricher.ts

**Prerequisites:** Story 3.2 (AI Search query integration)

**Technical Notes:**
- Parse R2 object path to extract org/repo: `gitingest/alphagov/govuk-frontend/summary.txt`
- Metadata retrieval may require R2 HEAD request (check performance impact)
- Consider caching metadata in KV for frequently accessed repos
- Result format matches PRD schema (FR-2.3 Result Metadata & Context)
- This implements FR-2.3 from PRD

---

### Story 3.4: Search Performance Validation and Baseline Metrics

As a **performance engineer**,
I want **to validate AI Search performance and establish baseline metrics**,
So that **we can determine if the managed service meets MVP requirements (<2s query latency)**.

**Acceptance Criteria:**

**Given** AI Search is operational with indexed content (Stories 3.1-3.3)
**When** I execute test queries representing common use cases
**Then** I measure: query response time, relevance of top 5 results, indexing lag

**Given** performance test results
**When** I analyze the metrics
**Then** p95 query response time is documented (target: <2s end-to-end, <800ms AI Search)
**And** relevance is assessed: do top 5 results match query intent for 80%+ of test queries?
**And** indexing lag is measured: time from R2 upload to searchable (target: <5 minutes)

**And** Test suite includes queries like: "authentication methods", "postcode validation", "NHS API integration"
**And** Test harness logs: query, response time, top 5 results, relevance score (manual assessment)
**And** Baseline metrics are documented for future comparison
**And** Decision criteria: if AI Search quality insufficient, plan migration to custom embeddings (Phase 2)

**Prerequisites:** Stories 3.1, 3.2, 3.3 (Complete search pipeline)

**Technical Notes:**
- Create test-search.ts script for repeatable performance testing
- Sample queries should reflect actual developer needs (based on product brief use cases)
- Relevance assessment: manual review initially, automated scoring in Phase 2
- Baseline metrics inform decision: continue with AI Search vs custom embeddings
- This validates the core hypothesis: gitingest quality + AI Search = useful semantic search
- Implements NFR-1.1 (query response time) and NFR-1.2 (search quality)
- MVP success criteria: 80%+ relevance for top 5 results

---

## Epic 4: MCP API Server (Read Path)

**Goal:** Build the user-facing MCP v2 protocol API that exposes semantic search to AI assistants (Claude, GitHub Copilot). This is the "read path" that developers interact with - a thin, fast wrapper around the AI Search infrastructure built in Epics 2-3.

**Value:** Enables the core product vision: ambient code discovery through AI assistants. MCP v2 compliance makes govscraperepo work with any compatible AI assistant. Edge deployment via Cloudflare Workers ensures <2s query response globally. Open access with no authentication keeps integration simple.

---

### Story 4.1: MCP v2 Protocol Foundation - Request/Response Structure

As a **API architect**,
I want **to implement the MCP v2 protocol foundation with proper request/response handling**,
So that **the API is standards-compliant and works with all MCP-compatible AI assistants**.

**Acceptance Criteria:**

**Given** the Cloudflare Workers foundation exists (Epic 1)
**When** I implement the MCP protocol handler
**Then** the API accepts POST requests to `/mcp/search` endpoint
**And** request body is validated: `{ query: string, limit?: number }`
**And** responses follow MCP v2 format with proper content-type headers

**Given** an invalid request (missing query, malformed JSON)
**When** the API receives the request
**Then** it returns 400 Bad Request with clear error message
**And** error format matches PRD spec: `{ error: { code, message } }`
**And** validation errors are descriptive: "Missing required field: query"

**And** Protocol version is negotiated via headers (X-MCP-Version: 2)
**And** CORS headers are configured for web-based AI assistants
**And** Request/response logging captures: method, path, status, duration
**And** Module location: src/api/mcp-handler.ts

**Prerequisites:** Story 1.1, 1.2, 1.3 (Foundation complete)

**Technical Notes:**
- MCP v2 protocol specification: https://modelcontextprotocol.io/v2
- Cloudflare Workers fetch event handler
- JSON schema validation for request body
- Standard HTTP status codes: 200, 400, 500, 503
- CORS configuration if needed for browser-based assistants
- No authentication required (MCP is open access)
- This implements FR-3.1 MCP v2 Protocol Compliance from PRD

---

### Story 4.2: Semantic Search Endpoint - Integrate AI Search with MCP Response Format

As a **API developer**,
I want **to implement the main search endpoint that queries AI Search and formats results for MCP**,
So that **developers can search UK government code through their AI assistants**.

**Acceptance Criteria:**

**Given** a request to `/mcp/search` (Story 4.1)
**When** I process the search query
**Then** query is sent to AI Search via Epic 3 integration
**And** results are enriched with metadata (Epic 3.3)
**And** top 5 results are formatted according to PRD schema

**Given** search results are retrieved
**When** I format the MCP response
**Then** response includes: `{ results: SearchResult[], took_ms: number }`
**And** each SearchResult contains: repo_url, repo_org, repo_name, snippet, last_updated, language, similarity_score, github_link, codespaces_link, metadata
**And** response time is logged for monitoring

**Given** AI Search returns no results
**When** I format the response
**Then** API returns 200 OK with empty results array: `{ results: [], took_ms: 123 }`
**And** empty results are logged with query text for analysis

**And** Query parameters are sanitized (prevent injection attacks)
**And** Default limit is 5 results (configurable, max 20)
**And** Search errors are handled gracefully (return 500 with details)
**And** Module location: src/api/search-endpoint.ts

**Prerequisites:** Stories 3.2, 3.3 (AI Search integration), Story 4.1 (MCP protocol)

**Technical Notes:**
- Integrates Epic 3's AI Search client and result enricher
- Response format matches PRD FR-2.2 and FR-2.3 schemas
- Query sanitization: trim whitespace, validate length (3-500 chars)
- Limit validation: 1-20 results (default 5)
- Performance logging: total time, AI Search time, enrichment time
- This is the core user-facing endpoint - implements FR-2.2 Semantic Search API
- NFR-1.1: <2s end-to-end response time (p95)
- No authentication required - open MCP access

---

### Story 4.3: API Error Handling and Structured Logging

As a **reliability engineer**,
I want **comprehensive error handling and structured logging across all API endpoints**,
So that **we can debug issues, monitor performance, and maintain high reliability**.

**Acceptance Criteria:**

**Given** any API endpoint encounters an error
**When** the error occurs
**Then** error is caught by global error handler
**And** appropriate HTTP status code is returned (400, 500, 503)
**And** error response follows PRD format: `{ error: { code, message, retry_after? } }`

**Given** an internal server error (500)
**When** the error is logged
**Then** structured log includes: error type, stack trace, request context (path, method)
**And** sensitive data is never logged (secrets, API keys)
**And** error logs enable quick root cause analysis

**Given** API requests are processed
**When** logging is performed
**Then** all logs are structured JSON with fields: timestamp, level, message, context
**And** context includes: requestId (correlation), duration, endpoint, status
**And** logs are compatible with Cloudflare Workers log streaming

**And** Error handler is registered as global middleware
**And** Logging utility is used consistently across all modules
**And** Log levels are configurable per environment (dev: debug, prod: info)
**And** This leverages Epic 1's logging foundation

**Prerequisites:** Story 1.3 (Logging foundation), Stories 4.1-4.2 (All API endpoints)

**Technical Notes:**
- Global error handler catches unhandled exceptions and promise rejections
- Error mapping: ValidationError→400, ServiceError→500/503
- Structured logging from Epic 1.3 (src/utils/logger.ts)
- Correlation IDs for distributed tracing (generate per request)
- This implements NFR-2.3 (audit logging) and NFR-6.3 (error rate monitoring)
- Log retention: Cloudflare Workers logs (7 days default), export to long-term storage in Phase 2
- Simpler error handling without auth/rate limiting complexity

---

## Epic 5: Developer Experience & Documentation

**Goal:** Create comprehensive documentation and integration examples that enable UK government developers to quickly integrate govscraperepo MCP API into their AI assistants (Claude Desktop, GitHub Copilot). This epic transforms the working API into an adoptable developer tool.

**Value:** Enables the "hundreds of uses per week" MVP success metric. Clear documentation reduces integration time from hours to <5 minutes. Integration examples provide copy-paste templates. OpenAPI spec enables automated client generation. Good developer experience drives organic adoption and word-of-mouth growth.

---

### Story 5.1: MCP Configuration Guides for Claude Desktop and GitHub Copilot

As a **government developer**,
I want **step-by-step instructions to integrate govscraperepo with Claude Desktop and GitHub Copilot**,
So that **I can start searching UK government code in <5 minutes with my preferred AI assistant**.

**Acceptance Criteria:**

**Given** Claude Desktop is installed on my machine
**When** I follow the Claude Desktop MCP configuration guide
**Then** I have clear instructions for: locating config file, adding MCP server entry, testing integration
**And** guide includes exact JSON configuration with govscraperepo MCP endpoint
**And** troubleshooting section covers common issues: network errors, invalid config, no results
**And** example queries to verify: "search UK government authentication code"
**And** I can confirm integration works within 5 minutes

**Given** GitHub Copilot is installed in my IDE (VS Code, JetBrains)
**When** I follow the GitHub Copilot MCP configuration guide
**Then** I have clear instructions for: extension settings, MCP server configuration, testing
**And** guide includes step-by-step setup specific to Copilot's MCP support
**And** example queries demonstrate Copilot-specific usage patterns
**And** troubleshooting covers Copilot-specific issues

**And** Both guides are published in README.md or dedicated integration docs
**And** Code examples use real govscraperepo endpoint URL
**And** Screenshots show both Claude Desktop and Copilot UI (if permissions allow)
**And** Guides link to respective MCP documentation for reference
**And** Clear note if Copilot MCP support is not yet released (as of MVP)

**Prerequisites:** Story 4.2 (Semantic search endpoint working)

**Technical Notes:**
- **Claude Desktop:** Config location `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- **Claude Desktop:** MCP format: `{ "mcpServers": { "govscraperepo": { "url": "https://govreposcrape.cloud.cns.me/mcp" } } }`
- **GitHub Copilot:** Config depends on VS Code/JetBrains extension settings (document when available)
- **GitHub Copilot:** May require preview/beta access for MCP support (note this clearly)
- Example queries should reflect actual use cases from PRD: authentication, postcode validation, NHS APIs
- Module location: README.md or docs/integration/ (claude-desktop.md, github-copilot.md)
- If Copilot MCP not available at MVP: document "Coming soon" with notification signup
- API endpoint: https://govreposcrape.cloud.cns.me
- This implements FR-4.1 MCP Configuration Documentation from PRD

---

### Story 5.2: OpenAPI 3.0 Specification

As a **API consumer**,
I want **a complete OpenAPI 3.0 specification for the MCP API**,
So that **I can understand the API contract and generate client libraries automatically**.

**Acceptance Criteria:**

**Given** the MCP API has endpoints implemented (Epic 4)
**When** I access the OpenAPI specification
**Then** spec documents all endpoints: POST /mcp/search
**And** request/response schemas are complete with examples
**And** error responses are documented (400, 500, 503)

**Given** the OpenAPI spec exists
**When** I use OpenAPI tools (Swagger UI, code generators)
**Then** spec is valid OpenAPI 3.0 format (passes validation)
**And** Swagger UI can render interactive documentation
**And** code generators (openapi-generator) can create TypeScript/Python clients

**And** OpenAPI spec is available at: /openapi.json endpoint or static file
**And** Spec includes: API title, description, version, contact info
**And** Example requests include realistic queries
**And** Authentication section notes "No authentication required"

**Prerequisites:** Story 4.1, 4.2 (All API endpoints defined)

**Technical Notes:**
- OpenAPI 3.0 specification format (not Swagger 2.0)
- Host OpenAPI spec as static JSON file or generated endpoint
- Consider Swagger UI for /docs endpoint (optional: nice-to-have)
- Schemas must match actual TypeScript types from src/types.ts
- Module location: static/openapi.json or src/api/openapi.ts
- This implements FR-4.2 OpenAPI 3.0 Specification from PRD

---

### Story 5.3: Integration Examples and Testing Tools

As a **developer integrating govscraperepo**,
I want **working code examples and testing tools**,
So that **I can validate my integration and understand best practices**.

**Acceptance Criteria:**

**Given** I want to test the MCP API directly
**When** I use provided code examples
**Then** examples exist for: cURL, TypeScript/JavaScript, Python
**And** each example shows: basic query, handling results, error handling
**And** examples are copy-paste ready with real endpoint URL

**Given** I want to validate my integration
**When** I use the testing tools
**Then** a simple test script exists to check connectivity: test-mcp.sh or test-mcp.ts
**And** test script validates: endpoint reachable, search returns results, response format correct
**And** test output is clear: "✅ MCP API working" or "❌ Connection failed: [reason]"

**And** Examples directory contains: examples/curl.sh, examples/node.js, examples/python.py
**And** Each example includes comments explaining key parts
**And** Examples demonstrate realistic queries from PRD use cases
**And** Testing tools output structured results for debugging

**Prerequisites:** Story 4.2 (Semantic search endpoint), Story 5.2 (OpenAPI spec for reference)

**Technical Notes:**
- cURL example: `curl -X POST https://govreposcrape.cloud.cns.me/mcp/search -H "Content-Type: application/json" -d '{"query":"authentication","limit":5}'`
- TypeScript example using fetch API
- Python example using requests library
- Test scripts should be self-contained (no external dependencies where possible)
- Module location: examples/ directory at repo root
- API endpoint: https://govreposcrape.cloud.cns.me
- This supports FR-4.1 developer integration from PRD

---

### Story 5.4: Usage Guide and Best Practices Documentation

As a **new user of govscraperepo**,
I want **guidance on effective search queries and best practices**,
So that **I get relevant results and understand how to use the platform effectively**.

**Acceptance Criteria:**

**Given** I'm new to semantic code search
**When** I read the usage guide
**Then** guide explains: how semantic search works, query formulation tips, result interpretation
**And** examples show good vs bad queries: "authentication methods" (good) vs "auth" (too vague)
**And** guidance on interpreting similarity scores and metadata

**Given** I want to maximize search relevance
**When** I follow best practices
**Then** documentation includes: optimal query length (3-20 words), natural language vs keywords, using context
**And** examples of domain-specific queries: "NHS API integration", "HMRC tax calculation", "DWP benefits validation"
**And** tips for browsing results: checking org reputation, last updated timestamp, license

**And** Usage guide is clear and concise (<500 words)
**And** Examples are UK government-specific (not generic)
**And** Guide links to PRD/product brief for deeper context
**And** Feedback mechanism explained: how to report issues or suggest improvements

**Prerequisites:** Story 5.1 (Configuration guide complete)

**Technical Notes:**
- Module location: docs/usage-guide.md or README.md section
- Should be accessible to non-technical users (civil servants) for Phase 2
- Examples based on PRD use cases and product brief scenarios
- Keep tone professional but approachable (UK government audience)
- This supports FR-4.1 and enables MVP success criteria (adoption)

---

## Epic 6: Operational Excellence

**Goal:** Establish production-ready operational practices including cost monitoring, security compliance validation, and observability dashboards. This epic ensures the MVP is sustainable (<£50/month), secure (NCSC compliant), and observable (actionable metrics).

**Value:** Enables confident production deployment. Cost monitoring prevents budget overruns and validates the <£50/month hypothesis. Security compliance ensures government trust. Observability enables rapid issue diagnosis. These operational foundations are critical for MVP credibility and Phase 2 scaling.

---

### Story 6.1: Cost Monitoring Dashboard and Alerts

As a **product owner**,
I want **real-time cost monitoring and budget alerts for all Cloudflare services**,
So that **we validate the <£50/month MVP hypothesis and prevent unexpected costs**.

**Acceptance Criteria:**

**Given** the platform is operational with all services (Workers, R2, AI Search, KV, Vectorize)
**When** I view the cost monitoring dashboard
**Then** I see daily costs broken down by service: Workers, R2, AI Search, KV, Vectorize
**And** cumulative monthly spend is displayed with projection to month-end
**And** cost per query (AI Search) and cost per ingestion run are calculated

**Given** monthly costs approach the budget threshold
**When** spending reaches 80% of £50/month budget
**Then** alert is triggered (email, Slack, or dashboard notification)
**And** alert includes: current spend, projection, breakdown by service, recommended actions

**And** Cost dashboard is accessible via Cloudflare Analytics or custom visualization
**And** Historical cost data is tracked for trend analysis (week-over-week, month-over-month)
**And** Cost optimization recommendations are documented: caching strategies, query patterns, ingestion frequency
**And** Dashboard shows key efficiency metrics: cache hit rate, queries per £, repos per £

**Prerequisites:** All Epic 1-5 stories (complete platform operational)

**Technical Notes:**
- Use Cloudflare Analytics API or dashboard for cost data
- Cost breakdown critical for validating PRD cost assumptions (NFR-7.1)
- 80% threshold provides early warning before budget exceeded
- Document actual costs vs estimates for future planning
- Module location: scripts/cost-monitoring.ts or dashboard link in README
- This implements NFR-7.1 (<£50/month MVP infrastructure cost) and NFR-7.3 (cost monitoring)

---

### Story 6.2: Security Compliance Validation - NCSC Standards

As a **security engineer**,
I want **to validate the platform against NCSC Secure Coding Standards**,
So that **govscraperepo meets government security requirements for production deployment**.

**Acceptance Criteria:**

**Given** the platform codebase is complete
**When** I perform security compliance validation
**Then** security checklist covers: input validation, output encoding, no eval/exec, dependency scanning
**And** all API endpoints validate and sanitize inputs (query strings, parameters)
**And** no secrets or API keys are logged or exposed in error messages
**And** HTTPS-only enforcement is verified (TLS 1.3)

**Given** dependencies are used in the project
**When** I run dependency security scanning
**Then** npm audit or equivalent shows zero high/critical vulnerabilities
**And** Dependabot or equivalent is configured for automated security updates
**And** dependency scanning runs weekly with alerts on new vulnerabilities

**And** Security compliance checklist is documented in SECURITY.md
**And** Audit logging covers all queries (timestamp, query text, response time) per NFR-2.3
**And** Read-only access pattern is validated (no write operations to GitHub)
**And** Security incident response plan is documented

**Prerequisites:** All Epic 1-5 stories (complete codebase)

**Technical Notes:**
- NCSC Secure Coding Standards: https://www.ncsc.gov.uk/collection/developers-collection
- Input validation critical for query parameters, JSON bodies
- No PII or sensitive data in vectors/logs (all data is public GitHub repos)
- Dependency scanning: npm audit, Snyk, or GitHub Security Advisories
- This implements NFR-2.1 (NCSC compliance) and NFR-2.5 (dependency security)
- Module location: SECURITY.md, scripts/security-audit.sh

---

### Story 6.3: Observability Dashboard - Key Metrics and KPIs

As a **platform operator**,
I want **a dashboard showing key metrics and KPIs for platform health**,
So that **I can monitor adoption, performance, and quality in real-time**.

**Acceptance Criteria:**

**Given** the platform is operational and serving queries
**When** I view the observability dashboard
**Then** dashboard shows: query volume (per day/week), response time (p50, p95, p99), error rate, cache hit rate
**And** adoption metrics: unique users (if trackable), queries per user, repeat usage
**And** quality metrics: empty result rate, slow query rate (>2s), error types breakdown

**Given** I want to track MVP success criteria
**When** I review the dashboard
**Then** MVP metrics are highlighted: weekly query volume (target: hundreds), adoption trend, performance compliance (<2s p95)
**And** alerts are configured for: error rate >1%, p95 response time >2s, daily queries <10 (low adoption warning)

**And** Dashboard is implemented using Cloudflare Analytics or custom tool (Grafana, Datadog)
**And** Key metrics are exportable for reporting (CSV, JSON)
**And** Dashboard link and access instructions are documented in README
**And** Metrics align with PRD success criteria (FR-8, NFR-1, NFR-6)

**Prerequisites:** All Epic 1-5 stories (platform generating metrics)

**Technical Notes:**
- Cloudflare Workers Analytics provides built-in metrics (requests, latency, errors)
- Custom metrics via structured logging: query patterns, result relevance, cache efficiency
- MVP success: "Hundreds of uses per week" trackable via query volume
- Dashboard should be accessible to team and stakeholders
- Module location: Dashboard link in README, custom metrics in src/utils/metrics.ts if needed
- This implements NFR-6.3 (error rate monitoring) and tracks MVP success criteria

---

### Story 6.4: Production Readiness Checklist and Deployment Guide

As a **deployment engineer**,
I want **a production readiness checklist and step-by-step deployment guide**,
So that **the MVP can be confidently deployed to production**.

**Acceptance Criteria:**

**Given** all Epic 1-6 stories are complete
**When** I review the production readiness checklist
**Then** checklist covers: all tests passing, security audit complete, cost monitoring active, documentation complete
**And** environment configuration verified: production service bindings, secrets, domain setup
**And** deployment prerequisites validated: Cloudflare account, domain DNS, wrangler CLI

**Given** I follow the deployment guide
**When** I execute deployment steps
**Then** guide includes: pre-deployment validation, wrangler deploy command, post-deployment verification
**And** rollback procedure is documented for deployment failures
**And** smoke tests are defined to validate deployment success

**And** Production readiness checklist is documented in DEPLOYMENT.md or README
**And** Deployment guide includes environment-specific configurations (staging vs production)
**And** Post-deployment verification includes: health check, test query, monitoring dashboard check
**And** Contact information for escalation is documented

**Prerequisites:** All Epic 1-6 stories complete

**Technical Notes:**
- Pre-deployment checklist: tests pass, dependencies updated, secrets configured, domain verified
- Deployment command: `wrangler deploy --env production`
- Smoke tests: curl test query, check response format, verify monitoring
- Rollback: `wrangler rollback` or redeploy previous version
- Module location: DEPLOYMENT.md or README.md section
- This enables confident MVP launch and supports NFR-6 (reliability)

---

