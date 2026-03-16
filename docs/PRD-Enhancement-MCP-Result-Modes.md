# PRD Enhancement: MCP API Result Modes

**Date:** 2025-11-19
**Author:** cns
**Status:** Proposed Enhancement
**Related PRD Sections:** FR-2.2 (Semantic Search API), FR-3.1 (MCP v2 Protocol Compliance)
**Version:** 1.0

---

## Summary

Enhance the MCP API search endpoint to support configurable result detail levels, allowing clients to choose between full gitingest summaries, focused snippets, or minimal semantic search results. This provides flexibility for different use cases while optimizing bandwidth and latency.

---

## Motivation

**Current Behavior:**
- MCP API returns fixed-format results with snippets and metadata
- No control over result verbosity
- All clients get the same level of detail

**Enhancement Need:**
- **AI assistants** may want different detail levels based on context window availability
- **Web UI** may prefer snippets for display (default)
- **CLI tools** may need full summaries for analysis
- **Performance-sensitive integrations** may only need repo links and scores

**User Value:**
- Faster responses for clients that don't need full context
- Richer information when clients can handle detailed results
- Bandwidth optimization for mobile/edge use cases
- Flexible integration patterns

---

## Proposed Enhancement

### New API Parameter: `resultMode`

Add optional `resultMode` parameter to the `/mcp/search` endpoint.

**API Signature:**
```json
POST /mcp/search
{
  "query": "authentication methods",
  "limit": 5,
  "resultMode": "snippets"  // NEW: "full" | "snippets" | "minimal"
}
```

### Three Result Modes

#### 1. **`snippets`** (Default)
**Use Case:** Standard search, web UI, AI assistant with moderate context window

**Returns:**
- Repo metadata (org, name, URL, language, last_updated, license)
- **Focused snippet** (3-5 lines of relevant code with surrounding context)
- Similarity score
- GitHub and Codespaces links
- Basic trust indicators (stars, forks)

**Example Response:**
```json
{
  "results": [
    {
      "repo_url": "https://github.com/alphagov/govuk-frontend",
      "repo_org": "alphagov",
      "repo_name": "govuk-frontend",
      "snippet": "// OAuth2 authentication middleware\nfunction authenticateUser(req, res, next) {\n  const token = req.headers.authorization;\n  if (!validateToken(token)) return res.status(401).send('Unauthorized');\n  next();\n}",
      "snippet_file_path": "src/auth/middleware.ts",
      "snippet_line_range": "45-50",
      "context_lines_before": 2,
      "context_lines_after": 2,
      "last_updated": "2025-10-15T14:30:00Z",
      "language": "TypeScript",
      "similarity_score": 0.87,
      "github_link": "https://github.com/alphagov/govuk-frontend/blob/main/src/auth/middleware.ts#L45-L50",
      "codespaces_link": "https://github.dev/alphagov/govuk-frontend",
      "metadata": {
        "stars": 1234,
        "forks": 456,
        "license": "MIT"
      }
    }
  ],
  "took_ms": 1234,
  "mode": "snippets"
}
```

---

#### 2. **`full`** (Comprehensive)
**Use Case:** Deep analysis, CLI tools, research, when full context needed

**Returns:**
- All snippet mode fields PLUS:
- **Complete gitingest summary** for the repository
- Full file context (not just snippet)
- Dependency information (if available)
- README excerpt
- Repository statistics (contributors, commit frequency)

**Example Response:**
```json
{
  "results": [
    {
      "repo_url": "https://github.com/alphagov/govuk-frontend",
      "repo_org": "alphagov",
      "repo_name": "govuk-frontend",

      // Standard fields from snippets mode...
      "snippet": "...",
      "snippet_file_path": "src/auth/middleware.ts",

      // FULL MODE ADDITIONS:
      "gitingest_summary": "# govuk-frontend\n\nTypeScript authentication library for GOV.UK services...\n\n## Key Files:\n- src/auth/middleware.ts: OAuth2 middleware\n- src/auth/validators.ts: Token validation\n...\n\n## Dependencies:\njsonwebtoken: ^9.0.0\nexpress: ^4.18.0\n...",

      "full_file_context": "import express from 'express';\nimport jwt from 'jsonwebtoken';\n\n// OAuth2 authentication middleware\nfunction authenticateUser(req, res, next) {\n  const token = req.headers.authorization;\n  if (!validateToken(token)) return res.status(401).send('Unauthorized');\n  next();\n}\n\n// ... rest of file ...",

      "readme_excerpt": "# GOV.UK Frontend\n\nAuthentication library for government services...",

      "repository_stats": {
        "contributors": 45,
        "commits_last_month": 23,
        "open_issues": 12,
        "last_commit": "2025-10-15T14:30:00Z"
      },

      "dependencies": [
        {"name": "jsonwebtoken", "version": "^9.0.0", "type": "runtime"},
        {"name": "express", "version": "^4.18.0", "type": "runtime"}
      ],

      // Standard metadata...
      "similarity_score": 0.87,
      "metadata": {...}
    }
  ],
  "took_ms": 2100,
  "mode": "full"
}
```

