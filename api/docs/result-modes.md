# MCP API Result Modes - Usage Guide

## Overview

The MCP API `/mcp/search` endpoint supports three result detail levels, allowing clients to optimize for their specific use case. Choose between fast metadata-only results, balanced code snippets, or comprehensive repository summaries.

## Quick Reference

| Mode | Latency (p95) | Bandwidth | Best For |
|------|---------------|-----------|----------|
| **minimal** | <500ms | ~1KB/result | Fast browsing, low-bandwidth clients, metadata exploration |
| **snippets** | <1500ms | ~5KB/result | **AI assistants (default)**, web UI, balanced performance |
| **full** | <3000ms | ~50KB/result | Deep analysis, CLI tools, comprehensive research |

## The Three Modes

### 1. Minimal Mode - Fast Browsing

**Use Case:** Quick repository discovery, low-bandwidth scenarios, building lists

**Returns:**
- Repository metadata (org, name, URL, language)
- Similarity score from semantic search
- Last update timestamp
- GitHub link
- Basic metadata (stars, license)

**What's NOT included:** Code snippets, gitingest summaries, repository stats

**Example Request:**
```json
{
  "query": "authentication methods",
  "limit": 5,
  "resultMode": "minimal"
}
```

**Example Response:**
```json
{
  "results": [
    {
      "repo_url": "https://github.com/alphagov/govuk-frontend",
      "repo_org": "alphagov",
      "repo_name": "govuk-frontend",
      "language": "TypeScript",
      "last_updated": "2025-01-15T10:30:00Z",
      "similarity_score": 0.87,
      "github_link": "https://github.com/alphagov/govuk-frontend",
      "metadata": {
        "stars": 1234,
        "license": "MIT"
      }
    }
  ],
  "metadata": {
    "query": "authentication methods",
    "limit": 5,
    "resultCount": 1,
    "duration": 245
  },
  "mode": "minimal"
}
```

**When to Use:**
- Building a list of relevant repositories
- Low-bandwidth connections (mobile, edge computing)
- Fast initial discovery before deeper investigation
- Filtering repositories by metadata (language, organization)

---

### 2. Snippets Mode - Balanced (Default)

**Use Case:** AI assistants, web UI, standard search queries

**Returns:**
- All minimal mode fields PLUS:
- Focused code snippet (3-5 lines from Vertex AI Search highlights)
- File path and line range for snippet
- Context lines before/after (fixed at 2 lines each)
- GitHub Codespaces quick-edit link

**Default Behavior:** When `resultMode` parameter is omitted, the API defaults to snippets mode for backward compatibility with existing clients.

**Example Request (Explicit):**
```json
{
  "query": "OAuth2 implementation",
  "limit": 3,
  "resultMode": "snippets"
}
```

**Example Request (Default):**
```json
{
  "query": "OAuth2 implementation",
  "limit": 3
  // resultMode omitted - defaults to "snippets"
}
```

**Example Response:**
```json
{
  "results": [
    {
      "repo_url": "https://github.com/alphagov/govuk-frontend",
      "repo_org": "alphagov",
      "repo_name": "govuk-frontend",
      "language": "TypeScript",
      "last_updated": "2025-01-15T10:30:00Z",
      "similarity_score": 0.87,
      "github_link": "https://github.com/alphagov/govuk-frontend",
      "metadata": {
        "stars": 1234,
        "license": "MIT"
      },
      "snippet": "function authenticateUser(req, res, next) {\n  const token = req.headers.authorization;\n  if (!validateToken(token)) return res.status(401).send('Unauthorized');\n  next();\n}",
      "snippet_file_path": "src/auth/middleware.ts",
      "snippet_line_range": "45-50",
      "context_lines_before": 2,
      "context_lines_after": 2,
      "codespaces_link": "https://github.dev/alphagov/govuk-frontend"
    }
  ],
  "metadata": {
    "query": "OAuth2 implementation",
    "limit": 3,
    "resultCount": 1,
    "duration": 682
  },
  "mode": "snippets"
}
```

**When to Use:**
- AI assistants (Claude, ChatGPT) for code exploration
- Web UI displaying search results with previews
- Balanced use cases requiring both context and performance
- Default choice for most integrations

---

### 3. Full Mode - Comprehensive Analysis

**Use Case:** Deep research, CLI tools, comprehensive code review

**Returns:**
- All snippet mode fields PLUS:
- Complete gitingest Markdown summary from Cloud Storage
- README excerpt (first 500 characters)
- Repository statistics (contributors, commits, issues, last commit)
- Parsed dependencies from package manifests (package.json, requirements.txt, go.mod)
- Full file context (future enhancement)

**Example Request:**
```json
{
  "query": "microservices architecture",
  "limit": 2,
  "resultMode": "full"
}
```

