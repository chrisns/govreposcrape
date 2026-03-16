# Epic Technical Specification: MCP API Enhancements - Result Modes

Date: 2025-11-19
Author: cns
Epic ID: 8
Status: Draft

---

## Overview

Epic 8 extends the existing MCP API (`/mcp/search` endpoint) with a configurable `resultMode` parameter, enabling clients to choose between three result detail levels: `minimal` (fast, metadata-only), `snippets` (default, balanced), and `full` (comprehensive with complete gitingest summaries). This enhancement optimizes bandwidth and latency for diverse integration patterns while maintaining backward compatibility with existing clients.

The enhancement addresses a key limitation in the current API: all clients receive the same result format regardless of their needs. AI assistants with limited context windows need lighter responses, CLI tools require comprehensive data for analysis, and performance-sensitive integrations benefit from minimal payloads. By providing three distinct modes, we enable each client type to optimize for their specific requirements.

## Objectives and Scope

**In Scope:**
- Add `resultMode` parameter to `/mcp/search` endpoint schema with enum validation (`minimal`, `snippets`, `full`)
- Implement minimal mode (repo metadata only, <500ms p95, ~1KB per result)
- Implement snippets mode as default (current behavior, <1500ms p95, ~5KB per result)
- Implement full mode (complete gitingest summaries + enhanced metadata, <3000ms p95, ~50KB per result)
- Update TypeScript types and OpenAPI specification
- Comprehensive documentation and integration examples
- Backward compatibility testing (existing clients work without changes)

**Out of Scope:**
- Per-result mode selection (all results in same mode)
- Dependency vulnerability data in full mode (future enhancement)
- Custom snippet length configuration (fixed at 3-5 lines)
- Mode-specific relevance ranking (consistent across modes)
- Caching strategy changes (use existing cache infrastructure)

**Success Criteria:**
- 30%+ of queries use non-default modes within 4 weeks of launch
- All performance targets met (minimal <500ms, snippets <1500ms, full <3000ms p95)
- Zero breaking changes for existing clients
- Positive user feedback on flexibility and documentation clarity

## System Architecture Alignment

**Current Architecture (Google Cloud Platform):**

The MCP API is deployed on Cloud Run (Node.js 20, TypeScript) and integrates with Vertex AI Search for semantic retrieval. The architecture follows a **read path / write path separation**:

- **Write Path:** Python container processes repositories → generates gitingest summaries → uploads to Cloud Storage with metadata
- **Read Path:** MCP API on Cloud Run → queries Vertex AI Search → formats MCP response

**Epic 8 Integration Points:**

| Component | Current Behavior | Enhancement |
|-----------|------------------|-------------|
| **Cloud Run API** (`api/src/index.ts`) | Returns fixed-format results | Add `resultMode` routing logic |
| **Vertex AI Search Service** (`api/src/services/vertexSearchService.ts`) | Returns search results with highlights | No changes (same query path for all modes) |
| **Cloud Storage** | Stores gitingest summaries | Full mode fetches complete summary from GCS |
| **MCP Types** (`api/src/types/mcp.ts`) | Single `SearchResult` interface | Add `MinimalResult`, `SnippetResult`, `FullResult` interfaces |
| **Response Formatter** (new) | N/A | Create `formatResponse()` function with mode branching |

**Architecture Constraints Maintained:**
- Managed services only (no new infrastructure)
- Vertex AI Search remains single source of truth for semantic retrieval
- Cloud Storage metadata extraction from URIs (no separate database)
- TypeScript strict mode compliance
- Structured JSON logging for all modes

**Performance Optimization Strategy:**
- **Minimal mode:** Skip Cloud Storage reads entirely (metadata from Vertex AI Search results)
- **Snippets mode:** Use Vertex AI Search highlights (current behavior)
- **Full mode:** Single GCS read per result for complete gitingest summary

## Detailed Design

### Services and Modules

