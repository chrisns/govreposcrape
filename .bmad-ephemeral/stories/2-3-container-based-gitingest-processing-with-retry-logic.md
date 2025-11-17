# Story 2.3: Container-Based gitingest Processing with Retry Logic

Status: review

## Story

As a **data pipeline engineer**,
I want **a containerized environment to run gitingest Python library on repository URLs**,
so that **we can generate LLM-ready code summaries for semantic search**.

## Acceptance Criteria

1. **Given** a repository marked as "needs processing" from cache check (Story 2.2)
   **When** I execute gitingest processing on the repository URL
   **Then** the container runs Python 3.11 with gitingest library installed
   **And** gitingest generates a comprehensive code summary (structure, key files, dependencies)
   **And** processing handles repositories of varying sizes (10KB to 100MB+)

2. **Given** gitingest processing may fail (timeout, network error, malformed repo)
   **When** processing encounters an error
   **Then** it retries up to 3 times with exponential backoff
   **And** timeouts are enforced (5 minutes max per repo)
   **And** failures are logged with repo URL and error details
   **And** processing continues with next repository (fail-safe)

3. **Given** container infrastructure requirements
   **When** container is built and configured
   **Then** container has Dockerfile with: Python 3.11, gitingest, boto3 for R2 access
   **And** container accepts environment variables: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY
   **And** container has CLI entrypoint: `python ingest.py <repo-url>`
   **And** processing statistics are logged: successful, failed, average time per repo

## Tasks / Subtasks

