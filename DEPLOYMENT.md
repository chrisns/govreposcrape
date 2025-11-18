# govreposcrape - Deployment Guide

This document provides setup instructions, configuration steps, and troubleshooting guidance for deploying govreposcrape to Google Cloud Platform.

## Table of Contents

- [Production Readiness Checklist](#production-readiness-checklist)
- [Deployment Procedure](#deployment-procedure)
- [Post-Deployment Verification](#post-deployment-verification)
- [Rollback Procedure](#rollback-procedure)
- [Smoke Tests](#smoke-tests)
- [Escalation Procedures](#escalation-procedures)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Production Readiness Checklist

**Use this checklist before deploying to production.** All items must be checked before proceeding with deployment.

### Tests and Quality

- [ ] **All tests passing:** Run `npm test` - 100% pass rate required
- [ ] **Integration tests complete:** Container ingestion pipeline tested with 100+ repos
- [ ] **Type checking passes:** Run `npm run type-check` - zero errors
- [ ] **Linting passes:** Run `npm run lint` - zero errors
- [ ] **Code formatted:** Run `npm run format:check` - all files formatted

### Security

- [ ] **Security audit complete:** Run `npm run security-audit` - zero high/critical findings
- [ ] **SECURITY.md reviewed:** Verify NCSC compliance checklist is current
- [ ] **No secrets in code:** Verify `.env` not committed, secrets use environment variables
- [ ] **Dependency scan clean:** Run `npm run security-audit:dependencies` - zero high/critical CVEs

### Cost Monitoring

- [ ] **Cost monitoring active:** Run `npm run cost-monitor` - dashboard accessible
- [ ] **Cost alerts configured:** Verify alerts set for >£40/month threshold
- [ ] **Cost projections reviewed:** Estimated monthly cost <£50/month (NFR-7.1 requirement)

### Documentation

- [ ] **README.md complete:** Quick start, API reference, integration examples present
- [ ] **SECURITY.md current:** NCSC standards documented, security checklist up-to-date
- [ ] **DEPLOYMENT.md current:** This guide reviewed and updated (if needed)
- [ ] **OpenAPI spec accessible:** Verify openapi.json available and valid

### Environment Configuration

- [ ] **Environment variables set:** All required vars in `.env` (see `.env.example`)
  - `GOOGLE_GEMINI_API_KEY` - Google Gemini API key
  - `GOOGLE_PROJECT_ID` - GCP project ID
  - `GOOGLE_PROJECT_NUMBER` - GCP project number
  - `GOOGLE_FILE_SEARCH_STORE_NAME` - File Search store (created on first run)
- [ ] **Service account configured:** `google-credentials.json` file present and valid
- [ ] **Docker available:** Run `docker --version` - Docker 20.10+ required
- [ ] **Container builds:** Run `docker build -t govreposcrape-container .` - builds successfully

### Deployment Prerequisites

- [ ] **Google Cloud account:** GCP project with Gemini API enabled
- [ ] **Gemini API key:** Valid API key from https://aistudio.google.com/apikey
- [ ] **Docker installed:** Docker Desktop or Docker Engine 20.10+
- [ ] **Node.js 18+:** Run `node --version` - v18.0.0 or higher
- [ ] **npm packages installed:** Run `npm install` - no errors

### Pre-Deployment Validation

- [ ] **Git status clean:** Run `git status` - no uncommitted changes (or commit them)
- [ ] **Branch up to date:** Pull latest from `main` branch
- [ ] **Smoke tests ready:** Verify `scripts/smoke-test.sh` is executable
- [ ] **Observability dashboard:** Metrics export working (Story 6.3)

---

## Deployment Procedure

Follow these steps in order to deploy govreposcrape to production.

### Step 1: Pre-Deployment Validation

```bash
# 1. Review production readiness checklist above
#    Ensure ALL items are checked before continuing

# 2. Verify git status
git status
# Expected: Clean working directory or ready to commit

# 3. Run full test suite
npm test
# Expected: All tests pass (100% pass rate)

# 4. Run security audit
npm run security-audit
# Expected: Zero high/critical findings

# 5. Run type checking
npm run type-check
# Expected: Zero type errors
```

### Step 2: Container Deployment

The govreposcrape project uses a Docker-based ingestion pipeline with Google File Search integration.

```bash
# 1. Build Docker container
docker build -t govreposcrape-container ./container

# Expected: Build completes successfully
# Build time: ~2-5 minutes depending on Docker cache

# 2. Verify container health
docker run --rm govreposcrape-container python -c "print('Container OK')"
# Expected: "Container OK" output

# 3. Test container with small ingestion run (10 repos)
docker run --rm \
  -e GOOGLE_GEMINI_API_KEY="$GOOGLE_GEMINI_API_KEY" \
  govreposcrape-container \
  python orchestrator.py --limit=10

# Expected: Successfully processes 10 repos, uploads to Google File Search
# Duration: ~2-5 minutes
# Success indicators:
#   - "Successfully processed: 10" in output
#   - No Python exceptions or errors
#   - File Search upload confirmations
```

### Step 3: Environment Configuration

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env with production values
# Set required variables:
#   - GOOGLE_GEMINI_API_KEY (from https://aistudio.google.com/apikey)
#   - GOOGLE_PROJECT_ID (from GCP console)
#   - GOOGLE_PROJECT_NUMBER (from GCP console)

# 3. Verify service account credentials
ls -la google-credentials.json
# Expected: File exists and is readable

# 4. Test Google Cloud authentication
docker run --rm \
  -v "$(pwd)/google-credentials.json:/app/google-credentials.json" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json \
  govreposcrape-container \
  python -c "from google.oauth2 import service_account; print('Auth OK')"
# Expected: "Auth OK" output
```

### Step 4: Full Production Deployment

```bash
# 1. Run full ingestion pipeline (all ~20k repos)
# WARNING: This will take 6-10 hours to complete
docker run --rm \
  -v "$(pwd)/google-credentials.json:/app/google-credentials.json" \
  -e GOOGLE_GEMINI_API_KEY="$GOOGLE_GEMINI_API_KEY" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json \
  govreposcrape-container \
  python orchestrator.py

# Expected outcomes:
#   - All repos processed successfully
#   - Summaries uploaded to Google File Search
#   - Search store created/updated
#   - No critical errors (some individual repo failures acceptable)

# 2. Monitor ingestion progress (optional - in separate terminal)
docker logs -f <container-id>

# 3. Verify ingestion completion
# Check final statistics in container output:
#   - Total repos processed
#   - Success rate (target: >95%)
#   - Upload confirmation count
```

### Deployment Timing Expectations

| Stage | Expected Duration | Acceptable Variance |
|-------|------------------|---------------------|
| Container build | 2-5 minutes | ±50% |
| Small test (10 repos) | 2-5 minutes | ±50% |
| Full ingestion (20k repos) | 6-10 hours | ±20% |
| File Search indexing lag | < 5 minutes | Per NFR-1.4 |

---

## Post-Deployment Verification

Run these checks immediately after deployment to verify success.

### Automated Smoke Tests

```bash
# Run smoke test suite
npm run smoke-test

# Expected output:
#   ✅ Container health check passed
#   ✅ Google File Search accessible
#   ✅ Test query returns results
#   ✅ Orchestrator import succeeds

# Test duration: ~30 seconds
```

### Manual Verification Steps

```bash
# 1. Health Check: Verify container environment
docker run --rm govreposcrape-container python -c "
from google_filesearch_client import GoogleFileSearchClient
client = GoogleFileSearchClient()
print(f'File Search store: {client.get_or_create_store()}')
"
# Expected: Store name printed (e.g., "govreposcrape-uk-code")

# 2. Test Query: Search for a known repository
docker run --rm \
  -e GOOGLE_GEMINI_API_KEY="$GOOGLE_GEMINI_API_KEY" \
  govreposcrape-container \
  python -c "
from google_filesearch_client import GoogleFileSearchClient
client = GoogleFileSearchClient()
results = client.search('authentication middleware', limit=5)
print(f'Search returned {len(results)} results')
for r in results[:3]:
    print(f'  - {r.get(\"metadata\", {}).get(\"url\", \"unknown\")}')
"
# Expected:
#   - "Search returned 5 results" (or similar)
#   - List of GitHub URLs

# 3. Verify Metrics Dashboard
npm run metrics-export
# Expected: Metrics exported successfully (from Story 6.3)
```

### Monitoring Dashboard Check

```bash
# Verify observability dashboard is receiving data
npm run cost-monitor
# Expected: Current costs displayed, no errors

# Check for alert configuration
npm run cost-monitor:alert
# Expected: Alerts configured and active
```

---

## Rollback Procedure

Use this procedure if deployment fails or critical issues are discovered.

### When to Rollback

Rollback immediately if:
- **Critical bug discovered:** Application crashes, data corruption, security vulnerability
- **Performance degradation:** Query response time >5s (vs. target <2s)
- **Cost spike:** Projected monthly cost >£75/month (1.5x target)
- **Integration failures:** Google File Search unavailable, Gemini API errors

### Rollback Steps

#### Option 1: Container Rollback (Recommended)

```bash
# 1. Identify previous working container
docker images | grep govreposcrape-container
# Find previous image tag/ID

# 2. Re-tag previous working image
docker tag <previous-image-id> govreposcrape-container:latest

# 3. Verify rollback
docker run --rm govreposcrape-container:latest python -c "print('Rollback OK')"

# 4. Run smoke tests against rolled-back version
npm run smoke-test
```

#### Option 2: Git Rollback

```bash
# 1. Identify last working commit
git log --oneline -10
# Find commit hash before problematic changes

# 2. Create rollback branch
git checkout -b rollback/<issue-description> <commit-hash>

# 3. Rebuild container from rolled-back code
docker build -t govreposcrape-container ./container

# 4. Verify rollback
npm run smoke-test
```

#### Option 3: File Search Store Rollback

```bash
# If File Search store is corrupted, create new store:

# 1. Set new store name in .env
GOOGLE_FILE_SEARCH_STORE_NAME=govreposcrape-uk-code-rollback-$(date +%Y%m%d)

# 2. Re-run ingestion to populate new store
docker run --rm \
  -e GOOGLE_GEMINI_API_KEY="$GOOGLE_GEMINI_API_KEY" \
  -e GOOGLE_FILE_SEARCH_STORE_NAME="$GOOGLE_FILE_SEARCH_STORE_NAME" \
  govreposcrape-container \
  python orchestrator.py --limit=100  # Start with 100 repos to test

# 3. Verify new store works
npm run smoke-test

# 4. Full re-ingestion (if test successful)
# (Remove --limit flag for full ingestion)
```

### Rollback Verification

After rollback, verify:
- [ ] Smoke tests pass (`npm run smoke-test`)
- [ ] Container health check passes
- [ ] Test queries return results
- [ ] No errors in container logs
- [ ] Monitoring dashboard shows normal metrics

### Rollback Decision Criteria

| Severity | Issue Type | Decision | Timeline |
|----------|-----------|----------|----------|
| **P1 (Critical)** | Service unavailable, data loss, security breach | Rollback immediately | < 5 minutes |
| **P2 (High)** | Degraded performance, high error rate (>5%) | Rollback within 30 minutes | Assess impact first |
| **P3 (Medium)** | Minor bugs, cosmetic issues | Fix forward | No rollback needed |

---

## Smoke Tests

Automated smoke tests are provided to quickly validate deployment success.

### Running Smoke Tests

```bash
# Default: Test local Docker container
npm run smoke-test

# Verbose output (for debugging)
./scripts/smoke-test.sh --verbose

# Syntax validation only (no actual execution)
./scripts/smoke-test.sh --test
```

### What Smoke Tests Validate

1. **Container Health:** Docker container runs without errors
2. **Python Environment:** All required packages importable
3. **Google File Search Client:** Can instantiate client and access store
4. **Orchestrator:** Main ingestion script imports successfully
5. **Environment Variables:** Required env vars are set

### Expected Smoke Test Output

```
🧪 govreposcrape Smoke Tests
============================

📦 Checking dependencies...
✅ Docker available (version 20.10.x)
✅ Python container image built

🔍 Running smoke tests...
Test 1/4: Container health check...     ✅ PASS (0.5s)
Test 2/4: Google File Search client...  ✅ PASS (1.2s)
Test 3/4: Test query execution...       ✅ PASS (2.1s)
Test 4/4: Orchestrator imports...       ✅ PASS (0.8s)

============================
✅ All tests passed (4/4)
Total duration: 4.6s
```

### Smoke Test Failure Handling

If smoke tests fail:

1. **Review error output:** Smoke test script provides detailed error messages
2. **Check environment variables:** Verify `.env` file has all required values
3. **Verify Docker status:** Run `docker ps` to see running containers
4. **Check Google Cloud credentials:** Ensure `google-credentials.json` is valid
5. **Review container logs:** Run `docker logs <container-id>` for details

---

## Escalation Procedures

Use these procedures when deployment issues cannot be resolved quickly.

### Escalation Contacts

| Role | Contact | Response Time |
|------|---------|---------------|
| **On-Call Engineer** | oncall@example.com | P1: Immediate<br>P2: 2 hours<br>P3: Next business day |
| **Project Lead** | (To be assigned) | Business hours only |
| **Google Cloud Support** | https://cloud.google.com/support | Per support plan SLA |

### Incident Severity Levels

#### P1 - Critical Outage
**Definition:** Service completely unavailable, data loss, security breach

**Response:**
- Immediate escalation to on-call engineer
- Page project lead (if after hours)
- Rollback immediately (don't wait for approval)
- Document incident in post-mortem

**Examples:**
- Container fails to start
- Google File Search store inaccessible
- Gemini API authentication failures
- Cost spike >£200/month

#### P2 - Degraded Service
**Definition:** Service functional but degraded, high error rate, performance issues

**Response:**
- Notify on-call engineer within 2 hours
- Assess impact and timeline for fix
- Consider rollback if fix ETA >4 hours
- Monitor closely

**Examples:**
- Ingestion failure rate >10%
- Query response time >5s
- Individual repo processing failures

#### P3 - Minor Issues
**Definition:** Cosmetic issues, minor bugs, documentation gaps

**Response:**
- Create GitHub issue for tracking
- Fix in next sprint
- No immediate escalation needed

**Examples:**
- Smoke test output formatting issues
- Documentation typos
- Non-critical log warnings

### Common Deployment Issues - Runbook

#### Issue: Container build fails

**Symptoms:** `docker build` command exits with error

**Resolution:**
1. Check Docker daemon is running: `docker ps`
2. Review build error output for missing dependencies
3. Clear Docker cache: `docker builder prune`
4. Retry build with no cache: `docker build --no-cache -t govreposcrape-container ./container`

#### Issue: Gemini API authentication failure

**Symptoms:** "API key invalid" or 401 Unauthorized errors

**Resolution:**
1. Verify API key in `.env` file: `grep GOOGLE_GEMINI_API_KEY .env`
2. Test API key directly: Visit https://aistudio.google.com/apikey
3. Regenerate API key if needed
4. Update `.env` with new key
5. Rebuild container to pick up new env var

#### Issue: File Search store not found

**Symptoms:** "Store not found" or "Failed to create store" errors

**Resolution:**
1. Check GCP project has Gemini API enabled
2. Verify service account has necessary permissions
3. Try creating new store manually:
   ```python
   from google_filesearch_client import GoogleFileSearchClient
   client = GoogleFileSearchClient()
   store_name = client.get_or_create_store()
   print(f"Store: {store_name}")
   ```
4. Update `GOOGLE_FILE_SEARCH_STORE_NAME` in `.env` with store name

#### Issue: Ingestion takes longer than expected

**Symptoms:** Full ingestion >12 hours (vs. expected 6-10 hours)

**Resolution:**
1. Check network connectivity: `ping google.com`
2. Verify Gemini API rate limits not exceeded
3. Monitor container logs for errors: `docker logs <container-id>`
4. Consider breaking ingestion into batches:
   ```bash
   docker run ... --limit=5000  # First 5000 repos
   docker run ... --offset=5000 --limit=5000  # Next 5000 repos
   ```

---

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
