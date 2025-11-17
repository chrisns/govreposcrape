# Sprint Change Proposal: Full Migration to Google Cloud Platform

**Date:** 2025-11-17
**Author:** BMad Correct Course Workflow
**Project:** govreposcrape
**Scope Classification:** **MAJOR** - Fundamental platform replan required
**Status:** Pending Approval

---

## Executive Summary

This proposal documents a **fundamental platform migration** from Cloudflare-based infrastructure to Google Cloud Platform triggered by Cloudflare AI Search (AutoRAG) indexing failure. The change affects all 6 epics and requires complete architectural redesign.

**Key Changes:**
- **Remove:** All Cloudflare infrastructure (Workers, R2, KV, Vectorize, AI Search)
- **Add:** Google Cloud Run (API hosting), Google File Search (semantic search), Google Cloud Storage (optional)
- **Result Count:** Increase from 5 to 20 results for maximum context
- **Architecture:** Edge compute (Cloudflare Workers) → Regional serverless containers (Cloud Run)

**Impact:**
- **Timeline:** +40-60 hours implementation effort (vs 15-20 hours hybrid approach)
- **Cost:** Revised from <£50/month to ~$50-80/month (Google Cloud billing)
- **Benefits:** Single vendor, production SLA, proven semantic search, poll-based indexing completion

---

## Section 1: Issue Summary

### Triggering Event

**Story:** Epic 3 (AI Search Integration) - Stories 3.1-3.4
**Issue Type:** Failed approach requiring different solution

**Problem Statement:**

> Cloudflare AI Search (AutoRAG Preview service) is not completing the indexing process for ~21,000 UK government repository gitingest summaries. The indexing operation has stalled indefinitely with no completion timeline, blocking Epic 3 completion and preventing the MCP API from returning search results. This blocks the entire MVP as semantic search is the core product value proposition.

**Evidence:**
- Cloudflare AI Search is in Preview (not GA) with unknown pricing and no SLA
- Indexing process has hung with no visibility into completion status
- No error messages or completion guarantees from managed service
- User has already provisioned Google Cloud credentials (GOOGLE_PROJECT_NUMBER, GOOGLE_PROJECT_ID, GOOGLE_PROJECT_NAME, GOOGLE_GEMINI_API_KEY), indicating readiness to pivot

**Technical Constraint:** Cloudflare's Preview service lacks production readiness and reliability guarantees needed for MVP delivery.

---

## Section 2: Impact Analysis

### 2.1 Epic Impact Summary

| Epic | Original Plan | Change Impact | New Status | Effort |
|------|--------------|---------------|------------|--------|
| **Epic 1: Foundation** | Cloudflare Workers setup | Complete platform change to Cloud Run | 🔴 Major Rewrite | 8-10h |
| **Epic 2: Ingestion** | Container → R2 → AI Search | Container → Google File Search | 🟡 Moderate Change | 6-8h |
| **Epic 3: AI Search** | Cloudflare AI Search integration | Complete replacement with Google File Search | 🔴 Complete Rewrite | 8-10h |
| **Epic 4: MCP API** | Workers-based API | Cloud Run container API | 🔴 Major Rewrite | 10-12h |
| **Epic 5: Documentation** | Cloudflare-focused docs | Google Cloud-focused docs | 🟡 Moderate Update | 3-4h |
| **Epic 6: Operations** | Cloudflare Analytics | Google Cloud Monitoring | 🟡 Moderate Update | 4-6h |

**Total Estimated Effort:** 40-60 hours

---

### 2.2 Detailed Epic Analysis

#### Epic 1: Foundation & Infrastructure Setup

**Status:** 🔴 **MAJOR REWRITE**

**OLD Approach:**
```bash
npm create cloudflare@latest govreposcrape -- --type hello-world --ts
# Provision: D1, KV, Vectorize, R2, AI Search
# Configure: wrangler.toml
# Deploy: wrangler deploy
```

