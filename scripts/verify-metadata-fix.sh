#!/bin/bash
#
# Verify that Vertex AI Search metadata extraction is working correctly
# Run this script after import operation completes (typically 10-30 minutes)
#

set -e

API_URL="https://govreposcrape-api-1060386346356.us-central1.run.app/mcp/search"

echo "====================================================================="
echo "Vertex AI Search Metadata Verification"
echo "====================================================================="
echo ""

# Test search with query that should match our uploaded repos
echo "Testing search for 'sharepoint'..."
echo ""

RESPONSE=$(curl -s -X POST "$API_URL" \
  -H 'Content-Type: application/json' \
  -d '{"query":"sharepoint","limit":5}')

# Check if we got proper org/repo metadata
UNKNOWN_COUNT=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
unknown_count = sum(1 for r in data['results'] if r['metadata']['org'] == 'unknown')
print(unknown_count)
")

TOTAL_RESULTS=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['metadata']['resultCount'])
")

echo "Total results: $TOTAL_RESULTS"
echo "Results with 'unknown' org: $UNKNOWN_COUNT"
echo ""

if [ "$UNKNOWN_COUNT" -eq "0" ]; then
    echo "✓ SUCCESS: All results have proper metadata!"
    echo ""
    echo "Sample results:"
    echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for i, r in enumerate(data['results'][:5], 1):
    print(f\"  {i}. {r['title']} | {r['url']}\")
"
    exit 0
else
    echo "✗ FAILURE: $UNKNOWN_COUNT results still showing 'unknown/unknown'"
    echo ""
    echo "This indicates:"
    echo "  1. Import operation may still be running (check Cloud Console)"
    echo "  2. Old .txt files still indexed (need purge)"
    echo "  3. New .jsonl files not yet indexed"
    echo ""
    echo "Wait 5-10 more minutes and run this script again."
    echo ""
    echo "To check import operation status:"
    echo "  gcloud discovery-engine operations describe <operation-id>"
    exit 1
fi
