# govreposcrape - Deployment Guide

This document provides setup instructions, configuration steps, and troubleshooting guidance for deploying govreposcrape to Cloudflare Workers.

## Prerequisites

- Cloudflare account with Workers enabled
- Node.js 18+ and npm installed
- Wrangler CLI installed (`npm install -g wrangler`)
- GitHub account for repository access

## Environment Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

This will open a browser window for authentication.

## AI Search Configuration (Epic 3 Story 3.1)

Cloudflare AI Search is a managed RAG (Retrieval-Augmented Generation) service that automatically indexes R2 bucket contents for semantic search.

### Dashboard Configuration Steps

1. **Access Cloudflare Dashboard**
   - Navigate to: https://dash.cloudflare.com/{your-account-id}/ai/search
   - Or: Cloudflare Dashboard → AI (left sidebar) → Search

2. **Create New AI Search Index**
   - Click "Create Index" button
   - Index name: `govreposcrape-search` (or your preferred name)
   - Description: "Semantic search over UK government repository code summaries"

3. **Configure R2 Source**
   ```yaml
   Source Type: R2 Bucket
   Bucket Name: govreposcrape-gitingest
   Path Prefix: gitingest/
   File Pattern: **/*.txt
   Content-Type Filter: text/plain
   ```

   **Important Notes:**
   - The R2 bucket `govreposcrape-gitingest` must already exist (created in Epic 2)
   - Path prefix `gitingest/` matches the upload structure from data ingestion pipeline
   - Content-Type `text/plain` is critical - matches Epic 2 R2 uploads
   - File pattern `**/*.txt` captures all gitingest summary files

4. **Configure Embedding and Chunking**
   ```yaml
   Embedding Model: @cf/baai/bge-large-en-v1.5
   Chunk Size: 384 tokens
   Chunk Overlap: 15%
   ```

   **Recommended Configuration:**
   - **Embedding Model:** `@cf/baai/bge-large-en-v1.5` (Workers AI)
     - 1,024 dimensions, 512 input tokens
     - Cost-effective (no external API costs)
     - Good semantic understanding for code and text
     - Alternative: `@cf/baai/bge-m3` for multilingual support

   - **Chunk Size:** 384 tokens
     - Balances context preservation with retrieval precision
     - Suitable for code functions/methods in gitingest summaries
     - Range: 64-512 tokens (adjust if needed based on testing)

   - **Chunk Overlap:** 15%
     - Maintains context across function/method boundaries
     - Reduces risk of splitting related code logic
     - Range: 0-30% (increase if context loss observed)

   **Configuration Notes:**
   - Smaller chunks (256 tokens) provide more precise matches but may fragment logic
   - Larger chunks (512 tokens) retain more context but reduce precision
   - Monitor retrieval quality and adjust if needed
   - See troubleshooting section if relevance issues occur

5. **Configure Retrieval and Generation**
   ```yaml
   Generation Model: Smart default (auto)
   Maximum Results: 10
   Match Threshold: 0.4
   Similarity Caching: Strong (High semantic similarity)
   Query Rewrite: Disabled
   Reranking: Disabled
   ```

   **Recommended Configuration:**
   - **Generation Model:** Smart default (auto)
     - Default: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
     - Used for RAG response generation (answering queries)
     - Note: This is separate from embedding model (configured in Step 4)

   - **Maximum Number of Results:** 10
     - Controls max results returned per query (corresponds to `top_k`)
     - Range: 0-50
     - Start with 10 for testing, adjust based on usage patterns
     - Higher values = more results but increased latency

   - **Match Threshold:** 0.4
     - Minimum similarity score for results (0.0-1.0)
     - 0.4 = moderate strictness (good starting point)
     - Lower (0.2-0.3) = more permissive, more results
     - Higher (0.6-0.8) = stricter matching, fewer but more relevant results

   - **Similarity Caching:** Strong (High semantic similarity)
     - Caches queries with similar semantic meaning
     - "Strong" = good balance between cost savings and result freshness
     - Reduces Workers AI costs for repeated/similar queries
     - Alternatives: Exact (near-identical only), Broad (more hits), Loose (max reuse)

   - **Query Rewrite:** Disabled (Phase 1)
     - Query expansion/reformulation for better search
     - Keep disabled initially to establish baseline performance
     - Enable in Phase 2 if query quality issues occur

   - **Reranking:** Disabled (Phase 1)
     - Improves result ordering but adds latency
     - Keep disabled initially for faster responses
     - Enable in Phase 2 if relevance issues occur

   **Configuration Notes:**
   - These settings are **Dashboard-only** (no IaC support currently)
   - See "Infrastructure as Code Limitations" section below
   - Adjust match threshold if getting too many/few results
   - Monitor query latency and adjust max results if needed

