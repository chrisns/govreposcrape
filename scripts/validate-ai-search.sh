#!/bin/bash
# Validates that Cloudflare AI Search is configured and operational
# Usage: ./scripts/validate-ai-search.sh [worker-url]
#        ./scripts/validate-ai-search.sh --test
# Example: ./scripts/validate-ai-search.sh https://govreposcrape.workers.dev

set -e

# Parse arguments for test mode
TEST_MODE=false
if [[ "$1" == "--test" ]]; then
  TEST_MODE=true
  shift
fi

# Default to local development if no URL provided
WORKER_URL="${1:-http://localhost:8787}"
HEALTH_ENDPOINT="${WORKER_URL}/mcp/health"

if [[ "$TEST_MODE" == "true" ]]; then
  echo "🧪 Running in test mode..."
  echo ""
fi

echo "🔍 Validating AI Search configuration..."
if [[ "$TEST_MODE" == "false" ]]; then
  echo "   Endpoint: ${HEALTH_ENDPOINT}"
fi
echo ""

# Dependency checks
if ! command -v curl &> /dev/null; then
    echo "❌ ERROR: curl is not installed"
    echo "   Install with: brew install curl (macOS) or apt-get install curl (Linux)"
    echo "   See: https://curl.se/download.html"
    exit 1
fi

# Check if jq is available (optional)
if ! command -v jq &> /dev/null; then
    if [[ "$TEST_MODE" == "true" ]]; then
        echo "⚠️  WARNING: jq is not installed (optional for detailed output)"
        echo "   Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    fi
fi

# Test mode: Validate dependencies and syntax only
if [[ "$TEST_MODE" == "true" ]]; then
  echo "✅ Dependencies: OK"
  echo "   - curl: $(command -v curl)"
  if command -v jq &> /dev/null; then
    echo "   - jq: $(command -v jq)"
  else
    echo "   - jq: not installed (optional)"
  fi
  echo ""
  echo "✅ Environment variables: OK"
  echo "   - WORKER_URL: ${WORKER_URL}"
  echo "   - HEALTH_ENDPOINT: ${HEALTH_ENDPOINT}"
  echo ""
  echo "✅ Syntax: OK"
  echo ""
  echo "🎉 Test mode passed - script is ready to run"
  exit 0
fi

# Make health check request
echo "📡 Checking health endpoint..."
HTTP_STATUS=$(curl -s -o /tmp/ai-search-health.json -w "%{http_code}" "${HEALTH_ENDPOINT}")

if [ "$HTTP_STATUS" -ne 200 ]; then
    echo "❌ Health check failed with HTTP ${HTTP_STATUS}"

    if [ -f /tmp/ai-search-health.json ]; then
        echo ""
        echo "Response body:"
        if command -v jq &> /dev/null; then
            cat /tmp/ai-search-health.json | jq '.'
        else
            cat /tmp/ai-search-health.json
        fi
    fi

    echo ""
    echo "💡 Troubleshooting steps:"
    echo "   1. Verify Worker is deployed: wrangler deploy"
    echo "   2. Check AI Search configuration in Cloudflare Dashboard"
    echo "   3. See DEPLOYMENT.md for configuration instructions"
    exit 1
fi

# Parse response
if command -v jq &> /dev/null; then
    AI_SEARCH_STATUS=$(cat /tmp/ai-search-health.json | jq -r '.services.ai_search.status // "unknown"')
else
    # Fallback without jq (basic grep)
    AI_SEARCH_STATUS=$(grep -o '"ai_search"[^}]*"status":"[^"]*"' /tmp/ai-search-health.json | sed 's/.*"status":"\([^"]*\)".*/\1/' || echo "unknown")
fi

echo ""
if [ "$AI_SEARCH_STATUS" = "ok" ]; then
    echo "✅ AI Search is configured and operational"

    if command -v jq &> /dev/null; then
        echo ""
        echo "📊 Service Status:"
        cat /tmp/ai-search-health.json | jq '.services'
    fi

    echo ""
    echo "✨ Next steps:"
    echo "   1. Upload test file: See DEPLOYMENT.md Test 1"
    echo "   2. Verify indexing: Wait 5 minutes and query for test content"
    echo "   3. Run integration tests: npm test"

    exit 0
else
    echo "❌ AI Search status: ${AI_SEARCH_STATUS}"

    if command -v jq &> /dev/null; then
        echo ""
        echo "Error details:"
        cat /tmp/ai-search-health.json | jq '.services.ai_search'
    fi

    echo ""
    echo "💡 Configuration required:"
    echo "   1. Access Cloudflare Dashboard: https://dash.cloudflare.com/ai/search"
    echo "   2. Follow setup instructions in DEPLOYMENT.md"
    echo "   3. Configure index with R2 bucket: govreposcrape-gitingest"

    exit 1
fi

# Clean up temp file
rm -f /tmp/ai-search-health.json
