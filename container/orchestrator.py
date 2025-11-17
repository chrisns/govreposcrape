#!/usr/bin/env python3
"""
govreposcrape - Pipeline Orchestrator
Story 2.6: Ingestion Orchestrator - End-to-End Pipeline Integration

Coordinates the complete ingestion pipeline:
fetch repos.json → check cache → process uncached → upload to R2

Usage:
    # Sequential (process all repos)
    python orchestrator.py

    # Parallel (10 containers)
    python orchestrator.py --batch-size=10 --offset=0  # Container 0
    python orchestrator.py --batch-size=10 --offset=1  # Container 1
    ...
    python orchestrator.py --batch-size=10 --offset=9  # Container 9

    # Dry run (test without processing)
    python orchestrator.py --batch-size=10 --offset=0 --dry-run

Environment Variables:
    R2_BUCKET: Cloudflare R2 bucket name
    R2_ENDPOINT: R2 endpoint URL
    R2_ACCESS_KEY: R2 access key ID
    R2_SECRET_KEY: R2 secret access key
"""

import sys
import os
import argparse
import signal
import time
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

# Import from existing modules
from ingest import (
    fetch_repos_json,
    filter_repos_for_batch,
    process_repository,
    ProcessingStats,
    logger,
    JSONFormatter
)

# Import cache module (Quality Story 1 Fix)
try:
    from cache import check_cache, update_cache, get_cache_stats
    CACHE_AVAILABLE = True
except ImportError:
    # Graceful degradation if cache module not available
    CACHE_AVAILABLE = False
    check_cache = None
    update_cache = None
    get_cache_stats = None

# For R2 cache checking
try:
    from r2_client import create_r2_client, R2ConfigError
except ImportError:
    # Graceful degradation if R2 not configured
    create_r2_client = None
    R2ConfigError = Exception


# Global state for graceful shutdown
current_state = {
    "repos_processed": 0,
    "stats": None,
    "batch_size": 1,
    "offset": 0
}


def check_cache_status(repos: List[Dict[str, Any]]) -> Dict[str, bool]:
    """
    Check cache status for repositories using Workers KV proxy

    Quality Story 1 Fix: Properly integrated cache checking via HTTP proxy to Workers KV

    Args:
        repos: List of repository objects with url, pushedAt, org, name

    Returns:
        Dict mapping repo URL to needsProcessing boolean
    """
    if not CACHE_AVAILABLE:
        logger.warning(
            "Cache module not available - marking all repos as needing processing",
            extra={"metadata": {
                "total_repos": len(repos),
                "cache_mode": "degraded-no-cache"
            }}
        )
        return {repo["url"]: True for repo in repos}

    logger.info(
        f"Checking cache status for {len(repos)} repositories via Workers KV proxy",
        extra={"metadata": {
            "total_repos": len(repos),
            "cache_mode": "workers-kv-proxy"
        }}
    )

    cache_status = {}
    cache_hits = 0
    cache_misses = 0

    for repo in repos:
        repo_url = repo.get("url", "")
        # repos.json uses "owner" field, not "org"
        org = repo.get("owner", repo.get("org", ""))
        name = repo.get("name", "")
        pushed_at = repo.get("pushedAt", "")

        if not org or not name or not pushed_at:
            # Missing required fields - mark as needs processing
            cache_status[repo_url] = True
            cache_misses += 1
            continue

        # Check cache via Workers KV proxy
        result = check_cache(org=org, repo=name, pushed_at=pushed_at)

        if result["needs_processing"]:
            cache_status[repo_url] = True
            cache_misses += 1
        else:
            cache_status[repo_url] = False
            cache_hits += 1

    cache_hit_rate = (cache_hits / len(repos) * 100) if repos else 0

    logger.info(
        f"Cache check complete: {cache_hits} hits ({cache_hit_rate:.1f}%), {cache_misses} misses",
        extra={"metadata": {
            "total_repos": len(repos),
            "cache_hits": cache_hits,
            "cache_misses": cache_misses,
            "cache_hit_rate": round(cache_hit_rate, 1)
        }}
    )

    return cache_status


