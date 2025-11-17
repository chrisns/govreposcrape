# govreposcrape

Semantic code search over ~21k UK government repositories using Cloudflare Workers and AI Search.

## Quick Start: Integrate with Claude Desktop

**Get started in under 5 minutes**

govscraperepo provides an MCP API for discovering UK government code through AI assistants. The fastest way to get started is with Claude Desktop:

### 3 Steps to Start Searching

1. **Add MCP Configuration**
   - Locate your Claude Desktop config file:
     - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
     - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
     - Linux: `~/.config/Claude/claude_desktop_config.json`

2. **Paste JSON Configuration**
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

3. **Restart Claude Desktop and Search**
   - Try: `"search UK government authentication code"`
   - Try: `"find NHS API integration examples"`
   - Try: `"show me postcode validation implementations"`

**Detailed Guides:**
- [Claude Desktop Integration Guide](./docs/integration/claude-desktop.md) - Step-by-step with troubleshooting
- [GitHub Copilot Integration Guide](./docs/integration/github-copilot.md) - Coming soon (awaiting MCP support)

**Production API:** `https://govreposcrape.cloud.cns.me`

---

## API Reference

### OpenAPI 3.0 Specification

Complete OpenAPI 3.0 specification available at: **[/openapi.json](https://govreposcrape.cloud.cns.me/openapi.json)**

**Interactive Documentation:**
- View and test API in [Swagger Editor](https://editor.swagger.io/?url=https://govreposcrape.cloud.cns.me/openapi.json)
- Explore endpoints, request/response schemas, and examples

### Generating Client Libraries

Use the OpenAPI spec to generate type-safe clients in any language:

**TypeScript / JavaScript:**
```bash
# Install OpenAPI Generator
npm install -g @openapitools/openapi-generator-cli

# Generate TypeScript client
openapi-generator-cli generate \
  -i https://govreposcrape.cloud.cns.me/openapi.json \
  -g typescript-fetch \
  -o ./generated-client

# Use the client
import { MCPAPIApi, Configuration } from './generated-client';

const api = new MCPAPIApi(new Configuration({
  basePath: 'https://govreposcrape.cloud.cns.me'
}));

const results = await api.searchCode({
  mCPRequest: { query: 'authentication', limit: 10 }
});
```

**Python:**
```bash
# Generate Python client
openapi-generator-cli generate \
  -i https://govreposcrape.cloud.cns.me/openapi.json \
  -g python \
  -o ./python-client

# Use the client
from python_client import MCPAPIApi, Configuration

config = Configuration(host='https://govreposcrape.cloud.cns.me')
api = MCPAPIApi(config)

results = api.search_code(mcp_request={'query': 'authentication', 'limit': 10})
```

**Other Languages:**
- Java, Go, Ruby, PHP, C#, and 50+ languages supported
- See [OpenAPI Generator docs](https://openapi-generator.tech/docs/generators)

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/mcp/search` | Semantic code search (MCP v2 protocol) |
| `GET` | `/mcp/health` | Health check for all service dependencies |
| `GET` | `/openapi.json` | OpenAPI 3.0 specification |

**No authentication required** - all endpoints are publicly accessible.

---

## Integration Examples

**Copy-paste ready code examples to get started in under 1 minute**

We provide working integration examples in multiple languages to help you quickly integrate the MCP API into your applications. All examples are self-contained, include comprehensive error handling, and demonstrate realistic use cases.

### Quick Start

**Option 1: cURL (Bash)**
```bash
# Copy and run immediately
./examples/curl.sh

# Or test specific endpoint
curl -X POST https://govreposcrape.cloud.cns.me/mcp/search \
  -H "Content-Type: application/json" \
  -d '{"query":"UK government authentication middleware","limit":5}'
```

**Option 2: Node.js/JavaScript**
```bash
# Prerequisites: Node.js 18+
node examples/node.js
```

**Option 3: Python**
```bash
# Prerequisites: Python 3.7+, requests library
pip install requests
python3 examples/python.py
```

### Example Files

All examples demonstrate:
- ✅ Basic search query with realistic use cases
- ✅ Result parsing and display with metadata
- ✅ Error handling for invalid queries, limits, network failures
- ✅ Health check endpoint validation
- ✅ Proper headers (Content-Type, X-MCP-Version)

| Language | File | Prerequisites | Use Case Demonstrated |
|----------|------|---------------|----------------------|
| **Bash** | [`examples/curl.sh`](./examples/curl.sh) | curl (standard on macOS/Linux) | Authentication middleware patterns |
| **JavaScript** | [`examples/node.js`](./examples/node.js) | Node.js 18+ (built-in fetch) | Express.js API endpoint patterns |
| **Python** | [`examples/python.py`](./examples/python.py) | Python 3.7+, requests library | NHS API integration patterns |

### Testing Tools

Validate your integration with our testing script:

```bash
# Test production API
./scripts/test-mcp.sh

# Test local development
./scripts/test-mcp.sh http://localhost:8788

# Verbose output for debugging
./scripts/test-mcp.sh --verbose

# Syntax validation only
./scripts/test-mcp.sh --test
```

**What the test script validates:**
- ✅ Health endpoint reachable and returns correct format
- ✅ Search endpoint returns results for valid queries
- ✅ Response structure has required fields (`results`, `took_ms`)
- ✅ Error handling for invalid queries (< 3 chars)
- ✅ Validation for limit out of range (> 20)
- ✅ OpenAPI specification accessibility

**Test output:**
- Clear pass/fail indicators (✅/❌)
- Response time for each endpoint (ms)
- Result count validation
- Error details for debugging

### Environment Variable Support

All examples support custom API URLs via environment variable:

```bash
# For local development
export MCP_API_URL="http://localhost:8788"
./examples/curl.sh

# For staging environment
export MCP_API_URL="https://staging.govreposcrape.cloud.cns.me"
node examples/node.js
```

### Realistic Query Examples

Based on PRD use cases, our examples demonstrate searches for:
- **Authentication patterns**: `"UK government authentication middleware JWT token validation"`
- **API integration**: `"Express.js API endpoint handler middleware route"`
- **Data validation**: `"postcode validation regex patterns UK"`
- **NHS specific**: `"NHS API integration authentication FHIR patient data"`

### Error Codes Reference

All examples handle these MCP API error codes:

| Code | HTTP Status | Description | Example Trigger |
|------|------------|-------------|-----------------|
| `INVALID_QUERY` | 400 | Query too short (< 3 chars) or too long (> 500 chars) | `{"query":"ab"}` |
| `INVALID_LIMIT` | 400 | Limit out of range (must be 1-20) | `{"limit":100}` |
| `INVALID_CONTENT_TYPE` | 400 | Missing or incorrect Content-Type header | No `Content-Type: application/json` |
| `MALFORMED_JSON` | 400 | Request body is not valid JSON | `{invalid json}` |
| `SEARCH_ERROR` | 503 | AI Search service temporarily unavailable | Retry after 60s |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Contact support |

### Need Help?

- **Integration guides**: See [`docs/integration/`](./docs/integration/) for detailed setup instructions
- **OpenAPI spec**: Use [`/openapi.json`](https://govreposcrape.cloud.cns.me/openapi.json) to generate clients
- **Examples not working?**:
  - Check API URL is correct (production: `https://govreposcrape.cloud.cns.me`)
  - Verify network connectivity with `./scripts/test-mcp.sh`
  - For local testing, start dev server: `npm run dev`

---

## Usage Guide

**Get the most from semantic code search with effective queries and best practices**

### How Semantic Search Works

Unlike keyword search, semantic search understands the *meaning* behind your query. Powered by Cloudflare AI Search (768-dimension embeddings), it finds relevant code even when exact keywords don't match.

**Good query** → `"UK government authentication middleware JWT token validation"`
**Bad query** → `"auth"` (too vague, lacks context)

The system analyzes your natural language query, compares it semantically to ~21,000 UK government code summaries, and returns the top matches with relevance scores (0.0-1.0 range).

### Query Best Practices

**Optimal query length:** 3-20 words (3-500 characters enforced by API)

**Use natural language with context:**
- ✅ `"NHS FHIR API patient data integration authentication"`
- ✅ `"HMRC tax calculation validation business rules"`
- ✅ `"DWP benefits eligibility validation patterns"`
- ❌ `"api"` (too generic)
- ❌ `"code"` (no context)

**Domain-specific examples for UK government developers:**
- **Healthcare**: `"NHS API authentication FHIR patient record access"`
- **Tax & Revenue**: `"HMRC VAT calculation validation UK tax rules"`
- **Benefits**: `"DWP Universal Credit eligibility validation"`
- **Standards**: `"GDS design system components GOV.UK patterns"`
- **Local Government**: `"council tax calculation postcode validation"`

**Refining queries:** If results aren't relevant, add more context or domain-specific terms (e.g., `"authentication"` → `"OAuth2 JWT authentication middleware Express.js"`).

### Understanding Search Results

Each result includes:

- **`repository`**: Repository name (e.g., `"alphagov/govuk-frontend"`)
- **`match_snippet`**: Relevant code excerpt from the repository
- **`relevance_score`**: 0.0-1.0 similarity score (higher = more relevant)
- **`metadata.language`**: Programming language detected
- **`metadata.stars`**: GitHub star count (popularity indicator)
- **`metadata.last_updated`**: Last commit timestamp (freshness indicator)
- **`metadata.github_url`**: Direct link to repository

**Browsing tips:**
- Check organization name (e.g., `alphagov`, `nhsdigital`) for trust
- Review `last_updated` to ensure code is maintained
- Higher `stars` often indicate production-ready code
- Verify license compatibility before reusing code

### Feedback & Support

- **Report issues**: [GitHub Issues](https://github.com/cns/govreposcrape/issues)
- **Product context**: See [PRD](./docs/PRD.md) for project goals and use cases
- **Integration help**: Detailed guides in [`docs/integration/`](./docs/integration/)
- **API reference**: Full specification at [`/openapi.json`](https://govreposcrape.cloud.cns.me/openapi.json)

---

## Overview

govreposcrape is a Cloudflare Workers-based MCP API server that provides semantic code search capabilities across UK government public repositories. The project follows a write path/read path separation architecture:

- **Write Path**: Python containerized ingestion pipeline processes repositories with smart caching (90%+ hit rate), stores summaries in R2
- **Read Path**: TypeScript MCP v2 API exposes semantic search powered by Cloudflare AI Search

## Architecture

- **Platform**: Cloudflare Workers (edge compute)
- **Language**: TypeScript 5.9+ (strict mode)
- **Runtime**: workerd (Cloudflare Workers runtime)
- **Build Tool**: esbuild (via wrangler CLI)
- **Test Framework**: Vitest 4.0+ with @cloudflare/vitest-pool-workers

### Service Bindings

All Cloudflare services configured in `wrangler.jsonc`:

| Service | Name | Binding | Purpose |
|---------|------|---------|---------|
| D1 Database | govreposcrape-db | `DB` | Metadata storage |
| KV Namespace | govreposcrape-cache | `KV` | Smart caching (90%+ hit rate) |
| R2 Bucket | govreposcrape-gitingest | `R2` | gitingest summary storage |
| Vectorize Index | govscraperepo-code-index | `VECTORIZE` | 768-dim cosine similarity |

## Prerequisites

- Node.js 20+ (LTS)
- npm 10+ or pnpm 8+
- Docker 24+ (for gitingest container)
- Cloudflare account with Workers enabled
- wrangler CLI 4.47.0+

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and add your Cloudflare credentials:

```bash
cp .env.example .env
```

Edit `.env` and add:
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID (find in dashboard)
- `CLOUDFLARE_API_TOKEN`: API token with Workers and Storage permissions

### 3. Verify Service Bindings

All service bindings are pre-configured in `wrangler.jsonc`. Service IDs:

- **D1 Database ID**: `REDACTED_CLOUDFLARE_D1_ID`
- **KV Namespace ID**: `REDACTED_CLOUDFLARE_KV_ID`
- **R2 Bucket**: `govreposcrape-gitingest`
- **Vectorize Index**: `govscraperepo-code-index` (768-dim, cosine)

### 4. Generate TypeScript Types

```bash
npm run cf-typegen
```

This generates type definitions for Cloudflare Workers bindings in `worker-configuration.d.ts`.

### 5. Run Development Server

```bash
npm run dev
# or
npm start
```

Workers will be available at `http://localhost:8787/`

## Project Structure

```
govreposcrape/
├── src/
│   ├── index.ts              # Workers entry point
│   ├── service-test.ts       # Service connectivity test (deployed separately)
│   ├── ingestion/            # Epic 2: Data pipeline (future)
│   ├── search/               # Epic 3: AI Search integration (future)
│   ├── api/                  # Epic 4: MCP API (future)
│   └── utils/                # Shared utilities (future)
├── test/                     # Vitest tests
├── docs/                     # Architecture and PRD documentation
├── wrangler.jsonc           # Main Workers configuration
├── wrangler-test.jsonc      # Service test configuration
├── package.json
├── tsconfig.json
├── vitest.config.mts
└── README.md
```

## Development Workflow

### Definition of Done

All stories must meet the [Definition of Done](.bmad/definition-of-done.md) criteria before being marked complete. This includes:
- Code quality standards (linting, formatting, review)
- Testing requirements (unit tests 80%+, integration tests for service bindings, scale tests for data pipelines)
- Documentation (code, API, README updates)
- Validation checkpoints (developer self-check, SM code review)
- Technical debt management (P0/P1/P2 severity tracking)

See [Definition of Done](.bmad/definition-of-done.md) for complete criteria.

### Local Development

1. Start dev server: `npm run dev`
2. Edit code (auto-reload enabled)
3. Run tests: `npm test` (watch mode: `npm test -- --watch`)
4. Test API: `curl http://localhost:8787/`

### Type Generation

After modifying `wrangler.jsonc` service bindings:

```bash
npm run cf-typegen
```

### Testing

For comprehensive testing documentation, see [TESTING.md](TESTING.md).

**Quick Start:**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run only unit tests
npm test -- --exclude "test/integration/**"

# Run only integration tests
npm test -- --grep "Integration"
```

**Test Types:**
- **Unit Tests:** Fast tests with mocked dependencies (80%+ coverage required)
- **Integration Tests:** End-to-end tests with real service bindings (100-1000 items)
- **Scale Tests:** Production-scale validation for data pipeline stories

See [TESTING.md](TESTING.md) for complete testing guide and [Integration Testing Standards](docs/integration-testing-standards.md) for integration test requirements.

### Deployment

The project supports separate staging and production environments with isolated service bindings.

#### Deployment Workflow

```bash
# 1. Lint and format code
npm run lint
npm run format:check

# 2. Run all tests
npm test

# 3. Deploy to staging
npm run deploy:staging

# 4. Validate staging deployment
curl https://govreposcrape-staging.chrisns.workers.dev/health

# 5. Deploy to production (after staging validation)
npm run deploy:production

# 6. Verify production deployment
curl https://govreposcrape-production.chrisns.workers.dev/health
```

#### Environment Configuration

Each environment has separate service binding IDs configured in `wrangler.jsonc`:

**Staging** (`npm run deploy:staging`)
- Worker: `govreposcrape-staging`
- KV Namespace: `staging-kv-namespace-id-placeholder` (to be provisioned)
- D1 Database: `staging-d1-database-id-placeholder` (to be provisioned)
- R2 Bucket: `govreposcrape-gitingest-staging`
- Vectorize Index: `govscraperepo-code-index-staging`

**Production** (`npm run deploy:production`)
- Worker: `govreposcrape-production`
- KV Namespace: `REDACTED_CLOUDFLARE_KV_ID`
- D1 Database: `REDACTED_CLOUDFLARE_D1_ID`
- R2 Bucket: `govreposcrape-gitingest`
- Vectorize Index: `govscraperepo-code-index`

**Default** (`npm run deploy`)
- Uses default bindings (same as production)

#### Health Check Endpoint

All deployments include a `/health` endpoint that validates connectivity to all service bindings:

```bash
# Check service health
curl https://govreposcrape-production.chrisns.workers.dev/health
```

**Healthy Response (200 OK):**
```json
{
  "status": "healthy",
  "services": {
    "kv": { "name": "KV Namespace", "status": "ok" },
    "r2": { "name": "R2 Bucket", "status": "ok" },
    "vectorize": { "name": "Vectorize Index", "status": "ok" },
    "d1": { "name": "D1 Database", "status": "ok" }
  },
  "timestamp": "2025-11-12T10:00:00.000Z"
}
```

**Unhealthy Response (503 Service Unavailable):**
```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "One or more services are unavailable"
  },
  "details": {
    "status": "unhealthy",
    "services": {
      "kv": { "name": "KV Namespace", "status": "failed", "error": "Connection timeout" },
      "r2": { "name": "R2 Bucket", "status": "ok" },
      "vectorize": { "name": "Vectorize Index", "status": "ok" },
      "d1": { "name": "D1 Database", "status": "ok" }
    },
    "timestamp": "2025-11-12T10:00:00.000Z"
  }
}
```

#### Environment Variables

Create environment-specific files for sensitive configuration:

```bash
# Development (local)
.env

# Staging secrets (deployed with wrangler)
.env.staging

# Production secrets (deployed with wrangler)
.env.production
```

**Never commit these files** - they're excluded in `.gitignore`.

Use wrangler secrets for sensitive values in production:

```bash
# Set secrets for production
echo "your-secret-value" | npx wrangler secret put SECRET_NAME --env production

# Set secrets for staging
echo "your-secret-value" | npx wrangler secret put SECRET_NAME --env staging
```

#### Troubleshooting Deployments

**Issue: Health check returns 503**
- Solution: Verify service bindings in `wrangler.jsonc` match provisioned resource IDs
- Check: Run `npx wrangler d1 list`, `npx wrangler kv:namespace list`, etc.

**Issue: Deployment fails with "binding not found"**
- Solution: Ensure service resources are created before deployment
- Create resources: `npx wrangler d1 create`, `npx wrangler kv:namespace create`, etc.

**Issue: TypeScript errors after wrangler.jsonc changes**
- Solution: Regenerate types with `npm run cf-typegen`

**Issue: Tests pass locally but deployment fails**
- Solution: Check compatibility_date in `wrangler.jsonc` matches runtime
- Verify: Service bindings exist in the target environment (staging/production)

## Logging

govreposcrape uses structured JSON logging for all operations, optimized for Cloudflare Workers log streaming and distributed tracing.

### Log Format

All logs follow a consistent JSON structure:

```json
{
  "timestamp": "2025-11-14T10:00:00.000Z",
  "level": "info",
  "message": "Request completed",
  "context": {
    "operation": "fetch",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "metadata": {
      "duration": 45,
      "statusCode": 200,
      "path": "/mcp/search"
    }
  }
}
```

### Log Levels

Configure via `LOG_LEVEL` environment variable in `wrangler.jsonc`:

| Level | Priority | Use Case | Environment |
|-------|----------|----------|-------------|
| `debug` | Lowest | Detailed diagnostic info | Development |
| `info` | Normal | General operational events | All environments |
| `warn` | Elevated | Potential issues, performance warnings | All environments |
| `error` | Highest | Error conditions, failures | All environments |

**Environment Configuration:**
- **Development**: `LOG_LEVEL=debug` (all logs)
- **Staging**: `LOG_LEVEL=info` (info and above)
- **Production**: `LOG_LEVEL=info` (info and above, stack traces filtered)

### Request Lifecycle Logging

Every API request generates correlated logs using a unique `requestId`:

```typescript
// Request start
{"level":"info","message":"Request received","context":{"requestId":"...","method":"POST","path":"/mcp/search"}}

// Request completion
{"level":"info","message":"Request completed","context":{"requestId":"...","duration":45,"statusCode":200}}
```

### Performance Monitoring

Slow requests (>2s) automatically log warnings per NFR-1.1 requirements:

```json
{
  "level": "warn",
  "message": "Slow request detected",
  "context": {
    "requestId": "...",
    "duration": 2150,
    "threshold": "2000ms (NFR-1.1)",
    "path": "/mcp/search"
  }
}
```

### Security Considerations

- **Stack traces**: Filtered in production environments to prevent internal implementation exposure
- **Sensitive data**: No PII, credentials, or secrets are logged (validated per AC #2)
- **Request IDs**: UUID v4 format for distributed tracing across Cloudflare's edge network

## Error Handling

The API implements comprehensive error handling with consistent response formats and automatic request/error correlation.

### Error Response Format

All errors return JSON with standardized structure:

```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Query must be at least 3 characters",
    "retry_after": 60
  }
}
```

### Error Types and HTTP Status Codes

| Error Class | HTTP Status | Error Codes | Retry Strategy |
|-------------|-------------|-------------|----------------|
| `ValidationError` | 400 Bad Request | `INVALID_QUERY`, `INVALID_CONTENT_TYPE`, `INVALID_JSON` | Do not retry |
| `ServiceError` | 503 Service Unavailable | `SEARCH_ERROR`, `SERVICE_UNAVAILABLE` | Retry after `retry_after` seconds |
| Unknown errors | 500 Internal Server Error | `INTERNAL_SERVER_ERROR` | Exponential backoff |

### Common Error Codes

#### Validation Errors (400)

```bash
# Query too short
curl -X POST http://localhost:8787/mcp/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ab"}'

# Response:
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Query must be at least 3 characters"
  }
}
```

#### Service Errors (503)

```bash
# AI Search unavailable
curl -X POST http://localhost:8787/mcp/search \
  -H "Content-Type: application/json" \
  -d '{"query": "authentication methods"}'

