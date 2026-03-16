# Migration Guide: Result Modes Feature

## Summary

The MCP API now supports three result detail levels (`minimal`, `snippets`, `full`) via an optional `resultMode` parameter. **Existing clients continue working without any changes.**

## Backward Compatibility Guarantee

### Zero Breaking Changes

✅ **Existing clients work identically:**
- Clients that don't send `resultMode` parameter receive **snippets mode** (current behavior)
- Response schema remains unchanged - all existing fields present
- API version stays at v1 (additive enhancement, not breaking change)

✅ **No action required:**
- No code changes needed for existing integrations
- No configuration updates required
- No migration deadline or deprecation

### Default Behavior

When `resultMode` parameter is omitted:
```json
{
  "query": "authentication methods",
  "limit": 5
  // resultMode omitted
}
```

API defaults to `"snippets"` mode - identical to current production behavior:
```json
{
  "results": [/* snippet results with code excerpts */],
  "metadata": {...},
  "mode": "snippets"
}
```

## Migration Scenarios

### Scenario 1: No Migration Needed

**Who:** Clients satisfied with current response format

**Action:** None - continue using API without changes

**Example:**
```typescript
// Existing code - no changes needed
const results = await fetch('https://api.../mcp/search', {
  method: 'POST',
  body: JSON.stringify({ query: 'OAuth2', limit: 5 })
});
// Still works - receives snippets mode by default
```

---

### Scenario 2: Optimize for Speed (Switch to Minimal Mode)

**Who:** Clients building repository lists, low-bandwidth scenarios, fast browsing

**Benefit:** ~3x faster response time, ~5x smaller payload

**Before (implicit snippets mode):**
```json
POST /mcp/search
{
  "query": "authentication",
  "limit": 10
}
// Response: ~50KB, ~700ms
```

**After (explicit minimal mode):**
```json
POST /mcp/search
{
  "query": "authentication",
  "limit": 10,
  "resultMode": "minimal"
}
// Response: ~10KB, ~250ms
```

**Code Changes:**

**TypeScript:**
```diff
 const response = await fetch(`${API_URL}/mcp/search`, {
   method: 'POST',
   body: JSON.stringify({
     query: searchQuery,
     limit: 10,
+    resultMode: 'minimal'
   })
 });
```

**Python:**
```diff
 response = requests.post(
     f"{api_url}/mcp/search",
     json={
         "query": query,
         "limit": 10,
+        "resultMode": "minimal"
     }
 )
```

**cURL:**
```diff
 curl -X POST "${API_URL}/mcp/search" \
   -H "Content-Type: application/json" \
   -d '{
     "query": "authentication",
     "limit": 10,
+    "resultMode": "minimal"
   }'
```

**When to Migrate to Minimal:**
- Building dropdown lists or autocomplete
- Mobile clients with limited bandwidth
- Fast initial discovery before detailed investigation
- You only need repository metadata (org, name, language, score)

---

### Scenario 3: Enhance for Deep Analysis (Switch to Full Mode)

**Who:** CLI tools, research projects, code review workflows, dependency analysis

**Benefit:** Complete gitingest summaries, repository stats, dependencies

**Before (implicit snippets mode):**
```json
POST /mcp/search
{
  "query": "microservices patterns",
  "limit": 3
}
// Response: Basic snippet with 3-5 lines of code
```

**After (explicit full mode):**
```json
POST /mcp/search
{
  "query": "microservices patterns",
  "limit": 3,
  "resultMode": "full"
}
// Response: Complete gitingest summary + repository stats + dependencies
```

**Code Changes:**

**TypeScript:**
```diff
 const response = await fetch(`${API_URL}/mcp/search`, {
   method: 'POST',
   body: JSON.stringify({
     query: searchQuery,
-    limit: 10,
+    limit: 3,  // Reduce limit for full mode (larger payloads)
+    resultMode: 'full'
   })
 });

 const data = await response.json();

 // Now you can access additional fields:
+data.results[0].gitingest_summary  // Complete Markdown summary
+data.results[0].repository_stats   // Contributors, commits, issues
+data.results[0].dependencies       // Parsed from package manifests
+data.results[0].readme_excerpt     // First 500 chars of README
```

**Python:**
```diff
 response = requests.post(
     f"{api_url}/mcp/search",
     json={
         "query": query,
-        "limit": 10,
+        "limit": 3,
+        "resultMode": "full"
     }
 )

 data = response.json()

 # Access full mode fields:
+for result in data['results']:
+    print(result['gitingest_summary'])
+    print(result['repository_stats'])
+    print(result['dependencies'])
```

**When to Migrate to Full:**
- CLI tools needing complete repository context
- Research requiring comprehensive data
- Code review analyzing architecture
- Dependency audits and security scanning
- Understanding project structure and patterns

---

### Scenario 4: Mixed Usage (Dynamic Mode Selection)

**Who:** Applications with different use cases in different contexts

**Approach:** Choose mode based on user action

**Example: Repository Browser Application**

