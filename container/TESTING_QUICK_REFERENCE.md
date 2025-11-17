# Testing Quick Reference Guide

## 🚀 Quick Start

```bash
cd /Users/cns/httpdocs/cddo/govreposcrape/container

# Install dependencies
pip install -r requirements-test.txt

# Run all tests
pytest

# Or use the test runner script
./run_tests.sh all
```

## 📁 Test File Locations

```
container/test/
├── unit/
│   ├── summary-truncation.test.py    # 512KB truncation logic (20 tests)
│   └── env-config.test.py            # Environment variables (18 tests)
└── integration/
    ├── gitingest-api-contract.test.py  # gitingest API (11 tests)
    └── r2-upload.test.py              # R2 upload pipeline (15 tests)
```

## 🏃 Common Commands

### Run Specific Test Types
```bash
# Unit tests only (fast, ~2 seconds)
pytest -m unit

# Integration tests only
pytest -m integration

# Exclude slow tests
pytest -m "not integration"

# With coverage report
pytest --cov=. --cov-report=html
```

### Run Specific Files/Tests
```bash
# Single file
pytest test/unit/summary-truncation.test.py

# Single test class
pytest test/unit/summary-truncation.test.py::TestSummaryTruncation

# Single test method
pytest test/unit/summary-truncation.test.py::TestSummaryTruncation::test_truncation_over_512kb

# With verbose output
pytest -vv test/unit/summary-truncation.test.py
```

### Using the Test Runner Script
```bash
./run_tests.sh unit         # Unit tests only
./run_tests.sh integration  # Integration tests only
./run_tests.sh coverage     # With coverage report
./run_tests.sh fast         # All except integration
./run_tests.sh all          # All tests (default)
```

## 🧪 Test Markers

Use markers to run specific test categories:

```bash
pytest -m unit         # Unit tests (fast, mocked)
pytest -m integration  # Integration tests
pytest -m network      # Tests requiring network
pytest -m r2           # Tests requiring R2 credentials
pytest -m slow         # Slow-running tests
```

## 📊 What Each Test File Tests

### 1. `gitingest-api-contract.test.py`
**Tests**: gitingest library API compatibility
- IngestionResult vs tuple return types
- .summary attribute handling
- Backwards compatibility
- max_file_size parameter

**When to run**: After gitingest library updates

### 2. `summary-truncation.test.py`
**Tests**: 512KB truncation logic
- Truncation at 524288 bytes boundary
- Truncation notice appended
- Edge cases (empty, exact boundary, large files)
- UTF-8 encoding handling

**When to run**: After changes to truncation logic in ingest.py

### 3. `r2-upload.test.py`
**Tests**: R2 upload with truncated summaries
- Complete pipeline (gitingest → truncate → upload)
- R2 file size limits
- Retry logic
- Error handling

**When to run**: After changes to R2 upload or truncation

### 4. `env-config.test.py`
**Tests**: Environment variable handling
- .env file parsing (NO variable expansion)
- Docker vs Python behavior
- R2 credential validation
- Edge cases (empty, special chars)

**When to run**: After changes to environment handling or Docker setup

## 🔍 Debugging Failed Tests

### Show full output
```bash
pytest -vv -s test/unit/summary-truncation.test.py
```

### Drop into debugger on failure
```bash
pytest --pdb test/unit/summary-truncation.test.py
```

### Show which tests will run
```bash
pytest --collect-only
```

### Run only failed tests from last run
```bash
pytest --lf  # last failed
pytest --ff  # failed first, then others
```

## 🌐 Environment Variables for Testing

### For Unit Tests (Mocked)
No environment variables needed - everything is mocked.

### For R2 Integration Tests
```bash
export R2_BUCKET=govreposcrape-gitingest
export R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
export R2_ACCESS_KEY=your_access_key
export R2_SECRET_KEY=your_secret_key

pytest test/integration/r2-upload.test.py
```

### For GitIngest Network Tests
```bash
# Requires network access to GitHub
pytest -m network --run-network-tests test/integration/gitingest-api-contract.test.py
```

## 📈 Coverage Reports

### Generate HTML coverage report
```bash
pytest --cov=. --cov-report=html
# Open htmlcov/index.html in browser
```

### View coverage in terminal
```bash
pytest --cov=. --cov-report=term-missing
```

### Coverage for specific module
```bash
pytest --cov=ingest --cov-report=term test/unit/summary-truncation.test.py
```

## ⚡ Speed Up Tests

### Run tests in parallel
```bash
# Install pytest-xdist first
pip install pytest-xdist

# Run with 4 workers
pytest -n 4
```

### Skip slow tests
```bash
pytest -m "not slow"
pytest -m "not integration"
```

## 🐛 Common Issues

### Issue: "gitingest module not found"
**Solution**: Install gitingest library (optional for integration tests)
```bash
pip install gitingest
```

### Issue: "R2ConfigError: Missing required R2 environment variables"
**Solution**: Either set R2 env vars OR run unit tests only
```bash
# Option 1: Skip integration tests
pytest -m "not integration"

# Option 2: Set env vars
export R2_BUCKET=test-bucket
export R2_ENDPOINT=https://test.r2.cloudflarestorage.com
export R2_ACCESS_KEY=test-key
export R2_SECRET_KEY=test-secret
```

### Issue: "ImportError: No module named boto3"
**Solution**: Install application dependencies
```bash
pip install boto3 requests
# Or install all dependencies
pip install -r requirements.txt
```

## 📝 Test Patterns Cheat Sheet

### Mock gitingest
```python
from unittest.mock import patch
from collections import namedtuple

@patch('gitingest.ingest')
def test_something(mock_ingest):
    IngestionResult = namedtuple('IngestionResult', ['summary', 'tree'])
    mock_ingest.return_value = IngestionResult(summary="test", tree="src/")
```

### Mock R2 client
```python
@patch('r2_client.create_r2_client')
@patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
def test_r2(mock_create_client):
    mock_client = Mock()
    mock_create_client.return_value = mock_client
```

### Test environment variables
```python
@patch.dict(os.environ, {"VAR": "value"}, clear=True)
def test_env():
    assert os.getenv('VAR') == "value"
```

## 🎯 Test Coverage Goals

| Module | Target | Status |
|--------|--------|--------|
| ingest.py | 85% | ✅ |
| r2_client.py | 82% | ✅ |
| Truncation logic | 100% | ✅ |
| Env handling | 95% | ✅ |

## 📚 Documentation

- Full documentation: `TEST_README.md`
- Test summary: `TEST_SUMMARY.md`
- This guide: `TESTING_QUICK_REFERENCE.md`

## 🚦 CI/CD Integration

### GitHub Actions
```yaml
- name: Test
  run: |
    cd container
    pip install -r requirements-test.txt
    pytest -m unit --cov=. --cov-report=xml
```

### Run before committing
```bash
# Quick check
./run_tests.sh fast

# Full validation
./run_tests.sh coverage
```

## 💡 Tips

1. **Run unit tests frequently** - They're fast (~2 seconds)
2. **Use markers** - Target specific test categories
3. **Check coverage** - Aim for 80%+ on new code
4. **Write tests first** - TDD approach works well
5. **Mock external services** - Keep tests fast and reliable

## 🆘 Getting Help

1. Check test docstrings for expected behavior
2. Review `TEST_README.md` for detailed documentation
3. Look at existing test patterns in test files
4. Run with `-vv` for verbose output
5. Use `--pdb` to debug failures

---

**Quick Reference Created**: 2025-11-13
**Test Suite Version**: 1.0
**Total Tests**: 64+
**Coverage Target**: 80%+