def format_elapsed_time(seconds: float) -> str:
    """
    Format elapsed time as human-readable string

    Args:
        seconds: Elapsed time in seconds

    Returns:
        Formatted string (e.g., "5h 47m", "15m", "45s")
    """
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
    cached: int,
    successful: int,
    failed: int,
    elapsed: float,
    batch_size: int = 1,
    offset: int = 0
):
    """
    Log progress update with statistics

    Args:
        processed: Number of repos processed so far
        total: Total number of repos
        cached: Number of cached (skipped) repos
        successful: Number of successfully processed repos
        failed: Number of failed repos
        elapsed: Elapsed time in seconds
        batch_size: Batch size for parallel execution
        offset: Offset for this batch
    """
    percentage = (processed / total * 100) if total > 0 else 0
    cache_hit_rate = (cached / processed * 100) if processed > 0 else 0

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
        f"cache hit: {cache_hit_rate:.1f}%, "
        f"elapsed: {elapsed_str}, ETA: {eta_str}"
    )

    logger.info(
        message,
        extra={"metadata": {
            "batch_size": batch_size,
            "offset": offset,
            "processed": processed,
            "total": total,
            "cached": cached,
            "successful": successful,
            "failed": failed,
            "percentage": round(percentage, 1),
            "cache_hit_rate": round(cache_hit_rate, 1),
            "elapsed_seconds": round(elapsed, 1),
            "eta_seconds": round(eta_seconds, 1) if processed > 0 else None
        }}
    )


def log_final_summary(
    total_repos: int,
    cached: int,
    processed: int,
    failed: int,
    elapsed: float,
    batch_size: int = 1,
    offset: int = 0
):
    """
    Log final pipeline statistics

    Args:
        total_repos: Total number of repos in feed
        cached: Number of cached (skipped) repos
        processed: Number of successfully processed repos
        failed: Number of failed repos
        elapsed: Total elapsed time in seconds
        batch_size: Batch size for parallel execution
        offset: Offset for this batch
    """
    cache_hit_rate = (cached / total_repos * 100) if total_repos > 0 else 0
    elapsed_str = format_elapsed_time(elapsed)

    message = (
        f"Pipeline complete: {total_repos} total, {cached} cached ({cache_hit_rate:.1f}%), "
        f"{processed} processed, {failed} failed, completed in {elapsed_str}"
    )

    logger.info(
        message,
        extra={"metadata": {
            "operation": "orchestrator-completion",
            "batch_size": batch_size,
            "offset": offset,
            "total_repos": total_repos,
            "cached": cached,
            "processed": processed,
            "failed": failed,
            "cache_hit_rate": round(cache_hit_rate, 1),
            "elapsed_seconds": round(elapsed, 1),
            "elapsed_formatted": elapsed_str
        }}
    )


