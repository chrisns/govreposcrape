# Metadata Extraction Fix Summary

## Problem

Vertex AI Search was not extracting repository metadata (org, repo, URL) from GCS files. Search results showed all documents as "unknown/unknown".

**Root Cause**: Using plain text files (`.txt`) with GCS custom metadata headers (`x-goog-meta-*`). Vertex AI Search's "content" schema only reads file content, not GCS metadata headers.

## Solution

Migrated from plain text with GCS metadata to **JSON Lines format with embedded structured data**.

### Changes Made

#### 1. Updated GCS Upload Client (`container/gcs_client.py`)

**Before** (Plain Text + GCS Metadata):
```python
# Upload as plain text
blob.upload_from_string(
    summary_content,
    content_type='text/plain; charset=utf-8'
)

# Set GCS custom metadata
blob.metadata = {
    'org': org,
    'repo': repo,
    'pushedAt': str(metadata.get('pushedAt', '')),
    # ... etc
}
```

**After** (JSON Lines with Embedded Metadata):
```python
# Create JSON Lines document with embedded metadata
jsonl_document = {
    "id": f"{org}/{repo}/{commit_sha}",
    "content": summary_content,
    "structData": {
        "org": org,
        "repo": repo,
        "url": metadata.get('url', f"https://github.com/{org}/{repo}"),
        "pushedAt": metadata.get('pushedAt', ''),
        "processedAt": metadata.get('processedAt', ''),
        "size": len(summary_content)
    }
}

jsonl_content = json.dumps(jsonl_document, ensure_ascii=False)

blob.upload_from_string(
    jsonl_content,
    content_type='application/jsonl; charset=utf-8'
)
```

**File Extension Changed**: `.txt` → `.jsonl`

#### 2. Updated Vertex AI Search Import Configuration

**Before**:
- Data schema: `content` (plain text only)
- GCS URI: `gs://govreposcrape-summaries/**/*.txt`

**After**:
- Data schema: `document` (supports structured data in `structData` field)
- GCS URI: `gs://govreposcrape-summaries/**/*.jsonl`

#### 3. Updated Cloud Run API (`api/src/services/vertexSearchService.ts`)

**Before** (Parsing from GCS URI):
```typescript
// Parse org/repo from document URI
const uriMatch = name.match(/([^/]+)\/([^/]+)\/([^/]+)\.txt$/);
const org = uriMatch?.[1] || 'unknown';
const repo = uriMatch?.[2] || 'unknown';
```

**After** (Reading from Embedded Metadata):
```typescript
// Extract metadata from structData (embedded in JSON Lines format)
const structData: any = document.structData;

// Get org/repo from structData
const org = structData?.org || 'unknown';
const repo = structData?.repo || 'unknown';
const url = structData?.url || `https://github.com/${org}/${repo}`;
```

## Validation

### Test Upload (5 repositories)
```bash
docker run --rm \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json \
  -e GCS_BUCKET_NAME=govreposcrape-summaries \
  -v "/path/to/google-credentials.json:/app/google-credentials.json:ro" \
  govreposcrape-container python orchestrator.py --limit=5
```

**Results**:
- ✓ 5/5 repositories uploaded successfully
- ✓ Files uploaded as `.jsonl` format
- ✓ Total size: 0.88 MB (926,735 bytes)
- ✓ Completion time: 24 seconds

### Verified JSON Lines Format

Sample document structure:
```json
{
  "id": "BathnesDevelopment/Scripts/6d3b48842f937d41bf08fe1eceb256783a319bb4",
  "content": "Repository: bathnesdevelopment/scripts\nCommit: 213716a2...",
  "structData": {
    "org": "BathnesDevelopment",
    "repo": "Scripts",
    "url": "https://github.com/BathnesDevelopment/Scripts",
    "pushedAt": "2015-02-19T22:33:33.000Z",
    "processedAt": "2025-11-17T19:50:15.736321Z",
    "size": 780
  }
}
```

## Next Steps

1. **Import JSON Lines documents to Vertex AI Search** (see `vertex-ai-import-manual-steps.md`)
2. **Test search metadata extraction** with Cloud Run API
3. **Run full migration** (~20,576 repositories) once metadata extraction is validated

## Files Modified

- `container/gcs_client.py` - JSON Lines upload implementation
- `api/src/services/vertexSearchService.ts` - Metadata extraction from structData
- `container/Dockerfile` - Rebuilt with updated code
- `api/Dockerfile` - Rebuilt and deployed to Cloud Run

## Docker Images

- Container: `govreposcrape-container` (rebuilt 2025-11-17)
- API: `gcr.io/govreposcrape/govreposcrape-api:latest` (deployed to Cloud Run)

## Service URLs

- Cloud Run API: `https://govreposcrape-api-1060386346356.us-central1.run.app`
- MCP Search Endpoint: `https://govreposcrape-api-1060386346356.us-central1.run.app/mcp/search`
