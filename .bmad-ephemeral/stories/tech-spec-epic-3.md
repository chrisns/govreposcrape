# Epic Technical Specification: AI Search Integration (Managed Service Layer)

Date: 2025-11-13
Author: cns
Epic ID: 3
Status: Draft

---

## Overview

Epic 3 establishes the semantic search capability for govscraperepo by integrating Cloudflare AI Search as a managed RAG (Retrieval-Augmented Generation) service. This epic validates the core hypothesis that gitingest-generated code summaries provide sufficient quality for semantic search without requiring custom embedding infrastructure. The managed service approach enables zero-code semantic search, automatic indexing of R2 bucket contents, and rapid MVP validation within the <£50/month cost constraint.

This epic bridges the data ingestion pipeline (Epic 2) with the user-facing MCP API (Epic 4), acting as the intelligence layer that transforms stored gitingest summaries into searchable, semantically-relevant results.

## Objectives and Scope

**In Scope:**

- Cloudflare AI Search configuration to monitor R2 bucket containing gitingest summaries
- Automatic indexing of new/updated gitingest files from R2 without manual triggers
- AI Search query API integration within Cloudflare Workers
- Result enrichment with repository metadata (org, repo name, GitHub links, Codespaces URLs)
- Performance validation: <2s query response time (p95), <5 minute indexing lag
- Baseline search quality measurement: 80%+ relevance for top 5 results
- Decision framework: Continue with AI Search vs migrate to custom embeddings (Phase 2)

**Out of Scope:**

- Custom embedding generation (deferred to Phase 2 if AI Search quality insufficient)
- Advanced chunking strategies (AST-based function splitting, semantic blocks)
- Hybrid search (semantic + BM25 syntactic ranking)
- Custom Vectorize index management
- Recency boosting or custom scoring algorithms
- Web interface for search (Phase 2)
- User accounts or personalization
- Trust signals or sector filtering (Phase 2)

**Success Criteria:**

- AI Search successfully indexes all gitingest summaries from R2 (21,000 repos)
- Natural language queries return relevant results ("authentication methods" finds auth implementations)
- 80%+ of test queries show relevant results in top 5 (manual assessment)
- Query response time <2s end-to-end (p95)
- Indexing lag <5 minutes from R2 upload to searchable
- Decision made: Continue with AI Search OR plan migration to custom embeddings

## System Architecture Alignment

**Architectural Context:**

Epic 3 sits at the intelligence layer between data storage (Epic 2) and API exposure (Epic 4):

```
Epic 2 (Data Ingestion) → R2 (gitingest summaries)
  ↓
AI Search (Auto-indexing + Query) ← Epic 3
  ↓
Epic 4 (MCP API) → Developers (Claude, Copilot)
```

**Components from Architecture:**

- **R2 Bucket:** `govreposcrape-gitingest` with path structure `gitingest/{org}/{repo}/summary.txt`
- **AI Search Service:** Cloudflare AI Search (Preview) with automatic R2 monitoring
- **Workers Integration:** Service binding `AI_SEARCH` in wrangler.toml
- **Search Client Module:** `src/search/ai-search-client.ts` for query execution
- **Result Enricher Module:** `src/search/result-enricher.ts` for metadata augmentation

**Alignment with Architectural Decisions:**

- **ADR-003 (Managed AI Search):** Validates managed service approach before custom infrastructure investment
- **ADR-001 (Cloudflare Workers):** Leverages Cloudflare ecosystem for cost efficiency and edge deployment
- **Cost Constraint (NFR-7.1):** AI Search pricing expected <£30/month for 21k documents (validated during MVP)
- **Performance Requirement (NFR-1.1):** AI Search retrieval <800ms (p95) contributes to <2s end-to-end target

**Constraints:**

- AI Search is in Preview (not GA) - expect occasional service issues, plan graceful degradation
- Unknown pricing model during Preview - monitor costs closely, alert if exceeding budget
- Limited control over embedding model or ranking algorithm
- Indexing lag dependent on Cloudflare's auto-indexing frequency (target <5 minutes)

## Detailed Design

### Services and Modules

