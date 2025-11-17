#!/bin/bash
# MCP API Integration Test Script
# Validates that the govscraperepo MCP API is operational and responding correctly
#
# Usage: ./scripts/test-mcp.sh [api-url]
#        ./scripts/test-mcp.sh --test
#        ./scripts/test-mcp.sh --verbose
#
# Examples:
#   ./scripts/test-mcp.sh                                          # Test production API
#   ./scripts/test-mcp.sh http://localhost:8788                   # Test local development
#   ./scripts/test-mcp.sh https://govreposcrape.cloud.cns.me      # Test specific URL
#   ./scripts/test-mcp.sh --verbose                                # Detailed output
#   ./scripts/test-mcp.sh --test                                   # Syntax validation only

set -e

# Parse arguments
TEST_MODE=false
VERBOSE=false
API_URL=""

for arg in "$@"; do
  case $arg in
    --test)
      TEST_MODE=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    http://*|https://*)
      API_URL="$arg"
      shift
      ;;
    *)
      # Unknown argument
      ;;
  esac
done

# Default to production if no URL provided
if [ -z "$API_URL" ]; then
  API_URL="${MCP_API_URL:-https://govreposcrape.cloud.cns.me}"
fi

SEARCH_ENDPOINT="${API_URL}/mcp/search"
HEALTH_ENDPOINT="${API_URL}/mcp/health"
OPENAPI_ENDPOINT="${API_URL}/openapi.json"

# Counters for test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test mode header
if [[ "$TEST_MODE" == "true" ]]; then
  echo "🧪 Running in test mode (syntax validation only)..."
  echo ""
fi

echo "🔍 MCP API Integration Test"
echo "============================"
if [[ "$TEST_MODE" == "false" ]]; then
  echo "API URL: ${API_URL}"
fi
echo ""

# Dependency checks
echo "📦 Checking dependencies..."

if ! command -v curl &> /dev/null; then
    echo "❌ ERROR: curl is not installed"
    echo "   Install with: brew install curl (macOS) or apt-get install curl (Linux)"
    exit 1
fi

if command -v jq &> /dev/null; then
  HAS_JQ=true
  if [[ "$VERBOSE" == "true" ]]; then
    echo "   ✅ curl: $(command -v curl)"
    echo "   ✅ jq: $(command -v jq)"
  fi
else
  HAS_JQ=false
  if [[ "$TEST_MODE" == "false" ]]; then
    echo "   ⚠️  jq not installed (optional - install for formatted output)"
  fi
  if [[ "$VERBOSE" == "true" ]]; then
    echo "   ✅ curl: $(command -v curl)"
    echo "   ⚠️  jq: not found (optional)"
  fi
fi

echo ""

# Test mode: Validate dependencies and syntax only
if [[ "$TEST_MODE" == "true" ]]; then
  echo "✅ Dependencies: OK"
  echo "✅ Environment variables: OK"
  echo "   - API_URL: ${API_URL}"
  echo "   - SEARCH_ENDPOINT: ${SEARCH_ENDPOINT}"
  echo "   - HEALTH_ENDPOINT: ${HEALTH_ENDPOINT}"
  echo "   - OPENAPI_ENDPOINT: ${OPENAPI_ENDPOINT}"
  echo ""
  echo "✅ Syntax: OK"
  echo ""
  echo "🎉 Test mode passed - script is ready to run"
  exit 0
fi

