# govreposcrape

**Semantic code search _and_ dependency intelligence over 24,500+ UK government repositories.** Exposes an [MCP](https://modelcontextprotocol.io) API so AI assistants like Claude can search government code _and_ query its entire software supply chain (SBOM dependency graph) directly.

Ask things like *"who's running a vulnerable Log4j?"*, *"who uses Express < 2?"*, *"what does HMRC build on?"*, or *"which departments share the most dependencies?"* — and get exhaustive, structured answers in seconds.

Built on Google Cloud (Cloud Run, BigQuery, Vertex AI Search, Cloud Storage).

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

Then ask Claude about UK government code — all nine tools (see [MCP tools](#mcp-tools)) become available automatically.

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

## MCP tools

Nine tools are exposed over the MCP endpoint. **Semantic search** answers "what does this code do"; the **dependency-intelligence** tools answer structured "who depends on what" questions that semantic search cannot.

| Tool | What it answers |
|------|-----------------|
| `search_uk_gov_code` | Semantic code search — "show me NHS FHIR authentication code" |
| `search_dependency` | Who depends on a package, with ecosystem-aware version ranges — "who uses express", "who runs express < 2" |
| `vulnerability_exposure` | **CVE blast-radius** via live [OSV.dev](https://osv.dev) — "who is exposed to Log4Shell", "what CVEs is alphagov running" |
| `package_popularity` | Most-depended-on packages + licence rollups — "top npm packages", "who uses GPL code" |
| `dependency_landscape` | Per-org tech profile: ecosystems, top packages, frameworks with **end-of-life** flags ([endoflife.date](https://endoflife.date)), licences |
| `dependency_compare` | Shared / unique dependencies + overlap % between two repos — spot duplicated effort across departments |
| `repo_dependencies` | Full, untruncated dependency list for one repo |
| `sbom_export` | Full dependency set + per-ecosystem counts + canonical SBOM URL |
| `dependency_trends` | Package usage across daily snapshots (90-day retention) |

> The dependency tools cover the ~15,600 repositories that have a generatable SBOM (semantic search covers all 24,500+). The aggregate SBOM carries direct dependencies only (no transitive graph).

### Examples

**Who uses Express, and is anyone on a pre-2.0 version?**

```jsonc
// search_dependency { "package": "express", "ecosystem": "npm" }
{ "total_repo_count": 1830,
  "top_versions": [["4.22.1", 277], ["5.2.1", 272], ["4.21.2", 258], ["4.17.1", 232]],
  "excluded": { "declared_range": 131, "empty_version": 1 } }

// search_dependency { "package": "express", "ecosystem": "npm", "version_range": "<2" }
{ "total_repo_count": 1830, "matched_repo_count": 0, "range_exact": true }   // exhaustive, not fuzzy
```

**Who is exposed to a vulnerable Log4j?** (live OSV.dev cross-reference)

```jsonc
// vulnerability_exposure { "package": "org.apache.logging.log4j/log4j-core", "ecosystem": "maven" }
{ "scope": "maven package \"org.apache.logging.log4j/log4j-core\"",
  "osv_available": true, "vulnerable_versions": 19,
  "findings": [
    { "package": "org.apache.logging.log4j/log4j-core", "version": "2.25.3",
      "affected_repo_count": 9,
      "repos_sample": ["govuk-one-login/ipv-core-back", "dwp/ms-fitnote-controller",
                       "nationalarchives/tdr-file-checks", "companieshouse/search.api.ch.gov.uk"],
      "vulnerabilities": [{ "cve": "CVE-2026-34480", "severity": "MODERATE",
                            "url": "https://osv.dev/vulnerability/GHSA-3pxv-7cmr-fjr4" }] }
  ] }
```

> Scope `vulnerability_exposure` to a `package` (+`ecosystem`), a `repo_full_name`, or an `org`. Maven packages are keyed by `group/artifact` (e.g. `org.apache.logging.log4j/log4j-core`); use `package_popularity` with `name_contains` to find the exact key.

**What does a department build on?**

```jsonc
// dependency_landscape { "org": "hmrc" }
{ "org": "hmrc", "repo_count": 1655,
  "ecosystems": [{ "ecosystem": "npm", "repos": 55, "dependencies": 25308 },
                 { "ecosystem": "gem", "repos": 49, "dependencies": 3508 },
                 { "ecosystem": "pypi", "repos": 47, "dependencies": 1558 }],
  "eol_frameworks": [{ "package": "django", "version": "1.11.5", "repos": 2, "eol_date": "2020-04-01" }],
  "licence_summary": { "copyleft_occurrences": 421, "unknown_or_missing": 1830 } }
```

**Where are departments duplicating effort?**

```jsonc
// dependency_compare { "repo_a": "alphagov/govuk-frontend", "repo_b": "hmrc/hmrc-frontend" }
{ "shared_count": 931, "overlap_pct": 51.2, "deps_a": 1402, "deps_b": 1217 }
```

**What are the most-used packages across government?**

```jsonc
// package_popularity { "ecosystem": "npm", "top": 3 }
{ "top_packages": [{ "package_name": "debug", "repo_count": 3132 },
                   { "package_name": "ms", "repo_count": 3091 },
                   { "package_name": "semver", "repo_count": 3023 }] }
```

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
                ┌───────────────────────────────────────────────────────────┐
                │                   Google Cloud Platform                    │
                │                                                            │
  MCP clients ─>│  Cloud Run API (Express / TypeScript)                      │
                │     ├─ search_uk_gov_code ───────────> Vertex AI Search    │
                │     ├─ search_dependency / popularity /                    │
                │     │  landscape / compare / sbom_export / trends ─> BigQuery
                │     │                          (govreposcrape_deps ~2.9M)  │
                │     └─ vulnerability_exposure ─> BigQuery + OSV.dev  (live) │
                │        dependency_landscape  ─> + endoflife.date    (live) │
                │                                                            │
                │  Cloud Run Jobs (Python)                                   │
                │     ├─ govreposcrape-ingestion  ─> gitingest ─> GCS ─>      │
                │     │                                Vertex AI Search       │
                │     └─ govreposcrape-deps-index ─> aggregate CycloneDX SBOM │
                │                          ─> explode (~2.9M rows) ─> BigQuery │
                └───────────────────────────────────────────────────────────┘
```

**Read paths:**
- Semantic: MCP client -> Cloud Run API -> Vertex AI Search -> results
- Dependency: MCP client -> Cloud Run API -> BigQuery (`govreposcrape_deps`), with live enrichment from OSV.dev (CVEs) and endoflife.date (EOL)

**Write paths (daily Cloud Run Jobs):**
- Semantic: fetch repos -> gitingest summarise -> upload to GCS -> Vertex AI auto-indexes
- Dependency: stream the aggregate CycloneDX SBOM -> explode to ~2.9M `(repo, library)` rows -> classify versions -> load BigQuery (date-partitioned, clustered) -> rebuild summary tables -> atomic view swap

Cross-ecosystem version comparison (e.g. `express < 2`) uses a byte-identical Python+TS version-key implementation (`container/version_keys.py` / `api/src/services/versionKeys.ts`) validated against shared golden vectors. See [`docs/sbom-dependency-index-design.md`](docs/sbom-dependency-index-design.md).

### Google Cloud services

| Service | Resource | Purpose |
|---------|----------|---------|
| Cloud Run | `govreposcrape-api` | MCP API server (Node.js, Express) |
| Cloud Run Jobs | `govreposcrape-ingestion` | Daily semantic ingestion (gitingest -> GCS) |
| Cloud Run Jobs | `govreposcrape-deps-index` | Daily dependency-index build (CycloneDX SBOM -> BigQuery, 04:00 UTC) |
| Cloud Storage | `govreposcrape-summaries` | gitingest summaries (`{org}/{repo}.md`) + deps NDJSON staging |
| Vertex AI Search | `govreposcrape-search` | Semantic search, auto-indexed from GCS |
| BigQuery | `govreposcrape_deps` | Structured dependency index (~2.9M rows, date-partitioned, 90-day retention) |

External services queried live (read-only, bounded): [OSV.dev](https://osv.dev) (CVEs) and [endoflife.date](https://endoflife.date) (framework EOL).

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
│   │   ├── index.ts            # Express entry point (+ rate limiter)
│   │   ├── controllers/        # searchController, mcpController (9 tools)
│   │   ├── services/           # vertexSearchService, depsQueryService,
│   │   │                       #   versionKeys, osvService, endoflifeService,
│   │   │                       #   safeFetch, concurrency, GCS, Gemini
│   │   └── middleware/         # logging, errors, timeout, validation, rateLimit
│   ├── test/                   # Vitest tests
│   └── Dockerfile
├── container/                  # Ingestion pipelines (Cloud Run Jobs)
│   ├── orchestrator.py         # Semantic (gitingest) orchestrator
│   ├── ingest.py               # gitingest processing
│   ├── build_deps_index.py     # SBOM -> BigQuery dependency index
│   ├── version_keys.py         # version classification (parity w/ versionKeys.ts)
│   ├── deploy-deps-index.sh    # deploy the deps-index job + scheduler
│   ├── gcs_client.py           # Cloud Storage client
│   └── Dockerfile
├── testdata/                   # shared Python<->TS version-key golden vectors
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
- [Dependency index design & as-built notes](docs/sbom-dependency-index-design.md)
- [PRD](docs/PRD.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Claude Desktop Guide](docs/integration/claude-desktop.md)
- [OpenAPI Spec](https://govreposcrape-api-1060386346356.us-central1.run.app/openapi.json) ([Swagger UI](https://editor.swagger.io/?url=https://govreposcrape-api-1060386346356.us-central1.run.app/openapi.json))
- [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
