# Epic Technical Specification: MCP API Server (Read Path)

Date: 2025-11-14
Author: cns
Epic ID: 4
Status: Draft

---

## Overview

Epic 4 implements the user-facing MCP v2 API server that exposes semantic code search to AI assistants (Claude Desktop, GitHub Copilot). This is the "read path" of the govscraperepo architecture - a thin, high-performance wrapper around the AI Search infrastructure built in Epics 2-3.

The epic delivers three core capabilities: (1) MCP v2 protocol-compliant request/response handling with proper validation and error responses, (2) a semantic search endpoint that queries Cloudflare AI Search and returns enriched results with repository metadata and GitHub links, and (3) comprehensive API error handling with structured logging for debugging and compliance.

This epic transforms the ingestion pipeline and search infrastructure into a production-ready developer tool, enabling the core product vision of "ambient code discovery through AI assistants."

## Objectives and Scope

**In Scope:**
- MCP v2 protocol foundation with POST /mcp/search endpoint, request/response validation, proper headers (X-MCP-Version: 2), and CORS configuration
- Semantic search endpoint integrating AI Search queries with result enrichment (metadata, GitHub links, Codespaces links)
- Comprehensive error handling with standard HTTP status codes (200, 400, 500, 503) and PRD-compliant error response format
- Structured JSON logging for all API requests with requestId correlation, operation tracking, and performance metrics
- Input validation and sanitization (query length 3-500 chars, limit 1-20, default 5)
- Health check endpoint for monitoring and integration testing

**Out of Scope (Deferred to Later Phases):**
- Authentication and authorization (no JWT/API keys in Epic 4 - open access MCP API)
- Rate limiting enforcement (handled at Cloudflare platform level, not application code)
- User accounts or personalization features
- Advanced filtering (by sector, language, popularity) - Phase 2
- OpenAPI specification generation (Story 5.2)
- Web interface (Phase 2)
- Procurement intelligence features (Phase 3)

**Success Criteria:**
- API compliant with MCP v2 protocol specification (validated with Claude Desktop integration test)
- Query response time <2s p95 for typical searches (5 results)
- All API errors return structured JSON in PRD format with appropriate HTTP status codes
- 100% of API requests logged with structured JSON including requestId, duration, and operation context

## System Architecture Alignment

Epic 4 implements the **read path** of the write/read separation architecture pattern. The API layer is deployed as Cloudflare Workers (src/index.ts, src/api/) and consumes the search infrastructure built in Epic 3.

**Architecture Components Referenced:**
- **Cloudflare Workers Runtime:** TypeScript 5.9+ with @cloudflare/workers-types, strict mode enabled, ES2022 target
- **AI Search Integration:** Queries Cloudflare AI Search service via Epic 3's `ai-search-client.ts` module
- **Result Enrichment:** Uses Epic 3's `result-enricher.ts` to add metadata and GitHub links
- **Structured Logging:** Leverages Epic 1's `src/utils/logger.ts` for JSON logging with requestId correlation
- **Error Handling:** Extends Epic 1's error handler foundation with API-specific ValidationError and ServiceError classes

**Architectural Constraints:**
- No authentication required (open MCP access per PRD and Architecture ADR-002)
- Stateless Workers (no session management, all context in request)
- Edge deployment for <200ms cold start and global distribution
- Thin API wrapper pattern (minimal processing, delegate to AI Search)
- Cost target: Workers free tier covers 100k requests/day (well within MVP needs)

**Integration Points:**
- Inbound: MCP v2 clients (Claude Desktop, GitHub Copilot, future IDE extensions)
- Outbound: Cloudflare AI Search API (Epic 3), R2 for metadata (Epic 2), KV for future caching
- Observability: Cloudflare Workers Analytics, structured JSON logs to Workers log streaming

## Detailed Design

### Services and Modules

| Module | Responsibility | Input | Output | Owner/Location |
|--------|---------------|-------|--------|----------------|
| **mcp-handler.ts** | MCP v2 protocol handling, request validation, routing | HTTP Request (POST /mcp/search) | Validated MCPRequest or ValidationError | src/api/mcp-handler.ts |
| **search-endpoint.ts** | Main search logic, AI Search query, result enrichment | MCPRequest { query, limit? } | MCPResponse { results, took_ms } | src/api/search-endpoint.ts |
| **health.ts** | Health check endpoint, service connectivity validation | HTTP Request (GET /mcp/health) | JSON health status | src/api/health.ts |
| **ai-search-client.ts** (Epic 3) | AI Search API integration, query translation | Natural language query, limit | Raw search results with scores | src/search/ai-search-client.ts |
| **result-enricher.ts** (Epic 3) | Metadata enrichment, GitHub link generation | Raw search results | Enriched SearchResult[] | src/search/result-enricher.ts |
| **logger.ts** (Epic 1) | Structured JSON logging with correlation | Log level, message, context | Console JSON output | src/utils/logger.ts |
| **error-handler.ts** (Epic 1) | Global error handling, HTTP response mapping | Error object, request context | JSON error response | src/utils/error-handler.ts |
| **types.ts** | Shared TypeScript interfaces and types | N/A | Type definitions | src/types.ts |