| Service/Module | Responsibility | Inputs | Outputs | Owner |
|----------------|----------------|--------|---------|-------|
| **Cloudflare AI Search** | Managed RAG service: auto-index R2 contents, generate embeddings, semantic search | R2 bucket path, file pattern, query text | Search results with snippets and similarity scores | Cloudflare (managed service) |
| **ai-search-client.ts** | Query interface to AI Search API, error handling, retry logic | Natural language query string, limit (1-20) | Raw search results with scores | Story 3.2 |
| **result-enricher.ts** | Augment results with GitHub metadata, links, Codespaces URLs | Raw AI Search result, R2 object path | Enriched SearchResult with full metadata | Story 3.3 |
| **R2 Metadata Service** | Fetch custom metadata from R2 objects (pushedAt, url, processedAt) | R2 object key | RepoMetadata object | Story 3.3 |
| **Performance Test Harness** | Execute test queries, measure response time, assess relevance | Test query suite | Baseline metrics: p95 latency, relevance scores | Story 3.4 |

### Data Models and Contracts

**AI Search Configuration (Cloudflare Dashboard):**

```yaml
source:
  type: r2_bucket
  bucket: govscraperepo-gitingest
  prefix: gitingest/
  pattern: "**/*.txt"

indexing:
  mode: continuous
  update_frequency: real-time

embedding:
  model: automatic  # Managed by Cloudflare
  dimension: unknown  # Cloudflare-managed
```

**AISearchResult (Raw Response):**

```typescript
interface AISearchResult {
  content: string;          // Code snippet from gitingest summary
  score: number;            // Similarity score (0.0-1.0)
  metadata: {
    path: string;           // R2 object path: gitingest/{org}/{repo}/summary.txt
    contentType: string;    // text/plain
  };
}
```

**EnrichedSearchResult (After Enrichment):**

```typescript
interface SearchResult {
  repo_url: string;           // https://github.com/{org}/{repo}
  repo_org: string;           // Parsed from R2 path
  repo_name: string;          // Parsed from R2 path
  snippet: string;            // AI Search content snippet
  last_updated: string;       // ISO8601 from R2 metadata (pushedAt)
  language?: string;          // Detected from gitingest (optional)
  similarity_score: number;   // 0.0-1.0 from AI Search
  github_link: string;        // https://github.com/{org}/{repo}
  codespaces_link: string;    // https://github.dev/{org}/{repo}
  metadata: RepoMetadata;     // From R2 custom metadata
}
```

**R2 Object Metadata (From Epic 2):**

```typescript
interface R2ObjectMetadata {
  customMetadata: {
    pushedAt: string;       // ISO8601 timestamp
    url: string;            // Full GitHub URL
    processedAt: string;    // When gitingest completed
  };
}
```

### APIs and Interfaces

**AISearchClient Interface:**

```typescript
interface AISearchClient {
  /**
   * Execute semantic search query against indexed R2 contents
   * @param query Natural language search string (3-500 chars)
   * @param limit Number of results to return (1-20)
   * @returns Promise of raw AI Search results
   * @throws ServiceError if AI Search unavailable
   */
  searchCode(query: string, limit: number): Promise<AISearchResult[]>;

  /**
   * Health check for AI Search connectivity
   * @returns Promise<boolean> true if service reachable
   */
  checkHealth(): Promise<boolean>;
}
```

**ResultEnricher Interface:**

```typescript
interface ResultEnricher {
  /**
   * Enrich raw AI Search result with GitHub metadata and links
   * @param rawResult Result from AI Search
   * @returns Promise of enriched SearchResult
   */
  enrichResult(rawResult: AISearchResult): Promise<SearchResult>;

  /**
   * Batch enrich multiple results (parallel execution)
   * @param rawResults Array of AI Search results
   * @returns Promise of enriched SearchResult array
   */
  enrichResults(rawResults: AISearchResult[]): Promise<SearchResult[]>;
}
```

**Cloudflare AI Search API (Workers Binding):**

```typescript
// Service binding in wrangler.toml
interface Env {
  AI_SEARCH: {
    query(request: {
      query: string;
      top_k?: number;
      filters?: Record<string, any>;
    }): Promise<{
      results: AISearchResult[];
      took_ms: number;
    }>;
  };
}
```