**NEW Approach:**
```bash
# Create Node.js/TypeScript project
npm init -y
npm install express @google/genai

# Create Dockerfile for Cloud Run
# Configure: cloudbuild.yaml or gcloud CLI
# Deploy: gcloud run deploy govreposcrape-api \
#   --source . \
#   --platform managed \
#   --region us-central1
```

**Changes Required:**
- ✅ Remove: wrangler.toml, all Cloudflare service bindings
- ✅ Add: Dockerfile, Cloud Run configuration, Google API credentials
- ✅ Replace: @cloudflare/workers-types → @types/node, @types/express
- ✅ Update: TypeScript config for Node.js target (not workerd)

**Story Modifications:**
- **Story 1.1:** Rewrite for Cloud Run initialization (not Workers)
- **Story 1.2:** Update TypeScript config for Node.js runtime
- **Story 1.3:** Keep logging foundation (portable across platforms)
- **Story 1.4:** Rewrite deployment pipeline for Cloud Run

**Estimated Effort:** 8-10 hours

---

#### Epic 2: Data Ingestion Pipeline

**Status:** 🟡 **MODERATE CHANGE** (Simplification)

**OLD Approach:**
```python
# container/orchestrator.py
fetch_repos() → check_kv_cache() → gitingest() → upload_to_r2()
```

**NEW Approach:**
```python
# container/orchestrator.py
fetch_repos() → gitingest() → upload_to_google_file_search()
```

**Changes Required:**
- ❌ **DELETE:** Story 2.2 (Smart Caching with KV) - Google handles deduplication
- 🔄 **REPLACE:** Story 2.4 (R2 Storage) → Google File Search Upload
  - `container/r2_client.py` → `container/google_filesearch_client.py`
  - Use `@google/genai` SDK's `uploadToFileSearchStore()` method
  - Add operation polling for completion tracking
- ✅ **KEEP:** Story 2.5 (Parallel Execution) - Google API supports concurrency
- 🔄 **SIMPLIFY:** Story 2.6 (Orchestrator) - Removes cache check complexity

**New Python Dependencies:**
```python
# requirements.txt
gitingest==0.1.0
google-generativeai==0.3.0  # Official Google Gemini SDK
```

**Implementation Example:**
```python
from google import genai

client = genai.Client(api_key=os.getenv('GOOGLE_GEMINI_API_KEY'))

# Create File Search Store (one-time)
store = client.aio.file_search_stores.create(
    config={'displayName': 'govreposcrape-uk-code'}
)

# Upload gitingest summary
operation = await client.aio.file_search_stores.upload_to_file_search_store(
    file=summary_content,
    file_search_store_name=store.name,
    config={
        'displayName': f'{org}/{repo}',
        'customMetadata': {
            'org': org,
            'repo': repo,
            'pushedAt': pushed_at,
            'url': repo_url
        }
    }
)

# Poll for completion
while not operation.done:
    await asyncio.sleep(5)
    operation = await client.aio.operations.get(operation=operation.name)
```

**Estimated Effort:** 6-8 hours

---

#### Epic 3: AI Search Integration

**Status:** 🔴 **COMPLETE REPLACEMENT**

**OLD Approach (Cloudflare AI Search):**
```typescript
// src/search/ai-search-client.ts
const results = await env.AI_SEARCH.query({
  query: userQuery,
  limit: 5
});
```

**NEW Approach (Google File Search):**
```typescript
// src/search/google-filesearch-client.ts
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: userQuery,
  config: {
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [process.env.GOOGLE_FILE_SEARCH_STORE_NAME]
      }
    }],
    response_mime_type: 'application/json'
  }
});

// Extract results with grounding metadata
const results = response.candidates[0].groundingMetadata.retrievalQueries;
```

**Story Replacements:**
- ❌ **DELETE:** Story 3.1 (Cloudflare AI Search Configuration)
- 🔄 **REPLACE:** Story 3.2 (Query API Integration) → Google File Search queries
- 🔄 **MODIFY:** Story 3.3 (Result Enrichment) → Parse Google's grounding metadata
- ✅ **KEEP:** Story 3.4 (Performance Validation) → Test Google instead of Cloudflare

