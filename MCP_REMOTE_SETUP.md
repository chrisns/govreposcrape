# Remote HTTP MCP Server Setup

## Overview

The govreposcrape MCP server is now configured as a **remote HTTP-based MCP server** deployed on Google Cloud Run. This allows Claude Code to access it without requiring local Node.js processes.

## Configuration

### .mcp.json

```json
{
  "mcpServers": {
    "govreposcrape": {
      "type": "http",
      "url": "https://govreposcrape-api-1060386346356.us-central1.run.app/mcp"
    }
  }
}
```

This configuration matches the pattern used by other remote MCP servers like DeepWiki.

### .claude/settings.local.json

```json
{
  "enableAllProjectMcpServers": true
}
```

This automatically enables all MCP servers defined in `.mcp.json`.

## MCP Server Endpoints

The HTTP MCP server implements the following JSON-RPC 2.0 methods:

### 1. Initialize
```bash
curl -X POST https://govreposcrape-api-1060386346356.us-central1.run.app/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {}
  }'
```

### 2. List Tools
```bash
curl -X POST https://govreposcrape-api-1060386346356.us-central1.run.app/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

### 3. Call Tool (Search)
```bash
curl -X POST https://govreposcrape-api-1060386346356.us-central1.run.app/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_uk_gov_code",
      "arguments": {
        "query": "NHS API integration",
        "limit": 5
      }
    }
  }'
```

## Available Tool

### search_uk_gov_code

Search across ~21,000 UK government repositories for code examples, libraries, and patterns.

**Parameters:**
- `query` (string, required): Search query (e.g., "authentication middleware", "postcode validation", "NHS API")
- `limit` (number, optional): Number of results to return (1-100, default: 20)

**Returns:**
- List of matching repositories with:
  - Repository title
  - GitHub URL
  - Organization name
  - Repository name

## Testing

### Automated Testing

Run the provided test script:

```bash
./test-mcp.sh
```

This will:
1. Open a new Terminal window
2. Start a Claude Code session
3. Send a test query to search UK government code
4. Display results

### Manual Testing

1. Start a new Claude Code session in this directory:
   ```bash
   cd ~/govreposcrape
   claude-code
   ```

2. Ask Claude to search UK government code:
   ```
   Search UK government code for Docker deployment examples
   ```

3. Claude will use the `search_uk_gov_code` tool automatically

## Architecture

```
Claude Code → .mcp.json (HTTP config) → Cloud Run API → Vertex AI Search → GCS Bucket (19,276 repos)
```

### Components

1. **Claude Code**: Client with MCP support
2. **HTTP MCP Server**: Deployed on Cloud Run at `/mcp` endpoint
3. **Express API**: Handles MCP JSON-RPC protocol with SSE
4. **Vertex AI Search**: Semantic search engine
5. **Cloud Storage**: Repository summaries storage

## Deployment

The MCP server is deployed as part of the main API:

```bash
gcloud run deploy govreposcrape-api \
  --source . \
  --region us-central1 \
  --project govreposcrape \
  --allow-unauthenticated \
  --timeout 60
```

## Files

- `/api/src/controllers/mcpController.ts` - MCP HTTP endpoint handler
- `/api/src/index.ts` - Express server with `/mcp` route
- `.mcp.json` - Claude Code MCP server configuration
- `test-mcp.sh` - Automated testing script
- `test-mcp.applescript` - AppleScript testing automation

## Benefits of Remote HTTP MCP

1. **No Local Process**: No need to run Node.js locally
2. **Centralized**: Single deployment serves all clients
3. **Scalable**: Runs on Cloud Run with auto-scaling
4. **Maintainable**: Updates deploy to all clients automatically
5. **Reliable**: Cloud Run provides 99.95% SLA

## Comparison to Local MCP

### Local MCP (stdio)
```json
{
  "command": "node",
  "args": ["/path/to/mcp-server.js"]
}
```
- Requires local Node.js installation
- Separate process per client
- Must update all clients for changes

### Remote HTTP MCP
```json
{
  "type": "http",
  "url": "https://api.example.com/mcp"
}
```
- No local dependencies
- Single shared instance
- Updates deploy once for all clients

## Security

- API is public (no authentication required)
- Rate limiting handled by Cloud Run
- CORS enabled for cross-origin requests
- Read-only access to search data

## Support

For issues or questions, check:
- API health: https://govreposcrape-api-1060386346356.us-central1.run.app/health
- Public widget: https://govreposcrape-api-1060386346356.us-central1.run.app
- Cloud Run logs: `gcloud run logs read govreposcrape-api --project govreposcrape`