**Example Response (Truncated):**
```json
{
  "results": [
    {
      "repo_url": "https://github.com/alphagov/govuk-frontend",
      "repo_org": "alphagov",
      "repo_name": "govuk-frontend",
      "language": "TypeScript",
      "last_updated": "2025-01-15T10:30:00Z",
      "similarity_score": 0.87,
      "github_link": "https://github.com/alphagov/govuk-frontend",
      "metadata": {
        "stars": 1234,
        "license": "MIT"
      },
      "snippet": "...",
      "snippet_file_path": "src/auth/middleware.ts",
      "snippet_line_range": "45-50",
      "context_lines_before": 2,
      "context_lines_after": 2,
      "codespaces_link": "https://github.dev/alphagov/govuk-frontend",
      "gitingest_summary": "# Repository Summary\n\n## README\n\nThis is the GOV.UK Frontend repository...\n\n## Key Files\n- src/auth/middleware.ts: OAuth2 middleware\n- src/auth/validators.ts: Token validation\n...",
      "readme_excerpt": "This is the GOV.UK Frontend repository. It provides reusable components and styles for government services...",
      "repository_stats": {
        "contributors": 42,
        "commits_last_month": 15,
        "open_issues": 8,
        "last_commit": "2025-01-14T15:30:00Z"
      },
      "dependencies": [
        {"name": "jsonwebtoken", "version": "^9.0.0", "type": "runtime"},
        {"name": "express", "version": "^4.18.0", "type": "runtime"},
        {"name": "typescript", "version": "^5.3.0", "type": "dev"}
      ]
    }
  ],
  "metadata": {
    "query": "microservices architecture",
    "limit": 2,
    "resultCount": 1,
    "duration": 2100
  },
  "mode": "full"
}
```

**When to Use:**
- CLI tools requiring complete repository context
- Research projects needing comprehensive data
- Code review workflows analyzing architecture
- Dependency analysis and security audits
- Understanding complete project structure

---

## Mode Selection Decision Tree

```
Do you need code snippets?
├─ NO → Use MINIMAL mode
│        (Fast metadata-only browsing)
│
└─ YES → Is complete repository context required?
         ├─ NO → Use SNIPPETS mode (default)
         │        (Balanced code snippets with context)
         │
         └─ YES → Use FULL mode
                  (Comprehensive analysis with gitingest summaries)
```

## Performance Characteristics

### Latency Targets (p95)

| Mode | Target | Typical | Notes |
|------|--------|---------|-------|
| Minimal | <500ms | ~250ms | Fastest - no Cloud Storage reads |
| Snippets | <1500ms | ~700ms | Default - uses Vertex AI Search highlights |
| Full | <3000ms | ~2100ms | Slowest - fetches from Cloud Storage |

### Bandwidth Usage

| Mode | Per Result | For 5 Results | Notes |
|------|------------|---------------|-------|
| Minimal | ~1KB | ~5KB | Metadata only |
| Snippets | ~5KB | ~25KB | Includes code snippets |
| Full | ~50KB | ~250KB | Includes complete gitingest summaries |

### Trade-offs

| Consideration | Minimal | Snippets | Full |
|---------------|---------|----------|------|
| **Speed** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Bandwidth** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Context** | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Completeness** | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## Code Examples

### cURL

See: `api/examples/result-modes/minimal-mode.sh`, `snippets-mode.sh`, `full-mode.sh`

### TypeScript/JavaScript

See: `api/examples/result-modes/minimal-mode.ts`, `snippets-mode.ts`, `full-mode.ts`

### Python

See: `api/examples/result-modes/minimal_mode.py`, `snippets_mode.py`, `full_mode.py`

## Error Handling

### Invalid Result Mode

**Request:**
```json
{
  "query": "test",
  "resultMode": "invalid"
}
```

**Response (400 Bad Request):**
```json
{
  "error": {
    "code": "INVALID_RESULT_MODE",
    "message": "resultMode must be one of: minimal, snippets, full",
    "allowed_values": ["minimal", "snippets", "full"]
  }
}
```

## Backward Compatibility

**Existing clients continue working without changes:**
- Clients that omit `resultMode` parameter receive snippets mode (current behavior)
- No breaking changes to response schema
- API version remains v1 (additive change only)

**Migration path:** Clients can opt into minimal or full modes when ready, with no required changes.

## MCP Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "govscraperepo": {
      "command": "node",
      "args": ["path/to/mcp-client.js"],
      "env": {
        "API_URL": "https://govreposcrape-api-xxxxx-uc.a.run.app",
        "DEFAULT_RESULT_MODE": "snippets"
      }
    }
  }
}
```

**Recommended modes by use case:**
- **Code exploration:** `snippets` (default)
- **Fast browsing:** `minimal`
- **Deep analysis:** `full`

## API Reference

For complete API schema including all result mode schemas, see:
- OpenAPI Specification: `/openapi.json` or `/docs` (Swagger UI)
- TypeScript Types: `api/src/types/mcp.ts`

## Support

For questions or issues:
- GitHub: https://github.com/alphagov/govreposcrape
- Documentation: `api/README.md`
- Migration Guide: `api/docs/migration-result-modes.md`
- Performance Documentation: `api/docs/performance.md`