# Response:
{
  "error": {
    "code": "SEARCH_ERROR",
    "message": "AI Search service unavailable after 3 attempts",
    "retry_after": 60
  }
}
```

### Global Error Handler

All unhandled errors are caught by the global error handler (src/index.ts:149) which:

1. Logs error with full context (requestId, path, method, duration)
2. Maps error types to appropriate HTTP status codes
3. Returns formatted error response with CORS headers
4. Maintains request correlation for debugging

### CORS Support

All error responses include CORS headers for cross-origin API access:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Request-ID
```

## Service Connectivity Verification

A test Workers script (`src/service-test.ts`) verifies connectivity to all service bindings:

```bash
# Deploy test worker
npx wrangler deploy --config wrangler-test.jsonc

# Test all services
curl https://govreposcrape-service-test.chrisns.workers.dev
```

Expected response:
```json
{
  "overall": "ALL SERVICES OK",
  "results": {
    "d1": { "status": "OK", "message": "D1 connection successful" },
    "kv": { "status": "OK", "message": "KV read/write successful" },
    "r2": { "status": "OK", "message": "R2 upload/download successful" },
    "vectorize": { "status": "OK", "message": "Vectorize connection successful" }
  }
}
```

## Service Naming Convention

All Cloudflare services use the `govreposcrape-` prefix for consistency:

- D1: `govreposcrape-db`
- KV: `govreposcrape-cache`
- R2: `govreposcrape-gitingest`
- Vectorize: `govscraperepo-code-index`

## Cost Management

**Target:** <£50/month for MVP (NFR-7.1)

govreposcrape includes comprehensive cost monitoring and budget alerts to validate the economic hypothesis and prevent unexpected costs.

### Cost Monitoring Dashboard

View real-time cost breakdown by service:

```bash
# Display current month costs
npm run cost-monitor

# Check for budget alerts (80% threshold)
npm run cost-monitor:alert

# Export cost data as JSON
npm run cost-monitor:export
```

**Dashboard Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Cost Monitoring Dashboard - govreposcrape MVP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: 2025-11-15

Daily Costs by Service:
  Workers:    £5.00
  R2:         £3.00
  AI Search:  £2.00
  KV:         £1.00
  Vectorize:  £0.50
  ──────────────────────
  Total:      £11.50/day

Monthly Summary:
  Current Spend:     £42.50
  Projected End:     £55.00
  Budget:            £50.00/month
  Utilization:       85.0%

⚠️  STATUS: Budget alert threshold exceeded

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Budget Alerts

Automatic alerts trigger when monthly spend reaches 80% of £50 budget (£40 threshold):

- **Console log**: Always succeeds (guaranteed delivery)
- **Email/Slack** (optional): Configure webhook URLs for team notifications
- **Alert payload**: Current spend, projection, service breakdown, optimization recommendations

