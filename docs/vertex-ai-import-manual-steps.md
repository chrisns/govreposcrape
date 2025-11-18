# Manual Vertex AI Search Import Steps

Since the API import is encountering permission propagation delays, perform the import via Google Cloud Console:

## Steps:

1. Navigate to: https://console.cloud.google.com/gen-app-builder/locations/global/collections/default_collection/dataStores/govreposcrape-summaries/data?project=govreposcrape

2. Click "Import" button

3. Configure import:
   - **Data source**: Cloud Storage
   - **GCS URI**: `gs://govreposcrape-summaries/**/*.jsonl`
   - **Data schema**: Select "Document" (for JSON Lines with structData)
   - **Reconciliation mode**: INCREMENTAL (to merge with existing data)

4. Click "Import"

5. Monitor the operation:
   - The import is a long-running operation
   - Check status in Cloud Console under "Operations" tab
   - Typically takes 5-10 minutes for small datasets (5 documents)
   - For full 20k migration, expect 30-60 minutes

## Verify Import Success:

Once import completes, test search with:

```bash
curl -s -X POST https://govreposcrape-api-1060386346356.us-central1.run.app/mcp/search \
-H 'Content-Type: application/json' \
-d '{"query":"authentication","limit":5}' | python3 -m json.tool
```

Expected result: JSON with proper org/repo metadata instead of "unknown/unknown".

## Alternative: API Import (once permissions propagate)

```bash
cd /Users/cns/httpdocs/cddo/govreposcrape/api
GOOGLE_APPLICATION_CREDENTIALS=/Users/cns/httpdocs/cddo/govreposcrape/google-credentials.json \
npx ts-node scripts/trigger-import.ts
```

Note: May need to wait 10-15 minutes for IAM permission changes to fully propagate.