**Module Interaction Flow:**
1. Workers fetch handler (src/index.ts) receives HTTP request
2. Routes POST /mcp/search → mcp-handler.ts
3. mcp-handler validates request → search-endpoint.ts
4. search-endpoint calls ai-search-client (Epic 3) → Cloudflare AI Search
5. AI Search returns results → result-enricher adds metadata
6. search-endpoint formats MCPResponse → mcp-handler
7. mcp-handler returns HTTP 200 with JSON

**Error Flow:**
- Validation errors → ValidationError → 400 Bad Request
- AI Search failures → ServiceError → 500/503 with retry_after
- Unhandled exceptions → Global error handler → 500 Internal Server Error

### Data Models and Contracts

**MCPRequest (Request Body):**
```typescript
interface MCPRequest {
  query: string;      // Required: 3-500 characters, natural language search query
  limit?: number;     // Optional: 1-20 results, default 5
}
```

**MCPResponse (Success Response):**
```typescript
interface MCPResponse {
  results: SearchResult[];  // Array of enriched search results
  took_ms: number;          // Total response time in milliseconds
}
```

**SearchResult (Result Item):**
```typescript
interface SearchResult {
  repo_url: string;           // Full GitHub URL: https://github.com/{org}/{repo}
  repo_org: string;           // Organization name (e.g., "alphagov")
  repo_name: string;          // Repository name (e.g., "govuk-frontend")
  snippet: string;            // Code snippet from AI Search (3-5 lines)
  last_updated: string;       // ISO8601 timestamp from pushedAt
  language?: string;          // Detected language (optional, e.g., "TypeScript")
  similarity_score: number;   // 0.0-1.0 from AI Search
  github_link: string;        // Same as repo_url
  codespaces_link: string;    // https://github.dev/{org}/{repo}
  metadata: RepoMetadata;     // Full repos.json entry
}
```

**RepoMetadata (from Epic 2):**
```typescript
interface RepoMetadata {
  url: string;         // GitHub repository URL
  pushedAt: string;    // ISO8601 timestamp of last push
  org: string;         // GitHub organization
  name: string;        // Repository name
}
```

**ErrorResponse (Error Format):**
```typescript
interface ErrorResponse {
  error: {
    code: string;        // Machine-readable error code (e.g., "INVALID_QUERY")
    message: string;     // Human-readable error message
    retry_after?: number; // Optional: seconds to wait before retry (for 503)
  }
}
```

**Error Codes:**
- `INVALID_QUERY` - Query validation failed (length, format)
- `INVALID_LIMIT` - Limit parameter out of range (1-20)
- `SEARCH_ERROR` - AI Search service failure
- `INTERNAL_ERROR` - Unexpected server error

**Validation Rules:**
- `query`: Required, 3-500 chars, UTF-8 string, trim whitespace
- `limit`: Optional, integer 1-20, default 5 if not provided
- Request body: Must be valid JSON, max 1KB payload

### APIs and Interfaces

**Endpoint 1: POST /mcp/search**

*Purpose:* Semantic code search over UK government repositories

*Request:*
```http
POST /mcp/search HTTP/1.1
Host: govreposcrape.cloud.cns.me
Content-Type: application/json
X-MCP-Version: 2
X-Request-ID: <uuid>

{
  "query": "authentication methods",
  "limit": 5
}
```

*Success Response (200 OK):*
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-MCP-Version: 2
X-Request-ID: <uuid>

{
  "results": [
    {
      "repo_url": "https://github.com/alphagov/govuk-frontend",
      "repo_org": "alphagov",
      "repo_name": "govuk-frontend",
      "snippet": "// Authentication middleware implementation...",
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

*Error Response (400 Bad Request):*
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Query must be between 3 and 500 characters"
  }
}
```

*Error Response (500 Internal Server Error):*
```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": {
    "code": "SEARCH_ERROR",
    "message": "AI Search service temporarily unavailable",
    "retry_after": 60
  }
}
```

**Endpoint 2: GET /mcp/health**

*Purpose:* Health check for monitoring and integration testing

*Request:*
```http
GET /mcp/health HTTP/1.1
Host: govreposcrape.cloud.cns.me
```

*Success Response (200 OK):*
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "services": {
    "workers": "ok",
    "ai_search": "ok",
    "r2": "ok"
  },
  "timestamp": "2025-11-14T10:30:00Z"
}
```

**HTTP Status Codes:**
- `200 OK` - Successful query, results returned (may be empty array)
- `400 Bad Request` - Invalid request format, validation failed
- `401 Unauthorized` - Not used in Epic 4 (no auth)
- `429 Too Many Requests` - Not enforced in Epic 4 (Cloudflare platform handles)
- `500 Internal Server Error` - AI Search failure, unexpected error
- `503 Service Unavailable` - Maintenance mode or service degradation

