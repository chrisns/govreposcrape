#!/usr/bin/env bash
#
# Integration Test: KV Caching (Quality Story 1)
# Tests cache functionality with 100+ repos from repos.json
#
# Expected Results:
# - First run: 0% cache hit rate (all misses)
# - Second run: 90%+ cache hit rate
#
# Usage:
#   ./scripts/test-kv-caching.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "KV Caching Integration Test - Quality Story 1"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found${NC}"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Build Docker image
echo "Building Docker image..."
docker build -t govreposcrape-ingest ./container &> /dev/null
echo -e "${GREEN}✓ Docker image built${NC}"
echo ""

# Start Worker in background (for KV proxy)
echo "Starting Cloudflare Worker (KV proxy)..."
npx wrangler dev --port 8787 &> /tmp/wrangler-dev.log &
WRANGLER_PID=$!

# Wait for Worker to start
sleep 5

# Check if Worker is running
if ! curl -s http://localhost:8787/health > /dev/null; then
    echo -e "${RED}✗ Worker not responding${NC}"
    kill $WRANGLER_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✓ Worker running on localhost:8787${NC}"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."
    kill $WRANGLER_PID 2>/dev/null || true
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}
trap cleanup EXIT

# Test parameters
BATCH_SIZE=100
OFFSET=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RUN 1: First ingestion (expect 0% cache hit rate)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run first ingestion
docker run --rm \
    --env-file .env \
    -e WORKER_URL=http://host.docker.internal:8787 \
    govreposcrape-ingest \
    python3 orchestrator.py --batch-size=$BATCH_SIZE --offset=$OFFSET 2>&1 | tee /tmp/run1.log

# Extract cache stats from first run
CACHE_HITS_RUN1=$(grep "Cache check complete" /tmp/run1.log | tail -1 | grep -oP '\d+ hits' | grep -oP '\d+' || echo "0")
CACHE_HIT_RATE_RUN1=$(grep "Cache check complete" /tmp/run1.log | tail -1 | grep -oP '\d+\.\d+%' | head -1 | grep -oP '\d+\.\d+' || echo "0")

echo ""
echo -e "Run 1 Results: ${CACHE_HITS_RUN1} cache hits (${CACHE_HIT_RATE_RUN1}%)"

if (( $(echo "$CACHE_HIT_RATE_RUN1 < 5.0" | bc -l) )); then
    echo -e "${GREEN}✓ First run: Expected low cache hit rate${NC}"
else
    echo -e "${YELLOW}⚠ First run: Unexpected cache hit rate${NC}"
fi

echo ""
sleep 2

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RUN 2: Second ingestion (expect 90%+ cache hit rate)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run second ingestion
docker run --rm \
    --env-file .env \
    -e WORKER_URL=http://host.docker.internal:8787 \
    govreposcrape-ingest \
    python3 orchestrator.py --batch-size=$BATCH_SIZE --offset=$OFFSET 2>&1 | tee /tmp/run2.log

# Extract cache stats from second run
CACHE_HITS_RUN2=$(grep "Cache check complete" /tmp/run2.log | tail -1 | grep -oP '\d+ hits' | grep -oP '\d+' || echo "0")
CACHE_HIT_RATE_RUN2=$(grep "Cache check complete" /tmp/run2.log | tail -1 | grep -oP '\d+\.\d+%' | head -1 | grep -oP '\d+\.\d+' || echo "0")

echo ""
echo -e "Run 2 Results: ${CACHE_HITS_RUN2} cache hits (${CACHE_HIT_RATE_RUN2}%)"

# Validate results
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if (( $(echo "$CACHE_HIT_RATE_RUN2 >= 90.0" | bc -l) )); then
    echo -e "${GREEN}✓ PASS: Cache hit rate ${CACHE_HIT_RATE_RUN2}% >= 90%${NC}"
    echo -e "${GREEN}✓ AC3 SATISFIED: Integration test passes with 90%+ cache hit rate${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}✗ FAIL: Cache hit rate ${CACHE_HIT_RATE_RUN2}% < 90%${NC}"
    echo -e "${RED}✗ AC3 NOT SATISFIED: Cache hit rate below threshold${NC}"
    EXIT_CODE=1
fi

echo ""
echo "Summary:"
echo "  Run 1: ${CACHE_HIT_RATE_RUN1}% cache hit rate (expected <5%)"
echo "  Run 2: ${CACHE_HIT_RATE_RUN2}% cache hit rate (expected ≥90%)"
echo ""

exit $EXIT_CODE
