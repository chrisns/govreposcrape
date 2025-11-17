# Google Cloud Migration - Implementation Handoff

**Date:** 2025-11-17
**Branch:** `feat/google-cloud-migration`
**Status:** Phase 2 Partially Complete (Container Layer Done)

---

## ✅ Completed Work (Phase 2a: Container Layer)

### 1. Cloudflare Code Removal
- ❌ Deleted `wrangler.toml`, `wrangler.jsonc`, `wrangler-test.jsonc`
- ❌ Removed `src/` directory (Workers TypeScript code)
- ❌ Removed `container/r2_client.py`, `container/cache.py`
- ❌ Removed `.wrangler/` artifacts

### 2. Google File Search Integration
- ✅ Created `container/google_filesearch_client.py`
  - Auto-creates File Search Store on first run
  - Uploads with metadata tracking
  - Operation polling for completion
  - Retry logic (3 attempts, exponential backoff)
  - Statistics tracking

- ✅ Updated `container/orchestrator.py`
  - Removed KV cache dependency
  - Simplified pipeline: fetch → gitingest → Google upload
  - Added `--limit` flag for testing
  - Google-native authentication

- ✅ Updated `container/requirements.txt`
  - Removed `boto3` (R2 client)
  - Added `google-generativeai>=0.3.0`

- ✅ Updated `.env.example` with Google configuration

---

## 📋 Remaining Work

### Phase 2b: Container Testing (2-3 hours)

**Test with Small Batch:**
```bash
cd container

# 1. Install dependencies
pip install -r requirements.txt

# 2. Set environment variables
export GOOGLE_GEMINI_API_KEY="your-key"
export GOOGLE_APPLICATION_CREDENTIALS="./google-credentials.json"

# 3. Dry run test
python orchestrator.py --limit=10 --dry-run

# 4. Real test (10 repos)
python orchestrator.py --limit=10

# 5. Check File Search Store was created
echo "Check logs for: GOOGLE_FILE_SEARCH_STORE_NAME=..."
# Copy that value to .env for future runs
```

**Expected Outcome:**
- File Search Store created
- 10 repos processed
- Summaries uploaded with metadata
- Operation polling completes successfully

---

### Phase 3: Cloud Run API (8-12 hours)

**Goal:** Replace Cloudflare Workers with Node.js/Express API on Cloud Run

**Steps:**

#### 3.1 Create API Structure
```bash
mkdir -p api/src/{controllers,middleware,services}
```

**Files to Create:**

1. `api/package.json`:
```json
{
  "name": "govreposcrape-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@google/genai": "^0.3.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "typescript": "^5.3.0",
    "tsx": "^4.7.0"
  }
}
```

2. `api/src/index.ts`:
```typescript
import express from 'express';
import cors from 'cors';
import { searchController } from './controllers/search';
import { healthController } from './controllers/health';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// MCP v2 endpoints
app.post('/mcp/search', searchController);
app.get('/health', healthController);

app.listen(PORT, () => {
  console.log(`govreposcrape-api listening on port ${PORT}`);
});
```

3. `api/src/services/google-filesearch.ts`:
```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY
});

export async function searchCode(query: string, limit: number = 20) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: query,
    config: {
      tools: [{
        fileSearch: {
          fileSearchStoreNames: [process.env.GOOGLE_FILE_SEARCH_STORE_NAME]
        }
      }],
      responseModalities: ['TEXT']
    }
  });

  // Parse response and return top results
  // TODO: Extract grounding metadata and format as MCP response
  return response;
}
```

4. `api/src/controllers/search.ts`:
```typescript
import { Request, Response } from 'express';
import { searchCode } from '../services/google-filesearch';

export async function searchController(req: Request, res: Response) {
  try {
    const { query, limit = 20 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_QUERY',
          message: 'Query must be a non-empty string'
        }
      });
    }

    const startTime = Date.now();
    const results = await searchCode(query, limit);
    const took_ms = Date.now() - startTime;

    res.json({
      results: results,  // TODO: Format as SearchResult[]
      took_ms
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: {
        code: 'SEARCH_ERROR',
        message: 'Internal search error'
      }
    });
  }
}
```

5. `api/Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "dist/index.js"]
```

6. `api/.dockerignore`:
```
node_modules
dist
.env
*.md
.git
```

#### 3.2 Deploy to Cloud Run
```bash
cd api

# Build and deploy
gcloud run deploy govreposcrape-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_FILE_SEARCH_STORE_NAME=$GOOGLE_FILE_SEARCH_STORE_NAME \
  --set-env-vars GOOGLE_GEMINI_API_KEY=$GOOGLE_GEMINI_API_KEY \
  --service-account govreposcrape-api@${PROJECT_ID}.iam.gserviceaccount.com
```