**CORS Configuration:**
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS, GET
Access-Control-Allow-Headers: Content-Type, X-MCP-Version, X-Request-ID
```

**Headers:**
- `X-MCP-Version: 2` - Protocol version (both request and response)
- `X-Request-ID: <uuid>` - Optional correlation ID (recommended for debugging)
- `Content-Type: application/json` - All requests and responses

### Workflows and Sequencing

**Happy Path: Successful Search Query**

1. **Request Reception** (src/index.ts fetch handler)
   - Receive HTTP POST to /mcp/search
   - Extract X-Request-ID or generate new UUID
   - Start performance timer

2. **Request Validation** (mcp-handler.ts)
   - Parse JSON body
   - Validate Content-Type: application/json
   - Check X-MCP-Version header (version 2)
   - Route to search endpoint

3. **Input Validation** (search-endpoint.ts)
   - Validate query: 3-500 chars, trim whitespace
   - Validate limit: 1-20 or default to 5
   - Throw ValidationError if invalid → 400 response

4. **AI Search Query** (ai-search-client.ts from Epic 3)
   - Translate MCPRequest to AI Search query
   - Execute search via Cloudflare AI Search binding
   - Receive raw results with similarity scores
   - Handle AI Search errors → ServiceError

5. **Result Enrichment** (result-enricher.ts from Epic 3)
   - For each raw result:
     - Parse R2 object path to extract org/repo
     - Generate GitHub link: `https://github.com/{org}/{repo}`
     - Generate Codespaces link: `https://github.dev/{org}/{repo}`
     - Attach full RepoMetadata from R2 object metadata
   - Return enriched SearchResult[]

6. **Response Formatting** (search-endpoint.ts)
   - Calculate took_ms (current time - start time)
   - Build MCPResponse { results, took_ms }
   - Return to mcp-handler

7. **Response Delivery** (mcp-handler.ts)
   - Set headers: Content-Type, X-MCP-Version, X-Request-ID
   - Log request: { requestId, operation: "search", duration, query, resultCount }
   - Return HTTP 200 with JSON body

**Error Path: Validation Failure**

1. Request received → mcp-handler validates
2. Invalid query (too short/long) → throw ValidationError
3. Error handler catches → map to ErrorResponse
4. Return HTTP 400 with { error: { code, message } }
5. Log error: { requestId, operation: "search", error: "INVALID_QUERY" }

**Error Path: AI Search Failure**

1. Request validated successfully
2. AI Search query fails (timeout, service unavailable)
3. ai-search-client throws ServiceError
4. Error handler catches → determine retry_after (60s)
5. Return HTTP 500/503 with { error: { code, message, retry_after } }
6. Log error: { requestId, operation: "search", error: "SEARCH_ERROR", aiSearchStatus: "unavailable" }

**Sequence Diagram (Text Format):**
```
Client → Workers: POST /mcp/search { query, limit }
Workers → mcp-handler: validate & route
mcp-handler → search-endpoint: MCPRequest
search-endpoint → ai-search-client: query AI Search
ai-search-client → AI Search: search query
AI Search → ai-search-client: raw results
ai-search-client → search-endpoint: raw results
search-endpoint → result-enricher: enrich results
result-enricher → R2: fetch metadata (if needed)
R2 → result-enricher: metadata
result-enricher → search-endpoint: enriched SearchResult[]
search-endpoint → mcp-handler: MCPResponse
mcp-handler → logger: log request
mcp-handler → Client: HTTP 200 JSON response
```

**Performance Budget Breakdown (2s p95 target):**
- Request validation: <10ms
- AI Search query: <800ms (p95)
- Result enrichment: <100ms (metadata fetch)
- Response serialization: <50ms
- Network latency: <500ms (edge deployment)
- Buffer: ~540ms

## Non-Functional Requirements

### Performance

**NFR-1.1: Query Response Time**
- **Target:** <2 seconds p95 end-to-end query response
- **Measurement:** Workers Analytics, real-user monitoring via structured logs
- **Breakdown:** AI Search <800ms + enrichment <100ms + serialization <50ms + network <500ms + buffer ~540ms
- **Validation:** Load testing with 100 concurrent requests, measure p50/p95/p99
- **Mitigation:** Edge deployment (Cloudflare global network), minimal processing (thin wrapper), async operations where possible

**NFR-1.2: Cold Start Latency**
- **Target:** <200ms Workers cold start time
- **Rationale:** Edge deployment with minimal dependencies (no heavy libraries)
- **Validation:** Cloudflare Workers dashboard metrics, first-request timing in different regions
- **Optimization:** Tree-shaking via esbuild, minimal module imports, no large JSON parsing at startup