| Service/Module | Responsibility | Inputs | Outputs | Owner |
|----------------|----------------|--------|---------|-------|
| **Request Validator** (`api/src/middleware/validateRequest.ts`) | Validate `resultMode` enum | POST body with `resultMode` | Validated request object or 400 error | Backend Dev |
| **Mode Router** (`api/src/services/modeRouter.ts` - NEW) | Route to correct formatter based on mode | Search results + `resultMode` | Formatted response | Backend Dev |
| **Minimal Formatter** (`api/src/formatters/minimalFormatter.ts` - NEW) | Strip to metadata only | Raw Vertex AI results | `MinimalResult[]` | Backend Dev |
| **Snippet Formatter** (`api/src/formatters/snippetFormatter.ts` - NEW) | Extract snippets from highlights | Raw Vertex AI results | `SnippetResult[]` | Backend Dev |
| **Full Formatter** (`api/src/formatters/fullFormatter.ts` - NEW) | Fetch gitingest + enrich metadata | Raw Vertex AI results + GCS client | `FullResult[]` | Backend Dev |
| **GCS Client** (`api/src/services/gcsClient.ts` - EXISTS) | Fetch gitingest summaries from Cloud Storage | `gs://{bucket}/{org}/{repo}.md` URI | Markdown text content | Backend Dev |

**Ownership:** All modules owned by backend development team (TypeScript/Node.js expertise required)

### Data Models and Contracts

**TypeScript Interfaces (`api/src/types/mcp.ts`):**

```typescript
// Base fields shared by all modes
interface BaseResult {
  repo_url: string;              // https://github.com/{org}/{repo}
  repo_org: string;              // Extracted from GCS URI
  repo_name: string;             // Extracted from GCS URI
  language: string;              // From GCS metadata or inferred
  last_updated: string;          // ISO 8601 timestamp
  similarity_score: number;      // 0-1 from Vertex AI Search
  github_link: string;           // https://github.com/{org}/{repo}
  metadata: {
    stars?: number;              // Future: GitHub API integration
    forks?: number;              // Future: GitHub API integration
    license?: string;            // Extracted from gitingest if available
  };
}

// Minimal mode (Story 8.2)
interface MinimalResult extends BaseResult {
  // No additional fields - metadata only
}

// Snippets mode (Story 8.3) - DEFAULT
interface SnippetResult extends BaseResult {
  snippet: string;               // 3-5 lines from Vertex AI highlights
  snippet_file_path: string;     // Extracted from highlights metadata
  snippet_line_range: string;    // "45-50" format
  context_lines_before: number;  // Fixed at 2
  context_lines_after: number;   // Fixed at 2
  codespaces_link: string;       // https://github.dev/{org}/{repo}
}

// Full mode (Story 8.4)
interface FullResult extends SnippetResult {
  gitingest_summary: string;     // Complete Markdown from GCS
  full_file_context?: string;    // Future: Extract full file if available
  readme_excerpt?: string;       // First 500 chars of README from gitingest
  repository_stats?: {
    contributors: number;        // Future: GitHub API
    commits_last_month: number;  // Future: GitHub API
    open_issues: number;         // Future: GitHub API
    last_commit: string;         // ISO 8601
  };
  dependencies?: Array<{
    name: string;
    version: string;
    type: 'runtime' | 'dev';
  }>;
}

// Request schema
interface SearchRequest {
  query: string;                 // Required
  limit?: number;                // Optional, default 5
  resultMode?: 'minimal' | 'snippets' | 'full';  // NEW, default 'snippets'
}

// Response schema
interface SearchResponse {
  results: MinimalResult[] | SnippetResult[] | FullResult[];
  took_ms: number;
  mode: 'minimal' | 'snippets' | 'full';  // Echo back the mode used
}
```

**Database Schema:** N/A (no database changes - Cloud Storage metadata extracted from URIs)

### APIs and Interfaces

**Endpoint:** `POST /mcp/search`

