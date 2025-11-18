# GovRepoScrape Cloud Run API

Production-ready MCP (Model Context Protocol) API server for semantic search across UK Government code repositories using Google Cloud Run and Vertex AI Search.

## Overview

This Cloud Run API provides a REST endpoint for searching through UK government code repositories. It integrates with Vertex AI Search to deliver production-grade semantic search with 99.9% SLA.

**Key Features:**
- MCP v2 compliant search endpoint
- Vertex AI Search integration for semantic search
- Structured JSON logging
- Health monitoring endpoint
- Request timeout protection (10s)
- CORS support
- Comprehensive error handling

## Architecture

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────────────┐
│   Client    │──────▶│  Cloud Run API   │──────▶│  Vertex AI Search   │
│  (MCP SDK)  │◀──────│  (Express/Node)  │◀──────│   (Search Engine)   │
└─────────────┘       └──────────────────┘       └─────────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │  Cloud Logging   │
                      └──────────────────┘
```

## Prerequisites

- **Google Cloud Project**: Active GCP project with billing enabled
- **Node.js**: Version 20.x or higher
- **gcloud CLI**: For deployment and management
- **Vertex AI Search Engine**: Configured search engine ID
- **Service Account**: With required IAM permissions

## Environment Variables

Create a `.env` file based on `.env.example`:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VERTEX_AI_SEARCH_ENGINE_ID` | Yes | Full resource name of Vertex AI Search engine | `projects/1060386346356/locations/global/collections/default_collection/engines/govreposcrape-search` |
| `GOOGLE_PROJECT_ID` | Yes | Google Cloud project ID | `govreposcrape` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes (Cloud Run) | Path to service account key JSON | `/path/to/key.json` |
| `PORT` | No | Server port (default: 8080) | `8080` |
| `NODE_ENV` | No | Environment mode | `production` |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (comma-separated) | `*` or `https://example.com` |
| `LOG_LEVEL` | No | Logging level | `info` |

## Local Development

### 1. Install Dependencies

```bash
cd api
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Run Development Server

```bash
npm run dev
```

The server will start on `http://localhost:8080`.

### 4. Run Tests

```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Type check
npm run type-check
```

### 5. Build for Production

```bash
npm run build
```

This compiles TypeScript to the `dist/` directory.

## Deployment

### Option 1: Automated Deployment (Cloud Build)

1. **Run setup script** (one-time):

```bash
chmod +x deploy-setup.sh
GOOGLE_PROJECT_ID=your-project-id ./deploy-setup.sh
```

2. **Deploy using Cloud Build**:

```bash
gcloud builds submit --config=cloudbuild.yaml .
```

### Option 2: Manual Deployment

1. **Build Docker image**:

```bash
docker build -t gcr.io/your-project-id/govreposcrape-api:latest .
```

2. **Push to Container Registry**:

```bash
docker push gcr.io/your-project-id/govreposcrape-api:latest
```

3. **Deploy to Cloud Run**:

```bash
gcloud run deploy govreposcrape-api \
  --image gcr.io/your-project-id/govreposcrape-api:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --service-account govreposcrape-api@your-project-id.iam.gserviceaccount.com \
  --set-env-vars "VERTEX_AI_SEARCH_ENGINE_ID=projects/.../engines/govreposcrape-search,GOOGLE_PROJECT_ID=your-project-id,NODE_ENV=production"
```

### Post-Deployment Verification

1. **Check health endpoint**:

```bash
curl https://govreposcrape-api-XXXXX-uc.a.run.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-17T12:00:00.000Z",
  "service": "govreposcrape-api",
  "version": "1.0.0"
}
```

2. **Test search endpoint**:

```bash
curl -X POST https://govreposcrape-api-XXXXX-uc.a.run.app/mcp/search \
  -H "Content-Type: application/json" \
  -d '{"query": "authentication patterns", "limit": 5}'
```

## API Endpoints

### `POST /mcp/search`

Perform semantic search across UK government repositories.

**Request Body:**
```json
{
  "query": "authentication patterns in government code",
  "limit": 20
}
```

**Parameters:**
- `query` (string, required): Search query
- `limit` (number, optional): Maximum results (1-100, default: 20)