def graceful_shutdown(signum, frame):
    """
    Handle SIGTERM for graceful shutdown

    Saves current progress to state file and exits cleanly
    """
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
    # Register signal handler for graceful shutdown
    signal.signal(signal.SIGTERM, graceful_shutdown)

    # Parse CLI arguments
    parser = argparse.ArgumentParser(
        description="Orchestrate gitingest pipeline (fetch → cache → process → upload)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Sequential (process all repos)
  python orchestrator.py

  # Parallel (10 containers)
  python orchestrator.py --batch-size=10 --offset=0  # Container 0
  python orchestrator.py --batch-size=10 --offset=1  # Container 1
  ...
  python orchestrator.py --batch-size=10 --offset=9  # Container 9

  # Dry run (test without processing)
  python orchestrator.py --batch-size=10 --offset=0 --dry-run
        """
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
        help='Simulate processing without running gitingest or uploading to R2'
    )

    args = parser.parse_args()

    # Validate arguments
    if args.offset >= args.batch_size:
        parser.error(f"offset ({args.offset}) must be less than batch-size ({args.batch_size})")

    # Update global state for graceful shutdown
    current_state["batch_size"] = args.batch_size
    current_state["offset"] = args.offset

    # Log pipeline start
    logger.info(
        f"Starting pipeline orchestrator (batch_size={args.batch_size}, offset={args.offset}, dry_run={args.dry_run})",
        extra={"metadata": {
            "batch_size": args.batch_size,
            "offset": args.offset,
            "dry_run": args.dry_run,
            "mode": "orchestrator"
        }}
    )

    start_time = time.time()

    try:
        # Step 1: Fetch repos.json
        if args.dry_run:
            logger.info("[DRY RUN] Simulating repos.json fetch", extra={"metadata": {}})
            # Simulate with 100 test repos
            repos = [
                {
                    "url": f"https://github.com/alphagov/repo{i}",
                    "pushedAt": "2025-01-01T00:00:00Z",
                    "org": "alphagov",
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
        logger.info(
            f"Filtered to {len(batch_repos)} repos for this batch",
            extra={"metadata": {
                "batch_repos": len(batch_repos),
                "batch_size": args.batch_size,
                "offset": args.offset
            }}
        )

        # Step 3: Check cache status for batch repos
        if args.dry_run:
            logger.info("[DRY RUN] Simulating cache check", extra={"metadata": {}})
            cache_status = {repo["url"]: False for repo in batch_repos}  # All cached in dry run
        else:
            cache_status = check_cache_status(batch_repos)

        # Filter to repos needing processing
        repos_to_process = [repo for repo in batch_repos if cache_status.get(repo["url"], True)]
        cached_count = len(batch_repos) - len(repos_to_process)

        logger.info(
            f"Cache check complete: {cached_count} cached, {len(repos_to_process)} need processing",
            extra={"metadata": {
                "cached": cached_count,
                "needs_processing": len(repos_to_process),
                "cache_hit_rate": round((cached_count / len(batch_repos) * 100), 1) if batch_repos else 0
            }}
        )

        # Step 4: Process each repository
        stats = ProcessingStats()
        current_state["stats"] = stats
        processed_count = 0

        for idx, repo in enumerate(repos_to_process):
            repo_url = repo.get("url", "")

            # Progress reporting (every 100 repos)
            if idx > 0 and idx % 100 == 0:
                elapsed = time.time() - start_time
                log_progress(
                    processed=processed_count,
                    total=len(repos_to_process),
                    cached=cached_count,
                    successful=stats.successful,
                    failed=stats.failed,
                    elapsed=elapsed,
                    batch_size=args.batch_size,
                    offset=args.offset
                )

            if args.dry_run:
                logger.info(
                    f"[DRY RUN] Would process {idx + 1}/{len(repos_to_process)}: {repo_url}",
                    extra={"metadata": {"repo_url": repo_url, "index": idx + 1}}
                )
                time.sleep(0.01)  # Simulate processing time
                stats.record_success(10)  # Fake 10s processing time
            else:
                # Process repository with gitingest and upload to R2
                result = process_repository(repo_url, upload_to_r2=True)

                if result.get("success"):
                    stats.record_success(result.get("duration", 0))

                    # Update cache after successful processing (Quality Story 1)
                    # repos.json uses "owner" field, not "org"
                    org = repo.get("owner", repo.get("org", ""))
                    if CACHE_AVAILABLE and org and repo.get("name") and repo.get("pushedAt"):
                        cache_entry = {
                            "pushedAt": repo["pushedAt"],
                            "processedAt": datetime.utcnow().isoformat() + "Z",
                            "status": "complete"
                        }
                        update_cache(org=org, repo=repo["name"], entry=cache_entry)
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

        # Step 5: Log final statistics
        elapsed = time.time() - start_time
        log_final_summary(
            total_repos=len(batch_repos),
            cached=cached_count,
            processed=stats.successful,
            failed=stats.failed,
            elapsed=elapsed,
            batch_size=args.batch_size,
            offset=args.offset
        )

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