---

#### 3. **`minimal`** (Semantic Results Only)
**Use Case:** Fast browsing, low-bandwidth, when only repo identification needed

**Returns:**
- Repo metadata (org, name, URL)
- Similarity score
- GitHub link
- **No code snippets, no gitingest summary**

**Example Response:**
```json
{
  "results": [
    {
      "repo_url": "https://github.com/alphagov/govuk-frontend",
      "repo_org": "alphagov",
      "repo_name": "govuk-frontend",
      "language": "TypeScript",
      "last_updated": "2025-10-15T14:30:00Z",
      "similarity_score": 0.87,
      "github_link": "https://github.com/alphagov/govuk-frontend",
      "metadata": {
        "stars": 1234,
        "license": "MIT"
      }
    }
  ],
  "took_ms": 456,
  "mode": "minimal"
}
```

---

## API Specification Changes

### Request Schema Update

**Before (Current):**
```json
{
  "query": "string (required)",
  "limit": "integer (optional, default: 5)"
}
```

**After (Enhanced):**
```json
{
  "query": "string (required)",
  "limit": "integer (optional, default: 5)",
  "resultMode": "enum: 'full' | 'snippets' | 'minimal' (optional, default: 'snippets')"
}
```

### Response Schema Updates

**Common Fields (All Modes):**
```typescript
interface BaseResult {
  repo_url: string;
  repo_org: string;
  repo_name: string;
  language: string;
  last_updated: string; // ISO 8601
  similarity_score: number; // 0-1
  github_link: string;
  metadata: {
    stars?: number;
    forks?: number;
    license?: string;
  };
}
```

**Snippet Mode (Default):**
```typescript
interface SnippetResult extends BaseResult {
  snippet: string; // 3-5 lines of code
  snippet_file_path: string;
  snippet_line_range: string; // "45-50"
  context_lines_before: number;
  context_lines_after: number;
  codespaces_link: string;
}
```

**Full Mode:**
```typescript
interface FullResult extends SnippetResult {
  gitingest_summary: string; // Complete summary
  full_file_context: string; // Entire file content
  readme_excerpt?: string;
  repository_stats?: {
    contributors: number;
    commits_last_month: number;
    open_issues: number;
    last_commit: string;
  };
  dependencies?: Array<{
    name: string;
    version: string;
    type: 'runtime' | 'dev';
  }>;
}
```

**Minimal Mode:**
```typescript
type MinimalResult = BaseResult; // No additional fields
```

---

## Implementation Notes

### Backend Changes

**1. Cloud Storage Structure Enhancement:**
```
gitingest/{org}/{repo}/
├── summary.txt           # Full gitingest summary (existing)
├── snippets.json         # NEW: Pre-extracted snippets by semantic cluster
├── metadata.json         # NEW: Repo stats, dependencies, README excerpt
└── embeddings.bin        # Vector embeddings (existing)
```

**2. Query Processing Pipeline:**
```
User Query
    ↓
Embed query (existing)
    ↓
Semantic search (existing)
    ↓
[NEW] Check resultMode parameter
    ↓
┌─────────────┬─────────────┬─────────────┐
│   minimal   │  snippets   │    full     │
│  (fastest)  │  (default)  │  (slowest)  │
└─────────────┴─────────────┴─────────────┘
    ↓              ↓              ↓
Fetch base     Fetch base     Fetch base
metadata       + snippets     + summary
                              + metadata
                              + full context
    ↓              ↓              ↓
Format and     Format and     Format and
return         return         return
```

**3. Performance Characteristics:**

| Mode | Latency (p95) | Bandwidth | Use When |
|------|---------------|-----------|----------|
| minimal | <500ms | ~1KB/result | Quick browsing, low bandwidth |
| snippets | <1500ms | ~5KB/result | Default, balanced (AI assistants, web UI) |
| full | <3000ms | ~50KB/result | Deep analysis, research, CLI tools |

---

### Client Integration Examples

**Claude Desktop MCP Config:**
```json
{
  "mcpServers": {
    "govscraperepo": {
      "url": "https://api.govscraperepo.uk/mcp",
      "apiKey": "YOUR_JWT_TOKEN",
      "defaultResultMode": "snippets",  // NEW
      "description": "UK Government code discovery"
    }
  }
}
```

**API Client Usage:**
```typescript
// Fast browsing - minimal mode
const repos = await govscraperepo.search({
  query: "authentication",
  resultMode: "minimal"
});

// Standard search - snippets (default)
const results = await govscraperepo.search({
  query: "authentication methods"
  // resultMode defaults to "snippets"
});

// Deep research - full mode
const detailedResults = await govscraperepo.search({
  query: "authentication methods",
  resultMode: "full"
});
```

---

## Acceptance Criteria

### AC-1: API Parameter Handling
- ✅ `resultMode` parameter accepted in POST /mcp/search
- ✅ Valid values: `"full"`, `"snippets"`, `"minimal"`
- ✅ Default to `"snippets"` if parameter omitted
- ✅ Return 400 error with clear message for invalid values

