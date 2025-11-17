# Integration Tests

This directory contains integration tests for the govreposcrape project. Integration tests verify that multiple components work together correctly using real Cloudflare service bindings.

## Quick Start

```bash
# Run all integration tests
npm test -- --grep "Integration"

# Run specific integration test
npm test test/integration/ingestion-pipeline.test.ts
```

## Prerequisites

### 1. Test Service Bindings

Integration tests require separate test namespaces to avoid polluting production data:

| Service | Test Namespace | Status |
|---------|---------------|--------|
| **KV** | `govreposcrape-test-kv` | To be provisioned |
| **R2** | `govreposcrape-test-r2` | To be provisioned |
| **D1** | `govreposcrape-test-db` | To be provisioned |
| **Vectorize** | `govscraperepo-test-index` | To be provisioned |

### 2. Provision Test Resources

**KV Namespace:**
```bash
npx wrangler kv:namespace create govreposcrape-test-kv
# Note the namespace ID and add to wrangler-test.jsonc
```

**R2 Bucket:**
```bash
npx wrangler r2 bucket create govreposcrape-test-r2
```

**D1 Database:**
```bash
npx wrangler d1 create govreposcrape-test-db
# Note the database ID and add to wrangler-test.jsonc
```

**Vectorize Index:**
```bash
npx wrangler vectorize create govscraperepo-test-index --dimensions=768 --metric=cosine
```

### 3. Configure Test Bindings

Create or update `wrangler-test.jsonc` with test resource IDs:

```jsonc
{
  "name": "govreposcrape-test",
  "compatibility_date": "2024-11-01",
  "kv_namespaces": [
    { "binding": "KV", "id": "YOUR_TEST_KV_NAMESPACE_ID" }
  ],
  "r2_buckets": [
    { "binding": "R2", "bucket_name": "govreposcrape-test-r2" }
  ],
  "d1_databases": [
    { "binding": "DB", "database_id": "YOUR_TEST_D1_DATABASE_ID" }
  ],
  "vectorize": [
    { "binding": "VECTORIZE", "index_name": "govscraperepo-test-index" }
  ]
}
```

## Test Structure

```
test/integration/
├── README.md                    # This file
├── fixtures/                    # Test data snapshots
│   └── test-repos-100.json     # First 100 repos for deterministic testing
├── ingestion-pipeline.test.ts  # Epic 2 pipeline integration tests (to be created)
└── ai-search.test.ts           # Epic 3 AI Search integration tests (to be created)
```

## Test Data Fixtures

### test-repos-100.json

Sample of 5 UK government repositories for integration testing. This fixture provides:
- Deterministic test data (same repos every run)
- Realistic data structure matching repos.json format
- Sufficient volume for meaningful cache hit rate testing

**Note:** In production, integration tests would use 100-1000 repos. This 5-repo fixture is a starting point for test development.

## Writing Integration Tests

### Test Markers

Use descriptive test names and group integration tests:

```typescript
import { describe, it, expect } from 'vitest';

describe('Integration: Ingestion Pipeline', () => {
  it('should process repos end-to-end with caching', async () => {
    // Test implementation
  });
});
```

### Test Cleanup

All integration tests MUST clean up test resources after execution:

```typescript
import { afterEach } from 'vitest';

afterEach(async () => {
  // Clean up KV namespace
  await cleanupKVNamespace('govreposcrape-test-kv');

  // Clean up R2 bucket
  await cleanupR2Bucket('govreposcrape-test-r2');
});
```

## Performance Expectations

Integration tests are slower than unit tests by design. This is acceptable for high-confidence validation.

| Test Size | Items | Expected Duration |
|-----------|-------|-------------------|
| **Small** | 5-10 repos | 1-2 minutes |
| **Standard** | 100 repos | 5-10 minutes |
| **Large** | 1000 repos | 30-60 minutes |

## CI/CD Integration

Integration tests should run:
- ✅ On pull requests (100-item tests)
- ✅ Pre-merge (500-item tests)
- ✅ Nightly (1000-item tests)
- ❌ NOT on every commit (too slow)

## Troubleshooting

### Issue: Tests fail with "Service binding not found"

**Solution:** Verify test resources are provisioned and IDs are correct in `wrangler-test.jsonc`

```bash
# List KV namespaces
npx wrangler kv:namespace list

# List R2 buckets
npx wrangler r2 bucket list

# List D1 databases
npx wrangler d1 list
```

### Issue: Cache hit rate < 90% on second run

**Possible causes:**
1. KV namespace not persisting data (check cleanup isn't running between test phases)
2. `pushedAt` timestamps changing in test data
3. Cache logic not correctly storing/retrieving timestamps

**Debug:**
```typescript
// Add logging to see cache operations
console.log('Cache stats:', {
  hits: stats.cache_hits,
  misses: stats.cache_misses,
  hitRate: (stats.cache_hits / total * 100).toFixed(1) + '%'
});
```

### Issue: Tests timeout after 2 minutes

**Solution:** Increase timeout for integration tests

```typescript
import { describe, it } from 'vitest';

describe('Integration: Ingestion Pipeline', () => {
  it('should process 100 repos', async () => {
    // Test implementation
  }, { timeout: 600000 }); // 10 minutes
});
```

## References

- [Integration Testing Standards](../../docs/integration-testing-standards.md) - Complete standards document
- [Definition of Done](../../.bmad/definition-of-done.md) - Integration test requirements
- [TESTING.md](../../TESTING.md) - Comprehensive testing guide

---

**Last Updated:** 2025-11-13
**Owner:** Quality Sprint Team