**Alert Example:**
```
🚨 BUDGET ALERT TRIGGERED 🚨

Triggered: 2025-11-15T14:00:00.000Z
Utilization: 85.0% (Threshold: 80.0%)
Current Spend: £42.50 / £50.00
Projected End-of-Month: £55.00

Cost Optimization Recommendations:
  1. AI Search costs are high (>40% of total). Consider batch processing queries or caching search results.
  2. Cache hit rate is 75% (target: 90%+). Increase cache TTL to reduce R2 reads.
  3. Continue monitoring weekly to detect trend changes early.
```

### Cost Optimization Strategies

The cost monitoring system automatically generates recommendations based on usage patterns:

| Cost Driver | Optimization Strategy | Expected Impact |
|-------------|----------------------|-----------------|
| **R2 Storage** | Implement lifecycle policies to archive old summaries | 20-30% reduction |
| **AI Search Queries** | Increase cache hit rate target from 90% to 95% | 10-15% reduction |
| **Workers Requests** | Reduce ingestion Cron frequency (e.g., 12h → 24h) | 50% reduction |
| **Cache Misses** | Increase KV TTL for unchanged repositories | 5-10% reduction |

### Service Cost Breakdown

- **Workers**: Free tier (100k requests/day) - typically £0-5/month
- **R2 Storage**: ~1GB × £0.015/GB = £0.015-3/month
- **AI Search**: Pay-per-query - target <40% of total
- **KV Namespace**: Free tier (1GB storage, 100k reads/day)
- **Vectorize Index**: Included in Workers plan