---

### Phase 4: Documentation Updates (3-4 hours)

**Files to Update:**

1. **docs/PRD.md:**
   - Replace Cloudflare AI Search → Google File Search (lines 216-247)
   - Update cost model (lines 1798-1824)
   - Remove smart caching innovation (lines 614-628)

2. **docs/architecture.md:**
   - Update Decision Summary Table (remove R2, KV, AI Search; add Google File Search)
   - Replace ADR-001 (Cloudflare → Google Cloud)
   - Update project structure

3. **docs/epics.md:**
   - Delete Story 2.2 (KV caching)
   - Replace Story 2.4 (R2 → Google File Search)
   - Rewrite Epic 3 (AI Search → Google File Search)
   - Update Epic 4 (Workers → Cloud Run)

---

## 🧪 Testing Strategy

### Container Testing (Phase 2b)
```bash
# Small batch
python orchestrator.py --limit=10

# Medium batch
python orchestrator.py --limit=100

# Full run (use Cloud Run Jobs for production)
python orchestrator.py  # Processes all 21k repos
```

### API Testing (Phase 3)
```bash
# Local testing
cd api
npm run dev

# Test query
curl -X POST http://localhost:8080/mcp/search \
  -H "Content-Type: application/json" \
  -d '{"query":"authentication methods","limit":20}'

# Deploy to Cloud Run
gcloud run deploy ...

# Test production endpoint
curl -X POST https://govreposcrape-api-xxx.run.app/mcp/search \
  -H "Content-Type: application/json" \
  -d '{"query":"postcode validation","limit":20}'
```

---

## 💰 Cost Monitoring

**Google Cloud Costs (Projected):**
- **File Search indexing:** $37.50 one-time (21k repos × 250M tokens × $0.15/1M)
- **Gemini API queries:** $10-20/month (1000 queries/day)
- **Cloud Run:** $5-10/month (generous free tier)
- **Total:** ~$50-80/month

**Monitoring:**
```bash
# Check costs
gcloud billing accounts list
gcloud billing projects describe $PROJECT_ID

# Set budget alerts (recommended: $100/month)
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="govreposcrape-budget" \
  --budget-amount=100
```

---

## 📚 Reference Documentation

- **Google File Search:** https://ai.google.dev/gemini-api/docs/file-search
- **Cloud Run:** https://cloud.google.com/run/docs
- **Gemini API:** https://ai.google.dev/gemini-api/docs
- **Service Accounts:** https://cloud.google.com/iam/docs/service-accounts

---

## 🚨 Known Issues & Notes

1. **File Search Store Creation:**
   - First run will auto-create store
   - Copy `GOOGLE_FILE_SEARCH_STORE_NAME` from logs to .env
   - Subsequent runs will reuse existing store

2. **Operation Polling:**
   - Large files can take 5+ minutes to index
   - Orchestrator polls every 5 seconds
   - Timeout set to 10 minutes per file

3. **Parallel Execution:**
   - Recommended: 40 workers (`--batch-size=40`)
   - Each worker processes ~515 repos
   - Total time: ~5-7 hours for 21k repos

4. **API Response Format:**
   - Need to parse Gemini grounding metadata
   - Extract search results with citations
   - Format as MCP v2 SearchResult[] schema

---

## ✅ Acceptance Criteria

**Phase 2 Complete When:**
- ✅ Container uploads to Google File Search
- ✅ 100 test repos process successfully
- ✅ File Search Store visible in console

**Phase 3 Complete When:**
- ⬜ Cloud Run API deployed
- ⬜ POST /mcp/search returns 20 results
- ⬜ Response time <2s (p95)
- ⬜ Claude Desktop integration works

**Phase 4 Complete When:**
- ⬜ All documentation updated
- ⬜ Sprint Change Proposal archived
- ⬜ Architecture reflects Google Cloud

---

## 🎯 Next Session Priorities

1. **Test container with 100 repos** (30 min)
2. **Create Cloud Run API structure** (2-3 hours)
3. **Deploy and test API** (2-3 hours)
4. **Update documentation** (2-3 hours)

**Estimated Total:** 8-10 hours to complete migration

---

**Questions? Check:**
- Sprint Change Proposal: `docs/sprint-change-proposal-2025-11-17.md`
- Perplexity Research: (embedded in this session)
- Archive Branch: `archive/cloudflare-implementation`