### AC-2: Minimal Mode
- ✅ Returns base metadata only (no snippets, no gitingest summary)
- ✅ Response time <500ms (p95)
- ✅ Bandwidth <1KB per result
- ✅ Includes similarity score and GitHub link

### AC-3: Snippets Mode (Default)
- ✅ Returns focused code snippets (3-5 lines) with context
- ✅ Includes file path and line range
- ✅ Response time <1500ms (p95)
- ✅ Bandwidth ~5KB per result
- ✅ GitHub and Codespaces links included

### AC-4: Full Mode
- ✅ Returns complete gitingest summary
- ✅ Includes full file context for snippet location
- ✅ README excerpt if available
- ✅ Repository statistics (contributors, commits, issues)
- ✅ Dependency list if extractable
- ✅ Response time <3000ms (p95)
- ✅ Bandwidth ~50KB per result

### AC-5: Response Consistency
- ✅ All modes return `mode` field indicating which mode was used
- ✅ Error handling consistent across modes
- ✅ Schema validation passes for all mode responses
- ✅ OpenAPI spec updated with mode variants

### AC-6: Backward Compatibility
- ✅ Existing clients without `resultMode` parameter continue working
- ✅ Default behavior matches current API (snippets equivalent)
- ✅ No breaking changes to existing response structure

---

## Performance Impact

### Storage Requirements

**Additional Storage:**
- `snippets.json`: ~10KB per repo
- `metadata.json`: ~5KB per repo
- **Total additional:** ~15KB × 21,000 repos = ~315MB

**Storage Cost Impact:**
- Current: ~1GB (gitingest summaries)
- After: ~1.3GB (with snippets + metadata)
- Cost increase: ~£0.06/month (negligible)

### Query Performance

| Metric | Current | Minimal | Snippets | Full |
|--------|---------|---------|----------|------|
| Cloud Storage reads | 1-2 | 1 | 2 | 3-4 |
| Data transfer (per result) | ~5KB | ~1KB | ~5KB | ~50KB |
| Latency (p95) | ~1500ms | ~500ms | ~1500ms | ~3000ms |

**Optimization:** Pre-generate snippets during gitingest processing to avoid real-time extraction

---

## Migration Plan

### Phase 1: Implementation (Week 1)
1. Add `resultMode` parameter parsing and validation
2. Implement minimal mode (simplest - remove fields)
3. Implement snippets mode (maintain current behavior)
4. Update response schemas and documentation

### Phase 2: Full Mode (Week 2)
1. Enhance gitingest pipeline to extract additional metadata
2. Generate `snippets.json` and `metadata.json` during ingestion
3. Implement full mode query path
4. Performance testing and optimization

### Phase 3: Rollout (Week 3)
1. Update OpenAPI specification
2. Deploy to production with feature flag
3. Update integration documentation
4. Announce to early adopters
5. Monitor usage patterns and performance

---

## Success Metrics

### Adoption Metrics
- **30%+ of queries** use non-default modes within 4 weeks
- **Minimal mode** adopted for browsing/discovery workflows
- **Full mode** used by CLI tools and research users

### Performance Metrics
- Minimal mode: <500ms response (p95) ✅
- Snippets mode: <1500ms response (p95) ✅
- Full mode: <3000ms response (p95) ✅
- No degradation to existing performance

### User Feedback
- Positive feedback on flexibility
- Clear use cases for each mode documented by users
- No confusion about mode differences

---

## Open Questions

1. **Should we support mode selection per-result?**
   - e.g., "Give me minimal for all, but full for top result"
   - **Decision:** Defer to Phase 2, not MVP

2. **Should full mode include dependency vulnerability data?**
   - Requires integration with security APIs
   - **Decision:** Out of scope, track as separate enhancement

3. **Should we cache different modes separately?**
   - Edge caching complexity vs performance
   - **Decision:** Test with single cache, optimize if needed

4. **Should mode affect ranking/relevance?**
   - Full mode could use richer signals
   - **Decision:** No, keep ranking consistent across modes

---

## References

- **Related PRD Sections:**
  - FR-2.2: Semantic Search API
  - FR-3.1: MCP v2 Protocol Compliance
  - NFR-1.1: Query Response Time

- **API Design Patterns:**
  - RESTful parameter design
  - Progressive enhancement (minimal → snippets → full)
  - Backward compatibility considerations

---

## Approval & Sign-off

- [ ] Technical review (API design)
- [ ] Performance review (latency targets)
- [ ] Security review (no new data exposure)
- [ ] Documentation review (OpenAPI spec)
- [ ] Stakeholder approval

---

**Status:** Ready for implementation
**Priority:** Medium (enhances existing MVP, not blocking)
**Estimated Effort:** 2-3 weeks (phased rollout)

---

_This enhancement maintains the core PRD vision while adding flexibility for diverse integration patterns. Default behavior preserves backward compatibility while enabling optimization for specific use cases._