- [x] Task 1: Create Docker container infrastructure (AC: #1, #3)
  - [x] Create container/Dockerfile with Python 3.11 base image
  - [x] Install gitingest library via pip
  - [x] Install boto3 for R2 access
  - [x] Configure environment variable support (R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY)
  - [x] Add .dockerignore file to exclude unnecessary files
  - [x] Document build instructions in container/README.md

- [x] Task 2: Implement gitingest processing script (AC: #1, #2, #3)
  - [x] Create container/ingest.py as main CLI entrypoint
  - [x] Accept repository URL as command-line argument
  - [x] Integrate gitingest library to generate code summary
  - [x] Handle varying repository sizes (10KB to 100MB+)
  - [x] Implement timeout enforcement (5 minutes max per repo)
  - [x] Add structured logging for processing events
  - [x] Generate statistics: successful, failed, average time per repo

- [x] Task 3: Implement retry logic with exponential backoff (AC: #2)
  - [x] Create retry wrapper function in container/ingest.py
  - [x] Implement exponential backoff: 3 attempts with delays [1s, 2s, 4s]
  - [x] Handle timeout errors, network errors, malformed repo errors
  - [x] Log retry attempts with repo URL and error details
  - [x] Continue processing on final failure (fail-safe - don't halt pipeline)
  - [x] Return success/failure status for upstream tracking

- [x] Task 4: Create comprehensive tests (AC: #1, #2, #3)
  - [x] Create container/test_ingest.py using pytest
  - [x] Test gitingest processing with valid repository URL
  - [x] Test timeout enforcement (simulate long-running repo)
  - [x] Test retry logic with transient failures
  - [x] Test retry exhaustion after 3 attempts
  - [x] Test fail-safe behavior (continue on failure)
  - [x] Test statistics tracking (successful, failed, average time)
  - [x] Mock gitingest library for controlled testing
  - [x] Verify all tests pass with `pytest container/test_ingest.py`

- [x] Task 5: Docker build and local testing (AC: #1, #3)
  - [x] Build Docker image: `docker build -t govreposcrape-ingest ./container`
  - [x] Test container locally with sample repository URL
  - [x] Verify environment variable injection works
  - [x] Test CLI entrypoint: `docker run govreposcrape-ingest python ingest.py <url>`
  - [x] Verify gitingest summary generation for real repository
  - [x] Document container usage in container/README.md

- [x] Task 6: Integration preparation for orchestrator (AC: #1, #2, #3)
  - [x] Design container invocation interface for Worker orchestrator (Story 2.6)
  - [x] Document expected input format (repository URL)
  - [x] Document expected output format (gitingest summary)
  - [x] Document error codes and failure modes
  - [x] Consider container orchestration platform (Docker on separate compute, not Workers)
  - [x] Add usage examples in container/README.md

- [x] Task 7: Update documentation (AC: #1, #2, #3)
  - [x] Document Dockerfile structure and build process
  - [x] Document ingest.py CLI interface and arguments
  - [x] Document retry logic and exponential backoff strategy
  - [x] Document timeout handling (5 minutes max)
  - [x] Document environment variable configuration
  - [x] Add troubleshooting section for common errors
  - [x] Document gitingest library version and dependencies

## Dev Notes

### Architecture Context

**Data Ingestion Pipeline - gitingest Processing** (from epics.md Epic 2):
- **Goal:** Generate LLM-ready code summaries for semantic search using gitingest Python library
- **Story 2.3 Role:** Container-based processing layer between cache checking (Story 2.2) and R2 storage (Story 2.4)
- **Challenge:** Cloudflare Workers can't run Python - requires separate Docker container
- **Scale:** ~21k repositories, average ~10s per repo → 58 hours sequential (parallelization in Story 2.5)
- **Performance:** Handle repositories from 10KB to 100MB+, enforce 5 minute timeout

**Container Architecture** (from epics.md):
- **Separation of Concerns:** Workers handle orchestration, container handles Python processing
- **Base Image:** Python 3.11 (compatibility with gitingest library)
- **Dependencies:** gitingest (code summarization), boto3 (R2 storage access)
- **CLI Interface:** `python ingest.py <repo-url>` for Worker invocation
- **Deployment:** Separate compute platform (not Workers) - e.g., Docker on VM, Cloud Run, ECS

**Retry and Error Handling**:
- **Exponential Backoff:** 3 attempts with delays [1s, 2s, 4s] (consistent with Stories 2.1, 2.2)
- **Timeout Enforcement:** 5 minutes max per repo (large repos can be slow)
- **Fail-Safe:** Processing continues on failure (don't halt entire pipeline for one repo)
- **Logging:** Structured logs with repo URL, error details, retry attempts

### Project Structure Notes

**New Container Directory**:
```
container/
├── Dockerfile           # Python 3.11 + gitingest + boto3
├── ingest.py           # Main CLI entrypoint - THIS STORY
├── test_ingest.py      # pytest test suite - THIS STORY
├── requirements.txt    # Python dependencies (gitingest, boto3, pytest)
├── .dockerignore       # Exclude unnecessary files from build
└── README.md           # Container documentation
```

**Integration with Existing Structure**:
```
src/
├── ingestion/            # Epic 2 modules
│   ├── repos-fetcher.ts  # Story 2.1 - EXISTING
│   ├── cache.ts          # Story 2.2 - EXISTING
│   └── orchestrator.ts   # Story 2.6 - will invoke container
```

### Learnings from Previous Story

**From Story 2.2: Smart Caching with KV (Status: done)**

**✅ REUSE THESE PATTERNS (APPLY TO CONTAINER):**
- **Retry Logic Pattern**: 3 attempts with exponential backoff [1s, 2s, 4s]
  - Apply to gitingest processing failures
  - Pattern: Implement similar retry wrapper in container/ingest.py
  - Reference: `src/utils/retry.ts` (TypeScript) → adapt to Python
- **Structured Logging**: JSON-formatted logs with context
  - Apply to container processing logs
  - Pattern: Use Python's `logging` module with JSON formatter
  - Log: processing start, success, failure, retry attempts, statistics
- **Fail-Safe Error Handling**: Continue processing on errors
  - Apply to gitingest failures (don't halt pipeline)
  - Pattern: Catch exceptions, log error, return failure status, continue
- **Statistics Tracking**: Track successful, failed, average time
  - Apply to container processing metrics
  - Pattern: In-memory counters, log periodic reports

**Architectural Patterns Established (TypeScript - adapt to Python)**:
- **File Naming**: Python: snake_case.py (ingest.py, test_ingest.py)
- **Function Naming**: Python: snake_case (process_repository, retry_with_backoff)
- **Module Pattern**: Python: functions and classes, clear separation of concerns
- **Documentation**: Comprehensive docstrings with examples (Python docstrings vs JSDoc)

**Testing Patterns to Follow**:
- **Test Framework**: pytest (Python equivalent of Vitest)
- **Test Structure**: Test classes or functions with clear naming
- **Coverage Target**: 80%+ on core logic
- **Mocking Strategy**: Mock gitingest library using pytest monkeypatch or unittest.mock
- **Reference**: test/ingestion/cache.test.ts patterns (adapt to Python)

**Quality Standards**:
- **Linting**: Use pylint or flake8 for Python code quality
- **Formatting**: Use black or autopep8 for consistent formatting
- **Type Checking**: Consider type hints (Python 3.11 supports improved type hints)
- **Test Pass Rate**: 100% (maintain established standard)

**Files Available for Integration (from Stories 2.1, 2.2)**:
- `src/ingestion/repos-fetcher.ts` - Provides repository URLs for processing
- `src/ingestion/cache.ts` - Filters repositories needing processing
- `src/utils/logger.ts` - Structured logging pattern (adapt to Python)
- `src/utils/retry.ts` - Retry pattern reference (adapt to Python)

**Implementation Success Factors from Story 2.2**:
- Comprehensive documentation with examples
- All functions exported/accessible with clear names
- Integration points clearly documented
- Test coverage for all acceptance criteria
- Proper mocking strategy for external dependencies
- Structured logging for all operations
- Error handling with graceful degradation

### Technical Implementation Notes

**gitingest Library**:
```python
# Install gitingest
pip install gitingest

# Basic usage (example)
from gitingest import ingest_repository

summary = ingest_repository("https://github.com/alphagov/govuk-frontend")
# Returns: Comprehensive code summary with structure, key files, dependencies
```

**Retry Logic Pattern** (adapt from TypeScript):
```python
import time
import logging

def retry_with_backoff(func, max_attempts=3, delays=[1, 2, 4]):
    """
    Retry function with exponential backoff

    Args:
        func: Function to retry
        max_attempts: Maximum number of attempts (default: 3)
        delays: Delay in seconds between retries (default: [1, 2, 4])

    Returns:
        Function result on success

    Raises:
        Exception: Last exception if all retries fail
    """
    for attempt in range(max_attempts):
        try:
            return func()
        except Exception as e:
            if attempt == max_attempts - 1:
                # Last attempt failed
                raise
            delay = delays[attempt] if attempt < len(delays) else delays[-1]
            logging.warning(f"Retry attempt {attempt + 1}/{max_attempts} after {delay}s delay: {e}")
            time.sleep(delay)
```

**Timeout Enforcement**:
```python
import signal

def timeout_handler(signum, frame):
    raise TimeoutError("gitingest processing exceeded 5 minute timeout")

# Set 5 minute timeout
signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(5 * 60)  # 300 seconds

try:
    # Process repository
    summary = ingest_repository(repo_url)
finally:
    signal.alarm(0)  # Cancel alarm
```

**CLI Entrypoint Structure**:
```python
#!/usr/bin/env python3
"""
gitingest Processing Container - CLI Entrypoint
Processes repository URLs and generates LLM-ready code summaries
"""

import sys
import argparse
import logging

def main():
    parser = argparse.ArgumentParser(description="Process repository with gitingest")
    parser.add_argument("repo_url", help="GitHub repository URL to process")
    args = parser.parse_args()

    # Process repository with retry and timeout
    result = process_repository_with_retry(args.repo_url)

    if result['success']:
        sys.exit(0)  # Success
    else:
        sys.exit(1)  # Failure

if __name__ == "__main__":
    main()
```

**Environment Variables**:
- R2_BUCKET: Cloudflare R2 bucket name
- R2_ENDPOINT: R2 endpoint URL
- R2_ACCESS_KEY: R2 access key ID
- R2_SECRET_KEY: R2 secret access key

**Error Scenarios to Handle**:
1. Repository not found (404) → Log error, mark failed, continue
2. Network timeout → Retry with backoff
3. gitingest processing timeout (5 min) → Log error, mark failed, continue
4. Malformed repository structure → Log error, mark failed, continue
5. gitingest library crash → Retry, then log error and continue

**Logging Strategy** (JSON structured logs):
- Log processing start: "Processing repository {url}"
- Log gitingest success: "Summary generated for {url} in {time}s"
- Log gitingest failure: "Processing failed for {url}: {error}"
- Log retry attempt: "Retry {attempt}/{max} for {url} after {delay}s"
- Log timeout: "Timeout after 5 minutes for {url}"
- Log statistics: "Processing stats: {successful} successful, {failed} failed, {avg_time}s avg"

**Performance Considerations**:
- Average processing time: ~10s per repo
- Large repos (100MB+): may take up to 5 minutes
- Timeout prevents runaway processes
- Retry logic handles transient failures
- Fail-safe ensures pipeline continues despite individual failures
- Sequential processing in this story (parallelization in Story 2.5)

### Testing Standards

**Test Framework**: pytest (Python testing framework)
- **Test Structure**: Test functions with descriptive names
- **Coverage Target**: 80%+ on core logic
- **Mocking Strategy**: Mock gitingest library using pytest monkeypatch or unittest.mock

**Test Coverage Requirements**:
- gitingest processing: successful summary generation
- Timeout enforcement: 5 minute limit
- Retry logic: 3 attempts with exponential backoff [1, 2, 4]
- Retry exhaustion: final failure after 3 attempts
- Fail-safe: continue processing on failure
- Statistics tracking: successful, failed, average time
- CLI interface: argument parsing and invocation

**Test Organization**:
```python
# container/test_ingest.py

import pytest
from ingest import process_repository, retry_with_backoff

class TestGitingestProcessing:
    def test_successful_processing(self, monkeypatch):
        # Mock gitingest to return summary
        # Verify summary generated
        pass

    def test_timeout_enforcement(self, monkeypatch):
        # Mock gitingest to exceed timeout
        # Verify TimeoutError raised
        pass

    def test_retry_with_backoff(self, monkeypatch):
        # Mock gitingest to fail twice, succeed third time
        # Verify 3 attempts with delays [1, 2, 4]
        pass

    def test_retry_exhaustion(self, monkeypatch):
        # Mock gitingest to fail all 3 attempts
        # Verify exception raised after final attempt
        pass

    def test_fail_safe_behavior(self):
        # Verify processing continues after failure
        # Verify error logged but no exception raised
        pass

    def test_statistics_tracking(self):
        # Verify successful, failed, average time tracked
        pass
```

### References

- [Source: docs/epics.md#Story-2.3] - Story definition and acceptance criteria
- [Source: docs/epics.md#Epic-2] - Data Ingestion Pipeline overview
- [Source: docs/PRD.md#FR-1.2] - gitingest Summary Generation functional requirement
- [Source: docs/PRD.md#NFR-1.3] - Performance requirements (~10s per repo)
- [Source: .bmad-ephemeral/stories/2-2-smart-caching-with-kv-avoid-unnecessary-reprocessing.md] - Cache integration and retry patterns
- [gitingest Python Library](https://pypi.org/project/gitingest/) - gitingest documentation
- [Cloudflare R2 Python SDK (boto3)](https://developers.cloudflare.com/r2/api/s3/api/) - R2 access with boto3

## Dev Agent Record

### Context Reference

- `.bmad-ephemeral/stories/2-3-container-based-gitingest-processing-with-retry-logic.context.xml`

### Agent Model Used

- claude-sonnet-4-5-20250929

### Completion Notes List

✅ **Story 2.3 Implementation Complete** (2025-11-13)

**Summary:**
Implemented complete containerized gitingest processing pipeline for UK government repositories. Container accepts repository URLs, generates LLM-ready code summaries, handles failures gracefully with retry logic, and integrates seamlessly with existing Cloudflare Workers infrastructure.

**Key Accomplishments:**

1. **Docker Container Infrastructure** (Task 1)
   - Created Dockerfile with Python 3.11 base image
   - Installed gitingest and boto3 dependencies
   - Configured environment variable support for R2 credentials
   - Added .dockerignore for efficient builds

2. **gitingest Processing Script** (Task 2)
   - Implemented container/ingest.py as CLI entrypoint
   - Integrated gitingest library (corrected import: `from gitingest import ingest`)
   - Added structured JSON logging matching TypeScript logger pattern
   - Implemented statistics tracking (successful, failed, average time)
   - Handles repositories from 10KB to 100MB+ with 5-minute timeout

3. **Retry Logic with Exponential Backoff** (Task 3)
   - Implemented retry_with_backoff function matching src/utils/retry.ts pattern
   - 3 attempts with delays [1s, 2s, 4s]
   - Handles timeout, network, and malformed repo errors
   - Fail-safe: continues processing on errors (doesn't halt pipeline)

4. **Comprehensive Test Suite** (Task 4)
   - Created 14 pytest tests covering all acceptance criteria
   - 100% test pass rate (14/14 passed)
   - Mocked gitingest library for controlled testing
   - Coverage: gitingest processing, retry logic, timeout enforcement, CLI interface, environment variables, statistics

5. **Docker Build and Testing** (Task 5)
   - Successfully built Docker image: govreposcrape-ingest
   - Verified container builds correctly with all dependencies
   - Tested CLI entrypoint and environment variable injection
   - All 14 container tests passed

6. **Integration Preparation** (Task 6)
   - Designed container invocation interface for Worker orchestrator (Story 2.6)
   - Documented input format (repository URL as CLI argument)
   - Documented output format (exit code 0=success, 1=failure)
   - Documented error codes and failure modes
   - Prepared for Docker on separate compute platform

7. **Comprehensive Documentation** (Task 7)
   - Created detailed container/README.md with:
     - Architecture overview and role in pipeline
     - Build instructions and usage examples
     - Retry logic and timeout enforcement details
     - Parallel execution strategy (Story 2.5 prep)
     - Troubleshooting section
     - Integration examples for orchestrator

**Technical Highlights:**

- **Consistent Patterns:** Adapted TypeScript retry pattern from src/utils/retry.ts to Python
- **Structured Logging:** JSON-formatted logs match src/utils/logger.ts pattern
- **Test Quality:** 100% pass rate (14 pytest + 136 vitest = 150 total tests passing)
- **No Regressions:** All existing TypeScript tests still pass
- **Fail-Safe Design:** Container never halts pipeline - errors logged and processing continues
- **Ready for Integration:** Clear interface for Worker orchestrator (Story 2.6)

**Dependencies Added:**
- gitingest (latest) - LLM-ready code summarization
- boto3 (^1.34) - R2 storage access
- pytest (^8.0) - Testing framework
- pytest-mock (^3.12) - Mocking support

### File List

**New Files Created:**
- container/Dockerfile
- container/requirements.txt
- container/.dockerignore
- container/ingest.py
- container/test_ingest.py
- container/README.md

**Modified Files:**
- `.bmad-ephemeral/stories/2-3-container-based-gitingest-processing-with-retry-logic.md` (story file)
- `.bmad-ephemeral/sprint-status.yaml` (status tracking)

---

## Senior Developer Review (AI)

### Reviewer
Claude (claude-sonnet-4-5-20250929)

### Date
2025-11-13

### Outcome
**APPROVE** ✅

All acceptance criteria fully implemented with evidence. All completed tasks verified. No regressions introduced. Implementation demonstrates excellent adherence to architectural patterns. Code quality exceeds expectations with 100% test pass rate (150/150 tests).

### Summary

Story 2.3 delivers a production-ready containerized gitingest processing pipeline. Implementation demonstrates:

✅ **Complete AC Coverage:** 3/3 acceptance criteria fully implemented
✅ **Verified Tasks:** 48/48 tasks verified complete (0 questionable, 0 false completions)
✅ **Test Quality:** 100% pass rate (14 pytest + 136 vitest = 150 total tests)
✅ **Architectural Alignment:** Patterns match TypeScript codebase (retry, logging)
✅ **No Regressions:** All existing tests pass
✅ **Documentation:** Comprehensive README with troubleshooting

The container successfully adapts TypeScript patterns to Python while maintaining consistency. Fail-safe design ensures pipeline robustness.

### Key Findings

**HIGH Severity Issues:** None
**MEDIUM Severity Issues:** None  
**LOW Severity Issues:**
1. **[Advisory]** Docker build warning for ENV secrets (lines 30-31) - Expected behavior for runtime injection, no action required

### Acceptance Criteria Coverage

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| **AC1** | Container with Python 3.11/gitingest, handles 10KB-100MB+ repos | ✅ IMPLEMENTED | Dockerfile:7, ingest.py:165,145-250, tests pass |
| **AC2** | 3 retries [1s,2s,4s], 5-min timeout, fail-safe error handling | ✅ IMPLEMENTED | ingest.py:112-142,177-231,233-250, tests pass |
| **AC3** | Dockerfile with deps, ENV vars, CLI, stats logging | ✅ IMPLEMENTED | Dockerfile:7,28-31, ingest.py:253-275,56-94, tests pass |

**Summary:** 3 of 3 ACs fully implemented (100%)

### Task Completion Validation

**Summary:** 48 of 48 tasks verified complete (100% verification, 0 questionable, 0 false completions)

All tasks systematically verified with file:line evidence. Key validations:
- ✅ Dockerfile: Python 3.11, gitingest, boto3, ENV vars (Dockerfile:1-35)
- ✅ ingest.py: CLI entrypoint, retry logic, timeout, logging, stats (ingest.py:1-320)
- ✅ Tests: 14 pytest tests covering all ACs (test_ingest.py:1-271, 100% pass)
- ✅ Documentation: Comprehensive README (README.md:1-328)

### Test Coverage

- **Container Tests:** 14/14 passed (100%)
- **Existing Tests:** 136/136 passed (100%)
- **Total:** 150/150 passing
- **Coverage:** All ACs have corresponding tests
- **No gaps identified**

### Architectural Alignment

✅ **Pattern Consistency:**
- Retry: matches src/utils/retry.ts (3 attempts, [1s,2s,4s])
- Logging: matches src/utils/logger.ts (JSON with timestamp/level/context)

✅ **Constraint Adherence:**
- Python 3.11+, separate container, fail-safe, CLI interface, ENV vars, pytest 80%+

✅ **Integration Points:**
- Ready for Worker orchestrator (Story 2.6)
- Compatible with repos-fetcher.ts, cache.ts
- Prepared for R2 storage (Story 2.4)

**No violations found**

### Security Notes

✅ Secrets via ENV (runtime injection)
✅ Input validation
✅ Error handling (no stack leaks)
✅ Minimal base image
⚠️ Docker ENV warning: informational only

### Action Items

**Code Changes Required:** None

**Advisory Notes:**
- Note: Add Dockerfile comment for ENV secrets (addresses Docker warning)
- Note: R2 upload in Story 2.4 (currently logs warning - expected)
- Note: Orchestrator in Story 2.6 (interface ready)
- Note: Parallel execution prepared for Story 2.5
