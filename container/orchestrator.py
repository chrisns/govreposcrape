#!/usr/bin/env python3
"""
govreposcrape - Pipeline Orchestrator (Google Cloud Platform)
Orchestrator for Vertex AI Search via Cloud Storage backend

Coordinates the complete ingestion pipeline:
fetch repos.json → gitingest → upload to Cloud Storage → Vertex AI Search indexing

Usage:
    # Sequential (process all repos)
    python orchestrator.py

    # Parallel (40 containers for faster processing)
    python orchestrator.py --batch-size=40 --offset=0  # Container 0
    python orchestrator.py --batch-size=40 --offset=1  # Container 1
    ...
    python orchestrator.py --batch-size=40 --offset=39  # Container 39

    # Dry run (test without processing)
    python orchestrator.py --batch-size=10 --offset=0 --dry-run

    # Limit processing (for testing)
    python orchestrator.py --limit=100

Environment Variables:
    GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON key
    GCS_BUCKET_NAME: Cloud Storage bucket name (default: govreposcrape-summaries)
"""

import sys
import os
import argparse
import signal
import time
import json
from typing import Dict, Any, List
from datetime import datetime

# Import from existing modules
from ingest import (
    fetch_repos_json,
    filter_repos_for_batch,
    process_repository,
    ProcessingStats,
    logger
)

# Import Cloud Storage client (Vertex AI Search backend)
from gcs_client import CloudStorageClient


# Global state for graceful shutdown
current_state = {
    "repos_processed": 0,
    "stats": None,
    "batch_size": 1,
    "offset": 0
}