**Error Codes:**

- `SEARCH_ERROR`: AI Search service unavailable or timeout
- `INVALID_QUERY`: Query validation failed (too short/long, malformed)
- `NO_RESULTS`: Query executed successfully but returned zero results (not an error, handled gracefully)
- `ENRICHMENT_ERROR`: Failed to fetch R2 metadata for result enrichment

### Workflows and Sequencing

**Story 3.1: AI Search Configuration**

```
1. Access Cloudflare Dashboard → AI Search section
2. Create new AI Search index: govreposcrape-search
3. Configure source:
   - Type: R2 Bucket
   - Bucket: govreposcrape-gitingest
   - Path prefix: gitingest/
   - File pattern: **/*.txt
   - Content-Type filter: text/plain
4. Enable continuous monitoring (auto-indexing on R2 changes)
5. Add AI_SEARCH service binding to wrangler.toml:
   [[ai]]
   binding = "AI_SEARCH"
   # No ID needed for managed service
6. Validate: Upload test file to R2 → wait 5 min → query via Workers
```

**Story 3.2: Query Execution Flow**

```
┌─────────────┐
│ MCP API     │ POST /mcp/search {"query": "auth", "limit": 5}
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ ai-search-client.ts │
│ 1. Validate query   │
│ 2. Call AI_SEARCH   │
│ 3. Handle errors    │
└──────┬──────────────┘
       │
       ▼
┌──────────────────────┐
│ Cloudflare AI Search │ Semantic search over indexed gitingest summaries
│ (Managed Service)    │ Returns top K results with similarity scores
└──────┬───────────────┘
       │
       ▼
┌────────────────────┐
│ AISearchResult[]   │ Raw results with snippets, scores, R2 paths
└────────────────────┘
```

**Story 3.3: Result Enrichment Flow**

```
┌───────────────────┐
│ AISearchResult[]  │ From Story 3.2
└────────┬──────────┘
         │
         ▼
┌────────────────────────────┐
│ result-enricher.ts         │
│ For each result:           │
│ 1. Parse R2 path           │
│ 2. Extract org/repo        │
│ 3. Fetch R2 metadata (HEAD)│
│ 4. Build GitHub links      │
│ 5. Add Codespaces URL      │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────┐
│ SearchResult[]     │ Enriched with metadata, links, timestamps
└────────────────────┘
```

**Story 3.4: Performance Validation Flow**

```
1. Create test query suite (10-20 queries):
   - "authentication methods"
   - "postcode validation"
   - "NHS API integration"
   - "HMRC tax calculation"

2. For each query:
   - Execute search via ai-search-client
   - Measure total time (start → results)
   - Record p50, p95, p99 latencies
   - Manual assessment: Are top 5 results relevant?

3. Calculate metrics:
   - Relevance score: % queries with relevant top 5
   - Average response time
   - Indexing lag: Upload test file → search available

4. Decision:
   - If relevance >80% AND latency <2s: Continue with AI Search ✓
   - If relevance <80% OR latency >2s: Plan custom embeddings (Phase 2)

5. Document baseline for future optimization comparisons
```

## Non-Functional Requirements

### Performance

**NFR-1.1: Query Response Time**
- **Target:** <2 seconds (p95) end-to-end
- **Epic 3 Contribution:** AI Search retrieval <800ms (p95)
- **Measurement:** Workers Analytics, custom performance logging
- **Validation:** Story 3.4 performance testing
- **Rationale:** Developer tool UX - slow search = abandonment

**NFR-1.4: AI Search Indexing Lag**
- **Target:** <5 minutes from R2 upload to searchable
- **Measurement:** Upload test file → query until found
- **Rationale:** Users expect current results, not stale data
- **Story:** 3.1 (validate during configuration)

### Security

**NFR-2.2: Read-Only Access Pattern**
- **Requirement:** Zero write operations to GitHub or R2 from search queries
- **Implementation:** AI Search configured with read-only R2 access
- **Validation:** Review AI Search permissions in Cloudflare dashboard
- **Rationale:** Principle of least privilege, prevent data corruption