**NFR-1.3: Empty Result Performance**
- **Target:** Empty results (no matches) should return in <500ms p95
- **Rationale:** AI Search with no matches is faster than result enrichment
- **Validation:** Test queries with no expected matches, measure response time

**NFR-1.4: Throughput**
- **MVP Target:** 100 queries/day sustained
- **Scale Target (12 months):** 10,000 queries/day sustained
- **Constraint:** Cloudflare Workers auto-scaling handles millions RPS, bottleneck is AI Search (unknown limits, monitor early)
- **Cost Impact:** Workers free tier covers 100k requests/day (well within MVP needs)

### Security

**NFR-2.1: NCSC Secure Coding Standards Compliance**
- **Requirements:**
  - Input validation on all API endpoints (query length, limit range, JSON format)
  - Output encoding (JSON only, no HTML rendering, no XSS risk)
  - No eval(), Function(), or dynamic code execution
  - Dependencies scanned weekly via npm audit in CI/CD
  - No secrets in logs or error messages
- **Validation:** Security checklist review (SECURITY.md), automated npm audit in pre-commit hooks
- **Tools:** ESLint security rules, npm audit, Dependabot

**NFR-2.2: Read-Only Access Pattern**
- **Requirement:** Zero write operations to external systems (GitHub, R2 write limited to Epic 2 container)
- **Implementation:** Workers only read from AI Search and R2, no mutation operations
- **Rationale:** Prevents supply chain compromise, aligns with least privilege principle

**NFR-2.3: Audit Logging**
- **Metric:** 100% of API queries logged with metadata
- **Log Fields:** timestamp, requestId, operation: "search", query (truncated if >100 chars), resultCount, duration, statusCode
- **Retention:** Cloudflare Workers logs (7 days default), structured JSON for export to long-term storage (Phase 2)
- **Privacy:** No PII logged (all data is public GitHub repos, queries are user-initiated)
- **Rationale:** Transparency, abuse detection, compliance, debugging

**NFR-2.4: Transport Security**
- **Requirement:** HTTPS only (TLS 1.3)
- **Implementation:** Cloudflare automatic HTTPS enforcement, no HTTP listeners
- **Validation:** All endpoints force HTTPS redirect

**NFR-2.5: Dependency Security**
- **Requirement:** Zero high/critical CVEs in production dependencies
- **Process:** Weekly npm audit scans, 48-hour patching SLA for critical issues
- **Tools:** npm audit, Dependabot (auto-create PRs for security updates)
- **Validation:** CI/CD blocks deployment if critical vulnerabilities detected

**NFR-2.6: Input Sanitization**
- **Query Sanitization:** Trim whitespace, validate UTF-8, check length (3-500 chars)
- **Limit Sanitization:** Type check (must be integer), range check (1-20)
- **JSON Validation:** Max payload size 1KB, reject malformed JSON with 400 error
- **SQL Injection:** Not applicable (no SQL database, AI Search API uses semantic search)
- **XSS:** Not applicable (API only, no HTML rendering)

### Reliability/Availability

**NFR-6.1: API Uptime**
- **Target:** 99.9% uptime for MVP (43 minutes/month downtime budget)
- **Measurement:** Cloudflare Workers Analytics, uptime monitoring (Pingdom/UptimeRobot)
- **SLA Dependency:** Cloudflare Workers SLA 99.99%, AI Search SLA unknown (Preview service)
- **Rationale:** Government infrastructure expectations, developer trust

**NFR-6.2: Error Rate**
- **Target:** <0.1% API error rate (5xx responses)
- **Monitoring:** Cloudflare Workers exception tracking, structured logs
- **Alerting:** Error rate >1% triggers alert (email/Slack)
- **Rationale:** High error rate indicates broken user experience

**NFR-6.3: Graceful Degradation**
- **Requirement:** AI Search unavailable → return 503 with retry_after instead of crash
- **Fallback Strategy:** Future consideration - cache popular query results in KV for emergency fallback
- **Error Handling:** All external service calls wrapped in try/catch with appropriate error mapping
- **Timeout Handling:** AI Search queries timeout after 5s, return 503 to client

**NFR-6.4: Health Check Reliability**
- **Requirement:** GET /mcp/health must respond even if AI Search is down
- **Implementation:** Health check tests Workers execution + connectivity checks (non-blocking)
- **Response:** Partial degradation reported as "degraded" status with details
- **Use Case:** Load balancer health checks, monitoring systems, integration tests

### Observability

**Structured Logging (All API Requests):**
- **Format:** JSON with consistent schema from Epic 1's logger.ts
- **Required Fields:**
  - timestamp (ISO8601)
  - level (info/warn/error)
  - requestId (UUID correlation ID)
  - operation ("search", "health")
  - duration (milliseconds)
  - statusCode (HTTP status)
- **Optional Fields:**
  - query (truncated to 100 chars for privacy)
  - resultCount (number of results returned)
  - error (error code if failed)
  - metadata (additional context)

