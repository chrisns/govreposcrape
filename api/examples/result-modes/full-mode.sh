#!/bin/bash
#
# Full Mode Example - Comprehensive Analysis
#
# Use case: Deep research, CLI tools, comprehensive code review
# Performance: <3000ms p95, ~50KB per result
# Returns: All snippet fields + complete gitingest summaries + repository stats + dependencies
#

# Set your API endpoint (replace with your actual Cloud Run URL)
API_URL="${API_URL:-https://govreposcrape-api-xxxxx-uc.a.run.app}"

# Example query: Deep analysis of microservices patterns
curl -X POST "${API_URL}/mcp/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "microservices architecture patterns",
    "limit": 2,
    "resultMode": "full"
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
#       "snippet": "function authenticateUser(req, res, next) {...}",
#       "snippet_file_path": "src/auth/middleware.ts",
#       "snippet_line_range": "45-50",
#       "context_lines_before": 2,
#       "context_lines_after": 2,
#       "codespaces_link": "https://github.dev/alphagov/govuk-frontend",
#       "gitingest_summary": "# Repository Summary\n\n## README\n\nThis is the GOV.UK Frontend repository...\n\n## Key Files\n- src/auth/middleware.ts: OAuth2 middleware\n- src/auth/validators.ts: Token validation\n\n## Dependencies\njsonwebtoken: ^9.0.0\nexpress: ^4.18.0\n...",
#       "readme_excerpt": "This is the GOV.UK Frontend repository. It provides reusable components and styles for government services...",
#       "repository_stats": {
#         "contributors": 42,
#         "commits_last_month": 15,
#         "open_issues": 8,
#         "last_commit": "2025-01-14T15:30:00Z"
#       },
#       "dependencies": [
#         {"name": "jsonwebtoken", "version": "^9.0.0", "type": "runtime"},
#         {"name": "express", "version": "^4.18.0", "type": "runtime"},
#         {"name": "typescript", "version": "^5.3.0", "type": "dev"}
#       ]
#     }
#   ],
#   "metadata": {
#     "query": "microservices architecture patterns",
#     "limit": 2,
#     "resultCount": 2,
#     "duration": 2100
#   },
#   "mode": "full"
# }
#
# Note: Includes complete gitingest summary, repository statistics, and dependency information.
# Perfect for: CLI tools, research, comprehensive code review, architecture analysis