**Key Changes:**
- Result count: 5 → **20 results** (maximum context per user request)
- Response format: Includes grounding metadata for citation transparency
- Model: gemini-2.5-flash (fast) or gemini-2.5-pro (higher quality)

**Estimated Effort:** 8-10 hours

---

#### Epic 4: MCP API Server

**Status:** 🔴 **MAJOR REWRITE** (Workers → Cloud Run)

**OLD Approach (Cloudflare Workers):**
```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle MCP protocol
  }
}
```

**NEW Approach (Cloud Run with Express):**
```typescript
// src/index.ts
import express from 'express';
import { searchController } from './api/search-endpoint';

const app = express();
app.use(express.json());

app.post('/mcp/search', searchController);
app.get('/mcp/health', healthController);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`MCP API listening on port ${PORT}`);
});
```

**Dockerfile:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

**Story Modifications:**
- 🔄 **Story 4.1:** MCP protocol handler → Express middleware pattern
- 🔄 **Story 4.2:** Search endpoint → Call Google File Search (20 results)
- ✅ **Story 4.3:** Error handling remains portable

**Key Differences:**
- Runtime: workerd → Node.js 20+
- Framework: Native fetch handlers → Express.js
- Deployment: wrangler → gcloud run deploy
- Scaling: Cloudflare automatic → Cloud Run autoscaling (0-100 instances)

**Estimated Effort:** 10-12 hours

---

#### Epic 5: Developer Experience & Documentation

**Status:** 🟡 **MODERATE UPDATE**

**Documentation Changes Required:**

1. **Integration Guides (Story 5.1):**
   - MCP endpoint URL: `https://govreposcrape-api-<hash>.run.app` (Cloud Run)
   - Remove Cloudflare-specific setup steps
   - Add Google Cloud API key generation steps

2. **OpenAPI Spec (Story 5.2):**
   - Update `servers` section with Cloud Run URL
   - No API contract changes (MCP v2 response format unchanged)

3. **Examples (Story 5.3):**
   - cURL examples: Update endpoint URL
   - No code changes (MCP API contract stable)

**Estimated Effort:** 3-4 hours

---

#### Epic 6: Operational Excellence

**Status:** 🟡 **MODERATE UPDATE**

**Monitoring Changes:**

**OLD (Cloudflare Analytics):**
- Cloudflare Workers dashboard
- R2/KV/AI Search usage metrics
- wrangler tail for logs

**NEW (Google Cloud Monitoring):**
- Cloud Run metrics (request count, latency, errors)
- Cloud Logging for structured logs
- Cloud Monitoring dashboards
- File Search API usage from Gemini API quotas

**Cost Monitoring (Story 6.1):**

**OLD Model:** <£50/month (Cloudflare free tiers)
- Workers: Free (100k req/day)
- R2: ~£0.015/month
- KV: Free
- AI Search: Unknown Preview pricing

**NEW Model:** ~$50-80/month (Google Cloud)
- Cloud Run: ~$5-10/month (low traffic, generous free tier: 2M requests/month)
- File Search indexing: ~$37.50 one-time (21k repos × ~250M tokens × $0.15/1M)
- Gemini API queries: ~$10-20/month (estimated 1000 queries/day × $0.00025/1k chars)
- Cloud Logging: Free tier covers MVP

**Security Compliance (Story 6.2):**
- Update for Google API key management (Secret Manager)
- NCSC standards still apply (HTTPS, input validation, audit logging)
- Dependency scanning: npm audit (unchanged)

**Estimated Effort:** 4-6 hours

---

## Section 3: Artifact Conflicts and Required Updates

### 3.1 PRD (docs/PRD.md)

**Section:** Product Scope → MVP

**Lines 216-247: Data Pipeline & Search**

OLD:
```markdown
**2. AI Search Auto-Indexing (Managed Service)**
- **Cloudflare AI Search** (formerly AutoRAG) automatically indexes R2 bucket contents
- **Zero custom embedding code** - AI Search handles embedding generation, vectorization, and indexing
- Continuous updates as new gitingest files added to R2

**3. MCP v2 API Server (Read Path - Thin Wrapper)**
- Cloudflare Workers hosting MCP v2 protocol endpoints
- JWT authentication for API access (15-minute tokens, refresh flow)
- Rate limiting: 100 requests/minute per token
```

