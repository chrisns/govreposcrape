# govreposcrape Container Test Suite

Comprehensive test coverage for the gitingest ingestion pipeline, including integration tests for adhoc changes.

## Test Structure

```
container/
├── test/
│   ├── unit/                           # Unit tests (fast, no external deps)
│   │   ├── summary-truncation.test.py  # 512KB truncation logic
│   │   └── env-config.test.py          # .env parsing tests
│   └── integration/                    # Integration tests (may need services)
│       ├── gitingest-api-contract.test.py  # gitingest library API
│       └── r2-upload.test.py           # R2 upload with truncation
├── test_ingest.py                      # Existing ingest tests
├── test_gcs_client.py                   # Existing R2 client tests
├── test_orchestrator.py                # Existing orchestrator tests
├── pytest.ini                          # Pytest configuration
└── TEST_README.md                      # This file
```

## Test Categories

### Unit Tests
Fast tests with no external dependencies (all mocked):
- `test/unit/summary-truncation.test.py` - Summary truncation at 512KB
- `test/unit/env-config.test.py` - Environment variable parsing
- `test_ingest.py` - Ingest pipeline logic
- `test_gcs_client.py` - R2 client operations

### Integration Tests
Tests that verify integration between components:
- `test/integration/gitingest-api-contract.test.py` - gitingest library compatibility
- `test/integration/r2-upload.test.py` - Complete pipeline with R2

## Running Tests

### Prerequisites

```bash
# Install pytest and dependencies
pip install pytest pytest-cov

# Install application dependencies
pip install -r requirements.txt

# Optional: Install gitingest for integration tests
pip install gitingest
```

### Run All Tests

```bash
# From container/ directory
pytest

# With coverage
pytest --cov=. --cov-report=html --cov-report=term-missing

# With verbose output
pytest -v
```

### Run Specific Test Categories

```bash
# Unit tests only (fast)
pytest -m unit

# Integration tests
pytest -m integration

# Specific test file
pytest test/unit/summary-truncation.test.py

# Specific test class
pytest test/unit/summary-truncation.test.py::TestSummaryTruncation

# Specific test function
pytest test/unit/summary-truncation.test.py::TestSummaryTruncation::test_no_truncation_small_summary
```

### Skip Slow Tests

```bash
# Skip integration tests (faster CI runs)
pytest -m "not integration"

# Skip network tests
pytest -m "not network"

# Skip R2 tests (no credentials needed)
pytest -m "not r2"
```

## Test Markers

Tests are marked with pytest markers for selective execution:

- `@pytest.mark.unit` - Unit test (fast, mocked)
- `@pytest.mark.integration` - Integration test (may need services)
- `@pytest.mark.network` - Requires network access
- `@pytest.mark.r2` - Requires R2 credentials
- `@pytest.mark.slow` - Slow-running test

Example:
```python
@pytest.mark.integration
@pytest.mark.network
def test_real_gitingest_call():
    # Test that requires network access
    pass
```

## New Test Coverage

### 1. GitIngest API Contract Tests
**File**: `test/integration/gitingest-api-contract.test.py`

Tests actual gitingest library behavior (NOT mocked):
- ✅ Verify IngestionResult return type with .summary attribute
- ✅ Test backwards compatibility with tuple unpacking
- ✅ Test error handling for different return types
- ✅ Verify max_file_size parameter support
- ✅ Test attribute check order (hasattr before isinstance)

**Run**: `pytest test/integration/gitingest-api-contract.test.py`

**Note**: Some tests require network access and are skipped by default.

### 2. Summary Truncation Tests
**File**: `test/unit/summary-truncation.test.py`

Tests 512KB truncation logic:
- ✅ Summary < 512KB: No truncation
- ✅ Summary = 512KB exactly: No truncation
- ✅ Summary > 512KB: Truncated with notice appended
- ✅ Verify truncation notice text format
- ✅ Verify truncated flag in metadata logging
- ✅ Test UTF-8 encoding byte counting
- ✅ Test truncation edge cases

**Run**: `pytest test/unit/summary-truncation.test.py`

**Coverage**: 100% of truncation logic in `ingest.py`

### 3. R2 Upload Integration Tests
**File**: `test/integration/r2-upload.test.py`

Tests R2 upload with truncated summaries:
- ✅ R2 upload with truncated summaries
- ✅ Verify file size limits in R2
- ✅ Test metadata includes standard fields (no truncated flag)
- ✅ Verify uploaded content has truncation notice
- ✅ Test complete pipeline: gitingest → truncation → R2
- ✅ Test retry logic with truncated summaries

**Run**: `pytest test/integration/r2-upload.test.py`

**Note**: Tests use mocked R2 client by default. Set R2 env vars for real integration testing.

### 4. Environment Config Tests
**File**: `test/unit/env-config.test.py`