**Request:**
```typescript
{
  query: string;          // Required: "authentication methods"
  limit?: number;         // Optional: 1-20, default 5
  resultMode?: string;    // NEW: "minimal" | "snippets" | "full", default "snippets"
}
```

**Response:**
```typescript
{
  results: Array<MinimalResult | SnippetResult | FullResult>;
  took_ms: number;
  mode: string;  // Echo the mode used
}
```

**Error Responses:**

| Status | Code | Message | When |
|--------|------|---------|------|
| 400 | INVALID_RESULT_MODE | "resultMode must be one of: minimal, snippets, full" | Invalid enum value |
| 400 | INVALID_QUERY | "query is required and must be non-empty" | Missing query |
| 400 | INVALID_LIMIT | "limit must be between 1 and 20" | Out of range |
| 500 | VERTEX_AI_ERROR | "Vertex AI Search unavailable" | Search service down |
| 500 | GCS_ERROR | "Failed to fetch gitingest summary" | Full mode GCS read failure |

**Error Response Format:**
```json
{
  "error": {
    "code": "INVALID_RESULT_MODE",
    "message": "resultMode must be one of: minimal, snippets, full",
    "allowed_values": ["minimal", "snippets", "full"]
  }
}
```

**Validation Rules:**
- `resultMode`: Must be one of three enum values (case-sensitive)
- Default to `"snippets"` if omitted (backward compatibility)
- All other validation rules unchanged from current API

### Workflows and Sequencing

**User Query Flow:**

```
1. Client sends POST /mcp/search with resultMode parameter
   ↓
2. Express middleware validates request schema
   - Valid? → Continue
   - Invalid? → Return 400 error with clear message
   ↓
3. Vertex AI Search query (same for all modes)
   - Query: client's search text
   - Returns: Top N results with highlights and metadata
   ↓
4. Mode Router branches based on resultMode:
   ├─ minimal → minimalFormatter (skip GCS, metadata only)
   ├─ snippets → snippetFormatter (use highlights)
   └─ full → fullFormatter (fetch from GCS + enrich)
   ↓
5. Formatter returns typed result array
   ↓
6. Response assembled: { results, took_ms, mode }
   ↓
7. JSON response sent to client
```

**Full Mode Detailed Sequence (Story 8.4):**

```
fullFormatter receives Vertex AI results
   ↓
For each result:
   1. Extract GCS URI from result metadata
      (e.g., gs://govreposcrape-summaries/alphagov/govuk-frontend.md)
   ↓
   2. Parallel processing:
      a) Call GCS client to fetch gitingest Markdown
      b) Extract repo stats from gitingest (if available)
      c) Parse dependencies from gitingest sections
   ↓
   3. Assemble FullResult object:
      - Base fields (from Vertex AI)
      - Snippet fields (from highlights)
      - gitingest_summary (from GCS)
      - repository_stats (parsed)
      - dependencies (parsed)
   ↓
4. Return FullResult array
```

**Parallel GCS Fetching:**
- Use `Promise.all()` for concurrent fetches (up to 5 results)
- Timeout: 2 seconds per fetch
- Failure handling: Return SnippetResult if GCS fetch fails (graceful degradation)

## Non-Functional Requirements

### Performance

**Targets from PRD Enhancement:**

| Mode | Latency (p95) | Bandwidth | Rationale |
|------|---------------|-----------|-----------|
| minimal | <500ms | ~1KB/result | Fastest - no GCS reads |
| snippets | <1500ms | ~5KB/result | Default - current performance baseline |
| full | <3000ms | ~50KB/result | Comprehensive - acceptable for deep analysis |

**Implementation Strategy:**
- **Minimal mode:** Optimize by skipping all Cloud Storage operations
- **Snippets mode:** Maintain current performance (no changes to query path)
- **Full mode:** Parallel GCS fetches with 2s timeout, graceful degradation if slow