6. **Enable Continuous Monitoring**
   - Mode: Continuous monitoring (real-time)
   - Update frequency: Automatic (as files added/updated in R2)

7. **Activate Index**
   - Review configuration summary
   - Click "Activate" to start indexing
   - **Note:** Initial indexing may take time if R2 bucket is already populated (~21k repos)

### wrangler.toml Service Binding

The AI_SEARCH binding is already configured in `wrangler.jsonc`:

```jsonc
{
  "ai": [
    {
      "binding": "AI_SEARCH"
    }
  ]
}
```

**No ID is required** - the managed service automatically discovers your AI Search index.

### TypeScript Type Definitions

TypeScript types for AI_SEARCH binding are defined in `src/types.ts` and `worker-configuration.d.ts`:

```typescript
interface Env {
  AI_SEARCH: AISearchBinding;
  // ... other bindings
}
```

### Infrastructure as Code Limitations

**Current Status:** Cloudflare AI Search does **NOT support full IaC configuration** (as of 2025-11-13).

**What's NOT Supported:**
- ❌ No Terraform provider for AI Search
- ❌ No Wrangler CLI commands for index creation/configuration
- ❌ No API endpoints for programmatic configuration
- ❌ Dashboard-only configuration for:
  - Index creation and naming
  - R2 source configuration
  - Embedding model selection
  - Chunking parameters (size, overlap)
  - Retrieval settings (generation model, match threshold, caching)
  - Continuous monitoring settings

**What IS Supported via IaC:**
- ✅ Service binding in `wrangler.jsonc` (binding name only)
- ✅ TypeScript type definitions
- ✅ Health check endpoints and query logic in code
- ✅ Programmatic queries via Workers AI Search binding

**Workaround: Documentation + Validation**

Since full IaC isn't available, this deployment guide follows best practices:

1. **Comprehensive Documentation:** All configuration steps documented above
2. **Validation Script:** Health check endpoint validates configuration
3. **Configuration as Code (Future):**
   ```bash
   # scripts/validate-ai-search.sh
   #!/bin/bash
   set -e

   echo "Validating AI Search configuration..."

   HEALTH=$(curl -s https://your-worker.workers.dev/mcp/health)
   AI_SEARCH_STATUS=$(echo $HEALTH | jq -r '.services.ai_search.status')

   if [ "$AI_SEARCH_STATUS" != "ok" ]; then
     echo "❌ AI Search not configured or unhealthy"
     echo "Configure via: https://dash.cloudflare.com/ai/search"
     exit 1
   fi

   echo "✅ AI Search operational"
   ```