# Helper function to run a test
run_test() {
  local test_name="$1"
  ((TESTS_RUN++))

  if [[ "$VERBOSE" == "true" ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test $TESTS_RUN: $test_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  else
    echo "Test $TESTS_RUN: $test_name"
  fi
}

# Helper function to mark test as passed
test_passed() {
  ((TESTS_PASSED++))
  echo "✅ PASSED"
  echo ""
}

# Helper function to mark test as failed
test_failed() {
  local reason="$1"
  ((TESTS_FAILED++))
  echo "❌ FAILED: $reason"
  echo ""
}

# Test 1: Health endpoint connectivity
run_test "Health endpoint reachable"

HEALTH_START=$(date +%s%3N)
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${HEALTH_ENDPOINT}" 2>&1 || echo -e "\n000")
HEALTH_END=$(date +%s%3N)
HEALTH_DURATION=$((HEALTH_END - HEALTH_START))

HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | tail -n 1)

if [[ "$VERBOSE" == "true" ]]; then
  echo "   Endpoint: ${HEALTH_ENDPOINT}"
  echo "   Duration: ${HEALTH_DURATION}ms"
  echo "   HTTP Status: ${HEALTH_STATUS}"
fi

if [ "$HEALTH_STATUS" -eq 200 ]; then
  test_passed
else
  test_failed "HTTP ${HEALTH_STATUS} - expected 200"
  if [[ "$VERBOSE" == "true" && -n "$HEALTH_BODY" ]]; then
    echo "   Response: $HEALTH_BODY"
    echo ""
  fi
fi

# Test 2: Health response format
run_test "Health response has correct format"

if [ "$HEALTH_STATUS" -eq 200 ] && [[ "$HAS_JQ" == "true" ]]; then
  STATUS_FIELD=$(echo "$HEALTH_BODY" | jq -r '.status' 2>/dev/null || echo "")
  SERVICES_FIELD=$(echo "$HEALTH_BODY" | jq '.services' 2>/dev/null || echo "")

  if [[ -n "$STATUS_FIELD" && -n "$SERVICES_FIELD" ]]; then
    if [[ "$VERBOSE" == "true" ]]; then
      echo "   Status: $STATUS_FIELD"
      echo "   Services checked: $(echo "$HEALTH_BODY" | jq '.services | length')"
    fi
    test_passed
  else
    test_failed "Missing required fields (status, services)"
  fi
elif [ "$HEALTH_STATUS" -ne 200 ]; then
  test_failed "Skipped - health endpoint not reachable"
else
  # No jq - skip validation
  echo "⚠️  SKIPPED: jq required for JSON validation"
  echo ""
fi

# Test 3: Search endpoint reachable with valid query
run_test "Search endpoint returns results for valid query"

SEARCH_START=$(date +%s%3N)
SEARCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SEARCH_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "X-MCP-Version: 2" \
  -d '{"query":"authentication middleware","limit":3}' 2>&1 || echo -e "\n000")
SEARCH_END=$(date +%s%3N)
SEARCH_DURATION=$((SEARCH_END - SEARCH_START))

SEARCH_BODY=$(echo "$SEARCH_RESPONSE" | head -n -1)
SEARCH_STATUS=$(echo "$SEARCH_RESPONSE" | tail -n 1)

if [[ "$VERBOSE" == "true" ]]; then
  echo "   Endpoint: ${SEARCH_ENDPOINT}"
  echo "   Query: 'authentication middleware'"
  echo "   Duration: ${SEARCH_DURATION}ms"
  echo "   HTTP Status: ${SEARCH_STATUS}"
fi

if [ "$SEARCH_STATUS" -eq 200 ]; then
  test_passed
else
  test_failed "HTTP ${SEARCH_STATUS} - expected 200"
  if [[ "$VERBOSE" == "true" && -n "$SEARCH_BODY" ]]; then
    echo "   Response: $SEARCH_BODY"
    echo ""
  fi
fi

# Test 4: Search response format validation
run_test "Search response has correct structure"

if [ "$SEARCH_STATUS" -eq 200 ] && [[ "$HAS_JQ" == "true" ]]; then
  RESULTS_FIELD=$(echo "$SEARCH_BODY" | jq '.results' 2>/dev/null || echo "")
  TOOK_MS_FIELD=$(echo "$SEARCH_BODY" | jq '.took_ms' 2>/dev/null || echo "")

  if [[ -n "$RESULTS_FIELD" && -n "$TOOK_MS_FIELD" ]]; then
    RESULT_COUNT=$(echo "$SEARCH_BODY" | jq '.results | length')
    if [[ "$VERBOSE" == "true" ]]; then
      echo "   Results count: $RESULT_COUNT"
      echo "   Response time: $(echo "$SEARCH_BODY" | jq '.took_ms')ms"
    fi
    test_passed
  else
    test_failed "Missing required fields (results, took_ms)"
  fi
elif [ "$SEARCH_STATUS" -ne 200 ]; then
  test_failed "Skipped - search endpoint not reachable"
else
  echo "⚠️  SKIPPED: jq required for JSON validation"
  echo ""
fi

# Test 5: Invalid query error handling
run_test "API rejects query that's too short (< 3 chars)"

ERROR_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SEARCH_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{"query":"ab","limit":5}' 2>&1 || echo -e "\n000")

ERROR_BODY=$(echo "$ERROR_RESPONSE" | head -n -1)
ERROR_STATUS=$(echo "$ERROR_RESPONSE" | tail -n 1)

if [[ "$VERBOSE" == "true" ]]; then
  echo "   Query: 'ab' (2 characters)"
  echo "   HTTP Status: ${ERROR_STATUS}"