NEW:
```markdown
**2. Google File Search Integration**
- **Google File Search API** indexes uploaded gitingest summaries via uploadToFileSearchStore
- **Managed semantic search** - Handles embedding generation, chunking, and Gemini-powered retrieval
- Poll-based completion tracking ensures reliable indexing
- Production SLA-backed service

**3. MCP v2 API Server (Cloud Run Deployment)**
- Google Cloud Run hosting MCP v2 protocol endpoints
- Open access (no authentication required for MVP)
- Platform-level rate limiting via Cloud Run quotas
- **Return top 20 results** for maximum context availability
- Grounding metadata for result citation transparency
```

---

**Lines 614-628: Innovation → Smart Caching**

❌ **DELETE ENTIRE SECTION**

Rationale: Google File Search has built-in deduplication. The "Metadata-Based Smart Caching" innovation claim is no longer applicable.

---

**Lines 1798-1824: NFR-7.1 Cost Requirements**

OLD:
```markdown
**NFR-7.1: MVP Infrastructure Cost**
- **Target:** < £50/month for ~21,000 repos, 100 queries/day
- **Breakdown (estimated):**
  - Cloudflare Workers: £0 (free tier: 100k req/day)
  - Cloudflare R2: £0 (free tier: 10GB storage)
  - Cloudflare AI Search: £TBD (Preview pricing unknown)
```

NEW:
```markdown
**NFR-7.1: MVP Infrastructure Cost**
- **Target:** ~$50-80/month for ~21,000 repos, 1000 queries/day
- **Breakdown:**
  - Google Cloud Run: ~$5-10/month (2M requests/month free tier covers most usage)
  - Google File Search indexing: ~$37.50 one-time (250M tokens × $0.15/1M)
  - Gemini API queries: ~$10-20/month (1000 queries/day × avg 4k chars/query)
  - Cloud Logging: Free tier sufficient
- **Rationale:** Predictable pricing with production SLA vs unknown Preview costs
```

---

### 3.2 Architecture (docs/architecture.md)

**Lines 33-51: Decision Summary Table**

REMOVE:
```markdown
| Platform | Cloudflare Workers | Latest | All |
| Data Storage | Cloudflare R2 | Managed | Epic 2, 3 |
| Cache | Cloudflare KV | Managed | Epic 2 |
| Search | Cloudflare AI Search | Managed | Epic 3, 4 |
| Build Tool | esbuild (via wrangler) | 4.47.0+ | All |
```

ADD:
```markdown
| Platform | Google Cloud Run | Latest | All |
| Container Runtime | Docker + Node.js 20 | 20 LTS | All |
| Search & Storage | Google File Search | Latest | Epic 2, 3, 4 |
| AI Models | Gemini 2.5 Flash/Pro | Latest | Epic 3, 4 |
| Build Tool | tsc + Docker | TypeScript 5.9+ | All |
| Deployment | gcloud CLI | Latest | All |
```

---

**Lines 53-103: Project Structure**

REMOVE:
```
├── wrangler.toml            # Cloudflare Workers config
├── src/ingestion/cache.ts   # KV caching
```

ADD:
```
├── Dockerfile               # Cloud Run container
├── cloudbuild.yaml          # Google Cloud Build config
├── .gcloudignore           # Deployment exclusions
```

---

**Lines 831-843: ADR-001**

REPLACE:
```markdown
### ADR-001: Cloudflare Workers as Primary Platform

**Decision:** Use Cloudflare Workers with managed R2, KV, and AI Search.

**Rationale:**
- <£50/month cost target achievable with free/low-cost tiers
- Edge deployment for <2s response time globally
```