**Smart Caching**: Reduces repeat ingestion costs by 90%+ through `pushedAt` timestamp tracking

### Historical Tracking

Cost data is tracked daily for trend analysis:
- **Week-over-week**: Compare weekly spend to detect spikes
- **Month-over-month**: Track growth trends for capacity planning
- **Efficiency metrics**: Queries per £, repos processed per £, cache hit rate

### Environment Variables

Configure cost monitoring with environment variables:

```bash
# Required: Cloudflare credentials
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token

# Optional: Alert webhooks (graceful degradation if unavailable)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
EMAIL_WEBHOOK_URL=https://your-email-service/webhook
```

### CI/CD Integration

Add cost monitoring to your deployment pipeline:

```yaml
# .github/workflows/deploy.yml
- name: Check budget before deployment
  run: npm run cost-monitor:alert
  continue-on-error: true  # Don't block deployment, just warn
```

**See [scripts/cost-monitoring.ts](scripts/cost-monitoring.ts) for implementation details.**

## Observability Dashboard

**Monitor platform health, adoption, and performance in real-time**

Track key metrics and KPIs to ensure the govscraperepo platform meets MVP success criteria ("hundreds of uses per week", <2s p95 latency, <1% error rate).

### Dashboard Access

**Cloudflare Workers Analytics Dashboard:**
- **URL**: https://dash.cloudflare.com/[account_id]/workers/analytics-engine/overview
- **Authentication**: Log in with your Cloudflare account credentials
- **Permissions Required**: Workers Analytics Read access