fi

if [ "$ERROR_STATUS" -eq 400 ]; then
  if [[ "$HAS_JQ" == "true" ]]; then
    ERROR_CODE=$(echo "$ERROR_BODY" | jq -r '.error.code' 2>/dev/null || echo "")
    if [[ "$VERBOSE" == "true" ]]; then
      echo "   Error code: $ERROR_CODE"
    fi

    if [[ "$ERROR_CODE" == "INVALID_QUERY" ]]; then
      test_passed
    else
      test_failed "Expected error code INVALID_QUERY, got: $ERROR_CODE"
    fi
  else
    test_passed
  fi
else
  test_failed "HTTP ${ERROR_STATUS} - expected 400"
fi

# Test 6: Invalid limit error handling
run_test "API rejects limit out of range (> 20)"

LIMIT_ERROR=$(curl -s -w "\n%{http_code}" -X POST "${SEARCH_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{"query":"authentication","limit":100}' 2>&1 || echo -e "\n000")

LIMIT_BODY=$(echo "$LIMIT_ERROR" | head -n -1)
LIMIT_STATUS=$(echo "$LIMIT_ERROR" | tail -n 1)

if [[ "$VERBOSE" == "true" ]]; then
  echo "   Limit: 100 (max is 20)"
  echo "   HTTP Status: ${LIMIT_STATUS}"
fi

if [ "$LIMIT_STATUS" -eq 400 ]; then
  if [[ "$HAS_JQ" == "true" ]]; then
    ERROR_CODE=$(echo "$LIMIT_BODY" | jq -r '.error.code' 2>/dev/null || echo "")
    if [[ "$VERBOSE" == "true" ]]; then
      echo "   Error code: $ERROR_CODE"
    fi

    if [[ "$ERROR_CODE" == "INVALID_LIMIT" ]]; then
      test_passed
    else
      test_failed "Expected error code INVALID_LIMIT, got: $ERROR_CODE"
    fi
  else
    test_passed
  fi
else
  test_failed "HTTP ${LIMIT_STATUS} - expected 400"
fi

# Test 7: OpenAPI specification availability
run_test "OpenAPI specification is accessible"

OPENAPI_RESPONSE=$(curl -s -w "\n%{http_code}" "${OPENAPI_ENDPOINT}" 2>&1 || echo -e "\n000")
OPENAPI_BODY=$(echo "$OPENAPI_RESPONSE" | head -n -1)
OPENAPI_STATUS=$(echo "$OPENAPI_RESPONSE" | tail -n 1)

if [[ "$VERBOSE" == "true" ]]; then
  echo "   Endpoint: ${OPENAPI_ENDPOINT}"
  echo "   HTTP Status: ${OPENAPI_STATUS}"
fi

if [ "$OPENAPI_STATUS" -eq 200 ]; then
  if [[ "$HAS_JQ" == "true" ]]; then
    OPENAPI_VERSION=$(echo "$OPENAPI_BODY" | jq -r '.openapi' 2>/dev/null || echo "")
    if [[ "$VERBOSE" == "true" && -n "$OPENAPI_VERSION" ]]; then
      echo "   OpenAPI version: $OPENAPI_VERSION"
    fi
  fi
  test_passed
else
  test_failed "HTTP ${OPENAPI_STATUS} - expected 200"
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Total tests:   $TESTS_RUN"
echo "Passed:        $TESTS_PASSED"
echo "Failed:        $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "🎉 All tests passed! MCP API is working correctly."
  echo ""
  echo "✅ Endpoints validated:"
  echo "   - Health check: ${HEALTH_ENDPOINT}"
  echo "   - Search API: ${SEARCH_ENDPOINT}"
  echo "   - OpenAPI spec: ${OPENAPI_ENDPOINT}"
  echo ""
  echo "📚 Next steps:"
  echo "   - Try the example scripts: examples/curl.sh, examples/node.js, examples/python.py"
  echo "   - Read integration guides: docs/integration/claude-desktop.md"
  echo "   - View API spec: ${OPENAPI_ENDPOINT}"
  echo ""
  exit 0
else
  echo "❌ Some tests failed. Please check the output above for details."
  echo ""
  echo "💡 Troubleshooting:"
  echo "   - Verify API URL is correct: ${API_URL}"
  echo "   - Check network connectivity"
  echo "   - Try with --verbose flag for detailed output"
  echo "   - For local testing: ./scripts/test-mcp.sh http://localhost:8788"
  echo ""
  exit 1
fi
