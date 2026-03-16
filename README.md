# govreposcrape

Semantic code search over 24,500+ UK government repositories. Exposes an [MCP](https://modelcontextprotocol.io) API so AI assistants like Claude can search government code directly.

Built on Google Cloud (Cloud Run, Vertex AI Search, Cloud Storage).

**Production API:** `https://govreposcrape-api-1060386346356.us-central1.run.app`

## Use it

### Claude Code (Recommended)

```bash
claude mcp add --transport http govreposcrape https://govreposcrape-api-1060386346356.us-central1.run.app/mcp
```

Or install the plugin:

```bash
/plugin marketplace add chrisns/govreposcrape
/plugin install govreposcrape@govreposcrape
```

Then ask Claude to search UK government code. The `search_uk_gov_code` tool becomes available automatically.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "govreposcrape": {
      "url": "https://govreposcrape-api-1060386346356.us-central1.run.app/mcp",
      "description": "Semantic search over 24,500+ UK government code repositories"
    }
  }
}
```

Config file location: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows), `~/.config/Claude/claude_desktop_config.json` (Linux).

### Any MCP Client

Add the `.mcp.json` from this repo, or point any MCP-compatible client at:

```
https://govreposcrape-api-1060386346356.us-central1.run.app/mcp
```

### Direct API

```bash
curl -X POST https://govreposcrape-api-1060386346356.us-central1.run.app/mcp/search \
  -H "Content-Type: application/json" \
  -d '{"query": "NHS authentication FHIR patient data", "limit": 5}'
```

No authentication required. See [`examples/`](./examples/) for Node.js and Python examples.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/mcp/search` | Semantic code search |
| `POST` | `/mcp` | MCP JSON-RPC endpoint (SSE) |
| `GET` | `/health` | Health check |
| `GET` | `/openapi.json` | OpenAPI 3.0 spec |

### Search parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Natural language search (3-500 chars) |
| `limit` | number | No | Results to return (1-100, default 20) |
| `resultMode` | string | No | `minimal`, `snippets`, or `full` (default `minimal`) |

### Error codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_QUERY` | 400 | Query too short/long |
| `INVALID_LIMIT` | 400 | Limit out of range |
| `SEARCH_ERROR` | 503 | Vertex AI Search unavailable |
| `TIMEOUT` | 408 | Request exceeded 10s timeout |

## Search tips

The API uses semantic search (Vertex AI Search), not keyword matching. Descriptive queries work best:

- **Good:** `"NHS FHIR API patient data integration authentication"`
- **Good:** `"HMRC tax calculation validation business rules"`
- **Good:** `"GOV.UK Design System accessible form components"`
- **Bad:** `"auth"` (too vague)

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │            Google Cloud Platform         │
                    │                                         │
  MCP Clients ───> │  Cloud Run API (Express/TypeScript)      │
                    │       │                                  │
                    │       ├──> Vertex AI Search (semantic)   │
                    │       └──> Cloud Storage (24,500+ repos) │
                    │                                         │
                    │  Cloud Run Jobs (Python ingestion)       │
                    │       │                                  │
                    │       ├──> GitHub gov repos feed         │
                    │       ├──> gitingest (summarisation)     │
                    │       └──> Cloud Storage (upload)        │
                    └─────────────────────────────────────────┘
```

**Read path:** MCP client -> Cloud Run API -> Vertex AI Search -> results

**Write path:** Cloud Run Jobs -> fetch repos -> gitingest summarise -> upload to GCS -> Vertex AI auto-indexes

### Google Cloud services

| Service | Resource | Purpose |
|---------|----------|---------|
| Cloud Run | `govreposcrape-api` | MCP API server (Node.js 20, Express) |
| Cloud Run Jobs | `govreposcrape-ingestion` | Daily ingestion (Python 3.11, 100 parallel tasks) |
| Cloud Storage | `govreposcrape-summaries` | gitingest summaries (`{org}/{repo}.md`) |
| Vertex AI Search | `govreposcrape-search` | Semantic search, auto-indexed from GCS |

## Development

### Prerequisites

- Node.js 20+
- Python 3.11+ (for ingestion container)
- Docker 24+
- `gcloud` CLI
- Google Cloud project with Vertex AI Search enabled

### Setup

```bash
npm install
cp .env.example .env   # then fill in Google Cloud credentials
npm run dev             # starts API on http://localhost:8080
```

### Testing

```bash
npm test                    # run all tests (Vitest)
npm test -- --coverage      # with coverage
cd api && npm test          # API tests only
pytest container/           # ingestion pipeline tests
```

### Deploy

```bash
cd api && ./deploy-setup.sh   # deploys API to Cloud Run
```

The ingestion pipeline runs daily via Cloud Scheduler, or manually:

```bash
gcloud run jobs execute govreposcrape-ingestion --project=govreposcrape --region=us-central1
```

## Project structure

```
govreposcrape/
├── api/                        # Cloud Run API
│   ├── src/
│   │   ├── index.ts            # Express entry point
│   │   ├── controllers/        # searchController, mcpController
│   │   ├── services/           # Vertex AI Search, GCS, Gemini
│   │   └── middleware/         # logging, errors, timeout, validation
│   ├── test/                   # Vitest tests
│   └── Dockerfile
├── container/                  # Ingestion pipeline (Cloud Run Jobs)
│   ├── orchestrator.py         # Batch processing orchestrator
│   ├── ingest.py               # gitingest processing
│   ├── gcs_client.py           # Cloud Storage client
│   └── Dockerfile
├── .claude-plugin/             # Claude Code plugin manifest
├── skills/                     # Claude Code skills
├── commands/                   # Claude Code slash commands
├── examples/                   # curl, Node.js, Python examples
├── docs/                       # Architecture, PRD, epics
└── scripts/                    # Deployment & utility scripts
```

## Security

The Google Cloud Project Number (`1060386346356`) in Cloud Run URLs is a public identifier by design - it does not grant access to resources. All secrets are managed via environment variables and Secret Manager.

See [SECURITY.md](./SECURITY.md).

## Links

- [Architecture](docs/architecture.md)
- [PRD](docs/PRD.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Claude Desktop Guide](docs/integration/claude-desktop.md)
- [OpenAPI Spec](https://govreposcrape-api-1060386346356.us-central1.run.app/openapi.json) ([Swagger UI](https://editor.swagger.io/?url=https://govreposcrape-api-1060386346356.us-central1.run.app/openapi.json))
- [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