def format_elapsed_time(seconds: float) -> str:
    """Format elapsed time as human-readable string"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    if hours > 0:
        return f"{hours}h {minutes}m"
    elif minutes > 0:
        return f"{minutes}m {secs}s"
    else:
        return f"{secs}s"


def log_progress(
    processed: int,
    total: int,
    successful: int,
    failed: int,
    elapsed: float,
    batch_size: int = 1,
    offset: int = 0
):
    """Log progress update with statistics"""
    percentage = (processed / total * 100) if total > 0 else 0

    # Calculate ETA
    if processed > 0:
        avg_time_per_repo = elapsed / processed
        remaining_repos = total - processed
        eta_seconds = avg_time_per_repo * remaining_repos
        eta_str = format_elapsed_time(eta_seconds)
    else:
        eta_str = "calculating..."

    elapsed_str = format_elapsed_time(elapsed)

    message = (
        f"Processed {processed}/{total} ({percentage:.1f}%), "
        f"elapsed: {elapsed_str}, ETA: {eta_str}"
    )

    logger.info(
        message,
        extra={"metadata": {
            "batch_size": batch_size,
            "offset": offset,
            "processed": processed,
            "total": total,
            "successful": successful,
            "failed": failed,
            "percentage": round(percentage, 1),
            "elapsed_seconds": round(elapsed, 1)
        }}
    )


def graceful_shutdown(signum, frame):
    """Handle SIGTERM for graceful shutdown"""
    logger.info(
        "Received SIGTERM, shutting down gracefully...",
        extra={"metadata": {
            "signal": signum,
            "repos_processed": current_state["repos_processed"]
        }}
    )

    # Save progress to state file
    state_file = "/tmp/orchestrator-state.json"
    try:
        with open(state_file, 'w') as f:
            json.dump({
                "repos_processed": current_state["repos_processed"],
                "batch_size": current_state["batch_size"],
                "offset": current_state["offset"],
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }, f, indent=2)

        logger.info(
            f"Shutdown complete, state saved to {state_file}",
            extra={"metadata": {"state_file": state_file}}
        )
    except Exception as e:
        logger.error(
            f"Failed to save state file: {str(e)}",
            extra={"metadata": {"error": str(e)}}
        )

    sys.exit(0)


def main():
    """Main orchestrator entry point"""
    # Log startup immediately
    print("Starting orchestrator.py...", flush=True)
    logger.info("Orchestrator starting", extra={"metadata": {}})

    # Register signal handler for graceful shutdown
    signal.signal(signal.SIGTERM, graceful_shutdown)

    # Parse CLI arguments
    parser = argparse.ArgumentParser(
        description="Orchestrate gitingest pipeline with Cloud Storage + Vertex AI Search",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        '--batch-size',
        type=int,
        default=1,
        help='Process every Nth repository (for parallel execution, default: 1)'
    )
    parser.add_argument(
        '--offset',
        type=int,
        default=0,
        help='Offset within batch (0 to batch-size-1, default: 0)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Simulate processing without running gitingest or uploading'
    )
    parser.add_argument(
        '--limit',
        type=int,
        help='Limit processing to first N repos (for testing)'
    )

    args = parser.parse_args()

    # Check for Cloud Run Task Index (for parallel execution)
    task_index = os.getenv('CLOUD_RUN_TASK_INDEX')
    task_count = os.getenv('CLOUD_RUN_TASK_COUNT')

    if task_index is not None and task_count is not None:
        # Running as Cloud Run Job with multiple tasks - use task index
        args.batch_size = int(task_count)
        args.offset = int(task_index)
        logger.info(
            f"Cloud Run Task Mode: task {task_index}/{task_count} (batch_size={args.batch_size}, offset={args.offset})",
            extra={"metadata": {
                "task_index": task_index,
                "task_count": task_count,
                "batch_size": args.batch_size,
                "offset": args.offset
            }}
        )

    # Validate arguments
    if args.offset >= args.batch_size:
        parser.error(f"offset ({args.offset}) must be less than batch-size ({args.batch_size})")

    # Update global state for graceful shutdown
    current_state["batch_size"] = args.batch_size
    current_state["offset"] = args.offset

    # Initialize Cloud Storage client
    if not args.dry_run:
        try:
            gcs_client = CloudStorageClient()
            # Get or verify bucket exists
            bucket_name = gcs_client.get_or_create_bucket()
            logger.info(
                f"Using Cloud Storage bucket: {bucket_name}",
                extra={"metadata": {"bucket_name": bucket_name}}
            )
        except Exception as e:
            logger.error(
                f"Failed to initialize Cloud Storage client: {str(e)}",
                extra={"metadata": {"error": str(e)}}
            )
            sys.exit(1)

    # Log pipeline start
    logger.info(
        f"Starting pipeline orchestrator (batch_size={args.batch_size}, offset={args.offset}, dry_run={args.dry_run})",
        extra={"metadata": {
            "batch_size": args.batch_size,
            "offset": args.offset,
            "dry_run": args.dry_run,
            "limit": args.limit,
            "mode": "orchestrator-google"
        }}
    )

    start_time = time.time()

    try:
        # Step 1: Fetch repos.json
        if args.dry_run:
            logger.info("[DRY RUN] Simulating repos.json fetch", extra={"metadata": {}})
            repos = [
                {
                    "url": f"https://github.com/alphagov/repo{i}",
                    "pushedAt": "2025-01-01T00:00:00Z",
                    "owner": "alphagov",
                    "name": f"repo{i}"
                }
                for i in range(100)
            ]
        else:
            repos = fetch_repos_json()

        total_repos = len(repos)
        logger.info(
            f"Fetched {total_repos} repositories from feed",
            extra={"metadata": {"total_repos": total_repos}}
        )

        # Step 2: Filter repos for this batch (parallel execution)
        batch_repos = filter_repos_for_batch(repos, args.batch_size, args.offset)

        # Apply limit if specified
        if args.limit and args.limit < len(batch_repos):
            batch_repos = batch_repos[:args.limit]
            logger.info(
                f"Limited to {args.limit} repos for testing",
                extra={"metadata": {"limit": args.limit}}
            )

        logger.info(
            f"Processing {len(batch_repos)} repos in this batch",
            extra={"metadata": {
                "batch_repos": len(batch_repos),
                "batch_size": args.batch_size,
                "offset": args.offset
            }}
        )

        # Step 3: Process each repository
        stats = ProcessingStats()
        current_state["stats"] = stats
        processed_count = 0

        for idx, repo in enumerate(batch_repos):
            repo_url = repo.get("url", "")
            org = repo.get("owner", repo.get("org", ""))
            name = repo.get("name", "")
            pushed_at = repo.get("pushedAt", "")

            # Progress reporting (every 100 repos)
            if idx > 0 and idx % 100 == 0:
                elapsed = time.time() - start_time
                log_progress(
                    processed=processed_count,
                    total=len(batch_repos),
                    successful=stats.successful,
                    failed=stats.failed,
                    elapsed=elapsed,
                    batch_size=args.batch_size,
                    offset=args.offset
                )

            if args.dry_run:
                logger.info(
                    f"[DRY RUN] Would process {idx + 1}/{len(batch_repos)}: {repo_url}",
                    extra={"metadata": {"repo_url": repo_url, "index": idx + 1}}
                )
                time.sleep(0.01)  # Simulate processing time
                stats.record_success(10)  # Fake 10s processing time
            else:
                # Process repository with gitingest (no R2 upload in this step)
                result = process_repository(repo_url, upload_to_r2=False)

                if result.get("success"):
                    # Upload to Cloud Storage
                    summary_content = result.get("summary", "")
                    if summary_content:
                        metadata = {
                            "url": repo_url,
                            "pushedAt": pushed_at,
                            "processedAt": datetime.utcnow().isoformat() + "Z"
                        }

                        upload_success = gcs_client.upload_summary(
                            org=org,
                            repo=name,
                            summary_content=summary_content,
                            metadata=metadata
                        )

                        if upload_success:
                            stats.record_success(result.get("duration", 0))
                        else:
                            stats.record_failure()
                            logger.warning(
                                f"Cloud Storage upload failed: {repo_url}",
                                extra={"metadata": {"repo_url": repo_url}}
                            )
                    else:
                        stats.record_failure()
                        logger.warning(
                            f"Empty summary returned: {repo_url}",
                            extra={"metadata": {"repo_url": repo_url}}
                        )
                else:
                    stats.record_failure()
                    logger.warning(
                        f"Repository processing failed: {repo_url}",
                        extra={"metadata": {
                            "repo_url": repo_url,
                            "error": result.get("error", "unknown")
                        }}
                    )

            processed_count += 1
            current_state["repos_processed"] = processed_count

        # Step 4: Log final statistics
        elapsed = time.time() - start_time
        elapsed_str = format_elapsed_time(elapsed)

        logger.info(
            f"Pipeline complete: {len(batch_repos)} total, {stats.successful} processed, {stats.failed} failed, completed in {elapsed_str}",
            extra={"metadata": {
                "operation": "orchestrator-completion",
                "batch_size": args.batch_size,
                "offset": args.offset,
                "total_repos": len(batch_repos),
                "processed": stats.successful,
                "failed": stats.failed,
                "elapsed_seconds": round(elapsed, 1),
                "elapsed_formatted": elapsed_str
            }}
        )

        # Print Cloud Storage stats
        if not args.dry_run:
            gcs_client.print_stats()

        # Exit with success
        sys.exit(0)

    except KeyboardInterrupt:
        logger.info(
            "Pipeline interrupted by user (Ctrl+C)",
            extra={"metadata": {"repos_processed": current_state["repos_processed"]}}
        )
        sys.exit(130)  # Standard exit code for SIGINT

    except Exception as e:
        logger.error(
            f"Pipeline failed with error: {str(e)}",
            extra={"metadata": {"error": str(e), "error_type": type(e).__name__}}
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