**NFR-2.3: Query Logging**
- **Requirement:** 100% of queries logged with metadata
- **Fields:** timestamp, query text, result count, response time, requestId
- **Storage:** Cloudflare Workers logs (7 days), export for long-term analysis
- **Rationale:** Debugging, relevance analysis, procurement intelligence (Phase 3)

### Reliability

**NFR-6.3: Error Rate**
- **Target:** <0.1% API error rate (5xx responses)
- **Epic 3 Contribution:** Handle AI Search service unavailability gracefully
- **Fallback:** Return 503 with clear error message and retry_after
- **Monitoring:** Cloudflare Workers exception tracking
- **Rationale:** AI Search is Preview (not GA) - expect occasional outages

**NFR-6.4: Graceful Degradation**
- **Requirement:** If AI Search unavailable, return meaningful error (not crash)
- **Implementation:** Try-catch around AI_SEARCH.query(), return ServiceError with retry guidance
- **Future Enhancement (Phase 2):** Cache popular query results for offline serving
- **Rationale:** Service resilience, user trust

### Cost

**NFR-7.1: MVP Infrastructure Cost**
- **Target:** <£50/month total (AI Search expected <£30/month for 21k docs)
- **Monitoring:** Cloudflare billing dashboard, weekly review
- **Alert:** If AI Search costs >£25/month, evaluate optimization or migration
- **Validation:** Story 3.4 measures query volume, projects monthly cost
- **Rationale:** AI Search pricing unknown in Preview - must validate hypothesis

### Integration

**NFR-5.3: AI Search Dependency Resilience**
- **Requirement:** Graceful degradation if AI Search unavailable
- **Health Check:** GET /mcp/health validates AI Search connectivity
- **Error Handling:** ServiceError with retry_after, structured logging
- **Monitoring:** Alert if health check fails for >5 minutes
- **Rationale:** Preview service may have instability - plan for it

## Dependencies and Integrations

### External Dependencies

**Cloudflare AI Search (Managed Service):**
- **Version:** Preview (as of 2025-11)
- **API:** Workers binding `AI_SEARCH` via wrangler.toml
- **Documentation:** https://developers.cloudflare.com/ai-search/
- **Limitations:**
  - Preview service, not GA - expect breaking changes
  - Pricing model unclear - monitor costs closely
  - Unknown query rate limits - test at scale
  - Limited configuration options (embedding model, ranking)
- **Fallback:** Migrate to custom Vectorize + embeddings if insufficient (Phase 2)

**Cloudflare R2 (Object Storage):**
- **Version:** GA
- **Usage:** Read R2 object metadata via HEAD requests for result enrichment
- **Binding:** `R2` service binding from Epic 2
- **Rate Limits:** 1M reads/month (free tier) - well within capacity
- **Cost:** Minimal (reads are free tier, metadata access is fast)

### Internal Dependencies

**From Epic 2 (Data Ingestion):**
- R2 bucket populated with gitingest summaries at `gitingest/{org}/{repo}/summary.txt`
- Custom metadata on R2 objects: `{ pushedAt, url, processedAt }`
- Consistent file structure and content-type (text/plain)
- **Critical Dependency:** Epic 3 cannot proceed without Epic 2 completing data ingestion

**For Epic 4 (MCP API):**
- Epic 4 will consume `ai-search-client.ts` and `result-enricher.ts` modules
- SearchResult interface must remain stable (API contract)
- Query validation logic shared between Epic 3 and Epic 4
- **Integration Point:** Epic 4 depends on Epic 3 delivering working search capability

### Package Dependencies

**TypeScript (from Epic 1):**
- `@cloudflare/workers-types` ^4.20250102.0 - Workers API types including AI Search binding
- `typescript` ^5.9.0 - Language runtime

**Testing:**
- `vitest` ^4.0.0 - Test runner
- `@cloudflare/vitest-pool-workers` ^0.7.0 - Workers-specific test environment

**No Additional npm Packages Required:**
- AI Search accessed via Workers binding (no SDK needed)
- R2 metadata access via Workers binding
- URL parsing via Node.js `node:url` (built-in)

### Configuration Files

