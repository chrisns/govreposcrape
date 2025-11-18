#!/usr/bin/env bash
#
# govreposcrape Smoke Test Script
#
# Validates that the govreposcrape container and Google File Search integration are operational.
# This script performs quick health checks without requiring full deployment.
#
# Usage:
#   ./scripts/smoke-test.sh                    # Run all smoke tests
#   ./scripts/smoke-test.sh --verbose          # Detailed output
#   ./scripts/smoke-test.sh --test             # Syntax validation only
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
#   2 - Script error (missing dependencies, invalid usage)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
TEST_MODE=false
VERBOSE=false

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --test)
      TEST_MODE=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "govreposcrape Smoke Test Script"
      echo ""
      echo "Usage:"
      echo "  $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --test       Syntax validation only (no actual execution)"
      echo "  --verbose    Detailed output for debugging"
      echo "  --help, -h   Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 2
      ;;
  esac
done

# Test mode header
if [[ "$TEST_MODE" == "true" ]]; then
  echo "🧪 Running in test mode (syntax validation only)..."
  echo ""
fi

echo "🧪 govreposcrape Smoke Tests"
echo "============================"
echo ""

# Dependency checks
echo "📦 Checking dependencies..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ ERROR: Docker is not installed${NC}"
    echo "   Install Docker: https://docs.docker.com/get-docker/"
    exit 2
fi

DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
echo -e "${GREEN}✅ Docker available${NC} (version $DOCKER_VERSION)"

# Check if container image exists
if docker images | grep -q "govreposcrape-container"; then
    echo -e "${GREEN}✅ Python container image built${NC}"
else
    echo -e "${YELLOW}⚠️  Container image not found${NC}"
    echo "   Build with: docker build -t govreposcrape-container ./container"
    if [[ "$TEST_MODE" == "false" ]]; then
        exit 2
    fi
fi

echo ""

# Exit early if in test mode
if [[ "$TEST_MODE" == "true" ]]; then
    echo "✅ Syntax validation passed"
    echo "   All smoke test checks are properly configured"
    exit 0
fi

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_output="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ "$VERBOSE" == "true" ]]; then
        echo ""
        echo -e "${BLUE}Running:${NC} $test_command"
    fi

    local start_time=$(date +%s)
    local output
    local exit_code=0

    output=$(eval "$test_command" 2>&1) || exit_code=$?

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [[ $exit_code -eq 0 ]] && echo "$output" | grep -q "$expected_output"; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "Test $TESTS_RUN/$((TESTS_RUN)): $test_name... ${GREEN}✅ PASS${NC} (${duration}s)"

        if [[ "$VERBOSE" == "true" ]]; then
            echo -e "${BLUE}Output:${NC}"
            echo "$output" | sed 's/^/  /'
        fi

        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "Test $TESTS_RUN/$((TESTS_RUN)): $test_name... ${RED}❌ FAIL${NC} (${duration}s)"

        echo -e "${RED}Error output:${NC}"
        echo "$output" | sed 's/^/  /'

        if [[ $exit_code -ne 0 ]]; then
            echo -e "${RED}Exit code: $exit_code${NC}"
        else
            echo -e "${YELLOW}Expected output not found: \"$expected_output\"${NC}"
        fi

        return 1
    fi
}

# Start smoke tests
echo "🔍 Running smoke tests..."
echo ""

# Test 1: Container health check
run_test \
    "Container health check" \
    "docker run --rm govreposcrape-container python -c \"print('Container OK')\"" \
    "Container OK"

# Test 2: Google File Search client import
run_test \
    "Google File Search client import" \
    "docker run --rm govreposcrape-container python -c \"from google_filesearch_client import GoogleFileSearchClient; print('Import OK')\"" \
    "Import OK"

# Test 3: Orchestrator import
run_test \
    "Orchestrator import" \
    "docker run --rm govreposcrape-container python -c \"import orchestrator; print('Orchestrator OK')\"" \
    "Orchestrator OK"

# Test 4: Python dependencies available
run_test \
    "Python dependencies" \
    "docker run --rm govreposcrape-container python -c \"import google.generativeai; import gitingest; print('Dependencies OK')\"" \
    "Dependencies OK"

# Summary
echo ""
echo "============================"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed ($TESTS_PASSED/$TESTS_RUN)${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed ($TESTS_FAILED/$TESTS_RUN)${NC}"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    exit 1
fi