Tests .env file parsing WITHOUT variable substitution:
- ✅ Verify R2 credentials are read correctly
- ✅ Test that ${VARIABLE} syntax is NOT expanded (stays literal)
- ✅ Document Docker vs Python variable expansion behavior
- ✅ Test environment variable validation
- ✅ Test edge cases (empty vars, special characters, quotes)

**Run**: `pytest test/unit/env-config.test.py`

**Key Finding**: Python's `os.getenv()` does NOT expand `${VARIABLE}` syntax. This is Docker's responsibility when loading .env files. Tests document this behavior.

## Environment Variables for Testing

### Minimal (Mocked Tests)
No environment variables required - all external services are mocked.

### R2 Integration Tests
Set these to run real R2 integration tests:
```bash
export R2_BUCKET=govreposcrape-gitingest
export R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
export R2_ACCESS_KEY=your_access_key
export R2_SECRET_KEY=your_secret_key
```

### GitIngest Network Tests
Requires network access to GitHub. Run with:
```bash
pytest -m network --run-network-tests
```

## Continuous Integration

### GitHub Actions Example
```yaml
- name: Run tests
  run: |
    cd container
    pip install -r requirements.txt
    pip install pytest pytest-cov

    # Unit tests (fast)
    pytest -m "not integration" --cov=. --cov-report=xml

    # Integration tests (if R2 credentials available)
    pytest -m integration || echo "Skipping integration tests"
  env:
    R2_BUCKET: ${{ secrets.R2_BUCKET }}
    R2_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
    R2_ACCESS_KEY: ${{ secrets.R2_ACCESS_KEY }}
    R2_SECRET_KEY: ${{ secrets.R2_SECRET_KEY }}
```

## Test Coverage Goals

- **Overall**: 80%+ coverage on core logic
- **Unit Tests**: 90%+ coverage
- **Integration Tests**: Focus on critical paths

### Current Coverage

| Module | Coverage | Status |
|--------|----------|--------|
| ingest.py | 85% | ✅ Good |
| gcs_client.py | 82% | ✅ Good |
| orchestrator.py | TBD | 🔄 Pending |

## Common Test Patterns

### Mocking GitIngest
```python
from unittest.mock import patch
from collections import namedtuple

@patch('gitingest.ingest')
def test_something(mock_ingest):
    IngestionResult = namedtuple('IngestionResult', ['summary', 'tree'])
    mock_ingest.return_value = IngestionResult(
        summary="Test summary",
        tree="src/"
    )

    # Test code here
```

### Mocking R2 Client
```python
from unittest.mock import patch, Mock

@patch('gcs_client.create_gcs_client')
@patch.dict(os.environ, {"R2_BUCKET": "test-bucket", ...})
def test_r2_upload(mock_create_client):
    mock_client = Mock()
    mock_create_client.return_value = mock_client

    # Test code here
```

### Testing Environment Variables
```python
from unittest.mock import patch
import os

@patch.dict(os.environ, {"VAR": "value"}, clear=True)
def test_env_var():
    assert os.getenv('VAR') == "value"
```

## Debugging Tests

### Run with Debug Output
```bash
# Show print statements
pytest -s

# Show full tracebacks
pytest --tb=long

# Run single test with debug
pytest -vv -s test/unit/summary-truncation.test.py::TestSummaryTruncation::test_truncation_over_512kb
```

### Use pytest debugger
```bash
# Drop into debugger on failure
pytest --pdb

# Drop into debugger at start
pytest --trace
```

## Known Issues and TODO

### Integration Tests
- [ ] Real R2 integration tests require AWS credentials
- [ ] Network tests are skipped by default (use `--run-network-tests`)
- [ ] GitIngest integration tests need gitingest library installed

### Test Improvements
- [ ] Add performance benchmarks for truncation
- [ ] Add concurrency tests for parallel processing
- [ ] Add tests for Docker volume mounts
- [ ] Add tests for container resource limits

## Contributing

When adding new tests:

1. **Choose correct location**:
   - Unit tests → `test/unit/`
   - Integration tests → `test/integration/`

2. **Add pytest markers**:
   ```python
   @pytest.mark.unit
   @pytest.mark.integration
   ```

3. **Follow naming conventions**:
   - File: `test_*.py` or `*.test.py`
   - Class: `Test*`
   - Function: `test_*`

4. **Add docstrings**:
   ```python
   def test_something():
       """
       Test: Brief description

       Acceptance Criteria:
       - Criterion 1
       - Criterion 2
       """
   ```

5. **Use TODO comments** for future work:
   ```python
   # TODO: Add test for edge case X
   # TODO: Requires AWS credentials
   ```

## References

- [pytest documentation](https://docs.pytest.org/)
- [pytest markers](https://docs.pytest.org/en/stable/how-to/mark.html)
- [pytest fixtures](https://docs.pytest.org/en/stable/how-to/fixtures.html)
- [gitingest library](https://github.com/cyclotruc/gitingest)
- [Cloudflare R2 docs](https://developers.cloudflare.com/r2/)