**Measurement:**
- Cloud Run request metrics (p50, p95, p99)
- Per-mode latency histograms in Cloud Monitoring
- Alerts if p95 exceeds targets for >5 minutes

**Optimization Opportunities (Future):**
- Cache gitingest summaries in Cloud Run memory (LRU cache, 100MB limit)
- Pre-compute repository stats during ingestion (Epic 2 enhancement)
- CDN caching for frequently accessed repos (Cloudflare in front of Cloud Run)

### Security

**No New Security Concerns:**
- All data is public (GitHub public repos) - no PII or classified data
- `resultMode` parameter is enum-validated (no injection vectors)
- GCS access remains read-only (existing IAM permissions)
- No authentication changes (existing JWT flow unchanged)

**Audit Logging:**
- Log `resultMode` in structured query logs for analytics
- Track mode usage distribution (helps identify adoption patterns)
- No sensitive data in any mode (public repos only)

**NCSC Secure Coding Compliance:**
- Input validation on enum values (Story 8.1)
- No eval() or dynamic code execution
- Dependency scanning unchanged (npm audit)

### Reliability/Availability

**Graceful Degradation (Full Mode):**
- If GCS fetch fails for a result, fall back to SnippetResult format
- Log error but don't fail entire request
- Client receives partial data rather than 500 error

**Backward Compatibility:**
- Existing clients (no `resultMode` param) get snippets mode (current behavior)
- No breaking changes to response schema
- OpenAPI spec versioned (v1 unchanged, v2 adds resultMode)

**Error Handling:**
- Vertex AI Search failure: Return 500 with clear error (existing behavior)
- GCS timeout: Degrade to snippet mode (new for full mode)
- Invalid resultMode: Return 400 with allowed values (Story 8.1)

**SLA Impact:**
- Minimal/Snippets modes: No change to 99.9% target
- Full mode: Same 99.9% target (timeout prevents cascading failures)

### Observability

**Structured Logging (all modes):**
```json
{
  "timestamp": "2025-11-19T12:34:56Z",
  "requestId": "abc123",
  "query": "authentication methods",
  "resultMode": "full",
  "vertexAiLatencyMs": 800,
  "gcsLatencyMs": 1200,
  "totalLatencyMs": 2100,
  "resultCount": 5,
  "gcsFetchErrors": 0,
  "level": "info"
}
```

**Metrics to Track:**
- Mode usage distribution (% queries by mode)
- Per-mode latency histograms
- GCS fetch success/failure rates (full mode)
- Bandwidth usage by mode
- Cache hit rates (if caching implemented)

**Dashboards:**
- Cloud Run metrics (existing): Request latency, error rates
- Custom dashboard (new): Mode-specific performance, adoption trends
- Alerts: p95 latency exceeds targets, GCS fetch failure rate >5%

## Dependencies and Integrations

**Existing Dependencies (no changes):**
```json
{
  "@google-cloud/discoveryengine": "^3.1.0",  // Vertex AI Search client
  "@google-cloud/storage": "^7.7.0",          // Cloud Storage client (already exists)
  "express": "^4.18.2",                       // HTTP server
  "typescript": "^5.3.3"                      // Type safety
}
```

**No New External Dependencies Required**

**Integration Points:**

| Service | Integration Type | Changes Required |
|---------|------------------|------------------|
| Vertex AI Search | Query API | None - same query for all modes |
| Cloud Storage | Object read | None - already integrated for gitingest |
| GitHub API | Future enhancement | Optional for repository_stats in full mode |

**Dependency Manifest Check:**
```bash
# package.json already includes all required dependencies
npm list @google-cloud/storage  # ✓ Already installed (v7.7.0)
```

## Acceptance Criteria (Authoritative)

Extracted from PRD Enhancement and Epic 8 stories:

**AC-1: API Parameter Handling (Story 8.1)**
1. `/mcp/search` endpoint accepts `resultMode` parameter
2. Valid values: `"minimal"`, `"snippets"`, `"full"` (case-sensitive)
3. Defaults to `"snippets"` if parameter omitted
4. Returns 400 with clear error message for invalid values
5. Response includes `mode` field indicating which mode was used

**AC-2: Minimal Mode (Story 8.2)**
1. Returns only base metadata fields (no snippets, no summaries)
2. p95 latency <500ms for top 5 results
3. Response size ~1KB per result or less
4. Response schema matches `MinimalResult` TypeScript interface
5. Mode field in response indicates `"minimal"`

**AC-3: Snippets Mode (Story 8.3)**
1. Returns base fields + focused code snippets (3-5 lines)
2. Snippets extracted from Vertex AI Search highlights
3. Includes file path, line range, context lines
4. p95 latency <1500ms for top 5 results
5. Defaults to snippets mode if `resultMode` omitted (backward compatible)
6. Response schema matches `SnippetResult` TypeScript interface

**AC-4: Full Mode (Story 8.4)**
1. Returns all snippet fields + complete gitingest summary
2. Fetches summary from Cloud Storage: `gs://{bucket}/{org}/{repo}.md`
3. Includes repository stats (contributors, commits, issues, last_commit)
4. Includes dependencies array (parsed from gitingest)
5. README excerpt (first 500 chars if available)
6. p95 latency <3000ms for top 5 results
7. Response schema matches `FullResult` TypeScript interface

**AC-5: Documentation (Story 8.5)**
1. OpenAPI spec documents `resultMode` parameter with enum values
2. Response schemas defined for all three modes with examples
3. Integration guide explains when to use each mode
4. Performance characteristics table published (latency, bandwidth)
5. Migration guide confirms existing clients work without changes

**AC-6: Backward Compatibility**
1. Existing clients without `resultMode` parameter continue working
2. Default behavior matches current production (snippets equivalent)
3. No breaking changes to existing response structure
4. API version remains v1 (additive change, not breaking)

## Traceability Mapping

| Acceptance Criteria | Spec Section | Component/API | Test Approach |
|---------------------|--------------|---------------|---------------|
| AC-1: Parameter handling | APIs and Interfaces | Request Validator middleware | Unit test: valid/invalid enum values, default behavior |
| AC-1: Response mode field | APIs and Interfaces | All formatters | Integration test: verify mode echoed in response |
| AC-2: Minimal mode fields | Data Models, Minimal Formatter | `minimalFormatter.ts` | Unit test: verify schema, no extra fields |
| AC-2: Minimal performance | Performance NFR | Mode Router + Minimal Formatter | Load test: p95 <500ms with 100 concurrent requests |
| AC-3: Snippets default | APIs and Interfaces | Request Validator | Integration test: omit param → snippets mode |
| AC-3: Snippet extraction | Data Models, Snippet Formatter | `snippetFormatter.ts` | Unit test: parse Vertex AI highlights correctly |
| AC-3: Snippets performance | Performance NFR | Mode Router + Snippet Formatter | Baseline test: p95 <1500ms (current performance) |
| AC-4: Full mode GCS fetch | Full Formatter, GCS Client | `fullFormatter.ts`, `gcsClient.ts` | Integration test: fetch gitingest from GCS |
| AC-4: Repo stats parsing | Data Models, Full Formatter | `fullFormatter.ts` | Unit test: extract stats from gitingest Markdown |
| AC-4: Full performance | Performance NFR | Mode Router + Full Formatter | Load test: p95 <3000ms with GCS parallel fetches |
| AC-5: OpenAPI spec | Documentation | `api/openapi.yaml` | Manual review: spec completeness, examples |
| AC-6: Backward compat | APIs and Interfaces | Request Validator | Regression test: existing clients (no param) work |

## Risks, Assumptions, Open Questions

**Risks:**