**Quick Start:**
1. Navigate to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your account → Workers & Pages → Analytics Engine
3. Select `govreposcrape` Worker
4. View metrics: Requests, Latency (p50/p95/p99), Errors, Status Codes

**Built-in Metrics (Zero Configuration):**
- **Query Volume**: Total requests per day/week
- **Response Time**: p50, p95, p99 latency percentiles
- **Error Rate**: 5xx error percentage
- **Status Code Distribution**: 200, 400, 500 breakdown
- **Geographic Distribution**: Request origins by region

### Key Performance Indicators (KPIs)

**MVP Success Metrics** (tracked via Workers Analytics + custom metrics):

| Metric | Target | Measurement | Dashboard Location |
|--------|--------|-------------|-------------------|
| **Weekly Query Volume** | 200+ queries/week | Requests per week | Workers Analytics → Time Series |
| **p95 Response Time** | <2 seconds | 95th percentile latency | Workers Analytics → Latency |
| **Error Rate** | <1% | 5xx errors / total requests | Workers Analytics → Errors |
| **Cache Hit Rate** | 90%+ | KV cache hits / total checks | Custom Metrics (see below) |
| **Empty Result Rate** | <20% | Queries with 0 results | Custom Metrics (logs) |
| **Slow Query Rate** | <5% | Queries >2s | Custom Metrics (logs) |

