# AI Search Performance Validation

This directory contains tools for validating Cloudflare AI Search performance and quality for the govreposcrape MVP.

## Scripts

### `validate-ai-search.ts`

**Purpose:** Comprehensive performance validation and baseline metrics generation

**Features:**
- Executes 10 test queries representing government use cases (3 runs each)
- Measures performance metrics (p50/p95/p99 response times)
- Assesses search relevance (manual scoring heuristics)
- Tests indexing lag (R2 upload → searchable)
- Generates baseline report with GO/NO-GO decision

**Usage:**

This script runs in a Cloudflare Workers environment and requires AI_SEARCH and R2 bindings.

```typescript
// Option 1: Import and call directly
import { runValidation } from "./scripts/validate-ai-search";

const report = await runValidation(env);
console.log(report.summary.decision); // "GO" or "NO-GO"
```

```bash
# Option 2: Run via service test endpoint (recommended)
# Add to src/service-test.ts:
import { runValidation } from "../scripts/validate-ai-search";

export async function handleServiceTest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "validate-ai-search") {
    const report = await runValidation(env);
    return Response.json(report);
  }
  // ... other test actions
}

# Then trigger via HTTP:
curl https://your-worker.workers.dev/service-test?action=validate-ai-search
```

**Output:**
- Structured JSON logs to console
- Baseline report: `.bmad-ephemeral/search-performance-baseline-{date}.md`

**Runtime:** ~15-20 minutes (includes 10-minute indexing lag test)

### `validate-ai-search-baseline.sh`

**Purpose:** Validates R2 bucket contents and AI Search readiness (pre-Worker validation)

**Usage:**

```bash
# From project root
./scripts/validate-ai-search-baseline.sh

# Test mode (validate dependencies and syntax only)
./scripts/validate-ai-search-baseline.sh --test
```

**Prerequisites:**
- AWS CLI installed (`brew install awscli` on macOS)
- `.env` file with R2 credentials:
  ```
  R2_BUCKET=govreposcrape-gitingest
  R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
  R2_ACCESS_KEY=[your-access-key]
  R2_SECRET_KEY=[your-secret-key]
  ```

**What it validates:**
1. R2 bucket accessibility
2. Gitingest summary file count
3. File structure and content-type
4. Provides AI Search Dashboard validation checklist

**Output:**
- Console output with validation results
- Progress metrics (e.g., "1,234 / 20,587 repos uploaded")
- Dashboard validation checklist

## Test Queries

The validation suite uses 10 test queries representing common UK government developer use cases:

| ID | Query | Intent | Expected Domains |
|----|-------|--------|------------------|
| Q1 | authentication JWT token validation | Find authentication patterns | alphagov, nhsdigital, moj |
| Q2 | postcode validation UK address lookup | Find address validation | alphagov, dwpdigital |
| Q3 | NHS API integration FHIR | Find NHS API examples | nhsdigital |
| Q4 | tax calculation HMRC PAYE | Find tax logic | hmrc |
| Q5 | GOV.UK frontend components design system | Find UI components | alphagov |
| Q6 | benefits validation DWP universal credit | Find benefits logic | dwpdigital |
| Q7 | API gateway rate limiting authentication | Find API patterns | alphagov, hmrc, nhsdigital |
| Q8 | microservice event driven architecture | Find microservice patterns | alphagov, moj, dwpdigital |
| Q9 | database migration versioning | Find migration tools | alphagov, nhsdigital, moj |
| Q10 | GOV.UK notify email SMS integration | Find Notify examples | alphagov, dwpdigital, moj |

## Performance Targets

Based on PRD NFR-1.1 and NFR-1.2:

| Metric | Target | Status |
|--------|--------|--------|
| End-to-end response time (p95) | <2 seconds | Measured |
| AI Search component time (p95) | <800 milliseconds | Measured |
| Search relevance | 80%+ of queries with 80%+ relevant top 5 results | Assessed |
| Indexing lag | <5 minutes from R2 upload to searchable | Tested |

## Relevance Scoring

Manual assessment scale (MVP - automated scoring in Phase 2):

| Score | Label | Description |
|-------|-------|-------------|
| 0 | Irrelevant | No relation to query |
| 1 | Tangential | Loosely related |
| 2 | Relevant | Directly relevant |
| 3 | Highly Relevant | Exactly what user needs |

**Success criteria:** Score >= 2 (Relevant or Highly Relevant)

**Target:** 80%+ of top 5 results are relevant for 80%+ of queries

## Baseline Report

The baseline report includes:

1. **Executive Summary**
   - GO/NO-GO decision
   - Key metrics vs. targets
   - Rationale

2. **Methodology**
   - Test query set rationale
   - Performance measurement approach
   - Relevance assessment method
   - Indexing lag test procedure

