#!/bin/bash
# Parallel ingestion script for govreposcrape
# Runs 40 concurrent Docker containers to process 20,587 repos in parallel
#
# Usage: ./scripts/run-parallel-ingestion.sh
#
# PARALLEL EXECUTION STRATEGY:
# - NUM_WORKERS=40: Number of parallel Docker containers
# - BATCH_SIZE=10: Modulo arithmetic parameter (each worker processes every 10th repo)
# - Formula: Worker N processes repos where (repo_index % BATCH_SIZE) == (N % BATCH_SIZE)
# - Result: 40 workers with batch-size=10 means ~515 repos per worker (20,587 / 40)
#
# WHY 40 WORKERS WITH BATCH_SIZE=10?
# - 40 workers = 4 concurrent sets of 10-worker batches
# - Each worker in a set processes unique repos (no overlap)
# - Example:
#   - Worker 0: repos 0, 10, 20, 30, 40... (indices where % 10 == 0)
#   - Worker 1: repos 1, 11, 21, 31, 41... (indices where % 10 == 1)
#   - Worker 10: repos 0, 10, 20, 30, 40... (same as Worker 0, hence ~515 repos each)
# - Better CPU utilization on multi-core systems vs original 10-worker design
#
# ESTIMATED PERFORMANCE:
# - Sequential: ~58 hours for 20,587 repos (~10s/repo average)
# - Parallel (40 workers): ~5-7 hours (assuming ~12s/repo with overhead)
# - Speedup: ~8-10× (not full 40× due to I/O bottlenecks and overhead)

set -e

# Change to project root directory (parent of scripts/)
cd "$(dirname "$0")/.."

# Configuration
BATCH_SIZE=10         # Modulo arithmetic parameter (do not change without understanding impact)
NUM_WORKERS=40        # Number of parallel Docker containers (4× original 10-worker design)
DOCKER_IMAGE="govreposcrape-ingest:latest"
LOG_DIR="logs/ingestion"

# Create log directory
mkdir -p "$LOG_DIR"

# Build the Docker image first to ensure current code
echo "🔨 Building Docker image with current code..."
docker build -t "$DOCKER_IMAGE" -f container/Dockerfile container/
echo "✅ Docker image built successfully"
echo ""

echo "🚀 Starting parallel gitingest ingestion pipeline"
echo "   Workers: $NUM_WORKERS"
echo "   Batch size: $BATCH_SIZE (modulo arithmetic parameter)"
echo "   Total repos: ~20,587"
echo "   Repos per worker: ~515 (20,587 / 40)"
echo "   Log directory: $LOG_DIR"
echo ""
echo "📋 Parallel Strategy:"
echo "   Each worker processes every ${BATCH_SIZE}th repo starting at its offset"
echo "   40 workers with batch-size=10 = 4 concurrent sets of 10-worker batches"
echo ""

# Start workers
for offset in $(seq 0 $((NUM_WORKERS - 1))); do
    echo "Starting worker $offset..."

    docker run --rm --env-file .env \
        "$DOCKER_IMAGE" \
        python3 ingest.py --batch-size="$BATCH_SIZE" --offset="$offset" \
        > "$LOG_DIR/worker-${offset}.log" 2>&1 &

    worker_pid=$!
    echo "  Worker $offset started (PID: $worker_pid, Log: $LOG_DIR/worker-${offset}.log)"
done

echo ""
echo "✅ All $NUM_WORKERS workers started"
echo ""
echo "📊 Monitor progress with:"
echo "   tail -f $LOG_DIR/worker-*.log"
echo ""
echo "   Or individual workers:"
echo "   tail -f $LOG_DIR/worker-0.log"
echo ""
echo "🔍 Check completion status:"
echo "   grep -h 'Batch.*complete' $LOG_DIR/worker-*.log"
echo ""
echo "⏱️  Estimated time: ~5-7 hours (assuming ~12 seconds/repo average)"
echo ""
echo "🛑 To stop all workers:"
echo "   pkill -f 'python3 ingest.py'"
echo ""
echo "Waiting for all workers to complete..."
wait

echo ""
echo "✅ All workers completed!"
echo ""
echo "📊 Final statistics:"
grep -h 'Batch.*complete' "$LOG_DIR"/worker-*.log | awk '
{
    total += $2
    successful += $3
    failed += $4
}
END {
    print "   Total processed: " total
    print "   Successful: " successful
    print "   Failed: " failed
    print "   Success rate: " (successful*100/(successful+failed)) "%"
}
'

echo ""
echo "🎉 Ingestion pipeline complete!"
