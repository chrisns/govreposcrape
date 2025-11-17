#!/bin/bash
# govreposcrape - Parallel Execution Script
# Story 2.5: Parallel Execution Support
#
# Run 10 containers in parallel for govscraperepo ingestion
# Expected speedup: 10× (58 hours → ~6 hours for 21k repos)

set -e

BATCH_SIZE=${1:-10}
IMAGE_NAME="govscraperepo-ingest"

echo "Starting parallel execution: $BATCH_SIZE containers"
echo "Expected speedup: ${BATCH_SIZE}×"
echo "=================================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Please create .env with R2 credentials:"
    echo "  R2_BUCKET=govscraperepo-gitingest"
    echo "  R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com"
    echo "  R2_ACCESS_KEY=..."
    echo "  R2_SECRET_KEY=..."
    exit 1
fi

# Launch containers in parallel
for offset in $(seq 0 $((BATCH_SIZE - 1))); do
  echo "Launching container: batch_size=$BATCH_SIZE, offset=$offset"

  docker run \
    --env-file .env \
    --name "govscraperepo-ingest-$offset" \
    --rm \
    "$IMAGE_NAME" \
    python ingest.py --batch-size="$BATCH_SIZE" --offset="$offset" &
done

# Wait for all containers to complete
echo ""
echo "Waiting for all containers to complete..."
wait

echo ""
echo "=================================================="
echo "All containers complete!"
echo "Check logs for individual container statistics"
