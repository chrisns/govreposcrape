# govreposcrape

Semantic code search over ~21k UK government repositories using Cloudflare Workers and AI Search.

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

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

### Deployment

```bash
# Deploy to production
npm run deploy

# Deploy with specific config
npx wrangler deploy --config wrangler.jsonc
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

Target: <£50/month for MVP

- Workers: Free tier (100k requests/day)
- R2: ~1GB storage × £0.015/GB = £0.015/month
- KV: Free tier (1GB storage, 100k reads/day)
- AI Search: Pay-per-query (validated during MVP)
- Smart caching reduces AI Search queries by 90%

## Documentation

- [Architecture](docs/architecture.md) - Technical architecture and decisions
- [PRD](docs/PRD.md) - Product requirements document
- [Epics](docs/epics.md) - Epic and story breakdown

## License

[License information to be added]

## Contributing

[Contributing guidelines to be added]