```typescript
// Fast browsing mode for list view
async function browseRepositories(query: string) {
  return await search(query, {
    limit: 20,
    resultMode: 'minimal'  // Fast list building
  });
}

// Default mode for search results
async function searchCode(query: string) {
  return await search(query, {
    limit: 5,
    resultMode: 'snippets'  // Code previews
  });
}

// Detailed mode for repository details page
async function getRepositoryDetails(query: string, repoName: string) {
  return await search(`${query} repo:${repoName}`, {
    limit: 1,
    resultMode: 'full'  // Complete context
  });
}
```

---

## Testing Migration

### 1. Validate Current Behavior

Test that default mode works (no `resultMode` parameter):

```bash
# Should return snippets mode (current behavior)
curl -X POST "${API_URL}/mcp/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 1}' | jq '.mode'
# Expected output: "snippets"
```

### 2. Test New Modes

```bash
# Test minimal mode
curl -X POST "${API_URL}/mcp/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 1, "resultMode": "minimal"}' | jq '.mode'
# Expected: "minimal"

# Test full mode
curl -X POST "${API_URL}/mcp/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 1, "resultMode": "full"}' | jq '.mode'
# Expected: "full"
```

### 3. Verify Error Handling

```bash
# Test invalid mode (should return 400 error)
curl -X POST "${API_URL}/mcp/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "resultMode": "invalid"}' | jq '.error'
# Expected: {"code": "INVALID_RESULT_MODE", "message": "...", "allowed_values": [...]}
```

## Performance Impact

### Response Times (p95)

| Mode | Before Feature | After Feature | Change |
|------|----------------|---------------|--------|
| Default (snippets) | ~700ms | ~700ms | No change |
| Minimal (new) | N/A | ~250ms | 3x faster |
| Full (new) | N/A | ~2100ms | Slower, but comprehensive |

### Bandwidth Usage (5 results)

| Mode | Payload Size | vs. Default |
|------|-------------|-------------|
| Minimal | ~10KB | -80% |
| Snippets (default) | ~50KB | Baseline |
| Full | ~250KB | +400% |

## Error Handling Updates

### New Error Code: `INVALID_RESULT_MODE`

**When:** Client sends invalid `resultMode` value

**Status:** 400 Bad Request

**Response:**
```json
{
  "error": {
    "code": "INVALID_RESULT_MODE",
    "message": "resultMode must be one of: minimal, snippets, full",
    "allowed_values": ["minimal", "snippets", "full"]
  }
}
```

**Client Handling:**
```typescript
try {
  const response = await search(query, { resultMode: userMode });
  return response.data;
} catch (error) {
  if (error.response?.data?.error?.code === 'INVALID_RESULT_MODE') {
    // Fallback to default mode
    console.warn('Invalid mode, using default');
    return await search(query, {}); // Omit resultMode
  }
  throw error;
}
```

## MCP Client Configuration

### Claude Desktop

**Before:**
```json
{
  "mcpServers": {
    "govscraperepo": {
      "command": "node",
      "args": ["mcp-client.js"],
      "env": {
        "API_URL": "https://api..."
      }
    }
  }
}
```

**After (optional optimization):**
```json
{
  "mcpServers": {
    "govscraperepo": {
      "command": "node",
      "args": ["mcp-client.js"],
      "env": {
        "API_URL": "https://api...",
        "DEFAULT_RESULT_MODE": "snippets"  // or "minimal" for faster responses
      }
    }
  }
}
```

## Rollout Plan

### Phase 1: Opt-in (Now)

- Feature available immediately
- Existing clients unaffected (default to snippets mode)
- New clients can adopt minimal or full modes

### Phase 2: Monitor Adoption (4 weeks)

- Track mode usage distribution
- Collect feedback from early adopters
- Optimize performance based on real usage

### Phase 3: Recommend Best Practices (8 weeks)

- Document optimal mode choices per use case
- Update integration guides with mode recommendations
- Share performance benchmarks

**No Phase 4 - No Deprecation:** Default behavior (snippets mode) is permanent.

## FAQs

### Q: Do I need to update my client code?

**A:** No - existing clients work identically. The `resultMode` parameter is optional.

### Q: What happens if I don't specify `resultMode`?

**A:** You get snippets mode (current behavior) - no change from before.

### Q: Will the API version change?

**A:** No - stays at v1. This is an additive enhancement, not a breaking change.

### Q: Can I mix modes in one application?

**A:** Yes - choose mode per request based on use case (e.g., minimal for lists, full for details).

### Q: What if I send an invalid mode?

**A:** You get a 400 error with `INVALID_RESULT_MODE` code and list of allowed values.

### Q: Is there a performance penalty for using default mode?

**A:** No - snippets mode (default) has identical performance to current API.

### Q: How do I know which mode to use?

**A:** See the [Result Modes Usage Guide](./result-modes.md) for decision tree and recommendations.

## Support

For questions or migration assistance:

- Usage Guide: [api/docs/result-modes.md](./result-modes.md)
- Performance Documentation: [api/docs/performance.md](./performance.md)
- Code Examples: `api/examples/result-modes/`
- OpenAPI Spec: `/docs` (Swagger UI)
- GitHub Issues: https://github.com/alphagov/govreposcrape/issues

## Changelog

**Version 1.1 (2025-11-19):**
- Added `resultMode` parameter (optional, default: "snippets")
- Added minimal mode (metadata only, <500ms, ~1KB)
- Added full mode (complete summaries, <3000ms, ~50KB)
- Default behavior unchanged (backward compatible)