**Key Metrics to Track:**
- **Query Volume:** Total queries per day/week, trending over time
- **Response Time Distribution:** p50, p95, p99 latencies
- **Error Rate:** 4xx vs 5xx errors, breakdown by error code
- **Empty Result Rate:** Percentage of queries returning zero results (search quality indicator)
- **AI Search Performance:** Time spent in AI Search API calls
- **Top Queries:** Most frequent search terms (anonymized)

**Cloudflare Workers Analytics:**
- Built-in request metrics (volume, latency, status codes)
- Geographic distribution of requests
- Edge location performance
- CPU time per request

**Custom Dashboards (Phase 2):**
- Real-time query volume chart
- Response time percentiles over time
- Error rate trends
- Popular search terms word cloud
- Cost per query tracking

**Alerting Thresholds:**
- Error rate >1% for 5 minutes → Alert
- p95 response time >2s for 5 minutes → Alert
- Daily query volume <10 (low adoption) → Weekly report
- AI Search unavailable (health check fails) → Immediate alert

## Dependencies and Integrations

**Runtime Dependencies (package.json):**
- `@cloudflare/workers-types` ^4.20241127.0 - TypeScript types for Workers runtime
- No runtime dependencies (Workers optimized for minimal bundle size)

**Dev Dependencies:**
- `typescript` ^5.9.0 - TypeScript compiler with strict mode
- `vitest` ^4.0.0 - Test framework
- `@cloudflare/vitest-pool-workers` - Workers-specific test pool
- `wrangler` ^4.47.0 - Cloudflare Workers CLI and deployment tool
- `eslint` - Code linting for quality
- `prettier` - Code formatting

**Cloudflare Service Integrations (Epic 1 provisioned):**
- **AI Search Binding:** Configured in wrangler.toml, provides semantic search capability
- **R2 Bucket:** `govscraperepo-gitingest` for metadata fetching (Epic 2)
- **KV Namespace:** `govscraperepo-cache` for future query caching (optional in Epic 4)
- **Workers Analytics:** Built-in observability

**Epic Dependencies (Must be Complete Before Epic 4):**
- **Epic 1 (Foundation):** Logger.ts, error-handler.ts, types.ts, wrangler.toml configuration
- **Epic 2 (Ingestion):** R2 storage with gitingest summaries and metadata
- **Epic 3 (AI Search):** ai-search-client.ts, result-enricher.ts, AI Search configured and indexing

**External Service Dependencies:**
- **Cloudflare AI Search:** Managed service (Preview), queries return results with similarity scores
- **GitHub (indirect):** Links generated to github.com and github.dev, no API calls from Workers

**MCP Protocol Integration:**
- **MCP v2 Specification:** https://modelcontextprotocol.io/v2
- **Client Compatibility:** Claude Desktop, GitHub Copilot (when MCP support ships), Cursor, Continue.dev
- **Protocol Requirements:** JSON request/response, X-MCP-Version header, standard error codes

**No Authentication Dependencies:**
- No OAuth providers
- No JWT libraries (open access API per Architecture ADR-002)
- No rate limiting libraries (Cloudflare platform handles)

**Dependency Security:**
- All dependencies vetted via npm audit
- Dependabot enabled for automated security updates
- Weekly security scans in CI/CD

## Acceptance Criteria (Authoritative)

**AC-1: MCP v2 Protocol Compliance (Story 4.1)**
- [ ] POST /mcp/search endpoint accepts JSON request body with `query` and optional `limit`
- [ ] Request validation returns 400 for missing query, query <3 chars, query >500 chars, limit <1, limit >20
- [ ] Response includes X-MCP-Version: 2 header
- [ ] Response is valid JSON with `results` array and `took_ms` number
- [ ] CORS headers configured: Access-Control-Allow-Origin: *, appropriate methods and headers
- [ ] OPTIONS preflight requests handled correctly
- [ ] Protocol version negotiation via X-MCP-Version header

**AC-2: Semantic Search Functionality (Story 4.2)**
- [ ] Query sent to AI Search via ai-search-client.ts (Epic 3)
- [ ] Results enriched with metadata via result-enricher.ts (Epic 3)
- [ ] Each SearchResult includes all required fields: repo_url, repo_org, repo_name, snippet, last_updated, similarity_score, github_link, codespaces_link, metadata
- [ ] Default limit is 5 results when not specified
- [ ] Limit parameter respected (1-20 range)
- [ ] Empty results return 200 OK with empty results array: `{ results: [], took_ms: N }`
- [ ] Response time <2s p95 for typical queries (5 results)

**AC-3: Error Handling and Logging (Story 4.3)**
- [ ] All errors return structured JSON in PRD format: `{ error: { code, message, retry_after? } }`
- [ ] ValidationError maps to 400 Bad Request with clear message
- [ ] ServiceError (AI Search failure) maps to 500/503 with retry_after
- [ ] Unhandled exceptions caught by global error handler → 500 Internal Server Error
- [ ] All API requests logged with structured JSON: requestId, operation, duration, statusCode, resultCount
- [ ] Error logs include error code and context
- [ ] No secrets or sensitive data in logs
- [ ] Correlation ID (X-Request-ID) tracked through entire request lifecycle

