# Testing Guide

**Version:** 1.0
**Last Updated:** 2025-11-13

This document provides comprehensive testing guidance for the govreposcrape project, covering unit tests, integration tests, and scale testing requirements.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Types](#test-types)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [Test Infrastructure](#test-infrastructure)
- [Test Data](#test-data)
- [Running Tests](#running-tests)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run only unit tests (TypeScript)
npm test -- --exclude "test/integration/**"

# Run only integration tests
npm test -- --grep "Integration"

# Run Python container tests
cd container && pytest
```

---

## Test Types

The govreposcrape project uses three types of tests:

| Test Type | Purpose | Speed | When Required | Data Volume |
|-----------|---------|-------|---------------|-------------|
| **Unit Tests** | Verify individual functions/modules | Fast (<1s) | Every story with logic | Small (5 items) |
| **Integration Tests** | Verify components work together | Slower (5-10 min) | Stories with service bindings | Realistic (100-1000 items) |
| **Scale Tests** | Verify performance at production scale | Slowest (30-60 min) | Data pipeline stories | Large (1000+ items) |

### When Each Test Type Is Required

**Unit Tests:**
- ✅ Required for ALL stories with logic
- ✅ Test individual functions in isolation
- ✅ Use mocked dependencies (no real service bindings)

**Integration Tests:**
- ✅ Required for stories touching service bindings (KV, R2, D1, AI Search)
- ✅ Required for data pipeline stories
- ✅ Required for external API integrations
- ❌ NOT required for pure logic stories

**Scale Tests:**
- ✅ Required for data pipeline stories (Epic 2)
- ✅ Required for AI Search performance validation (Epic 3)
- ❌ NOT required for UI/documentation stories

See [Definition of Done](.bmad/definition-of-done.md) for complete testing requirements.

---

## Unit Tests

Unit tests verify individual functions and modules in isolation using mocked dependencies.

### Framework: Vitest + @cloudflare/vitest-pool-workers

**Configuration:** `vitest.config.mts`

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' }
      }
    }
  }
});
```

### Directory Structure

```
test/
├── utils/              # Utility function tests
├── ingestion/          # Ingestion pipeline tests
├── api/                # API endpoint tests
└── deployment/         # Deployment health check tests
```

### Writing Unit Tests

**Example: Testing a utility function**

```typescript
import { describe, it, expect } from 'vitest';
import { parseRepoData } from '../src/utils/repo-parser';

describe('Unit: parseRepoData', () => {
  it('should parse valid repo data', () => {
    const input = {
      name: 'alphagov/govuk-frontend',
      pushedAt: '2025-11-01T10:00:00Z'
    };

    const result = parseRepoData(input);

    expect(result.name).toBe('alphagov/govuk-frontend');
    expect(result.owner).toBe('alphagov');
    expect(result.timestamp).toBe('2025-11-01T10:00:00Z');
  });

  it('should throw error for invalid data', () => {
    const invalid = { name: '' };

    expect(() => parseRepoData(invalid)).toThrow('Invalid repo data');
  });
});
```

### Coverage Requirements

- **Target:** 80%+ code coverage for core logic
- **Measurement:** `npm test -- --coverage`
- **Enforcement:** Defined in [Definition of Done](.bmad/definition-of-done.md#21-unit-tests)

**View coverage report:**
```bash
npm test -- --coverage
# Opens coverage/index.html in browser
```

---

## Integration Tests

Integration tests verify that multiple components work together correctly using **real Cloudflare service bindings**.

### Key Principles

1. **Real Service Bindings:** Use actual KV, R2, D1, AI Search - NOT mocks
2. **Realistic Data Volumes:** Minimum 100 items (NOT 5 items)
3. **End-to-End Workflows:** Test complete pipelines from input → processing → storage → verification
4. **Separate Test Namespaces:** Isolated from production (`govreposcrape-test-*`)
5. **Automated Cleanup:** Clean up test data after each run

See [Integration Testing Standards](docs/integration-testing-standards.md) for complete standards.

### Prerequisites

Integration tests require separate test service bindings. See [test/integration/README.md](test/integration/README.md) for provisioning instructions.

| Service | Test Namespace | Provisioning Command |
|---------|---------------|----------------------|
| **KV** | `govreposcrape-test-kv` | `npx wrangler kv:namespace create govreposcrape-test-kv` |
| **R2** | `govreposcrape-test-r2` | `npx wrangler r2 bucket create govreposcrape-test-r2` |
| **D1** | `govreposcrape-test-db` | `npx wrangler d1 create govreposcrape-test-db` |
| **Vectorize** | `govscraperepo-test-index` | `npx wrangler vectorize create govscraperepo-test-index --dimensions=768 --metric=cosine` |

### Writing Integration Tests

**Example: Epic 2 Ingestion Pipeline Integration Test**

See [test/integration/README.md](test/integration/README.md) for complete example.

```typescript
import { describe, it, expect, afterEach } from 'vitest';

describe('Integration: Ingestion Pipeline', () => {
  afterEach(async () => {
    // Cleanup: Delete test data after each test
    await cleanupKVNamespace('govreposcrape-test-kv');
    await cleanupR2Bucket('govreposcrape-test-r2');
  });

  it('should process 100 repos with 90%+ cache hit rate', async () => {
    const testRepos = loadTestFixture('test-repos-100.json');

    // Phase 1: Initial ingestion (cache miss)
    const stats1 = await runIngestionPipeline({
      repos: testRepos,
      kvNamespace: 'govreposcrape-test-kv',
      r2Bucket: 'govreposcrape-test-r2'
    });

    expect(stats1.processed).toBe(100);
    expect(stats1.cacheHits).toBe(0);

    // Phase 2: Re-ingestion (cache hit)
    const stats2 = await runIngestionPipeline({
      repos: testRepos,
      kvNamespace: 'govreposcrape-test-kv',
      r2Bucket: 'govreposcrape-test-r2'
    });

    const hitRate = stats2.cacheHits / 100;
    expect(hitRate).toBeGreaterThanOrEqual(0.90);
  }, { timeout: 600000 }); // 10 minutes
});
```

### Performance Expectations

| Test Size | Items | Expected Duration | Acceptable? |
|-----------|-------|------------------|-------------|
| **Small** | 100 repos | 5-10 minutes | ✅ YES |
| **Medium** | 500 repos | 20-30 minutes | ✅ YES |
| **Large** | 1000 repos | 30-60 minutes | ✅ YES (nightly) |

**Trade-off:** Integration tests are slower than unit tests, but provide essential confidence that real-world scenarios work end-to-end.

---

## Test Infrastructure

### Test Namespaces

All integration tests use separate test namespaces to avoid polluting production data:

**Production Namespaces:**
- KV: `govreposcrape-cache` (`REDACTED_CLOUDFLARE_KV_ID`)
- R2: `govreposcrape-gitingest`
- D1: `govreposcrape-db` (`REDACTED_CLOUDFLARE_D1_ID`)
- Vectorize: `govscraperepo-code-index`

**Test Namespaces:**
- KV: `govreposcrape-test-kv` (to be provisioned)
- R2: `govreposcrape-test-r2` (to be provisioned)
- D1: `govreposcrape-test-db` (to be provisioned)
- Vectorize: `govscraperepo-test-index` (to be provisioned)

### Wrangler Configuration for Tests

Create `wrangler-test.jsonc` for test environment:

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

### Cleanup Procedures

All integration tests MUST clean up test resources after execution:

```typescript
async function cleanupTestResources() {
  // KV: Delete all test keys
  await cleanupKVNamespace('govreposcrape-test-kv');

  // R2: Delete all test objects
  await cleanupR2Bucket('govreposcrape-test-r2');

  // D1: Truncate test tables
  await cleanupD1Database('govreposcrape-test-db');
}
```

---

## Test Data

### Unit Test Data

Unit tests use **small, synthetic data** (5 items):

```typescript
const mockRepos = [
  { name: 'alphagov/repo1', pushedAt: '2025-11-01T10:00:00Z' },
  { name: 'alphagov/repo2', pushedAt: '2025-11-02T10:00:00Z' },
  { name: 'alphagov/repo3', pushedAt: '2025-11-03T10:00:00Z' },
  { name: 'alphagov/repo4', pushedAt: '2025-11-04T10:00:00Z' },
  { name: 'alphagov/repo5', pushedAt: '2025-11-05T10:00:00Z' }
];
```

### Integration Test Data

Integration tests use **realistic, deterministic data** (100-1000 items):

**Fixture:** `test/integration/fixtures/test-repos-100.json`

Sample UK government repositories for deterministic integration testing:

```json
[
  {
    "name": "alphagov/govuk-frontend",
    "pushedAt": "2025-11-02T10:45:22Z",
    "description": "GOV.UK Frontend",
    "language": "JavaScript"
  },
  ...
]
```

**Creating test fixtures:**

```bash
# Fetch first 100 repos from repos.json (if available)
curl -s https://government.github.com/community/repositories.json | \
  jq '.repos[:100]' > test/integration/fixtures/test-repos-100.json
```

### Scale Test Data

Scale tests use **production-scale data** (1000+ items):

- **Epic 2:** 1000-5000 repos from full repos.json feed
- **Epic 3:** 500-1000 pre-indexed code summaries

---

## Running Tests

### All Tests

```bash
# Run all tests (unit + integration)
npm test

# Watch mode (auto-rerun on file changes)
npm test -- --watch

# Coverage report
npm test -- --coverage
```

### Unit Tests Only

```bash
# TypeScript unit tests (exclude integration)
npm test -- --exclude "test/integration/**"

# Python container unit tests
cd container && pytest -m unit
```

### Integration Tests Only

```bash
# TypeScript integration tests
npm test -- --grep "Integration"

# Python container integration tests
cd container && pytest -m integration
```

### Specific Test Files

```bash
# Run specific test file
npm test test/utils/logger.test.ts

# Run specific Python test
pytest container/test/unit/test_cache.py
```

### Test Markers (Python)

Python tests use pytest markers for categorization:

```bash
# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Run only network-dependent tests
pytest -m network

# Run only R2-dependent tests
pytest -m r2

# Exclude slow tests
pytest -m "not slow"
```

See [container/pytest.ini](container/pytest.ini) for all markers.

### Coverage Targets

| Component | Target | Command |
|-----------|--------|---------|
| **TypeScript Workers** | 80%+ | `npm test -- --coverage` |
| **Python Container** | 85%+ ingest.py, 82%+ r2_client.py | `pytest --cov=src --cov-report=html` |

---

## CI/CD Integration

### When Tests Run

| Test Type | Trigger | Typical Duration | Blocking? |
|-----------|---------|------------------|-----------|
| **Unit tests** | Every commit | <30 seconds | ✅ YES |
| **Lint/format** | Every commit | <10 seconds | ✅ YES |
| **Integration (100 items)** | Every PR | 5-10 minutes | ✅ YES |
| **Integration (500 items)** | Pre-merge | 20-30 minutes | ✅ YES |
| **Integration (1000 items)** | Nightly | 30-60 minutes | ⚠️ Optional |
| **Scale tests (5000 items)** | Weekly/manual | 2-4 hours | ❌ NO |

### Pre-commit Hooks

Pre-commit hooks run automatically on `git commit`:

```bash
# Configured in .husky/pre-commit
npm run lint          # ESLint + TypeScript check
npm run format:check  # Prettier formatting
npm test              # Fast unit tests
```

### GitHub Actions (Future)

**Recommended CI/CD pipeline:**

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm test -- --exclude "test/integration/**"

  integration-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm test -- --grep "Integration"
    env:
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

---

## Troubleshooting

### Issue: Tests pass locally but fail in CI/CD

**Possible causes:**
1. Environment variables missing in CI/CD
2. Service bindings not configured for test environment
3. Timing issues (tests too fast/slow for CI environment)

**Solution:**
```bash
# Verify environment variables
echo $CLOUDFLARE_ACCOUNT_ID
echo $CLOUDFLARE_API_TOKEN

# Check service bindings
npx wrangler kv:namespace list
npx wrangler r2 bucket list
```

### Issue: Integration tests fail with "Service binding not found"

**Solution:** Provision test resources and update `wrangler-test.jsonc`

See [test/integration/README.md](test/integration/README.md#prerequisites) for provisioning instructions.

### Issue: Cache hit rate < 90% in integration tests

**Possible causes:**
1. KV namespace not persisting data between test phases
2. `pushedAt` timestamps changing in test data
3. Cleanup running between test phases (should only run after test completes)

**Debug:**
```typescript
// Add logging to see cache operations
console.log('Phase 1 stats:', stats1);
console.log('Phase 2 stats:', stats2);
console.log('Cache hit rate:', (stats2.cacheHits / 100 * 100).toFixed(1) + '%');
```

### Issue: Tests timeout

**Solution:** Increase timeout for slow tests

```typescript
// Vitest: Set timeout per test
it('should process 100 repos', async () => {
  // Test implementation
}, { timeout: 600000 }); // 10 minutes

// Vitest: Set timeout globally in vitest.config.mts
export default defineWorkersConfig({
  test: {
    testTimeout: 600000 // 10 minutes
  }
});
```

```python
# pytest: Set timeout with decorator
import pytest

@pytest.mark.timeout(600)  # 10 minutes
def test_full_ingestion_pipeline():
    # Test implementation
    pass
```

### Issue: Coverage below 80%

**Solution:** Identify uncovered code and add tests

```bash
# Generate detailed coverage report
npm test -- --coverage

# Open HTML report to see uncovered lines
open coverage/index.html
```

Focus on:
- Core business logic (ingestion, caching, search)
- Error handling paths
- Edge cases (empty input, invalid data, etc.)

### Issue: Flaky tests (pass sometimes, fail other times)

**Possible causes:**
1. Non-deterministic test data (e.g., fetching live data instead of fixtures)
2. Race conditions in async code
3. Timing-dependent assertions
4. Shared state between tests

**Solutions:**
```typescript
// Use deterministic test data from fixtures
const testData = loadFixture('test-repos-100.json');

// Ensure proper cleanup between tests
afterEach(async () => {
  await cleanupTestResources();
});

// Add proper async/await handling
await expect(asyncFunction()).resolves.toBe(expected);

// Use retry logic for timing-sensitive assertions
await waitFor(() => expect(condition).toBe(true));
```

---

## Python Container Tests

The `container/` directory has its own testing setup with pytest.

### Quick Reference

```bash
# Change to container directory
cd container

# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific markers
pytest -m unit           # Unit tests only
pytest -m integration    # Integration tests only
pytest -m "not slow"     # Exclude slow tests
```

See [container/TESTING_QUICK_REFERENCE.md](container/TESTING_QUICK_REFERENCE.md) for complete Python testing guide.

---

## References

- [Integration Testing Standards](docs/integration-testing-standards.md) - Complete integration testing standards
- [Definition of Done](.bmad/definition-of-done.md) - Testing requirements for all stories
- [Test Integration README](test/integration/README.md) - Integration test setup guide
- [Container Testing Guide](container/TESTING_QUICK_REFERENCE.md) - Python pytest guide
- [Architecture](docs/architecture.md) - Testing stack and service bindings

---

**Document History:**
- **2025-11-13:** Initial version 1.0 created as part of Story Quality-2
- **Owner:** Quality Sprint Team
