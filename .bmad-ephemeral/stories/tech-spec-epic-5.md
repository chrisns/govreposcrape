# Epic Technical Specification: Developer Experience & Documentation

Date: 2025-11-14
Author: cns
Epic ID: 5
Status: Draft

---

## Overview

Epic 5 transforms the working govscraperepo MCP API (delivered in Epics 1-4) into an adoptable developer tool by creating comprehensive documentation, integration examples, and developer resources. This epic addresses the critical "last mile" challenge: developers can't use what they can't configure. The core deliverables are step-by-step MCP configuration guides for Claude Desktop and GitHub Copilot, machine-readable OpenAPI 3.0 specification for automated client generation, copy-paste integration examples in multiple languages (cURL, TypeScript, Python), and usage best practices tailored to UK government code discovery use cases.

The epic directly enables the MVP success criterion of "hundreds of uses per week" by reducing integration time from hours to <5 minutes. Clear documentation drives organic adoption through word-of-mouth and self-service onboarding. Without this epic, the technically functional API remains inaccessible to most developers, limiting adoption to early adopters willing to reverse-engineer integration patterns. This epic is the bridge between "it works" and "developers use it."

## Objectives and Scope

**In Scope:**

- **Story 5.1:** Step-by-step MCP configuration guides for Claude Desktop (macOS/Windows/Linux) and GitHub Copilot (VS Code/JetBrains) with exact JSON configuration, troubleshooting sections, and example queries to verify integration
- **Story 5.2:** Complete OpenAPI 3.0 specification documenting all MCP endpoints (POST /mcp/search, GET /mcp/health), request/response schemas with examples, error response formats, and interactive Swagger UI at /docs endpoint
- **Story 5.3:** Working integration examples in cURL (shell script), TypeScript/JavaScript (Node.js), and Python demonstrating basic queries, result handling, error handling, and a simple test script (test-mcp.sh or test-mcp.ts) for connectivity validation
- **Story 5.4:** Usage guide explaining how semantic search works, query formulation tips, result interpretation guidance, and UK government-specific examples (NHS APIs, HMRC tax calculation, DWP benefits validation, postcode validation)

**Out of Scope:**

