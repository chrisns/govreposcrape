#!/bin/bash
#
# Minimal Mode Example - Fast Browsing
#
# Use case: Quick repository discovery, low-bandwidth clients, metadata-only exploration
# Performance: <500ms p95, ~1KB per result
# Returns: Repository metadata only (no code snippets, no summaries)
#

# Set your API endpoint (replace with your actual Cloud Run URL)
API_URL="${API_URL:-https://govreposcrape-api-xxxxx-uc.a.run.app}"

# Example query: Find authentication-related repositories
curl -X POST "${API_URL}/mcp/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication methods in UK government services",
    "limit": 5,
    "resultMode": "minimal"
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
#       }
#     }
#   ],
#   "metadata": {
#     "query": "authentication methods in UK government services",
#     "limit": 5,
#     "resultCount": 5,
#     "duration": 245
#   },
#   "mode": "minimal"
# }
#
# Note: No 'snippet', 'gitingest_summary', or other enhanced fields.
# Perfect for: Fast browsing, building lists, low-bandwidth scenarios