3. **Performance Metrics**
   - Response time distribution (avg, p50, p95, p99)
   - AI Search component performance
   - Result enrichment performance
   - Timing breakdown analysis

4. **Relevance Metrics**
   - Overall relevance rate
   - Per-query relevance breakdown
   - Queries passing threshold

5. **Indexing Lag**
   - Measured lag time
   - Comparison to target

6. **Story 3.3 AC #2b Validation**
   - Snippet context adequacy assessment
   - Recommendation for snippet expansion

7. **Raw Data**
   - All performance measurements
   - All relevance assessments
   - Timing breakdowns

8. **Recommendations**
   - Next steps based on decision
   - Remediation options if NO-GO
   - Phase 2 enhancements

## Story 3.3 AC #2b Validation

The validation script assesses whether AI Search snippets provide adequate context without manual expansion:

**Assessment criteria:**
- Snippet length >= 100 characters
- Multi-line snippet (contains `\n`)

**Decision:**
- ✅ **Adequate:** All queries return snippets with adequate context → No code changes needed
- ⚠️ **Limited:** Some queries have limited context → Document as Phase 2 enhancement

This resolves the pending review item from Story 3.3.

## Integration Examples

### Add to service-test.ts

```typescript
import { runValidation } from "../scripts/validate-ai-search";

export async function handleServiceTest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "validate-ai-search") {
    try {
      const report = await runValidation(env);
      return Response.json({
        success: true,
        decision: report.summary.decision,
        summary: report.summary,
        reportPath: `.bmad-ephemeral/search-performance-baseline-${new Date().toISOString().split("T")[0]}.md`,
      });
    } catch (error) {
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }, { status: 500 });
    }
  }

  // ... other test actions
}
```

### Add npm script (package.json)

```json
{
  "scripts": {
    "validate:search": "wrangler dev --test-scheduled",
    "validate:baseline": "./scripts/validate-ai-search-baseline.sh"
  }
}
```

## Troubleshooting

### "ERROR: This script must be run in a Cloudflare Workers environment"

**Cause:** The TypeScript validation script requires Workers runtime (AI_SEARCH, R2 bindings)

**Solution:** Run via service-test endpoint or integrate into Workers app

### "❌ R2 bucket not accessible"

**Cause:** Invalid R2 credentials or bucket configuration

**Solution:**
1. Check `.env` file has correct R2 credentials
2. Verify bucket name matches wrangler.toml
3. Test bucket access: `aws s3 ls s3://your-bucket --endpoint-url=... --region=auto`

### "⚠️ No summary files found in R2 bucket"

**Cause:** Ingestion pipeline hasn't started or completed yet

**Solution:**
1. Check ingestion pipeline is running
2. Verify R2 bucket path matches expected structure (`gitingest/org/repo/summary.txt`)
3. Wait for ingestion to complete or partial completion

### Performance below targets

**Cause:** Various factors (network latency, AI Search query complexity, enrichment overhead)

**Solutions:**
1. **If AI Search p95 > 800ms:** Consider custom embeddings in Phase 2
2. **If enrichment slow:** Review R2 HEAD request performance, optimize metadata fetch
3. **If total p95 > 2s:** Profile timing breakdown, optimize bottlenecks

### Relevance below 80% threshold

**Cause:** Poor gitingest summary quality, AI Search embedding quality, or test query design

**Solutions:**
1. Review gitingest summary quality for sample results
2. Adjust test queries to be more specific or aligned with indexed content
3. Consider custom embedding model if AI Search quality is consistently poor
4. Plan Phase 2 relevance improvements (query expansion, re-ranking, etc.)

## Next Steps

After running validation:

1. **Review baseline report** in `.bmad-ephemeral/search-performance-baseline-{date}.md`

2. **If GO decision:**
   - Proceed with Epic 4 (MCP API Server) implementation
   - Monitor performance in production
   - Establish ongoing benchmarking

3. **If NO-GO decision:**
   - Review recommendations in baseline report
   - Implement remediation actions
   - Re-run validation after improvements
   - Consider Phase 2 pivot to custom embeddings

4. **Document learnings:**
   - Update Epic 3 retrospective with validation findings
   - Document any gotchas or surprises
   - Share baseline metrics with team

## References

- **PRD:** `docs/PRD.md` (NFR-1.1, NFR-1.2)
- **Epics:** `docs/epics.md` (Story 3.4)
- **Architecture:** `docs/architecture.md` (AI Search configuration)
- **Story 3.2:** `.bmad-ephemeral/stories/3-2-ai-search-query-api-integration-in-workers.md`
- **Story 3.3:** `.bmad-ephemeral/stories/3-3-result-enrichment-add-metadata-and-github-links.md`
- **Story 3.4:** `.bmad-ephemeral/stories/3-4-search-performance-validation-and-baseline-metrics.md`