**Adoption Trends:**
- Week-over-week query growth
- Repeat usage patterns (if user tracking enabled)
- Query success rate (non-empty results)

### Custom Metrics Collection

govscraperepo extends Cloudflare's built-in metrics with custom tracking via structured logging:

**Tracked Metrics:**
- **Cache Hit Rate**: KV cache efficiency (from Epic 2 smart caching)
- **Empty Result Rate**: Percentage of queries returning zero results
- **Slow Query Rate**: Queries exceeding 2-second threshold
- **Error Type Breakdown**: Categorized errors (validation, AI Search timeout, etc.)

**Metric Calculation** (from `src/utils/metrics.ts`):

```typescript
// Cache hit rate: KV cache hits vs total cache checks
cache_hit_rate = (cache_hits / total_cache_checks) × 100

// Empty result rate: queries with 0 search results
empty_result_rate = (queries_with_zero_results / total_queries) × 100

// Slow query rate: queries exceeding performance target
slow_query_rate = (queries_over_2s / total_queries) × 100
```

**Accessing Custom Metrics:**

Custom metrics are emitted via structured JSON logs (compatible with Cloudflare Workers log streaming):

```bash
# View live custom metrics in Workers logs
npx wrangler tail --env production --format pretty

# Example log entry with custom metrics:
{
  "timestamp": "2025-11-15T10:30:45.123Z",
  "level": "info",
  "message": "Search request completed",
  "context": {
    "operation": "execute_search",
    "metadata": {
      "duration": 1234,
      "resultCount": 5,
      "aiSearchDuration": 678,
      "enrichDuration": 123
    }
  }
}
```

### Alert Configuration

**Critical Alert Thresholds** (aligned with PRD requirements):

| Alert | Threshold | Action | Delivery |
|-------|-----------|--------|----------|
| **High Error Rate** | >1% (NFR-6.3) | Investigate API/service failures | Cloudflare Notifications |
| **Slow Performance** | p95 >2s (NFR-1.1) | Check AI Search latency, optimize queries | Email/Slack |
| **Low Adoption** | <10 queries/day for 3+ days | Review marketing, integration guides | Dashboard Warning |
| **Budget Overrun** | >80% of £50/month | Review cost drivers, optimize caching | Cost Monitor (see above) |

**Configuring Alerts in Cloudflare:**

1. Navigate to Cloudflare Dashboard → Notifications
2. Click "Create" → Select "Workers" alert type
3. Configure thresholds:
   - **Error Rate Alert**: `error_rate > 1%` (5-minute window)
   - **Latency Alert**: `p95_latency > 2000ms` (10-minute window)
4. Set delivery: Email, Slack webhook, PagerDuty (optional)
5. Test alert: Trigger test notification to verify delivery

**Alert Response Procedures:**

