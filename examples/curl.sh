#!/bin/bash
# govscraperepo MCP API - cURL Example
# Demonstrates how to search UK government code repositories using curl
#
# Prerequisites: curl (standard on macOS/Linux)
# Usage: ./examples/curl.sh
#
# This example shows:
# - Basic search query for authentication patterns
# - Error handling for invalid queries
# - Response parsing and display

set -e  # Exit on error

# API Configuration
# Use environment variable or default to production
API_BASE="${MCP_API_URL:-https://govreposcrape-api-1060386346356.us-central1.run.app}"
API_URL="${API_BASE}/mcp/search"
HEALTH_URL="${API_BASE}/mcp/health"

# Note: If you encounter SSL errors with the custom domain, you can use:
#   export MCP_API_URL="http://localhost:8788"  # For local development
# Then run this script again

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 govscraperepo MCP API - cURL Example"
echo "========================================"
echo ""

# Example 1: Successful search query
echo "📝 Example 1: Search for authentication middleware patterns"
echo "Query: 'UK government authentication middleware JWT token validation'"
echo ""

# Make the API request
# - Content-Type: application/json is REQUIRED
# - X-MCP-Version: 2 is optional but recommended
# - Body contains query (3-500 chars) and limit (1-20, default 5)
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -H "X-MCP-Version: 2" \
  -d '{
    "query": "UK government authentication middleware JWT token validation",
    "limit": 5
  }')

# Extract HTTP status code and response body
HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n 1)

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo -e "${GREEN}✅ Success!${NC} HTTP $HTTP_STATUS"
  echo ""

  # Parse response using basic text tools (jq is optional)
  if command -v jq &> /dev/null; then
    # Pretty print with jq if available
    echo "Response (formatted):"
    echo "$HTTP_BODY" | jq '.'
    echo ""

    # Extract key information
    RESULT_COUNT=$(echo "$HTTP_BODY" | jq '.results | length')
    TOOK_MS=$(echo "$HTTP_BODY" | jq '.took_ms')

    echo "📊 Results: $RESULT_COUNT repositories found in ${TOOK_MS}ms"
    echo ""

    # Display first result details
    if [ "$RESULT_COUNT" -gt 0 ]; then
      echo "First result:"
      echo "$HTTP_BODY" | jq '.results[0] | {
        repository,
        relevance_score,
        github_url: .metadata.github_url
      }'
    fi
  else
    # Fallback without jq
    echo "Response (raw JSON):"
    echo "$HTTP_BODY"
    echo ""
    echo -e "${YELLOW}💡 Tip: Install jq for formatted output: brew install jq${NC}"
  fi
else
  echo -e "${RED}❌ Request failed${NC} HTTP $HTTP_STATUS"
  echo ""
  echo "Error response:"
  echo "$HTTP_BODY"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Example 2: Error handling - Query too short
echo "📝 Example 2: Error handling - Query too short (< 3 chars)"
echo "Query: 'ab' (only 2 characters)"
echo ""

ERROR_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "ab",
    "limit": 5
  }')

ERROR_BODY=$(echo "$ERROR_RESPONSE" | head -n -1)
ERROR_STATUS=$(echo "$ERROR_RESPONSE" | tail -n 1)

if [ "$ERROR_STATUS" -eq 400 ]; then
  echo -e "${GREEN}✅ Error handling works correctly${NC} HTTP $ERROR_STATUS"
  echo ""

  if command -v jq &> /dev/null; then
    echo "Error response:"
    echo "$ERROR_BODY" | jq '.'

    ERROR_CODE=$(echo "$ERROR_BODY" | jq -r '.error.code')
    ERROR_MESSAGE=$(echo "$ERROR_BODY" | jq -r '.error.message')

    echo ""
    echo "Error Code: $ERROR_CODE"
    echo "Message: $ERROR_MESSAGE"
  else
    echo "Error response (raw):"
    echo "$ERROR_BODY"
  fi
else
  echo -e "${YELLOW}⚠️ Unexpected status code${NC} HTTP $ERROR_STATUS"
  echo "$ERROR_BODY"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Example 3: Error handling - Limit out of range
echo "📝 Example 3: Error handling - Limit out of range (> 20)"
echo "Limit: 100 (maximum is 20)"
echo ""

LIMIT_ERROR=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication middleware",
    "limit": 100
  }')

LIMIT_BODY=$(echo "$LIMIT_ERROR" | head -n -1)
LIMIT_STATUS=$(echo "$LIMIT_ERROR" | tail -n 1)

if [ "$LIMIT_STATUS" -eq 400 ]; then
  echo -e "${GREEN}✅ Validation works correctly${NC} HTTP $LIMIT_STATUS"
  echo ""

  if command -v jq &> /dev/null; then
    echo "$LIMIT_BODY" | jq '{
      error_code: .error.code,
      message: .error.message
    }'
  else
    echo "$LIMIT_BODY"
  fi
else
  echo -e "${YELLOW}⚠️ Unexpected response${NC}"
  echo "$LIMIT_BODY"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Example 4: Health check
echo "📝 Example 4: API Health Check"
echo "Endpoint: GET ${HEALTH_URL}"
echo ""

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${HEALTH_URL}")
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | tail -n 1)

if [ "$HEALTH_STATUS" -eq 200 ]; then
  echo -e "${GREEN}✅ API is healthy${NC} HTTP $HEALTH_STATUS"
  echo ""

  if command -v jq &> /dev/null; then
    echo "$HEALTH_BODY" | jq '{
      status,
      service_count: (.services | length),
      timestamp
    }'
  else
    echo "$HEALTH_BODY"
  fi
else
  echo -e "${RED}❌ API health check failed${NC} HTTP $HEALTH_STATUS"
  echo "$HEALTH_BODY"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎉 Examples complete!"
echo ""
echo "💡 Next steps:"
echo "   - Try your own queries by modifying the 'query' field"
echo "   - Adjust 'limit' (1-20) to get more or fewer results"
echo "   - See README.md for Node.js and Python examples"
echo "   - Run ./scripts/test-mcp.sh to validate your integration"
echo ""
echo "📚 API Documentation:"
echo "   - OpenAPI Spec: ${API_URL%/mcp/search}/openapi.json"
echo "   - Integration Guide: docs/integration/claude-desktop.md"
echo ""