**wrangler.toml (AI Search Binding):**
```toml
[[ai]]
binding = "AI_SEARCH"
# Configuration done via Cloudflare dashboard, binding provides API access
```

**Environment Variables:**
None required for AI Search (managed service handles auth via service binding)

### Dependency Constraints

**AI Search Preview Status:**
- **Risk:** Breaking API changes, service instability, pricing changes
- **Mitigation:** Abstract AI Search behind `ai-search-client.ts` interface for easy swap
- **Monitoring:** Track Cloudflare AI Search changelog, test after updates
- **Contingency:** Phase 2 migration plan to custom Vectorize if needed

**R2 Metadata Availability:**
- **Risk:** R2 HEAD requests may be slow or rate-limited at scale
- **Mitigation:** Batch metadata fetches, cache frequently accessed metadata in KV (Phase 2)
- **Validation:** Story 3.3 measures metadata fetch latency

## Acceptance Criteria (Authoritative)

**AC-3.1: AI Search Configuration and R2 Bucket Connection**

1. AI Search service is configured via Cloudflare dashboard to monitor R2 bucket `govscraperepo-gitingest`
2. Configuration specifies: path prefix `gitingest/`, file pattern `**/*.txt`, content-type `text/plain`
3. AI Search automatically detects and indexes new/updated objects in R2 bucket
4. Indexed documents are searchable within 5 minutes of R2 upload
5. Service binding `AI_SEARCH` is added to wrangler.toml and accessible from Workers
6. Health check endpoint confirms AI Search connectivity and service status
7. Setup instructions documented in DEPLOYMENT.md for team reference

**AC-3.2: AI Search Query API Integration in Workers**

1. `ai-search-client.ts` module implements `AISearchClient` interface
2. `searchCode(query, limit)` method accepts natural language queries (3-500 chars)
3. Queries are sent to AI Search API via `AI_SEARCH` service binding
4. API returns top K results with similarity scores and code snippets
5. Response includes: content snippet, similarity score (0.0-1.0), R2 object path
6. Query errors are handled gracefully (timeout, service unavailable) with retry logic (3 attempts, exponential backoff)
7. Query validation rejects invalid inputs: query too short (<3 chars), too long (>500 chars), limit out of range (1-20)
8. Error responses follow PRD format: `{ error: { code, message, retry_after? } }`
9. Query logging captures: timestamp, query text, result count, response time, requestId
10. Response time for AI Search retrieval is <800ms (p95) measured via Workers Analytics

**AC-3.3: Result Enrichment - Add Metadata and GitHub Links**

1. `result-enricher.ts` module implements `ResultEnricher` interface
2. `enrichResult(rawResult)` parses R2 object path to extract org and repo name
3. R2 HEAD request fetches custom metadata: pushedAt, url, processedAt
4. Result includes full GitHub URL: `https://github.com/{org}/{repo}`
5. Result includes Codespaces quick-launch link: `https://github.dev/{org}/{repo}`
6. Enriched result includes: repo_url, repo_org, repo_name, snippet, last_updated, language (if detectable), similarity_score, github_link, codespaces_link, metadata
7. Batch enrichment function `enrichResults(rawResults)` processes multiple results in parallel
8. Metadata fetch failures are logged but don't block result return (graceful degradation)
9. Enrichment time is <100ms per result (measured)
10. Result format matches PRD SearchResult schema exactly

**AC-3.4: Search Performance Validation and Baseline Metrics**

1. Test query suite created with 10-20 representative queries (authentication, postcode validation, NHS APIs, HMRC, etc.)
2. Each query is executed via ai-search-client and response times measured
3. P50, p95, p99 latencies documented for baseline comparison
4. Relevance assessment: Manual review of top 5 results for each query
5. Relevance score calculated: % of queries with relevant top 5 results
6. Indexing lag measured: Upload test file → time until searchable
7. Baseline metrics documented in docs/performance-baseline.md or DEPLOYMENT.md
8. Decision criteria applied:
   - If relevance >80% AND p95 <2s: Continue with AI Search ✓
   - If relevance <80% OR p95 >2s: Plan migration to custom embeddings (Phase 2)