WITH:
```markdown
### ADR-001: Google Cloud Platform as Primary Platform

**Decision:** Use Google Cloud Run with Google File Search and Gemini API.

**Rationale:**
- Production SLA-backed services (vs Cloudflare Preview services)
- Proven semantic search with completion guarantees
- Single vendor simplicity (all Google)
- Container-native deployment flexibility
- Predictable costs: ~$50-80/month with clear billing

**Context:** Original decision was Cloudflare Workers, invalidated by AI Search Preview service unreliability (indexing never completes). Pivot to Google ensures MVP delivery timeline.
```

---

### 3.3 Epics (docs/epics.md)

**Epic 2 Changes:**

Lines 229-262: **Story 2.2 - Smart Caching with KV**
❌ **DELETE ENTIRE STORY** (Google File Search handles deduplication)

Lines 307-340: **Story 2.4 - R2 Storage**
🔄 **REPLACE WITH:**

```markdown
### Story 2.4: Google File Search Upload with Metadata Tracking

As a **data pipeline engineer**,
I want **to upload gitingest summaries to Google File Search Store with metadata**,
So that **files are indexed for semantic search and we can track upload status**.

**Acceptance Criteria:**

**Given** a gitingest summary has been generated (Story 2.3)
**When** I upload the summary to Google File Search
**Then** the file is uploaded via `uploadToFileSearchStore()` API
**And** custom metadata is attached: `org`, `repo`, `pushedAt`, `url`
**And** operation status is polled until `done: true`

**Given** an upload operation may fail (network error, API quota)
**When** upload encounters an error
**Then** it retries with exponential backoff (3 attempts)
**And** failure is logged with repo details and error message
**And** failed uploads don't block processing of other repositories

**And** Upload module has methods: uploadSummary(org, repo, content, metadata), pollOperation(operationName)
**And** Upload statistics are logged: total uploaded, failed, pending operations
**And** Operation completion ensures file is searchable before reporting success

**Prerequisites:** Story 2.3 (gitingest processing)

**Technical Notes:**
- Google Gemini SDK: `@google/genai` for TypeScript/Node.js
- Poll operation every 5 seconds until completion
- Custom metadata enables filtering in search queries
- Module location: container/google_filesearch_client.py
```

---

**Epic 3 Changes:**

**ALL STORIES 3.1-3.4:** 🔴 **COMPLETE REWRITE**

Replace "Cloudflare AI Search" → "Google File Search" throughout
Add poll-based completion tracking
Update API integration examples for Gemini SDK

---

**Epic 4 Changes:**

Lines 619-706: **ALL STORIES 4.1-4.3**
🔄 **UPDATE** for Cloud Run Express.js patterns instead of Workers fetch handlers

---

## Section 4: Recommended Approach

**Selected Path:** **Option 1 - Direct Adjustment** (with expanded scope)

### Approach Justification

**Why Direct Adjustment (Not Rollback or MVP Review):**
1. **Completed Work Preserved:** Epic 2 container/gitingest processing is working and reusable
2. **Architecture Simplification:** Removes KV cache complexity, consolidates to single vendor
3. **Unblocks MVP:** Google File Search has production SLA and proven semantic search
4. **Timeline Acceptable:** 40-60 hours vs indefinite Cloudflare AI Search blocker

**Why Full Google (Not Hybrid Cloudflare/Google):**
1. **Single Vendor Simplicity:** Reduces operational complexity, unified billing
2. **Ecosystem Integration:** Cloud Run + File Search + Gemini API work seamlessly
3. **Container-Native:** Already using containers for ingestion, extend to API hosting
4. **Production Readiness:** All Google services are GA (not Preview)

### Implementation Strategy

**Phase 1: Preserve Current Work (1-2 hours)**
```bash
git add -A
git commit -m "chore: checkpoint before Google Cloud migration"
git checkout -b archive/cloudflare-implementation
git push -u origin archive/cloudflare-implementation
git checkout main
git checkout -b feat/google-cloud-migration
```

**Phase 2: Container Layer Migration (6-8 hours)**
- Install Google Gemini SDK in container
- Implement `google_filesearch_client.py`
- Update orchestrator to call Google instead of R2
- Test with small batch (100 repos)

**Phase 3: API Layer Migration (10-12 hours)**
- Create Dockerfile for Cloud Run
- Implement Express.js MCP endpoints
- Integrate Google File Search query API
- Update to return 20 results (not 5)
- Test locally with `docker run`