1. **Risk: GCS fetch latency for full mode**
   - Impact: High (if p95 >3000ms, fails NFR)
   - Likelihood: Medium (depends on network latency)
   - Mitigation: Parallel fetches with 2s timeout, graceful degradation to snippets mode
   - Next Step: Baseline GCS read latency test in production (Story 8.4)

2. **Risk: Low adoption of new modes**
   - Impact: Medium (feature unused, wasted effort)
   - Likelihood: Low (clear use cases documented)
   - Mitigation: Proactive communication to early adopters, usage analytics dashboard
   - Next Step: Pre-launch user research with Claude Desktop team

3. **Risk: Vertex AI Search highlights insufficient for snippets**
   - Impact: Medium (snippet quality degrades)
   - Likelihood: Low (highlights already used in production)
   - Mitigation: Fallback to gitingest first 200 chars (existing pattern)
   - Next Step: Validate highlight quality across diverse queries (Story 8.3)

**Assumptions:**

1. **Assumption:** Vertex AI Search response structure remains stable (highlights, metadata URIs)
   - Validation: Monitor Vertex AI API changelog, test with new versions
   - Dependency: Google Cloud Platform service stability

2. **Assumption:** gitingest summaries are well-formatted Markdown
   - Validation: Spot-check sample repos from production GCS bucket
   - Dependency: Epic 2 ingestion pipeline quality

3. **Assumption:** 30%+ mode adoption is realistic
   - Validation: User research, early adopter feedback
   - Dependency: Clear documentation and integration examples

**Open Questions:**

1. **Question:** Should we support per-result mode selection? (e.g., minimal for 4 results, full for 1)
   - Current Decision: No - defer to future enhancement
   - Rationale: Simpler implementation, assess demand in Phase 1

2. **Question:** Should full mode include GitHub API data (stars, forks, live stats)?
   - Current Decision: No - parse from gitingest only (avoid rate limits)
   - Rationale: GitHub API has 5,000 req/hour limit, caching adds complexity
   - Future Enhancement: Story 9.x if demand exists

3. **Question:** Should we cache gitingest summaries in Cloud Run memory?
   - Current Decision: Defer to performance testing (Story 8.4)
   - Rationale: Measure actual latency first, optimize if needed
   - Implementation Note: LRU cache with 100MB limit if latency exceeds target

## Test Strategy Summary

**Unit Tests (Vitest):**
- Request validator: enum validation, default value, error messages
- Minimal formatter: schema compliance, field presence/absence
- Snippet formatter: highlight parsing, line range extraction
- Full formatter: gitingest parsing, stats extraction, dependency parsing
- GCS client: mock fetch, timeout handling, error scenarios

**Integration Tests:**
- End-to-end API calls for all three modes
- Backward compatibility: requests without `resultMode` param
- Error handling: invalid mode values, GCS failures
- Mode router: correct formatter selection

**Performance Tests (Apache Bench / Artillery):**
- Baseline: snippets mode p95 latency (establish current performance)
- Minimal mode: p95 <500ms with 100 concurrent requests
- Full mode: p95 <3000ms with GCS parallel fetches (5 results)
- Bandwidth measurement: validate ~1KB (minimal), ~5KB (snippets), ~50KB (full)

**Load Tests (Before Production):**
- 1000 queries/minute across all three modes
- Monitor Cloud Run auto-scaling behavior
- Verify no performance degradation to existing queries

**Manual Testing:**
- MCP client integration (Claude Desktop config)
- OpenAPI spec validation (Swagger UI)
- Documentation clarity (early adopter feedback)
- Error message clarity (invalid enum values)

**Test Coverage Target:** 80%+ for new code (formatters, router, validator)

**Regression Testing:**
- Existing MCP API tests must pass (no breaking changes)
- Current production queries must work identically (backward compat)

---

**End of Technical Specification**

This document is the authoritative source for Epic 8 implementation. All stories (8.1-8.5) must trace back to this specification. Any deviations require tech spec update and PM approval.