9. Test harness script created for repeatable performance testing
10. Metrics are exportable for reporting and tracking over time

## Traceability Mapping

| AC | Spec Section | Component/API | Test Idea |
|----|--------------|---------------|-----------|
| AC-3.1.1-3 | Services: Cloudflare AI Search | Cloudflare Dashboard Config | Manual: Configure AI Search → verify R2 monitoring active |
| AC-3.1.4 | NFR-1.4: Indexing Lag | AI Search Auto-indexing | Integration: Upload test file → query every 30s → record time to indexed |
| AC-3.1.5-6 | APIs: AI_SEARCH binding | wrangler.toml, health.ts | Unit: Mock AI_SEARCH.query() → assert binding accessible |
| AC-3.2.1-2 | Services: ai-search-client.ts | AISearchClient interface | Unit: searchCode("test", 5) → assert query sent correctly |
| AC-3.2.3-5 | Data Models: AISearchResult | ai-search-client.ts | Integration: Execute real query → assert response shape matches |
| AC-3.2.6-8 | Error Handling: ServiceError | ai-search-client.ts | Unit: Mock AI Search timeout → assert ServiceError thrown with retry_after |
| AC-3.2.9 | NFR-2.3: Query Logging | logger.ts | Integration: Execute query → assert structured log entry created |
| AC-3.2.10 | NFR-1.1: Response Time | ai-search-client.ts | Load: 100 concurrent queries → assert p95 <800ms |
| AC-3.3.1-3 | Services: result-enricher.ts | ResultEnricher interface | Unit: enrichResult(mockRawResult) → assert R2 path parsed, metadata fetched |
| AC-3.3.4-6 | APIs: GitHub links, Codespaces | result-enricher.ts | Unit: enrichResult() → assert github_link and codespaces_link format correct |
| AC-3.3.7 | Workflows: Batch Enrichment | result-enricher.ts | Integration: enrichResults([...10 results]) → assert parallel execution, <1s total |
| AC-3.3.8 | NFR-6.4: Graceful Degradation | result-enricher.ts | Unit: Mock R2 HEAD failure → assert result still returned with partial data |
| AC-3.3.9-10 | Data Models: SearchResult | result-enricher.ts | Integration: End-to-end search → assert final result matches PRD schema |
| AC-3.4.1-3 | Performance: Test Harness | test-search.ts script | Manual: Run test suite → record latencies → calculate p50/p95/p99 |
| AC-3.4.4-5 | Performance: Relevance | Test query suite | Manual: Review top 5 for each query → calculate relevance % |
| AC-3.4.6 | NFR-1.4: Indexing Lag | Integration test | Manual: Upload → query → measure lag |
| AC-3.4.7-9 | Documentation | docs/performance-baseline.md | Manual: Document metrics → decision criteria → next steps |

## Risks, Assumptions, Open Questions

### Risks