**AC-4: Health Check Endpoint (Story 4.3)**
- [ ] GET /mcp/health returns 200 OK with JSON status
- [ ] Health check includes Workers status, AI Search connectivity, R2 availability
- [ ] Health check responds even if AI Search is degraded (reports "degraded" status)
- [ ] Response format: `{ status: "healthy|degraded", services: {...}, timestamp: ISO8601 }`

**AC-5: Input Validation and Sanitization (Story 4.1)**
- [ ] Query trimmed of whitespace
- [ ] Query validated: 3-500 characters
- [ ] Limit validated: integer 1-20 or default to 5
- [ ] Malformed JSON returns 400 with clear error message
- [ ] Request payload >1KB rejected with 400 error

**AC-6: Performance Requirements (Cross-Story)**
- [ ] p95 response time <2s for typical queries (measured via load testing)
- [ ] Cold start latency <200ms (measured via Workers Analytics)
- [ ] Empty result queries <500ms p95
- [ ] Able to handle 100 concurrent requests without degradation

**AC-7: Security Compliance (Cross-Story)**
- [ ] All endpoints HTTPS only (TLS 1.3)
- [ ] Input validation on all parameters (query, limit)
- [ ] No eval(), Function(), or dynamic code execution
- [ ] npm audit shows zero high/critical vulnerabilities
- [ ] Error messages do not leak internal implementation details
- [ ] CORS configured securely (no credential sharing)

**AC-8: Integration Testing (Cross-Story)**
- [ ] Successfully integrates with Claude Desktop (manual MCP configuration test)
- [ ] curl test query returns valid results: `curl -X POST https://govreposcrape.cloud.cns.me/mcp/search -H "Content-Type: application/json" -d '{"query":"authentication","limit":5}'`
- [ ] Health check accessible: `curl https://govreposcrape.cloud.cns.me/mcp/health`
- [ ] All TypeScript types compile without errors: `npm run type-check`
- [ ] All unit tests pass: `npm test` with >80% coverage

## Traceability Mapping

| Acceptance Criteria | PRD Requirement | Architecture Component | Test Approach |
|---------------------|-----------------|------------------------|---------------|
| AC-1: MCP Protocol | FR-3.1 MCP v2 Protocol Compliance | src/api/mcp-handler.ts | Unit tests for validation, integration test with Claude Desktop |
| AC-2: Search Function | FR-2.2 Semantic Search API, FR-2.3 Result Metadata | src/api/search-endpoint.ts, Epic 3 modules | Unit tests with mocked AI Search, integration test with real data |
| AC-3: Error Handling | FR-3.4 Health & Monitoring, FR-8.2 Audit Logging | src/utils/error-handler.ts, logger.ts | Unit tests for error cases, verify log format |
| AC-4: Health Check | FR-3.4 Health & Monitoring | src/api/health.ts | Integration test against deployed service |
| AC-5: Input Validation | NFR-2.1 NCSC Secure Coding | src/api/mcp-handler.ts validation | Unit tests with invalid inputs, fuzzing |
| AC-6: Performance | NFR-1.1 Query Response Time <2s | Edge deployment, thin wrapper pattern | Load testing with k6/artillery, p95 measurement |
| AC-7: Security | NFR-2.1 NCSC Standards, NFR-2.4 Transport Security | TLS, input validation, dependency scanning | npm audit, security checklist review |
| AC-8: Integration | FR-4.1 MCP Configuration, Success Metric: 20+ adopters | MCP endpoint, documentation | Manual Claude Desktop test, curl examples |

**PRD to Epic 4 Mapping:**
- **FR-3.1 MCP v2 Protocol:** Delivered via Stories 4.1, 4.2 (protocol handler, search endpoint)
- **FR-3.2 JWT Auth:** NOT in Epic 4 (deferred per ADR-002)
- **FR-3.3 Rate Limiting:** NOT in Epic 4 (Cloudflare platform handles)
- **FR-3.4 Health & Monitoring:** Delivered via Story 4.3 (health endpoint, logging)
- **FR-2.2 Semantic Search:** Integrates Epic 3's AI Search client
- **FR-2.3 Result Metadata:** Integrates Epic 3's result enricher

**Architecture to Epic 4 Mapping:**
- **Read Path Pattern:** Epic 4 implements read path (thin API wrapper over Epic 3)
- **Error Handling Strategy:** Extends Epic 1 error classes (ValidationError, ServiceError)
- **Logging Pattern:** Uses Epic 1 structured logger with requestId correlation
- **Naming Conventions:** All modules follow kebab-case.ts, functions camelCase
- **TypeScript Strict Mode:** All code compiles with strict: true