**Response (200 OK):**
```json
{
  "results": [
    {
      "title": "alphagov/govuk-frontend",
      "url": "https://github.com/alphagov/govuk-frontend",
      "snippet": "Authentication patterns using...",
      "metadata": {
        "org": "alphagov",
        "repo": "govuk-frontend",
        "pushedAt": "2025-01-15T10:30:00Z",
        "processedAt": "2025-01-15T11:00:00Z"
      }
    }
  ],
  "metadata": {
    "query": "authentication patterns in government code",
    "limit": 20,
    "resultCount": 1,
    "duration": 342
  }
}
```

**Error Responses:**

- `400 Bad Request`: Invalid request (missing query, invalid limit)
- `408 Request Timeout`: Request exceeded 10s timeout
- `500 Internal Server Error`: Vertex AI Search API failure

**Error Format (MCP v2):**
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Missing or invalid required field: query",
    "details": {}
  }
}
```

### `GET /health`

Health check endpoint for monitoring and load balancers.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2025-01-17T12:00:00.000Z",
  "service": "govreposcrape-api",
  "version": "1.0.0"
}
```

## Service Account Setup

The Cloud Run service requires a service account with the following IAM roles:

1. **Discovery Engine Viewer** (`roles/discoveryengine.viewer`)
   - Access Vertex AI Search API

2. **Cloud Run Invoker** (`roles/run.invoker`)
   - Allow health checks

3. **Logging Log Writer** (`roles/logging.logWriter`)
   - Write structured logs to Cloud Logging

Run `deploy-setup.sh` to automatically configure the service account and IAM permissions.

## Performance

- **Response Time**: <2s (p95) for search requests
- **Timeout**: 10s request timeout
- **Concurrency**: 80 concurrent requests per instance
- **Auto-scaling**: 0-10 instances (Cloud Run managed)
- **Memory**: 512Mi per instance
- **CPU**: 1 vCPU per instance

## Monitoring and Logging

All requests are logged in structured JSON format to Cloud Logging:

```json
{
  "level": "info",
  "message": "Search request completed",
  "query": "authentication patterns",
  "limit": 20,
  "resultCount": 5,
  "duration": 342,
  "timestamp": "2025-01-17T12:00:00.000Z"
}
```

**Key Metrics:**
- Request count
- Response time (p50, p95, p99)
- Error rate
- Search result count

Access logs via:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=govreposcrape-api" --limit 50
```

## Troubleshooting

### Service Account Permission Errors

```
Error: Permission denied on Vertex AI Search
```

**Solution**: Verify service account has `roles/discoveryengine.viewer`:

```bash
gcloud projects get-iam-policy your-project-id \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:govreposcrape-api@*"
```

### Vertex AI Search Not Found

```
Error: Search engine not found
```

**Solution**: Verify `VERTEX_AI_SEARCH_ENGINE_ID` format:
```
projects/PROJECT_NUMBER/locations/global/collections/default_collection/engines/ENGINE_ID
```

### Cold Start Latency

First request after idle period may take 2-3s.

**Solution**: Configure minimum instances:

```bash
gcloud run services update govreposcrape-api \
  --min-instances 1 \
  --region us-central1
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Performance Testing

Run p95 response time validation:

```bash
npm test -- test/integration/search.test.ts -t "p95"
```

## Security

- **Authentication**: Service account-based authentication (Workload Identity)
- **CORS**: Configurable via `ALLOWED_ORIGINS` environment variable
- **Rate Limiting**: Managed by Google Cloud (default: 1000 req/min)
- **Input Validation**: All request parameters validated
- **Error Handling**: No sensitive data exposed in error responses

## Cost Optimization

- **Auto-scaling**: Scales to zero when idle (no cost)
- **Request Bundling**: Batch requests when possible
- **Caching**: Client-side caching recommended (5-minute TTL)
- **Vertex AI Search**: SEARCH_TIER_STANDARD pricing

Estimated cost: ~$0.05-0.10 per 1000 searches (excluding Vertex AI Search costs).

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [github.com/alphagov/govreposcrape/issues](https://github.com/alphagov/govreposcrape/issues)
- Documentation: [See DEPLOYMENT.md for full deployment guide](../DEPLOYMENT.md)