**R-3.1: AI Search Preview Service Instability**
- **Description:** AI Search is in Preview (not GA) - may experience outages, breaking changes, or performance issues
- **Probability:** Medium (Preview services typically have <99% uptime)
- **Impact:** High (core search functionality blocked if service down)
- **Mitigation:**
  - Implement graceful degradation (return clear error, don't crash)
  - Health check endpoint monitors AI Search availability
  - Alert if service unavailable for >5 minutes
  - Document rollback plan to Phase 2 custom embeddings if needed
  - Abstract AI Search behind interface for easy swapping

**R-3.2: gitingest Quality Insufficient for Semantic Search**
- **Description:** gitingest summaries may lack semantic richness needed for accurate search results
- **Probability:** Medium (hypothesis to be validated in Story 3.4)
- **Impact:** High (poor relevance = MVP fails, users don't trust results)
- **Mitigation:**
  - Story 3.4 baseline testing identifies quality issues early
  - Decision criteria: <80% relevance triggers Phase 2 migration plan
  - Fallback: Custom embeddings with AST-based chunking, Vectorize index
  - MVP timeline includes buffer for quality iteration if needed

**R-3.3: AI Search Pricing Exceeds Budget**
- **Description:** Preview pricing unknown - may be >£30/month projected, breaking <£50/month constraint
- **Probability:** Low-Medium (Cloudflare typically cost-competitive)
- **Impact:** Medium (budget overrun requires cost optimization or migration)
- **Mitigation:**
  - Weekly cost monitoring via Cloudflare billing dashboard
  - Alert if AI Search costs >£25/month
  - Optimization options: Edge caching for popular queries (Phase 2), smart query deduplication
  - Fallback: Migrate to custom Vectorize (lower per-query cost, higher upfront effort)

**R-3.4: R2 Metadata Fetch Latency Impacts Performance**
- **Description:** HEAD requests to R2 for metadata may be slow, contributing to >2s query time
- **Probability:** Low (R2 metadata access typically fast, <100ms)
- **Impact:** Medium (performance target missed, user experience degraded)
- **Mitigation:**
  - Story 3.3 measures metadata fetch latency explicitly
  - Optimization: Batch HEAD requests, cache frequently accessed metadata in KV
  - Performance budget: <100ms for metadata fetch, leaving 1.1s for other operations
  - If R2 slow, consider denormalizing metadata into AI Search index (future)

### Assumptions

**A-3.1: AI Search Supports R2 Auto-Indexing**
- **Assumption:** Cloudflare AI Search Preview includes R2 bucket monitoring feature
- **Validation:** Story 3.1 configuration step, Cloudflare documentation review
- **If False:** Manual indexing workflow required, significantly increasing operational complexity

**A-3.2: AI Search Embedding Model is "Good Enough"**
- **Assumption:** Cloudflare's managed embedding model provides sufficient semantic understanding for government code
- **Validation:** Story 3.4 relevance testing with 80% threshold
- **If False:** Phase 2 migration to custom embeddings (bge-base-en-v1.5) required

**A-3.3: 21k Repository Scale is Within AI Search Limits**
- **Assumption:** AI Search Preview handles 21,000 indexed documents without performance degradation
- **Validation:** Story 3.4 measures query performance at full scale
- **If False:** May need to shard index, optimize chunking, or migrate to custom solution

**A-3.4: Text/Plain Content-Type Sufficient for Indexing**
- **Assumption:** AI Search can index plain text gitingest summaries without special formatting
- **Validation:** Story 3.1 test upload confirms indexing and searchability
- **If False:** May need to convert to markdown or structured format

### Open Questions

**Q-3.1: AI Search Query Rate Limits?**
- **Question:** What are the query rate limits for AI Search Preview? (unknown in documentation)
- **Impact:** May affect scalability to thousands of queries/day
- **Resolution Plan:** Test at increasing query volumes (Story 3.4), monitor for throttling errors
- **Fallback:** If rate limits too restrictive, implement edge caching or migrate to Vectorize

**Q-3.2: AI Search Supports Multi-Language Code?**
- **Question:** Does AI Search embedding model understand code across languages (TypeScript, Python, Go, etc.)?
- **Impact:** Affects search quality for polyglot government repositories
- **Resolution Plan:** Test queries include multi-language examples (Story 3.4)
- **Fallback:** If language-specific, consider language-aware routing or custom embeddings

**Q-3.3: Indexing Lag for Large Files?**
- **Question:** How does indexing lag vary with gitingest summary size (10KB vs 500KB)?
- **Impact:** Large repos may be slow to become searchable
- **Resolution Plan:** Measure indexing lag for various file sizes (Story 3.4)
- **Optimization:** If lag >5 minutes for large files, consider summary truncation or chunking

**Q-3.4: AI Search Handles Incremental Updates Efficiently?**
- **Question:** When R2 objects are updated (pushedAt change), does AI Search re-index efficiently or full rebuild?
- **Impact:** Affects cache hit rate value and ongoing operational costs
- **Resolution Plan:** Test incremental update scenario (upload new version → measure re-indexing)
- **Important For:** Phase 2 automated ingestion every 6 hours

## Test Strategy Summary

### Test Levels

**Unit Tests (Vitest):**
- **Coverage Target:** 80%+ for ai-search-client.ts and result-enricher.ts
- **Scope:**
  - Query validation logic (length, format, limit range)
  - R2 path parsing (org/repo extraction)
  - GitHub link generation (URL formatting)
  - Error handling (ServiceError, ValidationError creation)
  - Retry logic (exponential backoff, max attempts)
- **Mocking:** Mock AI_SEARCH binding, R2 binding, avoid external service calls
- **Examples:**
  ```typescript
  describe('ai-search-client', () => {
    test('validates query length between 3-500 chars', () => {
      expect(() => searchCode('ab', 5)).toThrow(ValidationError);
    });

    test('retries on AI Search timeout with exponential backoff', async () => {
      const mockAISearch = createMockBinding({ failTimes: 2 });
      const result = await searchCode('test', 5, mockAISearch);
      expect(mockAISearch.callCount).toBe(3); // Initial + 2 retries
    });
  });
  ```

**Integration Tests (Vitest + Workers):**
- **Coverage Target:** Happy path + critical error paths
- **Scope:**
  - End-to-end search: query → AI Search → enrichment → final result
  - R2 metadata fetching (real R2 binding with test data)
  - AI Search connectivity (real service binding, test queries)
  - Performance measurement (response time logging)
- **Environment:** @cloudflare/vitest-pool-workers with test R2 bucket
- **Examples:**
  ```typescript
  test('end-to-end search returns enriched results', async () => {
    const result = await searchCode('authentication', 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({
      repo_url: expect.stringMatching(/^https:\/\/github\.com/),
      similarity_score: expect.any(Number),
      github_link: expect.stringMatching(/github\.com/),
    });
  });
  ```

**Manual Testing (Story 3.4):**
- **Test Query Suite:** 10-20 representative queries from PRD use cases
- **Relevance Assessment:** Manual review of top 5 results per query
- **Performance Measurement:** Latency recording via test harness script
- **Indexing Lag Test:** Upload test file → query repeatedly → record first success
- **Decision Making:** Apply 80% relevance threshold, <2s latency criteria

**Load Testing (Optional - Post-MVP):**
- **Scope:** 100 concurrent queries to measure p95 latency under load
- **Tool:** Artillery or k6 for load generation
- **Target:** Maintain <2s p95 even at 100 RPS (requests per second)

### Test Data

**Test Repositories (R2):**
- 5-10 sample gitingest summaries uploaded to test R2 bucket
- Cover variety: small (10KB), medium (100KB), large (500KB)
- Languages: TypeScript, Python, Go, Java (multi-language validation)
- Content: Mix of authentication, validation, API patterns

**Test Queries:**
- "authentication methods" (broad concept)
- "postcode validation UK" (specific domain knowledge)
- "NHS API integration" (sector-specific)
- "HMRC tax calculation" (department-specific)
- "Express middleware" (technical framework)
- "OAuth 2.0 implementation" (security pattern)

### Edge Cases

**Query Edge Cases:**
- Extremely short query ("ab" - should fail validation)
- Maximum length query (500 chars - should succeed)
- Empty query ("" - should fail)
- Non-ASCII characters (UTF-8 validation)
- Limit = 0 (should fail)
- Limit > 20 (should clamp or fail)

**AI Search Edge Cases:**
- Service timeout (mock slow response)
- Service unavailable (503 error)
- No results for query (empty array - valid response)
- Malformed response from AI Search (handle gracefully)

**Enrichment Edge Cases:**
- R2 metadata missing (fallback to minimal data)
- R2 HEAD request timeout (log error, return partial result)
- Invalid R2 path format (log error, skip enrichment)

### Test Automation

**CI/CD Integration:**
- All unit tests run on every commit (npm test)
- Integration tests run on PR to main
- Performance baseline tests run weekly (automated)
- Manual Story 3.4 testing blocks Epic completion

**Test Commands:**
```bash
# Unit tests (fast)
npm test src/search/

# Integration tests (requires Workers binding)
npm run test:integration

# Performance baseline (manual trigger)
npm run test:performance

# Coverage report
npm run test:coverage
```

---

**Status:** Ready for implementation
**Dependencies:** Epic 2 complete (R2 populated with gitingest summaries)
**Next Steps:** Story 3.1 - Configure AI Search and validate R2 bucket connection