**Epic Dependencies Trace:**
- **Epic 1 → Epic 4:** Logger, error handler, types, wrangler config
- **Epic 2 → Epic 4:** R2 metadata (indirect, via Epic 3 enricher)
- **Epic 3 → Epic 4:** AI Search client, result enricher (direct integration)

**Success Metrics Trace:**
- **PRD Success: "20+ early adopters integrate MCP"** → AC-8 Integration Testing validates this is possible
- **PRD Success: "<2s query response"** → AC-6 Performance validates this target
- **PRD Success: "Hundreds of uses per week"** → Enabled by AC-1 protocol compliance + AC-8 ease of integration

## Risks, Assumptions, Open Questions

**Risks:**

1. **RISK: AI Search Quality Insufficient**
   - **Impact:** Search results not relevant, developers don't trust/use the API
   - **Likelihood:** Medium (AI Search is Preview, quality unknown until tested)
   - **Mitigation:** Epic 3.4 validates baseline quality before Epic 4. If insufficient, defer Epic 4 and improve search quality first
   - **Fallback:** Migrate to custom embeddings (Phase 2 plan exists in PRD)

2. **RISK: AI Search Service Instability**
   - **Impact:** Frequent 503 errors, poor user experience, adoption failure
   - **Likelihood:** Medium (Preview service, no published SLA)
   - **Mitigation:** Graceful error handling with retry_after, health check monitoring, fallback to cached results (Phase 2)
   - **Escalation Path:** If AI Search unreliable, accelerate Phase 2 custom embeddings migration

3. **RISK: Response Time >2s**
   - **Impact:** Fails PRD requirement, poor developer experience
   - **Likelihood:** Low (edge deployment + thin wrapper should be fast)
   - **Mitigation:** Performance budget breakdown shows achievable, load testing validates before launch
   - **Fallback:** Optimize result enrichment (cache metadata in KV), reduce default limit from 5 to 3

4. **RISK: MCP Protocol Adoption Barrier**
   - **Impact:** Developers find MCP configuration too complex, low adoption
   - **Likelihood:** Low (configuration is one JSON file edit)
   - **Mitigation:** Epic 5 provides step-by-step guides, test with early adopters for feedback
   - **Fallback:** Prioritize web UI (Phase 2) if MCP integration proves difficult

5. **RISK: Epic 3 Dependencies Incomplete**
   - **Impact:** Cannot start Epic 4 development, timeline delay
   - **Likelihood:** Low (Epic 3 stories well-defined)
   - **Mitigation:** Validate Epic 3 completion before Epic 4 kickoff, ensure ai-search-client.ts and result-enricher.ts exist and tested
   - **Blocker:** Epic 4 cannot proceed until Epic 3 Stories 3.2 and 3.3 complete

**Assumptions:**

1. **ASSUMPTION: Epic 1, 2, 3 Complete**
   - Logger, error handler, types exist and tested
   - R2 has gitingest summaries with metadata
   - AI Search configured and indexing R2 content
   - ai-search-client.ts and result-enricher.ts modules exist

2. **ASSUMPTION: AI Search API Stable Enough for MVP**
   - Preview service works for ~100 queries/day MVP load
   - Some instability acceptable if gracefully handled
   - Phase 2 migration path exists if quality/stability insufficient

3. **ASSUMPTION: No Authentication Required**
   - Open MCP access per Architecture ADR-002 is acceptable for MVP
   - Cloudflare platform-level rate limiting prevents abuse
   - No PII or sensitive data in queries/results

4. **ASSUMPTION: Claude Desktop Supports MCP v2**
   - MCP v2 protocol specification is stable
   - Claude Desktop supports JSON-based MCP configuration
   - Integration can be validated manually before Epic 5 documentation

5. **ASSUMPTION: 21k Repos Already Indexed**
   - Epic 2 ingestion pipeline has processed majority of repos.json feed
   - AI Search has indexed the R2 content
   - Enough test data exists to validate search quality

**Open Questions:**

1. **QUESTION: AI Search Preview Pricing?**
   - Status: Unknown, Cloudflare hasn't published AI Search pricing
   - Impact: Critical for cost target (<£50/month)
   - Next Step: Contact Cloudflare support for Preview pricing guidance before Epic 4 start
   - Decision Point: If cost >£30/month for AI Search, may need to accelerate custom embeddings

2. **QUESTION: AI Search Query Limits?**
   - Status: Unknown, no published rate limits for AI Search
   - Impact: May hit throttling at scale (thousands of queries/day)
   - Next Step: Monitor early and ask Cloudflare about limits
   - Mitigation: Implement KV caching for popular queries if limits discovered

3. **QUESTION: GitHub Copilot MCP Support Timeline?**
   - Status: Unclear if Copilot supports MCP v2 yet
   - Impact: Affects Epic 5 documentation and adoption potential
   - Next Step: Research Copilot MCP status during Epic 4, document "Coming soon" if not available
   - Workaround: Focus on Claude Desktop for MVP, add Copilot in Phase 2