**Phase 4: Deployment Setup (4-6 hours)**
- Configure Google Cloud project
- Create File Search Store (one-time)
- Deploy to Cloud Run
- Verify MCP endpoint accessibility

**Phase 5: Documentation & Operations (6-8 hours)**
- Update PRD, Architecture, Epics
- Update integration guides
- Configure Cloud Monitoring
- Create cost tracking dashboard

**Phase 6: Testing & Validation (8-12 hours)**
- Run full ingestion (21k repos)
- Performance testing (query latency)
- Integration testing (Claude Desktop, MCP)
- Validate 20-result responses

---

## Section 5: Change Scope Classification

**Scope:** **MAJOR** - Fundamental replan required

**Rationale:**
- Changes fundamental platform decision (Cloudflare → Google Cloud)
- Affects all 6 epics
- Invalidates ADR-001 (core architecture decision)
- Requires PM/Architect involvement per workflow guidelines

**Handoff Recipients:**
- **Product Manager:** Cost model approval (~$50-80/month vs <£50/month)
- **Solution Architect:** Platform migration review and approval
- **Development Team:** Implementation after approval

---

## Section 6: Implementation Handoff Plan

### Pre-Implementation Checklist

Before starting implementation:
- ✅ Commit all current Cloudflare work to archive branch
- ✅ Create Google Cloud project and enable APIs
  - File Search API
  - Gemini API
  - Cloud Run API
  - Cloud Build API
- ✅ Generate and securely store Google API keys
- ✅ Review and approve revised cost structure
- ✅ Update project documentation (PRD, Architecture, Epics)

### Implementation Sequence

**Week 1: Container & Ingestion Layer**
1. Story 2.4: Google File Search upload implementation
2. Story 2.6: Orchestrator simplification (remove KV cache)
3. Testing: Upload 100 sample repos, verify indexing completion

**Week 2: API & Deployment Layer**
1. Epic 4: Cloud Run Express.js MCP API
2. Epic 3: Google File Search query integration (20 results)
3. Story 1.4: Cloud Run deployment pipeline
4. Testing: End-to-end MCP query flow

**Week 3: Operations & Documentation**
1. Epic 6: Google Cloud monitoring setup
2. Epic 5: Documentation updates
3. Full ingestion run (21k repos)
4. Performance validation

### Success Criteria

**MVP Delivery Validated When:**
- ✅ All 21k repos indexed in Google File Search Store
- ✅ MCP API returns 20 relevant results for test queries
- ✅ Query response time <2s (p95)
- ✅ Claude Desktop integration functional
- ✅ Cost tracking dashboard operational
- ✅ Documentation updated and accurate

---

## Section 7: Risk Assessment & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Google File Search API quotas exceeded | Medium | High | Implement batch uploads with rate limiting, request quota increase |
| Cloud Run cold start latency >2s | Medium | Medium | Use min-instances=1 for always-warm container |
| Migration cost exceeds budget | Low | Medium | Monitor spending daily, optimize Gemini model selection (Flash vs Pro) |
| Indexing 21k repos exceeds time budget | Low | Medium | Parallel uploads (Story 2.5 preserved), poll operations efficiently |
| MCP client compatibility issues | Low | High | Test with Claude Desktop early, maintain MCP v2 spec compliance |

---

## Approval Required

**This proposal requires explicit approval from:**
- ✅ **Product Owner:** Cost structure change (~$50-80/month)
- ✅ **Technical Lead:** Platform migration (Cloudflare → Google Cloud)
- ✅ **User (cns):** Confirm full Google migration vs hybrid approach

**Once approved, estimated timeline:**
- Implementation: **40-60 hours** (5-7 business days with focused effort)
- Testing & Validation: **8-12 hours** (1-2 days)
- **Total:** 2-3 weeks to production-ready MVP

---

**Prepared by:** BMad Correct Course Workflow
**Workflow Version:** 1.0
**Next Steps:** Pending user approval to proceed with Phase 1 (Preserve Current Work)
