# Integration Testing Standards

**Version:** 1.0
**Last Updated:** 2025-11-13
**Status:** Active
**Owner:** Quality Sprint Team

## Table of Contents

- [1. Overview](#1-overview)
- [2. What Are Integration Tests?](#2-what-are-integration-tests)
- [3. When Integration Tests Are Required](#3-when-integration-tests-are-required)
- [4. Integration Test Requirements](#4-integration-test-requirements)
- [5. Unit Tests vs Integration Tests](#5-unit-tests-vs-integration-tests)
- [6. Test Data Requirements](#6-test-data-requirements)
- [7. Test Infrastructure](#7-test-infrastructure)
- [8. Performance Expectations](#8-performance-expectations)
- [9. Epic 2 Pipeline Integration Testing Guidelines](#9-epic-2-pipeline-integration-testing-guidelines)
- [10. Sample Integration Test Structure](#10-sample-integration-test-structure)

---

## 1. Overview

This document establishes integration testing standards for the govreposcrape project to ensure stories are not marked "done" without realistic end-to-end validation.

### Context: Why These Standards Exist

During Epic 2 retrospective, we identified a critical quality gap:

> **Stories were marked "done" with only 5-repo unit tests, failing to catch real-world integration failures until forced manual validation.**

**User Frustration (Verbatim):**
> "the team could have totally done this without me, and done it faster via the api"

The caching integration failure in Epic 2 was not caught by unit tests because:
1. **Unit tests mocked KV access** - Didn't catch that Docker containers couldn't access KV bindings
2. **Only 5 repos tested** - Too small to reveal real-world caching behavior
3. **No end-to-end workflow** - Didn't test Worker → Docker → KV → R2 full pipeline

These standards prevent similar failures by requiring realistic data volumes, real service bindings, and end-to-end workflow validation.

---

## 2. What Are Integration Tests?

**Integration tests verify that multiple components work together correctly using real service bindings and realistic data volumes.**

### Key Characteristics

- **Multi-component:** Tests interactions between 2+ system components
- **Real services:** Uses actual Cloudflare service bindings (KV, R2, D1, AI Search) - NOT mocks
- **End-to-end workflows:** Validates complete user/system workflows
- **Realistic data:** Uses 100-1000 items minimum (not 5 items)
- **Slower execution:** 5-10 minutes for 100-item tests is acceptable
- **Higher confidence:** Proves the system works together in real-world scenarios

### What Integration Tests Are NOT

- **Not unit tests:** Integration tests don't test individual functions in isolation
- **Not smoke tests:** More comprehensive than basic connectivity checks
- **Not performance tests:** Focus is correctness, not optimization (though performance is observed)
- **Not full regression tests:** Don't need to test entire 20k repo dataset for every story

---

## 3. When Integration Tests Are Required

Integration tests are **REQUIRED** for stories that:

| Story Type | Requirement | Example |
|------------|-------------|---------|
| **Service Binding Stories** | REQUIRED | Stories touching KV, R2, D1, AI Search, Vectorize |
| **Data Pipeline Stories** | REQUIRED | Ingestion, transformation, storage workflows |
| **External API Integration** | REQUIRED | GitHub API, repos.json feed, AI Search API |
| **Multi-component Features** | REQUIRED | Features spanning Worker ↔ Container ↔ Storage |
| **Pure Logic Stories** | OPTIONAL | Utility functions, data validation, pure transformations |

### Decision Tree

```
Does the story touch service bindings (KV, R2, D1, AI Search)?
├─ YES → Integration tests REQUIRED
└─ NO → Does it involve external APIs or multi-component workflows?
    ├─ YES → Integration tests REQUIRED
    └─ NO → Integration tests OPTIONAL (unit tests sufficient)
```

---

## 4. Integration Test Requirements

All integration tests MUST meet these requirements:

### 4.1 Real Service Bindings

- [ ] **Use real Cloudflare services** (KV, R2, D1, AI Search) - NOT mocks
- [ ] **Separate test namespaces** (e.g., `govreposcrape-test-kv`, `govreposcrape-test-r2`)
- [ ] **Isolated from production** - Test data must not pollute production resources

### 4.2 Realistic Data Volumes

- [ ] **Minimum 100 items** for standard integration tests
- [ ] **100-1000 items** for data pipeline tests
- [ ] **NOT 5 items** - This is a unit test volume, not integration test volume

### 4.3 End-to-End Workflow Validation

- [ ] **Complete workflows:** Test full pipeline from input → processing → storage → verification
- [ ] **Data flow verification:** Validate data at each stage of the pipeline
- [ ] **Error propagation:** Verify errors surface correctly through the workflow

### 4.4 Test Markers and Categorization

**TypeScript (Vitest):**
```typescript
import { describe, it, expect } from 'vitest';

describe('Integration: Ingestion Pipeline', () => {
  it('should process 100 repos end-to-end', async () => {
    // Integration test implementation
  });
});
```

**Python (pytest):**
```python
import pytest

@pytest.mark.integration
@pytest.mark.network
@pytest.mark.r2
@pytest.mark.slow
def test_full_ingestion_pipeline_with_caching():
    """Integration test: Fetch 100 repos, process, verify caching"""
    # Test implementation
```

### 4.5 Cleanup Procedures

- [ ] **Automated teardown:** Clean up test data after test runs
- [ ] **Idempotent tests:** Tests should be repeatable without manual cleanup
- [ ] **Resource management:** Verify test resources are released properly

---

## 5. Unit Tests vs Integration Tests

| Aspect | Unit Tests | Integration Tests |
|--------|-----------|-------------------|
| **Scope** | Single function/module | Multiple components working together |
| **Dependencies** | Mocked/stubbed | Real services (KV, R2, APIs) |
| **Speed** | Fast (<1s per test) | Slower (minutes) |
| **Data Volume** | Small (5 items) | Realistic (100-1000 items) |
| **Purpose** | Verify logic correctness | Verify end-to-end workflows |
| **When Required** | Every story with logic | Stories with service integration |
| **Confidence Level** | Moderate (logic works) | High (system works together) |
| **Test Markers** | `@pytest.mark.unit` | `@pytest.mark.integration` |
| **Execution Time** | Milliseconds | 5-10 minutes (100 items) |
| **CI/CD** | Run on every commit | Run on PR, pre-merge, nightly |

### Example Comparison

**Unit Test (5 items, mocked KV):**
```python
@pytest.mark.unit
def test_cache_stores_repo_timestamp():
    """Unit test: Verify cache stores pushedAt timestamp"""
    mock_kv = MockKVNamespace()
    cache = Cache(mock_kv)

    # Test with 5 repos
    repos = [{"name": "repo1", "pushedAt": "2025-11-13T10:00:00Z"}]
    cache.store(repos)

    assert mock_kv.get("repo1") == "2025-11-13T10:00:00Z"
```

**Integration Test (100 items, real KV):**
```python
@pytest.mark.integration
@pytest.mark.network
@pytest.mark.slow
def test_full_ingestion_pipeline_with_caching():
    """Integration test: Fetch 100 repos, process, verify 90%+ cache hit rate"""
    # Use real KV namespace: govreposcrape-test-kv
    # Use real R2 bucket: govreposcrape-test-r2

    test_repos = load_test_repos_snapshot()  # First 100 from repos.json

    # Phase 1: Initial ingestion (all cache misses)
    stats_run1 = run_ingestion_pipeline(
        repos=test_repos,
        kv_namespace='govreposcrape-test-kv',
        r2_bucket='govreposcrape-test-r2'
    )

    assert stats_run1['processed'] == 100
    assert stats_run1['cache_hits'] == 0

    # Phase 2: Re-ingestion (90%+ cache hits expected)
    stats_run2 = run_ingestion_pipeline(
        repos=test_repos,
        kv_namespace='govreposcrape-test-kv',
        r2_bucket='govreposcrape-test-r2'
    )

    cache_hit_rate = stats_run2['cache_hits'] / 100
    assert cache_hit_rate >= 0.90, f"Cache hit rate {cache_hit_rate} < 90%"

    # Cleanup
    cleanup_test_resources()
```

---

## 6. Test Data Requirements

### 6.1 Deterministic Test Data

Integration tests must use **deterministic, reproducible test data** to ensure consistent results:

- **Use snapshots:** Capture first 100-200 repos from repos.json as test fixtures
- **Version control:** Store test data snapshots in `test/integration/fixtures/`
- **Document expectations:** Define expected outcomes based on snapshot data

### 6.2 Test Data Sources

**For Epic 2 Ingestion Pipeline:**
- **Source:** UK government repos.json feed (`https://government.github.com/community/repositories.json`)
- **Test fixture:** First 100 repos from snapshot stored in `test/integration/fixtures/test-repos-100.json`
- **Rationale:** Deterministic data prevents flaky tests due to upstream changes

**For AI Search Integration:**
- **Source:** Pre-indexed code summaries from R2 bucket
- **Test fixture:** 50-100 pre-processed gitingest summaries
- **Rationale:** AI Search tests need realistic code content for semantic search validation

### 6.3 Test Data Volumes

| Test Type | Minimum Items | Recommended Items | Maximum Items |
|-----------|---------------|-------------------|---------------|
| **Smoke Test** | 5-10 | 10 | 20 |
| **Standard Integration** | 100 | 100-200 | 500 |
| **Data Pipeline Integration** | 100 | 500 | 1000 |
| **Full Regression** | 1000 | 5000 | 20000 (full dataset) |

**CRITICAL:** Stories must NOT be marked "done" with only 5-item tests. Minimum 100 items for integration tests.

---

## 7. Test Infrastructure

### 7.1 Separate Test Namespaces

All integration tests MUST use separate test namespaces to avoid polluting production data:

| Service | Production Namespace | Test Namespace |
|---------|---------------------|----------------|
| **KV** | `govreposcrape-cache` (`REDACTED_CLOUDFLARE_KV_ID`) | `govreposcrape-test-kv` (to be provisioned) |
| **R2** | `govreposcrape-gitingest` | `govreposcrape-test-r2` (to be provisioned) |
| **D1** | `govreposcrape-db` (`REDACTED_CLOUDFLARE_D1_ID`) | `govreposcrape-test-db` (to be provisioned) |
| **Vectorize** | `govscraperepo-code-index` | `govscraperepo-test-index` (to be provisioned) |

### 7.2 Wrangler Configuration for Tests

Create `wrangler-test.jsonc` for test environment bindings:

```jsonc
{
  "name": "govreposcrape-test",
  "compatibility_date": "2024-11-01",
  "kv_namespaces": [
    { "binding": "KV", "id": "test-kv-namespace-id" }
  ],
  "r2_buckets": [
    { "binding": "R2", "bucket_name": "govreposcrape-test-r2" }
  ],
  "d1_databases": [
    { "binding": "DB", "database_id": "test-d1-database-id" }
  ],
  "vectorize": [
    { "binding": "VECTORIZE", "index_name": "govscraperepo-test-index" }
  ]
}
```

### 7.3 Cleanup Strategy

**Automated Cleanup After Each Test Run:**

```python
def cleanup_test_resources():
    """Clean up test namespaces after integration test run"""
    # KV: Delete all keys with test prefix
    kv_client = get_kv_client('govreposcrape-test-kv')
    kv_client.delete_all(prefix='test-')

    # R2: Delete all objects in test bucket
    r2_client = get_r2_client('govreposcrape-test-r2')
    r2_client.delete_bucket_contents()

    # D1: Truncate test tables
    db_client = get_d1_client('govreposcrape-test-db')
    db_client.execute('TRUNCATE TABLE repos_metadata')
```

**Cleanup Verification:**
- [ ] Test cleanup runs automatically after each test
- [ ] Verify test namespaces are empty after cleanup
- [ ] Monitor for orphaned test resources

---

## 8. Performance Expectations

Integration tests are **slower than unit tests** by design. This is acceptable because they provide essential confidence that real-world scenarios work end-to-end.

### 8.1 Execution Time Guidelines

| Test Size | Items | Expected Duration | Acceptable? |
|-----------|-------|------------------|-------------|
| **Small** | 100 repos | 5-10 minutes | ✅ YES |
| **Medium** | 500 repos | 20-30 minutes | ✅ YES |
| **Large** | 1000 repos | 30-60 minutes | ✅ YES (nightly) |
| **Full Regression** | 20000 repos | 6-10 hours | ⚠️ Manual only |

### 8.2 Trade-offs

**Slower execution is acceptable when it provides:**
- Higher confidence in system correctness
- Early detection of integration failures
- Validation of real-world workflows
- Prevention of production incidents

**When to optimize:**
- Tests taking >2x expected duration
- CI/CD pipeline blocked by slow tests
- Tests timing out due to resource constraints

### 8.3 CI/CD Integration Strategy

| Test Type | When to Run | Typical Duration |
|-----------|-------------|------------------|
| **Unit tests** | Every commit | <30 seconds |
| **Integration (100 items)** | Every PR | 5-10 minutes |
| **Integration (500 items)** | Pre-merge | 20-30 minutes |
| **Integration (1000 items)** | Nightly | 30-60 minutes |
| **Full regression** | Manual/weekly | 6-10 hours |

---

## 9. Epic 2 Pipeline Integration Testing Guidelines

These guidelines are specific to the Epic 2 data ingestion pipeline and serve as a reference pattern for other epics.

### 9.1 Test Data Sources

**Primary Source:** UK government repos.json feed
- URL: `https://government.github.com/community/repositories.json`
- Total repos: ~21,000
- Test fixture: First 100 repos

**Fixture Creation:**
```bash
# Fetch repos.json and extract first 100 repos
curl -s https://government.github.com/community/repositories.json | \
  jq '.repos[:100]' > test/integration/fixtures/test-repos-100.json
```

### 9.2 KV/R2 Test Namespace Strategy

**KV Test Namespace:** `govreposcrape-test-kv`
- **Purpose:** Cache `pushedAt` timestamps to detect unchanged repos
- **Cleanup:** Delete all keys after each test run
- **Provisioning:** `npx wrangler kv:namespace create govreposcrape-test-kv`

**R2 Test Bucket:** `govreposcrape-test-r2`
- **Purpose:** Store gitingest summaries (JSON + metadata)
- **Cleanup:** Delete all objects after each test run
- **Provisioning:** `npx wrangler r2 bucket create govreposcrape-test-r2`

### 9.3 End-to-End Workflow

**Complete Epic 2 Pipeline Integration Test:**

1. **Fetch repos.json** → Load 100 repos from test fixture
2. **Check KV cache** → Verify cache miss on first run (0% hit rate)
3. **Process uncached repos** → Run gitingest on repos with no KV entry
4. **Upload to R2** → Store summaries with metadata
5. **Update KV cache** → Store `pushedAt` timestamps
6. **Re-run pipeline** → Verify 90%+ cache hit rate on second run
7. **Verify R2 objects** → Confirm 100 objects exist and are accessible
8. **Cleanup** → Delete test KV keys and R2 objects

### 9.4 Performance Expectations

| Pipeline Stage | Expected Duration (100 repos) |
|----------------|-------------------------------|
| Fetch repos.json | 1-2 seconds |
| KV cache check | 5-10 seconds |
| gitingest processing | 3-5 minutes |
| R2 upload | 30-60 seconds |
| KV cache update | 5-10 seconds |
| **Total** | **5-10 minutes** |

**Acceptable Variance:** ±50% (2.5-15 minutes acceptable due to network/Docker variability)

---

## 10. Sample Integration Test Structure

This sample demonstrates a complete integration test for the Epic 2 ingestion pipeline.

### 10.1 Test File Location

**TypeScript Workers Integration Tests:**
```
test/integration/ingestion-pipeline.test.ts
```

**Python Container Integration Tests:**
```
container/test/integration/test_ingestion_pipeline.py
```

### 10.2 Sample Python Integration Test

```python
"""
Integration test for Epic 2 data ingestion pipeline.

This test validates the complete workflow:
1. Fetch repos.json (100 repos from fixture)
2. Check KV cache (expect 0% hit rate on first run)
3. Process uncached repos with gitingest
4. Upload summaries to R2
5. Update KV cache with pushedAt timestamps
6. Re-run pipeline (expect 90%+ cache hit rate)
7. Verify R2 objects exist and are accessible
8. Clean up test resources

Expected Duration: 5-10 minutes for 100 repos
"""

import pytest
import json
from pathlib import Path
from typing import Dict, List

# Test markers for categorization
pytestmark = [
    pytest.mark.integration,
    pytest.mark.network,
    pytest.mark.r2,
    pytest.mark.slow
]

# Test configuration
TEST_KV_NAMESPACE = 'govreposcrape-test-kv'
TEST_R2_BUCKET = 'govreposcrape-test-r2'
TEST_REPOS_FIXTURE = Path(__file__).parent / 'fixtures' / 'test-repos-100.json'


def load_test_repos_snapshot() -> List[Dict]:
    """Load deterministic test data: first 100 repos from repos.json"""
    with open(TEST_REPOS_FIXTURE, 'r') as f:
        return json.load(f)


@pytest.fixture(scope='function')
def clean_test_namespaces():
    """Ensure test namespaces are clean before and after each test"""
    # Pre-test cleanup
    cleanup_kv_namespace(TEST_KV_NAMESPACE)
    cleanup_r2_bucket(TEST_R2_BUCKET)

    yield  # Run test

    # Post-test cleanup
    cleanup_kv_namespace(TEST_KV_NAMESPACE)
    cleanup_r2_bucket(TEST_R2_BUCKET)


def test_full_ingestion_pipeline_with_caching(clean_test_namespaces):
    """
    Integration test: Fetch 100 repos, process, verify caching

    Acceptance Criteria:
    - AC1: First run processes 100 repos (0% cache hit)
    - AC2: Second run achieves 90%+ cache hit rate
    - AC3: 100 R2 objects created and accessible
    - AC4: KV cache contains 100 pushedAt timestamps
    """
    # === PHASE 1: Initial Ingestion (Cache Miss) ===

    test_repos = load_test_repos_snapshot()
    assert len(test_repos) == 100, "Test fixture should contain exactly 100 repos"

    # Run ingestion pipeline with test namespaces
    stats_run1 = run_ingestion_pipeline(
        repos=test_repos,
        kv_namespace=TEST_KV_NAMESPACE,
        r2_bucket=TEST_R2_BUCKET,
        batch_size=100
    )

    # Verify Phase 1 results
    assert stats_run1['total_repos'] == 100
    assert stats_run1['processed'] == 100, "Should process all 100 repos on first run"
    assert stats_run1['cache_hits'] == 0, "No cache hits expected on first run"
    assert stats_run1['cache_misses'] == 100, "All repos should be cache misses"
    assert stats_run1['r2_uploads'] == 100, "Should upload 100 summaries to R2"
    assert stats_run1['errors'] == 0, "No errors expected"

    # === PHASE 2: Re-Ingestion (Cache Hit) ===

    # Re-run pipeline with same repos (no pushedAt changes)
    stats_run2 = run_ingestion_pipeline(
        repos=test_repos,
        kv_namespace=TEST_KV_NAMESPACE,
        r2_bucket=TEST_R2_BUCKET,
        batch_size=100
    )

    # Verify Phase 2 results: Caching working
    cache_hit_rate = stats_run2['cache_hits'] / 100
    assert cache_hit_rate >= 0.90, (
        f"Cache hit rate {cache_hit_rate:.1%} < 90%. "
        f"Expected: ≥90% | Actual: {stats_run2['cache_hits']}/100 hits"
    )

    # Verify minimal reprocessing
    assert stats_run2['processed'] <= 10, (
        f"Should reprocess ≤10 repos (cache misses), got {stats_run2['processed']}"
    )

    # === PHASE 3: R2 Verification ===

    # Verify R2 objects exist and are accessible
    r2_objects = list_r2_bucket_objects(TEST_R2_BUCKET, prefix='gitingest/')
    assert len(r2_objects) >= 100, (
        f"Expected ≥100 R2 objects, found {len(r2_objects)}"
    )

    # Spot-check: Verify first object structure
    first_object = r2_objects[0]
    object_content = download_r2_object(TEST_R2_BUCKET, first_object['key'])

    # Validate gitingest summary structure
    summary = json.loads(object_content)
    assert 'repository' in summary
    assert 'summary' in summary
    assert 'tree' in summary
    assert summary['repository']['name'] in [r['name'] for r in test_repos]

    # === PHASE 4: KV Verification ===

    # Verify KV cache contains pushedAt timestamps
    kv_keys = list_kv_keys(TEST_KV_NAMESPACE)
    assert len(kv_keys) == 100, f"Expected 100 KV keys, found {len(kv_keys)}"

    # Spot-check: Verify timestamp format
    first_repo_name = test_repos[0]['name']
    cached_timestamp = get_kv_value(TEST_KV_NAMESPACE, first_repo_name)
    assert cached_timestamp is not None
    assert cached_timestamp == test_repos[0]['pushedAt']


def test_ingestion_pipeline_with_changed_repos(clean_test_namespaces):
    """
    Integration test: Verify reprocessing when pushedAt changes

    Acceptance Criteria:
    - AC1: Initial run caches 100 repos
    - AC2: Repos with updated pushedAt are reprocessed
    - AC3: Unchanged repos use cache (90%+ hit rate maintained)
    """
    test_repos = load_test_repos_snapshot()

    # Phase 1: Initial ingestion
    stats_run1 = run_ingestion_pipeline(
        repos=test_repos,
        kv_namespace=TEST_KV_NAMESPACE,
        r2_bucket=TEST_R2_BUCKET
    )
    assert stats_run1['processed'] == 100

    # Modify 5 repos: Update pushedAt timestamp
    modified_repos = test_repos.copy()
    for i in range(5):
        modified_repos[i]['pushedAt'] = '2025-11-13T12:00:00Z'  # New timestamp

    # Phase 2: Re-ingestion with 5 modified repos
    stats_run2 = run_ingestion_pipeline(
        repos=modified_repos,
        kv_namespace=TEST_KV_NAMESPACE,
        r2_bucket=TEST_R2_BUCKET
    )

    # Verify: Only 5 repos reprocessed (95% cache hit rate)
    assert stats_run2['cache_hits'] == 95, (
        f"Expected 95 cache hits (95 unchanged repos), got {stats_run2['cache_hits']}"
    )
    assert stats_run2['processed'] == 5, (
        f"Expected 5 repos reprocessed (pushedAt changed), got {stats_run2['processed']}"
    )


def test_ingestion_pipeline_error_handling(clean_test_namespaces):
    """
    Integration test: Verify graceful error handling

    Acceptance Criteria:
    - AC1: Invalid repos are skipped without crashing pipeline
    - AC2: Valid repos are processed despite errors in other repos
    - AC3: Error stats are tracked correctly
    """
    test_repos = load_test_repos_snapshot()

    # Inject 3 invalid repos (missing required fields)
    invalid_repos = [
        {'name': 'invalid-repo-1'},  # Missing pushedAt
        {'pushedAt': '2025-11-13T10:00:00Z'},  # Missing name
        {'name': '', 'pushedAt': '2025-11-13T10:00:00Z'}  # Empty name
    ]

    mixed_repos = test_repos[:97] + invalid_repos  # 97 valid + 3 invalid = 100

    # Run pipeline with mixed valid/invalid repos
    stats = run_ingestion_pipeline(
        repos=mixed_repos,
        kv_namespace=TEST_KV_NAMESPACE,
        r2_bucket=TEST_R2_BUCKET
    )

    # Verify: 97 valid repos processed, 3 errors logged
    assert stats['processed'] == 97, f"Expected 97 valid repos processed"
    assert stats['errors'] == 3, f"Expected 3 errors logged for invalid repos"
    assert stats['r2_uploads'] == 97, f"Expected 97 R2 uploads for valid repos"


# === Helper Functions ===

def run_ingestion_pipeline(repos, kv_namespace, r2_bucket, batch_size=100):
    """Run the full ingestion pipeline with test configuration"""
    # Implementation delegates to orchestrator.py or equivalent
    from orchestrator import IngestOrchestrator

    orchestrator = IngestOrchestrator(
        kv_namespace=kv_namespace,
        r2_bucket=r2_bucket,
        batch_size=batch_size
    )

    return orchestrator.run(repos)


def cleanup_kv_namespace(namespace):
    """Delete all keys in KV test namespace"""
    # Implementation uses Cloudflare KV API
    pass


def cleanup_r2_bucket(bucket):
    """Delete all objects in R2 test bucket"""
    # Implementation uses Cloudflare R2 API
    pass


def list_r2_bucket_objects(bucket, prefix=''):
    """List all objects in R2 bucket with optional prefix"""
    # Implementation uses Cloudflare R2 API
    pass


def download_r2_object(bucket, key):
    """Download object content from R2 bucket"""
    # Implementation uses Cloudflare R2 API
    pass


def list_kv_keys(namespace):
    """List all keys in KV namespace"""
    # Implementation uses Cloudflare KV API
    pass


def get_kv_value(namespace, key):
    """Get value from KV namespace"""
    # Implementation uses Cloudflare KV API
    pass
```

### 10.3 Test Execution

**Run integration tests:**
```bash
# Run all integration tests (TypeScript)
npm test -- --grep "Integration"

# Run all integration tests (Python)
pytest -m integration

# Run Epic 2 pipeline integration test specifically
pytest container/test/integration/test_ingestion_pipeline.py -v

# Run with coverage
pytest -m integration --cov=src --cov-report=html
```

**Expected output:**
```
container/test/integration/test_ingestion_pipeline.py::test_full_ingestion_pipeline_with_caching PASSED [5m 23s]
container/test/integration/test_ingestion_pipeline.py::test_ingestion_pipeline_with_changed_repos PASSED [3m 12s]
container/test/integration/test_ingestion_pipeline.py::test_ingestion_pipeline_error_handling PASSED [2m 45s]

=========================== 3 passed in 11m 20s ===========================
```

---

## References

- [Definition of Done](.bmad/definition-of-done.md) - Incorporates these integration testing standards
- [Story Quality-1](../.bmad-ephemeral/stories/quality-1-diagnose-and-fix-kv-caching-integration.md) - Caching failure that motivated these standards
- [Story Quality-3](../.bmad-ephemeral/stories/quality-3-update-definition-of-done-with-scale-testing.md) - DoD update incorporating these standards
- [Architecture](./architecture.md) - Testing stack and service bindings
- [Container Testing Quick Reference](../container/TESTING_QUICK_REFERENCE.md) - Python pytest configuration

---

**Document History:**
- **2025-11-13:** Initial version 1.0 created as part of Story Quality-2
- **Owner:** Dana (Quality Advocate)
- **Sign-off:** Pending team review (Story Quality-2 AC4)