- **High Error Rate (>1%)**: Check `wrangler tail` logs for error details, review AI Search service status, verify service bindings
- **Slow Performance (p95 >2s)**: Analyze query patterns, check AI Search indexing lag, review caching efficiency
- **Low Adoption (<10/day)**: Review MCP integration guides, check Claude Desktop configuration examples, validate API endpoint accessibility

### Metrics Export

Export metrics data for reporting, analysis, or integration with external tools.

**Export Script** (`scripts/export-metrics.ts`):

```bash
# Export current month metrics as JSON
npm run metrics-export

# Export specific date range as CSV
npm run metrics-export -- --format csv --start-date 2025-11-01 --end-date 2025-11-15 --output metrics-nov.csv

# Weekly export (last 7 days)
npm run metrics-export:weekly

# Monthly export (last 30 days)
npm run metrics-export:monthly
```

**Available npm Scripts:**
- `metrics-export` - Export metrics (default: JSON, last 7 days)
- `metrics-export:weekly` - Export last 7 days as JSON
- `metrics-export:monthly` - Export last 30 days as JSON

**CLI Arguments:**
- `--format <csv|json>` - Output format (default: json)
- `--start-date <YYYY-MM-DD>` - Start date (default: 7 days ago)
- `--end-date <YYYY-MM-DD>` - End date (default: today)
- `--output-file <path>` - Output file path (default: stdout)

**Example CSV Export:**

```csv
date,query_volume,response_time_p50,response_time_p95,response_time_p99,error_rate,cache_hit_rate
2025-11-15,234,456,1234,1876,0.04,92.3
2025-11-14,198,432,1189,1654,0.02,94.1
2025-11-13,267,478,1345,1923,0.08,91.7
```

**Example JSON Export:**

```json
{
  "period": "weekly",
  "start_date": "2025-11-08",
  "end_date": "2025-11-15",
  "metrics": [
    {
      "date": "2025-11-15",
      "query_volume": 234,
      "response_time_p50": 456,
      "response_time_p95": 1234,
      "response_time_p99": 1876,
      "error_rate": 0.04,
      "cache_hit_rate": 92.3,
      "empty_result_rate": 12.5,
      "slow_query_rate": 3.2
    }
  ],
  "mvp_success_metrics": {
    "weekly_queries": 1543,
    "adoption_trend": "increasing",
    "performance_compliance": true
  }
}
```

**GraphQL Analytics API** (for programmatic access):

govscraperepo uses Cloudflare's GraphQL Analytics API for metrics retrieval:

```bash
# Example: Query last 7 days of request metrics
curl -X POST https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { viewer { accounts(filter: { accountTag: \"$ACCOUNT_ID\" }) { workersInvocationsAdaptive(limit: 1000, filter: { datetime_geq: \"2025-11-08T00:00:00Z\" }) { sum { requests errors } avg { duration } quantiles { duration { p50 p95 p99 } } } } } }"
  }'
```

**See [scripts/export-metrics.ts](scripts/export-metrics.ts) for full implementation details.**

### MVP Success Tracking

**Weekly Review Checklist:**
- [ ] Query Volume: ≥200 queries/week (target: "hundreds")
- [ ] Performance: p95 latency <2s (NFR-1.1)
- [ ] Reliability: Error rate <1% (NFR-6.3)
- [ ] Adoption Trend: Week-over-week growth
- [ ] Cache Efficiency: Hit rate >90% (NFR-1.4)

**MVP Fails If:**
- Adoption minimal (<10 queries/day sustained)
- Performance degraded (p95 >2s for 7+ days)
- High error rate (>1% sustained)
- Budget exceeded (>£50/month without optimization path)

**Quarterly Metrics Review:**
- Export 90-day metrics: `npm run metrics-export -- --start-date YYYY-MM-DD --end-date YYYY-MM-DD`
- Analyze trends: query volume growth, latency improvements, error rate stability
- Validate PRD success criteria: FR-8 (usage), NFR-1 (performance), NFR-6 (reliability)
- Document learnings for Phase 2 planning

### Resources

- **Cloudflare Workers Analytics**: https://developers.cloudflare.com/workers/observability/analytics-engine/
- **GraphQL Analytics API**: https://developers.cloudflare.com/analytics/graphql-api/
- **Metrics Best Practices**: https://developers.cloudflare.com/workers/observability/metrics-and-logs/
- **Custom Metrics**: See `src/utils/metrics.ts` for implementation
- **Export Script**: See `scripts/export-metrics.ts` for usage examples

## Documentation

- [Architecture](docs/architecture.md) - Technical architecture and decisions
- [PRD](docs/PRD.md) - Product requirements document
- [Epics](docs/epics.md) - Epic and story breakdown

## License

[License information to be added]

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, automation tools, and quality standards.