- IDE plugins/extensions (Vision phase: VS Code, JetBrains)
- Web interface documentation (Phase 2: covered in Epic 5's web UI stories)
- Advanced API features not in MVP (filtering by sector, trust signals, custom ranking)
- SDK libraries (Phase 2: npm package, pip package for programmatic access)
- Video tutorials or interactive walkthroughs (nice-to-have, not MVP blocking)
- Localization/translation (English only for UK government audience)

**Success Criteria:**

- 20+ early adopters successfully self-configure MCP integration without support requests
- Integration time measured at <5 minutes from documentation start to first successful query
- Zero high-severity documentation bugs (incorrect config, broken examples, missing prerequisites)
- OpenAPI spec validates without errors and generates working client code (tested with openapi-generator)

## System Architecture Alignment

Epic 5 is a **pure documentation and example layer** with minimal code changes to the existing Cloudflare Workers API. The architecture alignment is straightforward:

**Leverages Existing Epic 4 MCP API:**
- POST /mcp/search endpoint (already implemented)
- GET /mcp/health endpoint (already implemented)
- MCPRequest and MCPResponse TypeScript interfaces (already defined in src/types.ts)
- Error response formats (already standardized in src/utils/error-handler.ts)
- No new Workers endpoints required (all functionality exists)

**New Static Assets (Story 5.2):**
- `static/openapi.json` - OpenAPI 3.0 specification as static file served by Workers
- Optional: `static/swagger-ui/` - Swagger UI assets for /docs interactive documentation (if implemented beyond basic JSON spec)

**New Example Code (Story 5.3):**
- `examples/curl.sh` - Shell script demonstrating cURL integration
- `examples/node.js` - TypeScript/JavaScript example using fetch API
- `examples/python.py` - Python example using requests library
- `examples/test-mcp.sh` or `examples/test-mcp.ts` - Connectivity test script
- These are reference examples, not production code

**New Documentation (Stories 5.1, 5.4):**
- `docs/integration/claude-desktop.md` - Claude Desktop MCP configuration guide
- `docs/integration/github-copilot.md` - GitHub Copilot MCP configuration guide (with caveats if MCP support not yet released)
- `docs/usage-guide.md` - Query formulation and best practices
- `README.md` updates - Add integration quickstart, link to detailed guides

**Architecture Constraints:**
- No changes to core Workers logic (src/api/, src/search/, src/ingestion/)
- No new external dependencies in package.json (documentation is static content)
- OpenAPI spec must match actual API behavior (POST /mcp/search returns MCPResponse exactly as implemented)
- Examples must work against production endpoint: https://govreposcrape.cloud.cns.me
- Documentation paths must not conflict with API routes (/docs vs /mcp/* separation)

## Detailed Design

### Services and Modules

Epic 5 is primarily **documentation artifacts** with minimal code changes. The only code module is a static file serving enhancement to the existing Workers:

**New Module: Static File Handler (optional for Swagger UI)**
- **Location:** `src/api/static-handler.ts` (if needed)
- **Purpose:** Serve OpenAPI spec at `/openapi.json` and optional Swagger UI at `/docs`
- **Implementation:** Simple Workers route handler that returns static JSON file
- **Fallback:** Can skip custom handler and serve OpenAPI spec from GitHub Pages or external CDN

**Documentation Modules (non-code):**

| Module | Type | Location | Owner | Purpose |
|--------|------|----------|-------|---------|
| Claude Desktop Guide | Markdown | `docs/integration/claude-desktop.md` | Story 5.1 | Step-by-step MCP configuration for Claude Desktop |
| GitHub Copilot Guide | Markdown | `docs/integration/github-copilot.md` | Story 5.1 | MCP configuration for Copilot (with caveats) |
| OpenAPI Specification | OpenAPI 3.0 JSON | `static/openapi.json` | Story 5.2 | Machine-readable API contract |
| Swagger UI | Optional HTML/JS/CSS | `static/swagger-ui/` | Story 5.2 | Interactive API documentation |
| cURL Example | Bash script | `examples/curl.sh` | Story 5.3 | Shell script integration example |
| Node.js Example | JavaScript | `examples/node.js` | Story 5.3 | TypeScript/JavaScript integration |
| Python Example | Python | `examples/python.py` | Story 5.3 | Python requests library example |
| Test Script | Bash or TS | `examples/test-mcp.sh` | Story 5.3 | Connectivity validation tool |
| Usage Guide | Markdown | `docs/usage-guide.md` | Story 5.4 | Query tips and best practices |
| README Updates | Markdown | `README.md` | All stories | Integration quickstart |

**Responsibilities:**

- **Claude Desktop Guide:** Platform-specific config paths (macOS/Windows/Linux), JSON configuration format, example queries, troubleshooting (network errors, invalid config, no results)
- **GitHub Copilot Guide:** Extension settings, MCP server configuration, Copilot-specific patterns, clear note if MCP support not yet released
- **OpenAPI Spec:** Document POST /mcp/search and GET /mcp/health with full request/response schemas, error formats (400, 500, 503), examples, authentication (none), rate limiting
- **Integration Examples:** Working code demonstrating query execution, result parsing, error handling, timeout handling, all using production endpoint (https://govreposcrape.cloud.cns.me)
- **Test Script:** Health check validation, test query execution, response format verification, clear pass/fail output
- **Usage Guide:** Semantic search explanation, good vs bad query examples, result interpretation (similarity scores, metadata), UK government-specific use cases

### Data Models and Contracts

Epic 5 **documents** the existing data contracts from Epic 4, but does not create new ones. The OpenAPI specification (Story 5.2) must accurately reflect these TypeScript interfaces:

**MCPRequest (already defined in src/types.ts):**
```typescript
interface MCPRequest {
  query: string;     // Required: 3-500 characters, natural language
  limit?: number;    // Optional: 1-20, default 5
}
```

**MCPResponse (already defined in src/types.ts):**
```typescript
interface MCPResponse {
  results: SearchResult[];  // Array of search results
  took_ms: number;          // Response time in milliseconds
}
```

**SearchResult (already defined in src/types.ts):**
```typescript
interface SearchResult {
  repo_url: string;           // https://github.com/{org}/{repo}
  repo_org: string;           // GitHub organization
  repo_name: string;          // Repository name
  snippet: string;            // Code snippet from AI Search
  last_updated: string;       // ISO8601 timestamp (pushedAt)
  language?: string;          // Detected language (optional)
  similarity_score: number;   // 0.0-1.0 from AI Search
  github_link: string;        // Direct GitHub link
  codespaces_link: string;    // https://github.dev/{org}/{repo}
  metadata: RepoMetadata;     // Full repos.json entry
}
```

**ErrorResponse (already defined in src/utils/error-handler.ts):**
```typescript
interface ErrorResponse {
  error: {
    code: string;        // Machine-readable error code
    message: string;     // Human-readable error message
    retry_after?: number; // Optional: seconds to wait before retry
  };
}
```

**OpenAPI 3.0 Schema Mapping:**

The OpenAPI spec must translate these TypeScript interfaces to OpenAPI schema format:

```yaml
components:
  schemas:
    MCPRequest:
      type: object
      required: [query]
      properties:
        query:
          type: string
          minLength: 3
          maxLength: 500
          example: "authentication methods"
        limit:
          type: integer
          minimum: 1
          maximum: 20
          default: 5
          example: 5

    MCPResponse:
      type: object
      required: [results, took_ms]
      properties:
        results:
          type: array
          items:
            $ref: '#/components/schemas/SearchResult'
        took_ms:
          type: number
          example: 234

    SearchResult:
      type: object
      required: [repo_url, repo_org, repo_name, snippet, last_updated, similarity_score, github_link, codespaces_link, metadata]
      properties:
        repo_url:
          type: string
          format: uri
          example: "https://github.com/alphagov/govuk-frontend"
        repo_org:
          type: string
          example: "alphagov"
        repo_name:
          type: string
          example: "govuk-frontend"
        snippet:
          type: string
          example: "// Authentication middleware..."
        last_updated:
          type: string
          format: date-time
          example: "2025-10-15T14:30:00Z"
        language:
          type: string
          example: "TypeScript"
        similarity_score:
          type: number
          minimum: 0
          maximum: 1
          example: 0.92
        github_link:
          type: string
          format: uri
          example: "https://github.com/alphagov/govuk-frontend"
        codespaces_link:
          type: string
          format: uri
          example: "https://github.dev/alphagov/govuk-frontend"
        metadata:
          $ref: '#/components/schemas/RepoMetadata'

    ErrorResponse:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code:
              type: string
              example: "INVALID_QUERY"
            message:
              type: string
              example: "Query must be between 3 and 500 characters"
            retry_after:
              type: integer
              example: 60
```

**No New Data Models:**
- All data models already exist from Epic 4 implementation
- Epic 5 only documents them in OpenAPI format
- Documentation must exactly match actual API behavior (test with openapi-generator to verify)

### APIs and Interfaces

Epic 5 documents the existing MCP API from Epic 4. No new endpoints are created, only documented:

**Existing Endpoints:**

**POST /mcp/search**
- **Purpose:** Semantic code search over UK government repositories
- **Method:** POST
- **Content-Type:** application/json
- **Request Body:** MCPRequest (see Data Models)
- **Success Response:** 200 OK, MCPResponse (see Data Models)
- **Error Responses:**
  - 400 Bad Request - Invalid query format, validation errors
  - 500 Internal Server Error - AI Search failure, R2 unavailable
  - 503 Service Unavailable - Maintenance mode
- **Headers:**
  - `X-MCP-Version: 2` (protocol version negotiation)
  - `X-Request-ID: <uuid>` (optional, for correlation)
- **CORS:** Enabled (`Access-Control-Allow-Origin: *`)
- **Rate Limiting:** Cloudflare platform-level (not exposed in headers)
- **Example:**
  ```bash
  curl -X POST https://govreposcrape.cloud.cns.me/mcp/search \
    -H "Content-Type: application/json" \
    -H "X-MCP-Version: 2" \
    -d '{"query": "authentication methods", "limit": 5}'
  ```

**GET /mcp/health**
- **Purpose:** Health check for monitoring and integration testing
- **Method:** GET
- **Success Response:** 200 OK
  ```json
  {
    "status": "healthy",
    "services": {
      "workers": "ok",
      "ai_search": "ok",
      "r2": "ok"
    },
    "timestamp": "2025-11-14T10:00:00Z"
  }
  ```
- **Error Response:** 503 Service Unavailable (if any service degraded)
- **Headers:** Standard (no special headers required)
- **Example:**
  ```bash
  curl https://govreposcrape.cloud.cns.me/mcp/health
  ```

**Optional New Endpoints (Story 5.2):**

**GET /openapi.json**
- **Purpose:** Serve OpenAPI 3.0 specification as static file
- **Method:** GET
- **Response:** 200 OK, application/json
- **Content:** OpenAPI 3.0 JSON document
- **Implementation:** Simple Workers route handler or static file from R2/Pages
- **Example:**
  ```bash
  curl https://govreposcrape.cloud.cns.me/openapi.json
  ```

**GET /docs** (optional, nice-to-have)
- **Purpose:** Interactive Swagger UI for API exploration
- **Method:** GET
- **Response:** 200 OK, text/html
- **Content:** Swagger UI HTML that loads /openapi.json
- **Implementation Options:**
  1. Embed Swagger UI assets in Workers (bloats bundle)
  2. CDN-hosted Swagger UI pointing to /openapi.json (preferred)
  3. GitHub Pages hosting separate from Workers
- **Decision:** Defer to implementation time, not critical for MVP

**Integration Interfaces (Story 5.1):**

**Claude Desktop MCP Configuration:**
```json
{
  "mcpServers": {
    "govscraperepo": {
      "url": "https://govreposcrape.cloud.cns.me/mcp",
      "description": "UK Government code discovery - semantic search over 21k government repositories"
    }
  }
}
```
- **Config File Locations:**
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`

**GitHub Copilot MCP Configuration (if available):**
- Configuration format depends on Copilot's MCP implementation
- As of Epic 5 development, GitHub Copilot MCP support status unclear
- Documentation must include clear caveat: "GitHub Copilot MCP support is preview/not yet released"
- Provide expected configuration format with disclaimer

### Workflows and Sequencing

Epic 5 workflows are **developer journeys**, not code execution flows:

**Workflow 1: Developer Integrates Claude Desktop (Story 5.1)**

1. **Discover govscraperepo** → Developer learns about govscraperepo (word-of-mouth, GDS communication, GitHub README)
2. **Find integration guide** → Navigate to README → Click "Claude Desktop Integration" link
3. **Read prerequisites** → Verify Claude Desktop installed (latest version recommended)
4. **Locate config file** → Follow OS-specific path instructions (macOS/Windows/Linux)
5. **Edit config file** → Add mcpServers entry with govscraperepo URL
6. **Restart Claude Desktop** → Required for config reload
7. **Test integration** → Try example query: "search UK government authentication code"
8. **Verify results** → Expect 5 results with repo URLs, snippets, metadata
9. **Troubleshoot if needed** → Consult troubleshooting section (network errors, invalid config)
10. **Success** → Developer can now discover government code through Claude

**Success Criteria:** Steps 1-9 complete in <5 minutes for average developer

**Workflow 2: Developer Uses OpenAPI Spec for Code Generation (Story 5.2)**

1. **Find OpenAPI spec** → Navigate to https://govreposcrape.cloud.cns.me/openapi.json or GitHub repo
2. **Download spec** → Save locally or use URL directly
3. **Choose code generator** → Select tool (openapi-generator, Swagger Codegen, Postman)
4. **Generate client** → Run generator with TypeScript/Python/etc. target
5. **Install generated client** → Add to project dependencies
6. **Import and configure** → Set base URL to https://govreposcrape.cloud.cns.me
7. **Make first API call** → Execute search query via generated client
8. **Success** → Type-safe API client integrated into application

**Success Criteria:** Generated client compiles without errors, API calls succeed

**Workflow 3: Developer Tests Integration with Test Script (Story 5.3)**

1. **Clone repository or download examples** → Get test-mcp.sh or test-mcp.ts
2. **Make script executable** → `chmod +x test-mcp.sh` (if bash)
3. **Run test script** → `./test-mcp.sh` or `npm run test:mcp`
4. **Script performs checks:**
   - Health check: GET /mcp/health returns 200 OK
   - Test query: POST /mcp/search with "test" query
   - Response validation: Verify MCPResponse format, results array
5. **View output:**
   - ✅ "Health check passed: API is healthy"
   - ✅ "Test query passed: Received 5 results"
   - ✅ "Response format valid: All required fields present"
   - **OR**
   - ❌ "Health check failed: Connection refused"
   - (Script exits with code 1 on failure)
6. **Success** → Developer confident integration works

**Success Criteria:** Test script accurately diagnoses connectivity, provides actionable error messages

**Workflow 4: Developer Formulates Effective Queries (Story 5.4)**

1. **Read usage guide** → Understand semantic search vs keyword search
2. **Learn query patterns:**
   - **Good:** "authentication methods" (natural language, specific intent)
   - **Bad:** "auth" (too vague, single keyword)
   - **Good:** "NHS API integration patterns" (domain-specific, clear scope)
   - **Bad:** "NHS" (single word, no context)
3. **Try example queries** → Follow UK government-specific examples:
   - "How do departments validate UK postcodes?"
   - "HMRC tax calculation implementations"
   - "DWP benefits eligibility checking"
4. **Interpret results:**
   - Check similarity_score (0.8+ typically good, <0.6 may be weak match)
   - Review last_updated (recent = actively maintained)
   - Check repo_org (alphagov, nhsdigital, hmrc = high trust)
5. **Refine queries** → If results poor, add context, use full questions
6. **Success** → Developer finds relevant government code consistently

**Success Criteria:** 80%+ of developers report finding relevant code on first or second query attempt

**Sequence Diagram: Developer First Use**

```
Developer → README → Integration Guide → Config File Edit → Claude Restart → Test Query → Results → Success
    |           |            |                |                  |              |            |         |
    |           |            |                |                  |              |            |         └─> Adoption
    |           |            |                |                  |              |            └─> Verify format
    |           |            |                |                  |              └─> POST /mcp/search
    |           |            |                |                  └─> Config reload
    |           |            |                └─> Add mcpServers entry
    |           |            └─> Find claude_desktop_config.json
    |           └─> Choose platform (Claude/Copilot/API)
    └─> Discover govscraperepo
```

## Non-Functional Requirements

### Performance

Epic 5 has minimal performance requirements as it's primarily documentation:

**NFR-5.1: Documentation Load Time**
- **Requirement:** Markdown documentation files load in <1 second
- **Target:** README.md, integration guides, usage guide all render instantly on GitHub
- **Rationale:** Developer experience - slow documentation = friction
- **Measurement:** GitHub Pages render time (if hosted), local file open time
- **Risk:** Large embedded images could slow load times (mitigation: optimize images, use lazy loading)

**NFR-5.2: OpenAPI Spec Size**
- **Requirement:** OpenAPI specification <100KB uncompressed
- **Target:** static/openapi.json file size
- **Rationale:** Fast download for code generators, reasonable for version control
- **Current Estimate:** ~20-30KB for 2 endpoints with full schemas
- **Measurement:** File size on disk, gzip compression ratio

**NFR-5.3: Example Code Execution Time**
- **Requirement:** Integration examples execute test queries in <3 seconds
- **Target:** examples/curl.sh, examples/node.js, examples/python.py
- **Rationale:** Fast feedback loop for developers testing integration
- **Breakdown:** API call <2s (existing NFR), script overhead <1s
- **Measurement:** `time ./examples/curl.sh` output

**NFR-5.4: Test Script Performance**
- **Requirement:** test-mcp.sh completes health check + test query in <5 seconds
- **Target:** Full validation suite (connectivity, query, format check)
- **Rationale:** Quick validation without developer wait time
- **Measurement:** Script execution time from start to exit

**Non-Performance:** Documentation is static content, no runtime performance impact on Workers API. Epic 5 does not affect existing NFR-1.1 (<2s query response time).

### Security

Epic 5 security focuses on **preventing insecure integration patterns** and protecting example code:

**NFR-5.5: No Hardcoded Secrets in Examples**
- **Requirement:** All integration examples use environment variables or placeholders for any future auth
- **Current State:** No authentication required (open API), but examples must demonstrate secure patterns
- **Pattern:**
  ```bash
  # Good (examples/curl.sh)
  API_URL="${API_URL:-https://govreposcrape.cloud.cns.me}"

  # Bad
  API_URL="https://govreposcrape.cloud.cns.me" # hardcoded
  ```
- **Rationale:** Future-proofing for Phase 2 when API keys may be added
- **Validation:** Code review of all examples

**NFR-5.6: HTTPS-Only in Documentation**
- **Requirement:** All documentation examples use HTTPS URLs, never HTTP
- **Enforcement:** `https://govreposcrape.cloud.cns.me` (not `http://`)
- **Rationale:** Train developers on secure API access patterns from day one
- **Validation:** Grep documentation for `http://` (should find zero matches except educational explanations)

**NFR-5.7: Input Validation Examples**
- **Requirement:** Integration examples demonstrate query validation (3-500 chars)
- **Pattern:** Examples show how to validate input before API call, handle 400 errors gracefully
- **Rationale:** Teach developers defensive programming patterns
- **Implementation:** Node.js and Python examples include validation functions

**NFR-5.8: Error Handling Demonstrations**
- **Requirement:** All integration examples include try-catch blocks and error logging
- **Pattern:** Examples show how to handle network errors, 500 errors, timeout scenarios
- **Rationale:** Prevent production integrations that crash on API failures
- **Validation:** Every example has error handling code path

**NFR-5.9: OpenAPI Spec Security Documentation**
- **Requirement:** OpenAPI spec explicitly documents security model (no auth currently, rate limiting)
- **Section:** `securitySchemes: {}` (empty for now), note in description about open access
- **Rationale:** Clear communication that API is currently open, may change in Phase 2
- **Validation:** OpenAPI spec includes security section even if empty

**No Sensitive Data:** All examples use safe test queries ("authentication methods", "postcode validation"). No PII, no real credentials, no sensitive UK government information.

### Reliability/Availability

Epic 5 reliability focuses on **documentation correctness and availability**:

**NFR-5.10: Documentation Accuracy**
- **Requirement:** 100% of code examples execute successfully against production API
- **Validation Process:**
  1. Test all bash examples: `bash examples/curl.sh`
  2. Test Node.js examples: `node examples/node.js`
  3. Test Python examples: `python3 examples/python.py`
  4. Verify all return expected results (5 SearchResults, valid format)
- **Frequency:** Test before every documentation commit, automated in CI/CD (Phase 2)
- **Failure Handling:** Any failing example blocks documentation release

**NFR-5.11: Config Path Accuracy**
- **Requirement:** Claude Desktop config file paths verified on all supported OS (macOS, Windows, Linux)
- **Validation:** Test on each platform or confirm with platform documentation
- **Current Paths:**
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
- **Risk:** Claude Desktop may change paths in updates (mitigation: link to official Claude docs)

**NFR-5.12: OpenAPI Spec Validation**
- **Requirement:** OpenAPI spec validates without errors using openapi-generator
- **Validation Command:** `openapi-generator validate -i static/openapi.json`
- **Target:** Zero validation errors, zero warnings for critical issues
- **Frequency:** Validate on every spec change
- **Rationale:** Broken spec = broken code generation = developer frustration

**NFR-5.13: Link Integrity**
- **Requirement:** All links in documentation resolve successfully (no 404s)
- **Scope:** Internal links (docs/integration/*.md), external links (https://govreposcrape.cloud.cns.me), GitHub links
- **Validation:** Link checker tool (markdown-link-check or similar)
- **Frequency:** Weekly automated check (Phase 2: CI/CD integration)
- **Failure Handling:** Fix broken links within 48 hours

**NFR-5.14: Documentation Availability**
- **Requirement:** Documentation accessible via GitHub repository (100% uptime via GitHub's SLA)
- **Hosting:** GitHub repository README and docs/ folder (primary), optional GitHub Pages (secondary)
- **Fallback:** If GitHub unavailable, API still functional (documentation outage doesn't block API usage)
- **Rationale:** Documentation is critical path for adoption, must be always available

**NFR-5.15: Version Consistency**
- **Requirement:** Documentation version matches API implementation version
- **Pattern:** Document API version in OpenAPI spec (`version: "1.0.0"`), reference in README
- **Update Process:** Increment version on breaking API changes, update all documentation references
- **Rationale:** Prevent confusion from outdated documentation

### Observability

Epic 5 observability focuses on **tracking documentation usage and effectiveness**:

**NFR-5.16: Example Usage Tracking (Optional, Phase 2)**
- **Requirement:** Track which integration examples are most used
- **Mechanism:** GitHub repository analytics (README views, docs/ folder views)
- **Metrics:** Views per doc, time on page, bounce rate
- **Rationale:** Understand which platforms (Claude, Copilot, direct API) are most popular
- **Action:** Prioritize improving most-used documentation

**NFR-5.17: Documentation Feedback Mechanism**
- **Requirement:** Clear path for users to report documentation issues
- **Implementation:** "Report documentation issue" link in README → GitHub Issues with template
- **Template Fields:** Page URL, issue description, expected vs actual, browser/OS
- **Response SLA:** Acknowledge within 48 hours, fix critical issues (incorrect config) within 1 week
- **Rationale:** Continuous documentation improvement based on user feedback

**NFR-5.18: Integration Success Metrics (Story 5.1)**
- **Requirement:** Track successful vs failed integrations
- **Measurement:** API logs (not directly attributable to documentation, but indicator)
- **Proxy Metrics:**
  - First query time: New users appear in API logs after documentation release
  - Error rate: High 400 errors may indicate documentation issues
  - Support requests: "How do I configure?" questions = documentation gaps
- **Target:** <5 support requests per 100 new users (95% self-service success)

**NFR-5.19: OpenAPI Spec Adoption Tracking (Story 5.2)**
- **Requirement:** Track downloads of openapi.json
- **Mechanism:** Cloudflare Workers analytics for /openapi.json endpoint (if hosted on Workers)
- **Alternative:** GitHub raw file download analytics (if hosted in repo)
- **Metrics:** Downloads per week, unique IPs
- **Rationale:** Understand if developers use OpenAPI spec for code generation
- **Action:** If low adoption, improve documentation about OpenAPI benefits

**NFR-5.20: Query Quality Monitoring (Story 5.4)**
- **Requirement:** Monitor query patterns to validate usage guide effectiveness
- **Mechanism:** API logs analysis (aggregate query lengths, common terms)
- **Metrics:**
  - Average query length (target: 10-30 characters = natural language phrases)
  - Single-word queries % (bad pattern, target: <20%)
  - UK government domain terms frequency ("NHS", "HMRC", "postcode", etc.)
- **Rationale:** Validate usage guide teaches effective query formulation
- **Action:** If many single-word queries, improve usage guide examples

**No User-Level Tracking:** Epic 5 does not introduce user accounts or personal tracking. All metrics are aggregate and anonymous.

## Dependencies and Integrations

### Internal Dependencies

**Epic 4: MCP API Server (CRITICAL PATH)**
- **Dependency:** Epic 5 documents the API delivered in Epic 4
- **Required State:** POST /mcp/search and GET /mcp/health fully implemented, tested, and deployed to production
- **Integration Points:**
  - OpenAPI spec must match actual API behavior (request/response schemas from src/types.ts)
  - Integration examples call production endpoint: https://govreposcrape.cloud.cns.me
  - Documentation references actual error codes and formats from src/utils/error-handler.ts
- **Risk:** If Epic 4 API changes during Epic 5 development, documentation becomes stale
- **Mitigation:** Lock Epic 4 API contract before starting Epic 5, any changes require documentation updates

**Epic 1: TypeScript Types (src/types.ts)**
- **Dependency:** MCPRequest, MCPResponse, SearchResult interfaces
- **Purpose:** OpenAPI spec schemas must match TypeScript type definitions exactly
- **Integration:** Manual translation from TypeScript to OpenAPI 3.0 schema format
- **Risk:** Type drift (TypeScript types updated but OpenAPI spec not)
- **Mitigation:** Automated validation script comparing types.ts to openapi.json (Phase 2)

**package.json (Minimal Changes)**
- **New Dev Dependencies (optional):**
  - `openapi-generator-cli` - For OpenAPI spec validation (NFR-5.12)
  - `markdown-link-check` - For link integrity validation (NFR-5.13)
  - None required for MVP (validation can be manual)
- **No New Runtime Dependencies:** Epic 5 is pure documentation, no production code dependencies

### External Dependencies

**Claude Desktop (Integration Target - Story 5.1)**
- **Vendor:** Anthropic
- **Version:** Latest stable release recommended (documentation must note version compatibility)
- **Config Format:** JSON (`claude_desktop_config.json`)
- **Config Locations:**
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
- **Integration Type:** MCP v2 protocol client
- **Risk:** Claude Desktop MCP configuration format may change
- **Mitigation:** Link to official Anthropic MCP documentation, note "Configuration format as of November 2025"
- **Testing:** Manual testing on at least 2 platforms (macOS + Windows or Linux)

**GitHub Copilot (Integration Target - Story 5.1)**
- **Vendor:** GitHub/Microsoft
- **Version:** VS Code extension, JetBrains plugin
- **MCP Support Status:** UNCERTAIN - As of Epic 5 development, MCP protocol support unclear
- **Documentation Strategy:**
  - Include guide with clear disclaimer: "GitHub Copilot MCP support is preview/not yet publicly available"
  - Provide expected configuration format based on MCP v2 spec
  - Note: "Check GitHub Copilot documentation for latest MCP integration status"
- **Risk:** Documenting unconfirmed integration may confuse users
- **Mitigation:** Clear visual warnings (⚠️ icon), "Coming Soon" section, link to Copilot roadmap
- **Testing:** Cannot test if feature not released; document expected behavior only

**OpenAPI Generator (Validation Tool - Story 5.2)**
- **Tool:** openapi-generator (https://openapi-generator.tech)
- **Version:** 7.0+ (latest stable)
- **Purpose:** Validate OpenAPI spec format, test code generation
- **Installation:** `npm install -g @openapitools/openapi-generator-cli`
- **Validation Command:** `openapi-generator validate -i static/openapi.json`
- **Code Generation Test:** Generate TypeScript client to verify spec works
- **Risk:** openapi-generator may have breaking changes
- **Mitigation:** Document exact version used, test with latest version before release

**GitHub Repository (Documentation Hosting)**
- **Service:** GitHub (github.com)
- **Purpose:** Primary documentation hosting (README.md, docs/*, examples/*)
- **Availability:** 99.99%+ SLA (GitHub uptime)
- **Integration:** Git version control, GitHub Pages (optional for /docs rendering)
- **Access:** Public repository (open source per PRD requirement)
- **Risk:** GitHub outage = documentation unavailable
- **Mitigation:** API remains functional, documentation can be read locally from cloned repo

**Markdown Renderers (Documentation Presentation)**
- **Renderers:**
  - GitHub Markdown (primary - renders in web browser)
  - VS Code Markdown Preview (developer local viewing)
  - Terminal pagers (less, cat for CLI users)
- **Compatibility:** Use GitHub-Flavored Markdown (GFM) for consistency
- **Features Used:** Tables, code blocks, task lists, links, headings
- **Risk:** Renderer differences (e.g., GitHub vs VS Code emoji support)
- **Mitigation:** Test documentation rendering on GitHub before release

### External APIs and Services (Documented, Not Called)

**Production MCP API Endpoint**
- **URL:** https://govreposcrape.cloud.cns.me
- **Purpose:** Examples and test scripts call this endpoint
- **Availability Requirement:** Must be live and stable during Epic 5 development
- **Testing:** All integration examples tested against production endpoint
- **Risk:** API downtime during documentation testing = blocked examples
- **Mitigation:** Use staging endpoint for initial testing, validate against production before release

### Integration Interfaces

**OpenAPI 3.0 to TypeScript Interface Mapping:**

| TypeScript Type | OpenAPI Schema | Mapping Notes |
|-----------------|----------------|---------------|
| `interface MCPRequest` | `components/schemas/MCPRequest` | Required: query (string 3-500), Optional: limit (int 1-20) |
| `interface MCPResponse` | `components/schemas/MCPResponse` | Required: results (array), took_ms (number) |
| `interface SearchResult` | `components/schemas/SearchResult` | 9 required fields, 1 optional (language) |
| `interface ErrorResponse` | `components/schemas/ErrorResponse` | Nested error object with code, message, optional retry_after |
| `string (ISO8601)` | `type: string, format: date-time` | Timestamps like last_updated, pushedAt |
| `number (0.0-1.0)` | `type: number, minimum: 0, maximum: 1` | Similarity scores |
| `string (URL)` | `type: string, format: uri` | GitHub links, repo URLs |

**MCP v2 Protocol to API Mapping:**

| MCP Client | Configuration Entry | API Endpoint |
|------------|---------------------|--------------|
| Claude Desktop | `mcpServers.govscraperepo.url` | https://govreposcrape.cloud.cns.me/mcp |
| GitHub Copilot | TBD (depends on implementation) | https://govreposcrape.cloud.cns.me/mcp |
| Custom Client | Base URL configuration | https://govreposcrape.cloud.cns.me |

### Dependency Management

**Documentation Dependencies (No package.json):**
- **Markdown Files:** No build step, direct commit to Git
- **OpenAPI Spec:** JSON file, no build step, validate with external tool
- **Examples:** Standalone scripts (bash, JavaScript, Python), no dependency manifest

**Optional Dev Dependencies (Phase 2 CI/CD):**
```json
{
  "devDependencies": {
    "@openapitools/openapi-generator-cli": "^2.7.0",
    "markdown-link-check": "^3.11.0"
  },
  "scripts": {
    "validate:openapi": "openapi-generator validate -i static/openapi.json",
    "validate:links": "markdown-link-check README.md docs/**/*.md"
  }
}
```

**No Runtime Dependencies:** Epic 5 adds zero runtime dependencies to Cloudflare Workers deployment. All dependencies are documentation-time tools only.

### Integration Testing

**Test Matrix for Integration Examples:**

| Example | Platform | Test Command | Expected Output |
|---------|----------|--------------|-----------------|
| curl.sh | macOS, Linux | `bash examples/curl.sh` | 5 SearchResults JSON |
| node.js | Node.js 20+ | `node examples/node.js` | Formatted results, no errors |
| python.py | Python 3.11+ | `python3 examples/python.py` | Formatted results, no errors |
| test-mcp.sh | macOS, Linux | `./examples/test-mcp.sh` | "✅ All tests passed" |

**Test Matrix for MCP Configuration:**

| Platform | OS | Config Path | Validation |
|----------|----|--------------|----- ------|
| Claude Desktop | macOS 14+ | ~/Library/Application Support/Claude/... | Manual: Add config → Restart → Test query |
| Claude Desktop | Windows 11 | %APPDATA%\Claude\... | Manual: Add config → Restart → Test query |
| Claude Desktop | Ubuntu 22.04+ | ~/.config/Claude/... | Manual: Add config → Restart → Test query |
| GitHub Copilot | VS Code | Settings JSON | Cannot test if MCP not released |

**OpenAPI Spec Validation:**

| Tool | Version | Test | Expected Result |
|------|---------|------|-----------------|
| openapi-generator | 7.0+ | `validate -i static/openapi.json` | Zero errors |
| openapi-generator | 7.0+ | `generate -i static/openapi.json -g typescript-fetch` | Client code compiles |
| Swagger Editor | Online | Paste openapi.json | Zero syntax errors |

### Dependency Risks and Mitigations

**Risk 1: Claude Desktop Config Format Changes**
- **Impact:** Documentation becomes incorrect, users can't configure
- **Probability:** Low (stable API unlikely to change rapidly)
- **Mitigation:** Version-pin documentation ("As of Claude Desktop v1.x"), link to official docs
- **Detection:** User reports, monitoring Anthropic changelogs

**Risk 2: GitHub Copilot MCP Support Delayed**
- **Impact:** Documentation premature, users frustrated by unavailable feature
- **Probability:** Medium (MCP support status unclear)
- **Mitigation:** Clear "Coming Soon" disclaimers, separate Copilot doc from Claude doc
- **Detection:** Monitor GitHub Copilot release notes

**Risk 3: OpenAPI Spec Drift from Implementation**
- **Impact:** Generated clients don't work, documentation inaccurate
- **Probability:** Low for MVP (Epic 4 frozen), Medium for long-term
- **Mitigation:** Automated validation comparing types.ts to openapi.json (Phase 2), manual review
- **Detection:** User reports, code generation failures

**Risk 4: Production API Changes During Documentation**
- **Impact:** Examples fail, documentation outdated immediately
- **Probability:** Low (Epic 4 should be stable)
- **Mitigation:** Coordinate with Epic 4 team, lock API contract, test examples against prod before release
- **Detection:** CI/CD running examples against prod API (Phase 2)

**Risk 5: Example Dependencies Outdated**
- **Impact:** Node.js/Python examples don't run on newer platforms
- **Probability:** Low for MVP (simple fetch/requests), Medium long-term
- **Mitigation:** Pin Node.js/Python versions in documentation ("Tested with Node.js 20+, Python 3.11+")
- **Detection:** User reports, periodic testing on latest LTS versions

## Acceptance Criteria (Authoritative)

These acceptance criteria are extracted from Epic 5 stories and represent the authoritative definition of "done" for this epic.

### Story 5.1: MCP Configuration Guides for Claude Desktop and GitHub Copilot

**AC-5.1.1: Claude Desktop Configuration Guide Completeness**
- **GIVEN** a developer has Claude Desktop installed
- **WHEN** they follow the Claude Desktop MCP configuration guide
- **THEN** the guide includes:
  - Step-by-step instructions for locating config file (macOS, Windows, Linux paths)
  - Exact JSON configuration with govscraperepo MCP endpoint
  - Troubleshooting section covering: network errors, invalid config syntax, no results returned
  - Example queries to verify integration: "search UK government authentication code"
  - Expected results format (5 SearchResults with repo URLs, snippets, metadata)
- **AND** the guide can be completed in <5 minutes by average developer
- **PASS CRITERIA:** Developer can configure Claude Desktop and execute successful query without support

**AC-5.1.2: GitHub Copilot Configuration Guide with Caveats**
- **GIVEN** GitHub Copilot is installed in IDE (VS Code or JetBrains)
- **WHEN** a developer reads the GitHub Copilot MCP configuration guide
- **THEN** the guide includes:
  - Clear disclaimer: "GitHub Copilot MCP support is preview/not yet publicly available"
  - Step-by-step instructions for extension settings and MCP server configuration
  - Example queries demonstrating Copilot-specific usage patterns
  - Troubleshooting covering Copilot-specific issues
- **AND** the guide clearly notes MCP support status and links to GitHub Copilot documentation
- **PASS CRITERIA:** Developer understands MCP support status and has configuration steps ready when feature releases

**AC-5.1.3: Multi-Platform Configuration Path Verification**
- **GIVEN** Claude Desktop configuration guides for 3 platforms (macOS, Windows, Linux)
- **WHEN** developers on each platform follow the guide
- **THEN** config file paths are correct for:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
- **AND** JSON configuration format is identical across all platforms
- **PASS CRITERIA:** Manual testing on at least 2 platforms confirms paths and config work

**AC-5.1.4: Integration Verification Examples**
- **GIVEN** a developer has completed MCP configuration
- **WHEN** they test the integration using provided example queries
- **THEN** example queries include:
  - "search UK government authentication code"
  - "find NHS API integration examples"
  - "show me postcode validation implementations"
- **AND** guide explains expected response structure (SearchResult array with 5 results)
- **AND** guide shows how to verify results are relevant government code
- **PASS CRITERIA:** Developer can confirm integration works by executing test queries

### Story 5.2: OpenAPI 3.0 Specification

**AC-5.2.1: Complete OpenAPI Spec for All Endpoints**
- **GIVEN** the MCP API has endpoints implemented (POST /mcp/search, GET /mcp/health)
- **WHEN** the OpenAPI specification is created
- **THEN** the spec documents:
  - POST /mcp/search with full request/response schemas and examples
  - GET /mcp/health with success/error response schemas
  - All error responses (400 Bad Request, 500 Internal Server Error, 503 Service Unavailable)
  - Request/response examples for each endpoint
- **AND** spec is available at `/openapi.json` endpoint or static file
- **PASS CRITERIA:** OpenAPI spec validates without errors using openapi-generator

**AC-5.2.2: Schema Accuracy and Code Generation**
- **GIVEN** the OpenAPI specification exists
- **WHEN** developers use OpenAPI tools (Swagger UI, code generators)
- **THEN** the spec:
  - Is valid OpenAPI 3.0 format (passes `openapi-generator validate`)
  - Can be rendered in Swagger UI without errors
  - Generates working TypeScript/Python clients via openapi-generator
- **AND** generated clients compile without errors
- **AND** generated clients successfully call production API
- **PASS CRITERIA:** Generated TypeScript client executes successful query against https://govreposcrape.cloud.cns.me

**AC-5.2.3: OpenAPI Metadata and Documentation**
- **GIVEN** the OpenAPI specification is complete
- **WHEN** developers view the spec
- **THEN** the spec includes:
  - API title: "govscraperepo MCP API"
  - Description: Clear explanation of UK government code search purpose
  - Version: "1.0.0"
  - Contact info: Link to GitHub repository issues
  - Server URL: https://govreposcrape.cloud.cns.me
  - Security section: Explicit note that no authentication required
- **AND** all schemas have descriptions and examples
- **PASS CRITERIA:** Spec provides sufficient context for developers to understand API without external documentation

**AC-5.2.4: Interactive Documentation (Optional)**
- **GIVEN** OpenAPI spec is available at `/openapi.json`
- **WHEN** developers access `/docs` endpoint (optional)
- **THEN** Swagger UI renders interactive API documentation
- **AND** developers can test API calls directly from browser
- **OR** if `/docs` not implemented, documentation clearly links to Swagger Editor or similar tool
- **PASS CRITERIA:** Developers can explore API interactively (via hosted /docs or external tool)

### Story 5.3: Integration Examples and Testing Tools

**AC-5.3.1: Multi-Language Integration Examples**
- **GIVEN** developers want to integrate govscraperepo API
- **WHEN** they view integration examples
- **THEN** examples exist for:
  - cURL: `examples/curl.sh` - Shell script with basic query
  - TypeScript/JavaScript: `examples/node.js` - Node.js using fetch API
  - Python: `examples/python.py` - Python using requests library
- **AND** each example demonstrates:
  - Basic query execution (POST /mcp/search)
  - Result parsing and display
  - Error handling (network errors, API errors)
  - Timeout handling
- **AND** all examples use production endpoint: https://govreposcrape.cloud.cns.me
- **PASS CRITERIA:** All 3 examples execute successfully and return 5 SearchResults

**AC-5.3.2: Examples Are Copy-Paste Ready**
- **GIVEN** integration examples exist
- **WHEN** a developer copies and runs an example
- **THEN** the example:
  - Executes without modification (no placeholder replacement required)
  - Includes comments explaining key parts
  - Demonstrates realistic queries from PRD use cases
  - Shows formatted output (not just raw JSON dump)
- **AND** examples use environment variables for configuration (API_URL)
- **PASS CRITERIA:** Developer can run example immediately after copy-paste with zero edits

**AC-5.3.3: Test Script for Connectivity Validation**
- **GIVEN** a test script exists (`test-mcp.sh` or `test-mcp.ts`)
- **WHEN** a developer runs the test script
- **THEN** the script validates:
  - Endpoint reachability: GET /mcp/health returns 200 OK
  - Search functionality: POST /mcp/search returns results
  - Response format correctness: All required fields present (repo_url, snippet, etc.)
- **AND** test output is clear:
  - ✅ "Health check passed: API is healthy"
  - ✅ "Test query passed: Received 5 results"
  - ✅ "Response format valid: All required fields present"
  - **OR** ❌ "Connection failed: [specific error]"
- **AND** script exits with code 0 on success, code 1 on failure
- **PASS CRITERIA:** Test script accurately diagnoses connectivity issues and provides actionable error messages

**AC-5.3.4: Example Code Quality**
- **GIVEN** all integration examples exist
- **WHEN** examples are reviewed
- **THEN** examples follow best practices:
  - Error handling: All network/API errors caught and logged
  - Input validation: Query length validated before API call
  - Secure patterns: HTTPS-only, environment variables for config
  - Comments: Key sections explained for learning
  - Output: Human-readable formatted results
- **AND** examples include JSDoc/docstrings explaining purpose
- **PASS CRITERIA:** Code review confirms examples demonstrate professional integration patterns

### Story 5.4: Usage Guide and Best Practices Documentation

**AC-5.4.1: Semantic Search Explanation**
- **GIVEN** the usage guide exists
- **WHEN** a developer reads the semantic search explanation
- **THEN** the guide explains:
  - How semantic search works (concept matching vs keyword matching)
  - Difference between natural language queries and keywords
  - Why semantic search is better for discovering government code
  - Examples of semantic vs keyword searches
- **AND** explanation is clear for non-technical users (civil servants in Phase 2)
- **PASS CRITERIA:** Explanation is understandable to average UK government developer without AI/ML background

**AC-5.4.2: Query Formulation Best Practices**
- **GIVEN** developers want to maximize search relevance
- **WHEN** they follow query formulation tips in usage guide
- **THEN** the guide includes:
  - Optimal query length: 3-20 words (natural phrases)
  - Good vs bad query examples:
    - Good: "authentication methods" (specific, natural language)
    - Bad: "auth" (too vague, single keyword)
    - Good: "NHS API integration patterns" (domain-specific, clear scope)
    - Bad: "NHS" (single word, no context)
  - Tips for using natural language: "How do departments...", "Show me examples of..."
  - When to add context: Specify technology, use case, department sector
- **PASS CRITERIA:** Guide provides 5+ good/bad query pairs with explanations

**AC-5.4.3: UK Government Domain-Specific Examples**
- **GIVEN** the usage guide includes examples
- **WHEN** developers try the examples
- **THEN** examples are UK government-specific:
  - "How do departments validate UK postcodes?"
  - "HMRC tax calculation implementations"
  - "DWP benefits eligibility checking"
  - "NHS API integration patterns"
  - "GDS authentication methods"
- **AND** examples reflect actual government developer needs from PRD use cases
- **AND** examples are tested to return relevant results
- **PASS CRITERIA:** All 5+ example queries return at least 3 relevant results when tested against production API

**AC-5.4.4: Result Interpretation Guidance**
- **GIVEN** developers receive search results
- **WHEN** they interpret results using the usage guide
- **THEN** the guide explains:
  - Similarity score meaning (0.8+ = strong match, 0.6-0.8 = moderate, <0.6 = weak)
  - Last updated timestamp importance (recent = actively maintained)
  - Organization reputation signals (alphagov, nhsdigital, hmrc = high trust)
  - License checking (MIT, OGL, Apache = reusable)
  - How to evaluate if code is production-ready vs experimental
- **PASS CRITERIA:** Guide provides decision framework for "should I reuse this code?"

**AC-5.4.5: Documentation Conciseness and Accessibility**
- **GIVEN** the usage guide is complete
- **WHEN** the guide is reviewed
- **THEN** the guide is:
  - Clear and concise (<500 words for main content)
  - UK government-specific examples (not generic software)
  - Linked to PRD/product brief for deeper context
  - Includes feedback mechanism: "Report documentation issue" link
- **AND** guide is accessible to non-technical users (civil servants in Phase 2)
- **PASS CRITERIA:** Guide readable at F-E reading level 8-9, confirmed by readability checker

### Epic-Level Acceptance Criteria

**AC-5.E.1: Self-Service Integration Success**
- **GIVEN** 20+ early adopters attempt MCP integration
- **WHEN** they follow documentation without support
- **THEN** at least 18 (90%) successfully configure and execute first query
- **AND** average integration time is <5 minutes from doc start to successful query
- **AND** fewer than 5 support requests per 100 users (95% self-service success rate)
- **PASS CRITERIA:** Post-release survey or analytics confirms 90%+ self-service success

**AC-5.E.2: Zero Critical Documentation Bugs**
- **GIVEN** documentation is released
- **WHEN** developers use it for 2 weeks
- **THEN** zero high-severity bugs are reported:
  - High severity: Incorrect config paths, broken examples, wrong API endpoints
  - Medium severity: Unclear instructions, missing prerequisites
  - Low severity: Typos, formatting issues
- **PASS CRITERIA:** No high-severity documentation bugs reported in first 2 weeks post-release

**AC-5.E.3: OpenAPI Spec Validation Success**
- **GIVEN** OpenAPI spec is complete
- **WHEN** validated with industry-standard tools
- **THEN** spec passes validation:
  - `openapi-generator validate -i static/openapi.json` returns zero errors
  - Swagger Editor shows zero syntax errors
  - TypeScript client generation succeeds and compiles
  - Generated client executes successful API call
- **PASS CRITERIA:** All validation tools confirm spec is correct and usable

**AC-5.E.4: Documentation Coverage Complete**
- **GIVEN** Epic 5 documentation artifacts
- **WHEN** documentation is reviewed for completeness
- **THEN** all required artifacts exist:
  - ✅ Claude Desktop integration guide (docs/integration/claude-desktop.md)
  - ✅ GitHub Copilot integration guide (docs/integration/github-copilot.md)
  - ✅ OpenAPI 3.0 specification (static/openapi.json)
  - ✅ cURL example (examples/curl.sh)
  - ✅ Node.js example (examples/node.js)
  - ✅ Python example (examples/python.py)
  - ✅ Test script (examples/test-mcp.sh or test-mcp.ts)
  - ✅ Usage guide (docs/usage-guide.md)
  - ✅ README updates with integration quickstart
- **PASS CRITERIA:** All 9 documentation artifacts present and complete

## Traceability Mapping

This table maps acceptance criteria to technical specification sections, implementation components, and test strategies:

| AC ID | Acceptance Criteria | Spec Section(s) | Component(s) | Test Idea |
|-------|---------------------|-----------------|--------------|-----------|
| **AC-5.1.1** | Claude Desktop guide completeness | Overview, Detailed Design > APIs and Interfaces, Workflows | docs/integration/claude-desktop.md | Manual: Follow guide on macOS, verify <5 min completion, successful query |
| **AC-5.1.2** | GitHub Copilot guide with caveats | Detailed Design > APIs and Interfaces | docs/integration/github-copilot.md | Manual: Review guide for clear disclaimers, MCP status notes |
| **AC-5.1.3** | Multi-platform config path verification | Detailed Design > APIs and Interfaces | docs/integration/claude-desktop.md (OS-specific sections) | Manual: Test on macOS + Windows/Linux, verify paths correct |
| **AC-5.1.4** | Integration verification examples | Detailed Design > Workflows | docs/integration/claude-desktop.md (examples section) | Execute 3 test queries in Claude Desktop, verify 5 results returned |
| **AC-5.2.1** | Complete OpenAPI spec for all endpoints | Detailed Design > Data Models, APIs and Interfaces | static/openapi.json | Run `openapi-generator validate`, expect zero errors |
| **AC-5.2.2** | Schema accuracy and code generation | Detailed Design > Data Models | static/openapi.json | Generate TypeScript client, compile, execute query against prod API |
| **AC-5.2.3** | OpenAPI metadata and documentation | Detailed Design > APIs and Interfaces | static/openapi.json (info section) | Review spec for title, description, version, contact, server URL |
| **AC-5.2.4** | Interactive documentation (optional) | Detailed Design > APIs and Interfaces | /docs endpoint (optional) | Load Swagger UI, test query execution from browser |
| **AC-5.3.1** | Multi-language integration examples | Detailed Design > Services and Modules, Workflows | examples/curl.sh, examples/node.js, examples/python.py | Run `bash examples/curl.sh && node examples/node.js && python3 examples/python.py` |
| **AC-5.3.2** | Examples are copy-paste ready | Detailed Design > Services and Modules | examples/*.{sh,js,py} | Copy example, paste in terminal/editor, run with zero modifications |
| **AC-5.3.3** | Test script for connectivity validation | Detailed Design > Services and Modules | examples/test-mcp.sh or examples/test-mcp.ts | Run `./examples/test-mcp.sh`, verify output shows ✅ or ❌ with clear messages |
| **AC-5.3.4** | Example code quality | NFR > Security (input validation, error handling) | examples/*.{sh,js,py} | Code review: Verify try-catch, input validation, secure patterns, comments |
| **AC-5.4.1** | Semantic search explanation | Overview | docs/usage-guide.md (intro section) | Readability check: F-E level 8-9, understandable to non-AI/ML developers |
| **AC-5.4.2** | Query formulation best practices | Detailed Design > Workflows (Workflow 4) | docs/usage-guide.md (query tips section) | Manual review: Verify 5+ good/bad query pairs with explanations |
| **AC-5.4.3** | UK government domain-specific examples | Detailed Design > Workflows | docs/usage-guide.md (examples section) | Execute 5+ example queries against prod API, verify 3+ relevant results each |
| **AC-5.4.4** | Result interpretation guidance | Detailed Design > Workflows | docs/usage-guide.md (results section) | Manual review: Decision framework for similarity scores, metadata, trust signals |
| **AC-5.4.5** | Documentation conciseness and accessibility | Overview, Objectives and Scope | docs/usage-guide.md | Readability check: <500 words main content, F-E level 8-9 |
| **AC-5.E.1** | Self-service integration success | Epic-level | All documentation artifacts | Post-release survey: 90%+ self-service, <5 min integration time |
| **AC-5.E.2** | Zero critical documentation bugs | Epic-level | All documentation artifacts | Bug tracker: Zero high-severity docs bugs in first 2 weeks |
| **AC-5.E.3** | OpenAPI spec validation success | Detailed Design > Data Models, Dependencies | static/openapi.json | Automated: `openapi-generator validate && generate && compile` |
| **AC-5.E.4** | Documentation coverage complete | Detailed Design > Services and Modules | All 9 documentation artifacts | Checklist: Verify all files exist, non-empty, committed to main |

### Traceability to PRD Requirements

| PRD Requirement | Epic 5 Acceptance Criteria | Implementation |
|-----------------|---------------------------|----------------|
| **FR-4.1:** MCP Configuration Documentation | AC-5.1.1, AC-5.1.2, AC-5.1.3, AC-5.1.4 | docs/integration/claude-desktop.md, docs/integration/github-copilot.md |
| **FR-4.2:** OpenAPI 3.0 Specification | AC-5.2.1, AC-5.2.2, AC-5.2.3, AC-5.2.4 | static/openapi.json, optional /docs endpoint |
| **NFR-4.1:** WCAG 2.1 AA Compliance (Phase 2 web UI) | Not applicable to Epic 5 (API docs only, no web UI) | Deferred to Phase 2 |
| **NFR-8.3:** Technology Code of Practice Alignment (Point 5: Make source code open) | AC-5.E.4 (all docs in public repo) | GitHub repository (open source) |

### Traceability to Architecture Decisions

| Architecture Decision | Epic 5 Impact | Acceptance Criteria |
|-----------------------|---------------|---------------------|
| **ADR-002:** No Authentication for MCP API | OpenAPI spec documents open access, examples show no auth | AC-5.2.3 (security section in spec) |
| **File Naming:** kebab-case.ts, snake_case.py | Examples follow conventions (curl.sh, node.js, python.py) | AC-5.3.1 (example naming) |
| **Module Exports:** Named exports preferred | Node.js example demonstrates named exports pattern | AC-5.3.4 (code quality) |
| **Error Handling:** 3 retries, exponential backoff | Examples demonstrate retry logic and error handling | AC-5.3.4, NFR-5.8 |
| **Logging:** Structured JSON | Examples show structured error logging | AC-5.3.4 |

### Test Coverage Summary

| Test Type | Coverage | Validation Method |
|-----------|----------|-------------------|
| **Manual Testing** | MCP configuration (Claude Desktop on 2+ OS), example execution (all 3 languages), OpenAPI rendering (Swagger UI) | Human execution following guides, verify <5 min completion |
| **Automated Validation** | OpenAPI spec format (openapi-generator), link integrity (markdown-link-check), code generation (TypeScript client compile) | CI/CD scripts (Phase 2), manual for MVP |
| **Code Review** | Example code quality (error handling, input validation, comments), documentation readability (F-E level), security patterns (HTTPS-only) | Peer review checklist |
| **Production Testing** | All examples against live API (https://govreposcrape.cloud.cns.me), test queries return relevant results | Execute before documentation release |
| **User Acceptance** | 20+ early adopters self-service integration, <5 support requests per 100 users | Post-release survey, support ticket tracking |

## Risks, Assumptions, Open Questions

### Risks

**Risk 1: Claude Desktop Config Format Changes Mid-Development**
- **Description:** Anthropic changes MCP configuration format or config file location during Epic 5 development
- **Impact:** HIGH - Documentation becomes incorrect immediately, users can't configure
- **Probability:** LOW - Stable API unlikely to change rapidly
- **Mitigation:**
  1. Version-pin documentation ("As of Claude Desktop v1.x, November 2025")
  2. Link to official Anthropic MCP documentation as authoritative source
  3. Test configuration on latest Claude Desktop version before documentation release
  4. Monitor Anthropic changelogs and update documentation promptly if changes detected
- **Contingency:** Include fallback section: "If config paths don't work, consult Claude Desktop documentation"
- **Owner:** Story 5.1 implementer

**Risk 2: GitHub Copilot MCP Support Not Released by Epic 5 Completion**
- **Description:** GitHub Copilot MCP protocol support remains unreleased or preview-only during Epic 5
- **Impact:** MEDIUM - Documentation premature, users frustrated by unavailable feature, credibility damage
- **Probability:** MEDIUM-HIGH - MCP support status currently unclear
- **Mitigation:**
  1. Clear visual disclaimers: ⚠️ "GitHub Copilot MCP support is preview/not yet publicly available"
  2. Separate Copilot doc from Claude doc (don't mix stable + unstable)
  3. Add "Coming Soon" badge to Copilot integration guide
  4. Link to GitHub Copilot roadmap or feature request for MCP support
  5. Consider deferring Copilot guide to Phase 2 if status unclear at Epic 5 start
- **Contingency:** Remove Copilot guide from MVP release if feature not available at launch
- **Owner:** Product owner decision at Epic 5 planning, Story 5.1 implementer

**Risk 3: OpenAPI Spec Drift from Implementation**
- **Description:** Epic 4 API changes (error formats, new fields, schema updates) but OpenAPI spec not updated
- **Impact:** HIGH - Generated clients don't work, code generation fails, documentation inaccurate
- **Probability:** LOW for MVP (Epic 4 should be frozen), MEDIUM for long-term maintenance
- **Mitigation:**
  1. Lock Epic 4 API contract before starting Epic 5 (coordinate with Epic 4 team)
  2. Manual validation: Compare types.ts to openapi.json line-by-line
  3. Automated validation script (Phase 2): Parse types.ts, compare to OpenAPI schemas
  4. Test code generation: Generate TypeScript client, compile, execute query before release
  5. Document API version in OpenAPI spec (version: "1.0.0"), increment on changes
- **Contingency:** If drift detected, block Epic 5 completion until OpenAPI spec updated and validated
- **Owner:** Story 5.2 implementer, Epic 4 tech lead

**Risk 4: Production API Downtime During Documentation Testing**
- **Description:** Production API (https://govreposcrape.cloud.cns.me) unavailable during Epic 5 example testing
- **Impact:** MEDIUM - Blocked examples testing, delayed documentation release
- **Probability:** LOW - Epic 4 API should be stable and deployed
- **Mitigation:**
  1. Coordinate with Epic 4 team on deployment schedule
  2. Use staging endpoint for initial example development (if available)
  3. Validate all examples against production API as final pre-release step
  4. Maintain local Workers dev environment as fallback for example testing
- **Contingency:** If production unavailable, test against `wrangler dev` local endpoint, re-test production before release
- **Owner:** Story 5.3 implementer

**Risk 5: Example Dependencies Outdated at Release**
- **Description:** Node.js/Python versions, libraries (fetch, requests) change, examples fail on latest platforms
- **Impact:** LOW for MVP (simple examples), MEDIUM long-term
- **Probability:** LOW for MVP (6-month horizon), MEDIUM for 2+ years
- **Mitigation:**
  1. Pin platform versions in documentation: "Tested with Node.js 20+, Python 3.11+"
  2. Use stable, long-term-support (LTS) features only (fetch API is stable, requests is mature)
  3. Avoid bleeding-edge features or experimental APIs
  4. Document example dependencies clearly (no hidden requirements)
  5. Test examples on multiple Node.js LTS versions (18, 20, 22) before release
- **Contingency:** Periodic testing (quarterly) against latest LTS versions, update examples as needed
- **Owner:** Story 5.3 implementer, long-term maintenance team

**Risk 6: Documentation Bugs Discovered Post-Release**
- **Description:** High-severity bugs (wrong config paths, broken examples, incorrect endpoints) found after documentation release
- **Impact:** HIGH - Adoption blocked, support requests spike, credibility damage
- **Probability:** MEDIUM - Documentation hard to test comprehensively pre-release
- **Mitigation:**
  1. Manual testing on at least 2 platforms (macOS + Windows/Linux) before release
  2. Peer review: Second developer follows all guides fresh, reports issues
  3. Beta testing: 5-10 early adopters test documentation pre-release, provide feedback
  4. Link checker: Automated validation of all documentation links (markdown-link-check)
  5. OpenAPI validation: `openapi-generator validate` before release
- **Contingency:** Rapid response SLA: Fix high-severity bugs within 24 hours, update documentation immediately
- **Owner:** All story implementers, code reviewer

**Risk 7: Test Queries Return No Results**
- **Description:** Example queries in usage guide ("NHS API integration", "HMRC tax calculation") return zero relevant results
- **Impact:** MEDIUM - User frustration, documentation appears inaccurate, query guidance ineffective
- **Probability:** LOW if examples tested pre-release, MEDIUM if untested
- **Mitigation:**
  1. Test all example queries against production API before documentation release
  2. Verify at least 3 relevant results returned for each example query
  3. Use queries validated in Epic 3/4 testing (proven to work)
  4. Include fallback queries if primary queries fail
  5. Explain that results depend on data ingestion status (Epic 2)
- **Contingency:** Update usage guide examples to queries proven to return results, note "Results may vary based on repository index status"
- **Owner:** Story 5.4 implementer

### Assumptions

**Assumption 1: Epic 4 API is Stable and Deployed**
- **Description:** POST /mcp/search and GET /mcp/health endpoints fully implemented, tested, and deployed to production
- **Validation:** Confirm with Epic 4 team that API is frozen and production-ready
- **Impact if False:** Epic 5 blocked, documentation targets moving implementation
- **Mitigation:** Epic 5 planning gate: API contract review, endpoint testing before starting documentation

**Assumption 2: Claude Desktop Supports MCP v2 Protocol**
- **Description:** Claude Desktop has stable MCP v2 support with JSON config file format
- **Validation:** Test on latest Claude Desktop version (as of November 2025)
- **Impact if False:** Claude integration guide inaccurate or incomplete
- **Mitigation:** Document Claude Desktop version tested, link to official Anthropic MCP documentation

**Assumption 3: Developers Have Basic Tool Knowledge**
- **Description:** Target developers understand Git (clone repo), terminal (run bash scripts), Node.js/Python basics
- **Validation:** User persona from PRD includes technical developers and civil servants (some technical)
- **Impact if False:** Documentation too complex, setup time >5 minutes, increased support requests
- **Mitigation:** Include prerequisites section: "Before starting: Install Node.js 20+, Python 3.11+, Git"

**Assumption 4: GitHub Repository is Public**
- **Description:** Documentation hosted in public GitHub repository (per PRD NFR-8.3: open source)
- **Validation:** Confirm repository visibility with product owner
- **Impact if False:** Documentation not accessible via GitHub Pages, links break
- **Mitigation:** Architecture specifies public repo, PRD requires open source (safe assumption)

**Assumption 5: OpenAPI 3.0 is Industry Standard**
- **Description:** OpenAPI 3.0 format is widely supported by code generators, Swagger UI, and developer tools
- **Validation:** OpenAPI 3.0 is current standard (as of 2025), broad tool support
- **Impact if False:** Generated clients don't work, spec not usable
- **Mitigation:** Test with openapi-generator (most popular tool), Swagger Editor (official validator)

**Assumption 6: No Authentication Required (MVP)**
- **Description:** MCP API remains open access (no JWT, no API keys) through Epic 5 completion
- **Validation:** Confirmed by ADR-002 (architecture), PRD (no auth in MVP)
- **Impact if False:** Examples and configuration guides become incorrect, need to document auth
- **Mitigation:** Architecture frozen per ADR-002, low risk for MVP

**Assumption 7: Production Endpoint is https://govreposcrape.cloud.cns.me**
- **Description:** Final production domain is confirmed and DNS configured
- **Validation:** Confirm with infrastructure team, test endpoint reachability
- **Impact if False:** All examples, OpenAPI spec server URL incorrect
- **Mitigation:** Use environment variable pattern in examples (API_URL), easy to update if domain changes

### Open Questions

**Q1: Should We Implement Interactive Swagger UI at /docs?**
- **Question:** Is hosted Swagger UI (/docs endpoint) required for MVP, or sufficient to link to external Swagger Editor?
- **Context:** Story 5.2 (AC-5.2.4) marks interactive docs as "optional"
- **Options:**
  1. **Host Swagger UI** - Better UX, one-click API exploration, but bloats Workers bundle or requires CDN
  2. **Link to Swagger Editor** - Simple, no code, but requires external tool, extra step for developers
  3. **Defer to Phase 2** - Focus on OpenAPI spec file, add UI later if demand
- **Decision Needed By:** Story 5.2 planning
- **Impact:** Medium - Better UX vs simpler implementation
- **Recommendation:** Defer to Phase 2, provide openapi.json file + link to Swagger Editor for MVP

**Q2: What Level of Detail for Troubleshooting Sections?**
- **Question:** How comprehensive should troubleshooting sections be in integration guides?
- **Context:** Story 5.1 (AC-5.1.1) requires troubleshooting for network errors, invalid config, no results
- **Options:**
  1. **Minimal** - 3-5 common issues with quick fixes
  2. **Comprehensive** - 10+ issues with step-by-step debugging
  3. **FAQ-style** - Separate troubleshooting document
- **Decision Needed By:** Story 5.1 implementation
- **Impact:** Low-Medium - User self-service success vs documentation length
- **Recommendation:** Minimal for MVP (network errors, config syntax, no results), expand based on support requests

**Q3: Should Examples Include Retry Logic?**
- **Question:** Should integration examples demonstrate retry logic with exponential backoff?
- **Context:** Architecture specifies 3 retries with exponential backoff (1s, 2s, 4s delays)
- **Options:**
  1. **Yes** - Examples show production-ready patterns, teach best practices
  2. **No** - Examples simplified for readability, retry logic documented separately
  3. **Separate example** - Basic example without retry, advanced example with retry
- **Decision Needed By:** Story 5.3 planning
- **Impact:** Low - Code quality vs example complexity
- **Recommendation:** Basic examples without retry (simpler), note "For production, add retry logic per architecture"

**Q4: How to Handle GitHub Copilot MCP Uncertainty?**
- **Question:** Should GitHub Copilot integration guide be included in MVP release?
- **Context:** Risk 2 - MCP support status unclear, may not be released
- **Options:**
  1. **Include with disclaimers** - Clear "preview/not available" warnings, provide expected config
  2. **Exclude from MVP** - Only Claude Desktop guide, add Copilot guide when MCP support confirmed
  3. **Placeholder** - "GitHub Copilot integration guide coming soon" section in README
- **Decision Needed By:** Epic 5 planning (before Story 5.1 starts)
- **Impact:** Medium - Completeness vs accuracy
- **Recommendation:** Include with clear disclaimers (Option 1), mark as "Coming Soon", update when MCP support confirmed

**Q5: What Platforms for Manual Testing?**
- **Question:** Which OS platforms should be tested for Claude Desktop configuration?
- **Context:** AC-5.1.3 requires "at least 2 platforms" (macOS, Windows, Linux)
- **Options:**
  1. **macOS + Windows** - Most common developer platforms
  2. **macOS + Linux** - Most common in UK government (Ubuntu/Debian)
  3. **All three** - Comprehensive, but resource-intensive
- **Decision Needed By:** Story 5.1 testing
- **Impact:** Low-Medium - Test coverage vs resource availability
- **Recommendation:** macOS + Linux (Option 2) for UK government focus, document Windows based on Claude Desktop official docs

**Q6: Should We Version Documentation?**
- **Question:** Should documentation be versioned (v1.0, v1.1) alongside API versions?
- **Context:** OpenAPI spec has version: "1.0.0", API may evolve in Phase 2
- **Options:**
  1. **Yes** - Clear versioning, historical docs accessible, supports API evolution
  2. **No** - Single "latest" documentation, simpler to maintain
  3. **Git tags only** - Use Git tags for versioning, no explicit version numbers in docs
- **Decision Needed By:** Story 5.2 (OpenAPI version field)
- **Impact:** Low for MVP, Medium for long-term maintenance
- **Recommendation:** OpenAPI spec versioned (1.0.0), documentation follows Git tags, defer explicit docs versioning to Phase 2

**Q7: What Metrics to Track for Documentation Success?**
- **Question:** Which observability metrics (NFR-5.16-5.20) should be implemented for MVP vs deferred to Phase 2?
- **Context:** NFR-5.16 marks usage tracking as "Optional, Phase 2"
- **Options:**
  1. **Minimal MVP** - GitHub repo analytics (views, clones), support request count
  2. **Moderate MVP** - Above + OpenAPI spec downloads (if hosted on Workers)
  3. **Comprehensive Phase 2** - Query quality monitoring, integration success tracking, feedback loop
- **Decision Needed By:** Epic 5 planning
- **Impact:** Low - Nice-to-have data vs implementation time
- **Recommendation:** Minimal MVP (GitHub analytics, support requests), defer advanced metrics to Phase 2

## Test Strategy Summary

### Testing Approach

Epic 5 testing focuses on **documentation accuracy and usability** rather than code functionality (no new API code). The test strategy combines manual testing (configuration guides), automated validation (OpenAPI spec), and user acceptance testing (early adopters).

### Test Levels

**1. Unit Testing (Not Applicable)**
- Epic 5 is pure documentation, no unit tests required
- Integration examples are standalone scripts (not production code), tested manually

**2. Integration Testing**
- **Scope:** Integration examples (curl.sh, node.js, python.py) call production API
- **Method:** Execute each example, verify returns 5 SearchResults with valid format
- **Pass Criteria:** All examples return 200 OK, valid MCPResponse JSON
- **Test Commands:**
  ```bash
  bash examples/curl.sh          # Expected: 5 results
  node examples/node.js          # Expected: Formatted results, no errors
  python3 examples/python.py     # Expected: Formatted results, no errors
  ./examples/test-mcp.sh         # Expected: ✅ All tests passed
  ```

**3. System Testing (Manual Validation)**
- **Scope:** End-to-end integration workflows (developer configures Claude Desktop → executes query)
- **Method:** Human testers follow guides on multiple platforms, measure completion time
- **Test Matrix:**

| Test Case | Platform | Steps | Expected Outcome | Pass Criteria |
|-----------|----------|-------|------------------|---------------|
| Claude Desktop Config (macOS) | macOS 14+ | Follow guide, locate config, add JSON, restart, query | Successful query in <5 min | Developer completes without support |
| Claude Desktop Config (Linux) | Ubuntu 22.04+ | Follow guide, locate config, add JSON, restart, query | Successful query in <5 min | Developer completes without support |
| OpenAPI Spec Validation | Any OS | Run `openapi-generator validate` | Zero errors | Validation passes |
| OpenAPI Code Generation | Any OS | Generate TypeScript client, compile, run | Client executes query | Compilation success, API call success |
| Usage Guide Examples | Any OS | Execute 5+ example queries via Claude/API | 3+ relevant results per query | Queries return government code |

**4. Acceptance Testing (User Validation)**
- **Scope:** Early adopter testing (20+ developers) before public release
- **Method:** Beta testers receive documentation, attempt self-service integration, provide feedback
- **Success Metrics:**
  - 90%+ self-service success rate (18/20+ complete without support)
  - Average integration time <5 minutes
  - <5 support requests per 100 users
  - Zero high-severity documentation bugs reported
- **Feedback Collection:** Post-integration survey (Google Forms), GitHub Issues

### Test Cases by Story

**Story 5.1: MCP Configuration Guides**

| Test ID | Test Case | Method | Expected Result |
|---------|-----------|--------|-----------------|
| T-5.1.1 | Follow Claude Desktop guide on macOS | Manual | Config successful, query works, <5 min |
| T-5.1.2 | Follow Claude Desktop guide on Linux | Manual | Config successful, query works, <5 min |
| T-5.1.3 | Verify config file paths on all OS | Manual | Paths correct: macOS ~/Library/Application Support/Claude/..., Windows %APPDATA%\Claude\..., Linux ~/.config/Claude/... |
| T-5.1.4 | Execute test queries from guide | Manual in Claude Desktop | 3 queries return 5 results each, verify relevant government code |
| T-5.1.5 | Review GitHub Copilot guide | Manual | Clear disclaimers, MCP status noted, expected config provided |
| T-5.1.6 | Troubleshooting section completeness | Manual review | Covers network errors, invalid config syntax, no results |

**Story 5.2: OpenAPI Specification**

| Test ID | Test Case | Method | Expected Result |
|---------|-----------|--------|-----------------|
| T-5.2.1 | Validate OpenAPI spec format | `openapi-generator validate -i static/openapi.json` | Zero errors, zero warnings |
| T-5.2.2 | Render spec in Swagger UI | Load openapi.json in Swagger Editor | Renders without errors, all endpoints visible |
| T-5.2.3 | Generate TypeScript client | `openapi-generator generate -i static/openapi.json -g typescript-fetch` | Code generates, compiles with `tsc` |
| T-5.2.4 | Execute query with generated client | Run generated client against prod API | Successful query, 5 SearchResults returned |
| T-5.2.5 | Verify OpenAPI metadata | Manual review of openapi.json | Title, description, version: "1.0.0", contact, server URL present |
| T-5.2.6 | Verify all endpoints documented | Manual review | POST /mcp/search, GET /mcp/health with full schemas |
| T-5.2.7 | Verify error responses documented | Manual review | 400, 500, 503 with error schemas and examples |

**Story 5.3: Integration Examples**

| Test ID | Test Case | Method | Expected Result |
|---------|-----------|--------|-----------------|
| T-5.3.1 | Execute cURL example | `bash examples/curl.sh` | 200 OK, JSON with 5 SearchResults, <3s execution |
| T-5.3.2 | Execute Node.js example | `node examples/node.js` | Formatted results, no errors, <3s execution |
| T-5.3.3 | Execute Python example | `python3 examples/python.py` | Formatted results, no errors, <3s execution |
| T-5.3.4 | Execute test script | `./examples/test-mcp.sh` | ✅ Health check passed, ✅ Test query passed, ✅ Response valid, exit code 0 |
| T-5.3.5 | Copy-paste test (cURL) | Copy curl.sh, paste in terminal, run | Executes without modification, returns results |
| T-5.3.6 | Copy-paste test (Node.js) | Copy node.js, paste in editor, run | Executes without modification, returns results |
| T-5.3.7 | Copy-paste test (Python) | Copy python.py, paste in editor, run | Executes without modification, returns results |
| T-5.3.8 | Code quality review | Peer review all examples | Try-catch present, input validation, HTTPS-only, comments, secure patterns |
| T-5.3.9 | Error handling test | Modify examples to trigger errors (invalid query, network timeout) | Errors caught, logged clearly, no crashes |

**Story 5.4: Usage Guide**

| Test ID | Test Case | Method | Expected Result |
|---------|-----------|--------|-----------------|
| T-5.4.1 | Readability check | Flesch-Kincaid Grade Level tool | F-E level 8-9, understandable to average developer |
| T-5.4.2 | Semantic search explanation review | Manual read | Explains concept matching vs keyword, clear for non-AI/ML developers |
| T-5.4.3 | Query formulation examples | Manual review | 5+ good/bad query pairs with explanations |
| T-5.4.4 | Execute UK gov example queries | Run 5+ queries against prod API | Each query returns 3+ relevant government code results |
| T-5.4.5 | Result interpretation guidance | Manual review | Explains similarity scores (0.8+=good), last_updated, org reputation, license |
| T-5.4.6 | Documentation length | Word count | Main content <500 words, concise |
| T-5.4.7 | Feedback mechanism present | Manual check | "Report documentation issue" link to GitHub Issues |

**Epic-Level Tests**

| Test ID | Test Case | Method | Expected Result |
|---------|-----------|--------|-----------------|
| T-5.E.1 | Early adopter testing | 20+ beta testers self-integrate | 18+ (90%) succeed, <5 min avg time, <5 support requests per 100 |
| T-5.E.2 | Documentation bug tracking | Monitor GitHub Issues for 2 weeks | Zero high-severity bugs reported |
| T-5.E.3 | Link integrity check | `markdown-link-check README.md docs/**/*.md` | All links resolve (no 404s) |
| T-5.E.4 | Documentation coverage | Checklist of 9 artifacts | All present: claude-desktop.md, github-copilot.md, openapi.json, curl.sh, node.js, python.py, test-mcp.sh, usage-guide.md, README updates |

### Test Environment

**Development Environment:**
- Local workstation with Node.js 20+, Python 3.11+, Git, bash
- Access to GitHub repository (read/write for documentation commits)
- openapi-generator-cli installed globally
- markdown-link-check installed (optional)

**Integration Environment:**
- Production API endpoint: https://govreposcrape.cloud.cns.me
- Staging endpoint (if available): https://staging.govreposcrape.cloud.cns.me
- Fallback: Local `wrangler dev` (localhost:8787)

**User Acceptance Environment:**
- Beta testers' own workstations (macOS, Windows, Linux)
- Claude Desktop installed (latest version)
- GitHub Copilot installed (if testing Copilot guide)

### Test Data

**API Test Queries:**
- "authentication methods" (general technical query)
- "NHS API integration patterns" (sector-specific)
- "HMRC tax calculation implementations" (department-specific)
- "DWP benefits eligibility checking" (use case-specific)
- "How do departments validate UK postcodes?" (natural language question)

**Expected Results:**
- Each query returns 5 SearchResults (limit: 5 default)
- Each result has valid format: repo_url, snippet, similarity_score, metadata
- At least 3 results per query are relevant UK government code

### Defect Management

**Severity Definitions:**
- **High:** Incorrect config paths, broken examples, wrong API endpoints, zero results from test queries
- **Medium:** Unclear instructions, missing prerequisites, poor error messages, link 404s
- **Low:** Typos, formatting issues, readability improvements

**Response SLA:**
- High: Fix within 24 hours, release updated documentation immediately
- Medium: Fix within 1 week, batch with next documentation update
- Low: Fix opportunistically, no blocking

**Tracking:**
- GitHub Issues with labels: `documentation`, `severity:high`, `severity:medium`, `severity:low`
- Document defects in Epic 5 retrospective for long-term improvements

### Test Deliverables

**Test Artifacts:**
1. Test execution report (test cases run, pass/fail status)
2. Beta tester feedback summary (survey results, success rate, integration time)
3. OpenAPI validation report (openapi-generator output)
4. Link checker report (markdown-link-check output)
5. Code generation test report (TypeScript client compilation log)
6. Production API test results (example execution logs)

**Exit Criteria:**
- All manual test cases passed (T-5.1.*, T-5.2.*, T-5.3.*, T-5.4.*)
- OpenAPI spec validates without errors (T-5.2.1)
- All integration examples execute successfully (T-5.3.1-5.3.4)
- Early adopter testing achieves 90%+ self-service success (T-5.E.1)
- Zero high-severity documentation bugs (T-5.E.2)
- All 9 documentation artifacts complete and committed (T-5.E.4)

---

**Tech Spec Complete**
Generated: 2025-11-14
Epic 5: Developer Experience & Documentation
Ready for implementation planning and story breakdown