4. **QUESTION: Metadata Fetch Performance from R2?**
   - Status: Unknown if R2 HEAD requests add significant latency to result enrichment
   - Impact: Could affect <2s response time target
   - Next Step: Test during Epic 4 Story 4.2 development
   - Mitigation: Cache metadata in KV if R2 fetches too slow

5. **QUESTION: Health Check Service Connectivity Test Implementation?**
   - Status: How to test AI Search connectivity without making a real query?
   - Impact: Health check accuracy
   - Next Step: Research AI Search API for health/ping endpoint, fallback to lightweight test query
   - Alternative: Health check reports "unknown" for AI Search if no ping endpoint exists

## Test Strategy Summary

**Test Levels:**

**1. Unit Tests (Vitest + @cloudflare/vitest-pool-workers)**
- **Coverage Target:** 80%+ for core logic modules
- **Framework:** Vitest 4.0+ with Workers test pool
- **Location:** Co-located with source (e.g., `mcp-handler.test.ts` next to `mcp-handler.ts`)
- **Scope:**
  - Request validation (mcp-handler.ts): valid/invalid query, valid/invalid limit, malformed JSON
  - Input sanitization: whitespace trimming, UTF-8 validation, length checks
  - Error response formatting: ValidationError → 400, ServiceError → 500/503
  - Logging output: verify structured JSON format, requestId correlation
  - Type checking: all TypeScript interfaces compile without errors

**2. Integration Tests**
- **Scope:**
  - MCP endpoint with mocked AI Search: POST /mcp/search returns valid MCPResponse
  - Health check endpoint: GET /mcp/health returns status JSON
  - Epic 3 integration: ai-search-client and result-enricher modules return expected data
  - Error scenarios: AI Search failure returns 503, validation failure returns 400
- **Test Data:** Sample repos.json entries, mocked AI Search responses
- **Environment:** Local wrangler dev server or staging deployment

**3. End-to-End Tests**
- **Manual Claude Desktop Integration:**
  - Configure Claude Desktop with MCP endpoint
  - Test query: "authentication methods" returns relevant government repos
  - Verify result format: all SearchResult fields populated correctly
  - Test error handling: invalid query returns 400 with clear message
- **curl Integration Tests:**
  - Valid search query: `curl -X POST ... -d '{"query":"test","limit":5}'`
  - Invalid query (too short): `curl -X POST ... -d '{"query":"ab"}'` → 400
  - Health check: `curl .../mcp/health` → 200 with status JSON
- **Load Testing (k6 or Artillery):**
  - 100 concurrent requests sustained for 1 minute
  - Measure p50, p95, p99 response times
  - Validate <2s p95 target achieved
  - Monitor error rate stays <0.1%

**4. Performance Testing**
- **Tools:** k6 (load testing), Cloudflare Workers Analytics (real-user monitoring)
- **Scenarios:**
  - Happy path: 5 results, typical query → measure response time
  - Empty results: query with no matches → measure response time
  - Cold start: first request to new Workers instance → measure latency
  - Concurrent load: 100 simultaneous requests → measure throughput
- **Metrics:**
  - p50, p95, p99 response times
  - Requests per second (RPS)
  - Error rate percentage
  - Cold start latency

**5. Security Testing**
- **Automated:**
  - npm audit (zero high/critical CVEs)
  - ESLint security rules
  - Input fuzzing (random invalid inputs)
- **Manual:**
  - NCSC secure coding checklist review
  - Verify no secrets in logs
  - Validate HTTPS enforcement
  - Test CORS configuration
  - Confirm input sanitization prevents injection attacks

**6. Acceptance Testing**
- **Checklist:** Run through all 8 AC sections (AC-1 through AC-8)
- **Validation:** Each acceptance criteria checkbox must pass before epic complete
- **Documentation:** Record test results, screenshots for manual tests
- **Sign-off:** Product owner approval after all ACs validated

**Test Data:**
- **Sample Queries:** "authentication methods", "postcode validation", "NHS API integration"
- **Invalid Inputs:** empty query, 2-char query, 501-char query, limit=-1, limit=21, malformed JSON
- **Mock AI Search Responses:** 5 results with similarity scores, empty results, error response
- **Mock R2 Metadata:** Sample RepoMetadata for enrichment testing

**Regression Testing:**
- Re-run all unit tests on every commit
- Integration tests on every deployment to staging
- Load tests before production deployment
- Manual Claude Desktop test before epic sign-off

**Test Automation:**
- CI/CD pipeline runs unit tests automatically
- Pre-commit hooks run type checking and linting
- Staging deployment triggers integration test suite
- Production deployment requires manual approval after tests pass

**Coverage Tracking:**
- Vitest coverage report: `npm run test:coverage`
- Target: 80%+ coverage for src/api/ modules
- Uncovered code requires justification (e.g., error handlers for edge cases)