**Monitor for IaC Support:**
- [Cloudflare Terraform Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
- [Wrangler GitHub Repository](https://github.com/cloudflare/workers-sdk)
- Cloudflare AI Search API documentation

## Validating AI Search Baseline

### Using the Validation Script

The project includes an automated validation script that checks R2 bucket access, counts indexed files, and provides guidance for Dashboard validation:

```bash
./scripts/validate-ai-search-baseline.sh
```

**What the script validates:**

1. **R2 Bucket Accessibility**
   - Tests AWS CLI connectivity to R2 bucket
   - Verifies credentials from .env file

2. **Gitingest Summary File Count**
   - Counts total files uploaded to `gitingest/` prefix
   - Calculates ingestion progress (uploaded / 20,587 total repos)

3. **File Structure Validation**
   - Samples 5 files from R2 bucket
   - Verifies Content-Type: text/plain
   - Validates file size and content preview

4. **Dashboard Validation Guidance**
   - Provides direct link to Cloudflare AI Search Dashboard
   - Documents test queries to run
   - Expected baseline metrics

**Example Output:**
```
🔍 AI Search Indexing Baseline Validation
==========================================

✅ R2 Bucket: Accessible
✅ Gitingest Files: 3710 uploaded
✅ Ingestion Progress: 18.0%
✅ File Validation: 5/5 samples valid

🔍 Expected AI Search Index Size: ~3710 documents
   (Allow 5 minutes for indexing lag per NFR-1.4)
```

**Re-run periodically** during background ingestion to track progress.

## Testing AI Search Configuration

### Test 1: Upload Test File to R2

Upload a test file to validate AI Search is monitoring the bucket correctly:

```bash
# Create test file
echo "function authenticateUser(username, password) {
  return jwt.sign({ username }, SECRET_KEY);
}" > test-summary.txt

# Upload to R2 (replace with your bucket name)
wrangler r2 object put govreposcrape-gitingest/gitingest/test-org/test-repo/summary.txt \
  --file test-summary.txt \
  --content-type text/plain
```

### Test 2: Wait for Indexing

AI Search should index the file within **5 minutes** (NFR-1.4 requirement). You can check:
- Cloudflare Dashboard → AI Search → Your index → View indexed documents

### Test 3: Verify Health Check

The `/mcp/health` endpoint tests AI Search connectivity:

```bash
# Local development
wrangler dev
curl http://localhost:8787/mcp/health

# Production/Staging
curl https://your-worker.workers.dev/mcp/health
```

**Expected Response (200 OK):**
```json
{
  "status": "healthy",
  "services": {
    "kv": { "name": "KV Namespace", "status": "ok" },
    "r2": { "name": "R2 Bucket", "status": "ok" },
    "vectorize": { "name": "Vectorize Index", "status": "ok" },
    "d1": { "name": "D1 Database", "status": "ok" },
    "ai_search": { "name": "AI Search", "status": "ok" }
  },
  "timestamp": "2025-11-13T12:00:00.000Z"
}
```

**Expected Response if AI Search Unavailable (503 Service Unavailable):**
```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "One or more services are unavailable"
  },
  "details": {
    "status": "unhealthy",
    "services": {
      "ai_search": {
        "name": "AI Search",
        "status": "failed",
        "error": "AI Search service unavailable"
      }
    },
    "timestamp": "2025-11-13T12:00:00.000Z"
  }
}
```

### Test 4: Clean Up Test File

```bash
# Remove test file from R2
wrangler r2 object delete govreposcrape-gitingest/gitingest/test-org/test-repo/summary.txt

# Remove local test file
rm test-summary.txt
```

## Deployment

### Deploy to Staging

```bash
npm run deploy:staging
```

This deploys to the `staging` environment configured in `wrangler.jsonc`.

### Deploy to Production

```bash
npm run deploy:production
```

**Production Checklist:**
- [ ] All tests passing (`npm test`)
- [ ] Health check returns 200 OK
- [ ] AI Search index is active and indexing
- [ ] R2 bucket is populated with gitingest summaries
- [ ] No linting errors (`npm run lint`)
- [ ] Code formatted (`npm run format`)

## Monitoring

### Health Check Monitoring

Set up monitoring for the `/mcp/health` endpoint:

```bash
# Example using curl with monitoring tool
curl -f https://your-worker.workers.dev/mcp/health || echo "Health check failed"
```

**Recommended Monitoring:**
- Check `/mcp/health` every 5 minutes
- Alert if health check returns 503 for > 5 minutes
- Track AI Search response times (should be < 800ms p95)

### Cloudflare Workers Analytics

Access metrics at: Cloudflare Dashboard → Workers → Your Worker → Metrics

**Key Metrics to Monitor:**
- Request rate (requests/second)
- Error rate (should be < 0.1%)
- Response time (p50, p95, p99)
- AI Search query latency

## Troubleshooting

### AI Search Not Indexing Files

**Symptoms:**
- Files uploaded to R2 don't appear in AI Search
- Health check shows `ai_search: "unavailable"`

**Solutions:**
1. **Verify R2 bucket configuration in AI Search:**
   - Check bucket name matches exactly: `govreposcrape-gitingest`
   - Verify path prefix: `gitingest/` (with trailing slash)
   - Confirm file pattern: `**/*.txt`

2. **Check Content-Type:**
   - Files must be uploaded with `Content-Type: text/plain`
   - Verify existing files: `wrangler r2 object get govreposcrape-gitingest/gitingest/{org}/{repo}/summary.txt --metadata`

3. **Validate file format:**
   - AI Search expects plain text files
   - gitingest summaries should be UTF-8 encoded

4. **Review AI Search logs:**
   - Cloudflare Dashboard → AI Search → Your index → Logs
   - Look for indexing errors or warnings

### Health Check Returns 503

**Symptoms:**
- `/mcp/health` returns 503 status
- Response shows `ai_search: "failed"`

**Solutions:**
1. **Check AI Search service status:**
   - Cloudflare Dashboard → AI Search → Your index
   - Verify index status is "Active" (not "Paused" or "Error")

2. **Verify service binding:**
   - Check `wrangler.jsonc` has `"ai"` binding configured
   - Run `npm run cf-typegen` to regenerate types
   - Redeploy: `wrangler deploy`

3. **Test AI Search directly:**
   - Cloudflare Dashboard → AI Search → Your index → Test query
   - Enter test query: "authentication"
   - Verify results are returned

4. **Check Workers logs:**
   ```bash
   wrangler tail
   ```
   - Look for AI Search query errors
   - Review structured logs for error details

### AI Search Queries Timing Out

**Symptoms:**
- Health check intermittently fails
- AI Search query takes > 5 seconds

**Solutions:**
1. **Check index size:**
   - Large indexes (> 100k documents) may have slower query times
   - Consider index optimization if needed

2. **Verify R2 bucket health:**
   - R2 should be accessible and responsive
   - Test R2 connectivity: health check should show `r2: "ok"`

3. **Review query complexity:**
   - Health check uses minimal query: `top_k=1`
   - Ensure no heavy filters or complex operations

### Initial Indexing Taking Too Long

**Symptoms:**
- AI Search index shows "Indexing..." for > 1 hour
- Uploaded files not searchable after 5 minutes

**Expected Behavior:**
- Initial indexing of 21k repos may take 1-2 hours
- Individual file indexing should be < 5 minutes after initial index complete

**Solutions:**
1. **Wait for initial indexing to complete:**
   - Check index status in Cloudflare Dashboard
   - Progress indicator shows number of documents indexed

2. **Upload files in batches:**
   - If uploading large number of files, do in batches of 1000
   - Allow AI Search to catch up between batches

3. **Monitor indexing lag:**
   - Upload test file
   - Query every 30 seconds until found
   - Measure actual indexing lag (should be < 5 minutes once initial index complete)

### Poor Search Quality or Irrelevant Results

**Symptoms:**
- Query results don't match expected code/repositories
- Top results have low similarity scores (< 0.5)
- Relevant code not appearing in top 10 results

**Solutions:**
1. **Review chunking configuration:**
   - If results are too fragmented, increase chunk size (512 tokens)
   - If missing context at boundaries, increase overlap (20-25%)
   - Test queries with different chunk sizes to find optimal balance

2. **Consider alternative embedding model:**
   - Default: `@cf/baai/bge-large-en-v1.5` (good for English code)
   - Alternative: `@cf/baai/bge-m3` if repositories use multiple languages
   - Note: Changing model requires re-indexing entire R2 bucket

3. **Validate query phrasing:**
   - Use natural language: "authentication with JWT" not "jwt auth func"
   - Include context: "React component for user profile" not just "profile"
   - Test with sample queries from docs/PRD.md acceptance criteria

4. **Check indexed content:**
   - Verify gitingest summaries contain meaningful code snippets
   - Review sample R2 files to ensure content quality
   - If summaries are too brief, may need to adjust gitingest configuration

5. **Adjust search parameters:**
   - Increase `top_k` to review more results (5-20 range)
   - Review similarity score distribution
   - If all scores < 0.6, consider re-indexing with different model

**Escalation:**
- If search quality remains poor after tuning, document findings
- Evaluate migration to custom embeddings (Phase 2 Epic 3 decision point)
- See tech-spec-epic-3.md for custom embedding fallback plan

## Cost Monitoring

### AI Search Pricing

**Current Status:** AI Search is in Preview (pricing not finalized)

**Expected Costs (to be validated):**
- **Storage:** ~21k documents, estimated < £30/month
- **Queries:** Pay-per-query model (pricing TBD)
- **Target:** Total infrastructure < £50/month (NFR-7.1)

**Monitoring:**
- Cloudflare Dashboard → Billing → Usage
- Weekly cost review recommended during Preview phase
- Alert if AI Search costs > £25/month

**Cost Optimization:**
- Use minimal `top_k` values (1-5 results)
- Cache popular query results (Phase 2 enhancement)
- Monitor query volume and adjust if needed

## References

- [Cloudflare AI Search Documentation](https://developers.cloudflare.com/ai-search/)
- [AI Search Chunking Configuration](https://developers.cloudflare.com/ai-search/configuration/chunking/)
- [AI Search Supported Models](https://developers.cloudflare.com/ai-search/configuration/models/supported-models/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [govreposcrape Architecture](docs/architecture.md)
- [govreposcrape PRD](docs/PRD.md)
- [Epic 3 Technical Specification](docs/tech-spec-epic-3.md)

## Support

For issues or questions:
- Review [Troubleshooting](#troubleshooting) section above
- Check Cloudflare Workers logs: `wrangler tail`
- Review structured logs for error details
- Consult Cloudflare AI Search documentation
- Create issue in project repository with logs and error details
