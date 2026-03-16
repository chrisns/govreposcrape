#!/bin/bash
#
# Snippets Mode Example - Balanced Default
#
# Use case: AI assistants, web UI, standard search (DEFAULT mode)
# Performance: <1500ms p95, ~5KB per result
# Returns: Metadata + focused code snippets (3-5 lines with context)
#

# Set your API endpoint (replace with your actual Cloud Run URL)
API_URL="${API_URL:-https://govreposcrape-api-xxxxx-uc.a.run.app}"

# Example 1: Explicit snippets mode
echo "=== Example 1: Explicit snippets mode ==="
curl -X POST "${API_URL}/mcp/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "OAuth2 implementation patterns",
    "limit": 3,
    "resultMode": "snippets"
  }' | jq '.'

echo ""
echo "=== Example 2: Default mode (resultMode omitted) ==="
# Example 2: Default behavior - same as snippets mode
curl -X POST "${API_URL}/mcp/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "OAuth2 implementation patterns",
    "limit": 3
  }' | jq '.'

# Expected response structure:
# {
#   "results": [
#     {
#       "repo_url": "https://github.com/alphagov/govuk-frontend",
#       "repo_org": "alphagov",
#       "repo_name": "govuk-frontend",
#       "language": "TypeScript",
#       "last_updated": "2025-01-15T10:30:00Z",
#       "similarity_score": 0.87,
#       "github_link": "https://github.com/alphagov/govuk-frontend",
#       "metadata": {
#         "stars": 1234,
#         "license": "MIT"
#       },
#       "snippet": "function authenticateUser(req, res, next) {\n  const token = req.headers.authorization;\n  if (!validateToken(token)) return res.status(401).send('Unauthorized');\n  next();\n}",
#       "snippet_file_path": "src/auth/middleware.ts",
#       "snippet_line_range": "45-50",
#       "context_lines_before": 2,
#       "context_lines_after": 2,
#       "codespaces_link": "https://github.dev/alphagov/govuk-frontend"
#     }
#   ],
#   "metadata": {
#     "query": "OAuth2 implementation patterns",
#     "limit": 3,
#     "resultCount": 3,
#     "duration": 682
#   },
#   "mode": "snippets"
# }
#
# Note: Includes focused code snippets with file path and line numbers.
# Perfect for: AI assistants (Claude, ChatGPT), web UI display, balanced use cases
