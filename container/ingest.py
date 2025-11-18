#!/usr/bin/env python3
"""
govreposcrape - gitingest Processing Container
Story 2.5: Parallel Execution Support - CLI Arguments for Batch Processing

CLI entrypoint for processing GitHub repositories with gitingest library.
Generates LLM-ready code summaries for semantic search.

Usage:
    # Sequential (process all repos from repos.json)
    python ingest.py

    # Parallel (10 containers)
    python ingest.py --batch-size=10 --offset=0  # Container 0
    python ingest.py --batch-size=10 --offset=1  # Container 1
    ...
    python ingest.py --batch-size=10 --offset=9  # Container 9

    # Dry run (test without processing)
    python ingest.py --batch-size=10 --offset=0 --dry-run

Environment Variables:
    R2_BUCKET: Cloudflare R2 bucket name
    R2_ENDPOINT: R2 endpoint URL
    R2_ACCESS_KEY: R2 access key ID
    R2_SECRET_KEY: R2 secret access key
"""

import sys
import os
import argparse
import logging
import json
import time
import signal
import requests
from typing import Dict, Any, Optional, List
from datetime import datetime


# Configure structured JSON logging (matching src/utils/logger.ts pattern)
class JSONFormatter(logging.Formatter):
    """Structured JSON log formatter matching TypeScript logger pattern"""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname.lower(),
            "message": record.getMessage(),
            "context": {
                "operation": "gitingest-container",
                "metadata": getattr(record, "metadata", {})
            }
        }
        return json.dumps(log_entry)


# Set up logger
logger = logging.getLogger("gitingest-container")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JSONFormatter())
logger.addHandler(handler)


# Statistics tracking
class ProcessingStats:
    """Track processing statistics across repository processing"""

    def __init__(self):
        self.successful = 0
        self.failed = 0
        self.total_time = 0.0
        self.start_time = time.time()

    def record_success(self, duration: float):
        """Record successful processing"""
        self.successful += 1
        self.total_time += duration

    def record_failure(self):
        """Record failed processing"""
        self.failed += 1

    def get_average_time(self) -> float:
        """Calculate average processing time"""
        if self.successful == 0:
            return 0.0
        return self.total_time / self.successful

    def log_stats(self, batch_size: int = 1, offset: int = 0):
        """
        Log processing statistics with batch context

        Args:
            batch_size: Batch size for parallel execution (default: 1)
            offset: Offset for this batch (default: 0)
        """
        total = self.successful + self.failed
        avg_time = self.get_average_time()
        elapsed = time.time() - self.start_time

        logger.info(
            f"Batch {batch_size}, offset {offset} complete: "
            f"{self.successful} successful, {self.failed} failed",
            extra={"metadata": {
                "batch_size": batch_size,
                "offset": offset,
                "total": total,
                "successful": self.successful,
                "failed": self.failed,
                "average_time_seconds": round(avg_time, 2),
                "total_time_seconds": round(elapsed, 2)
            }}
        )


# Global stats instance
stats = ProcessingStats()


# Timeout handler
class TimeoutError(Exception):
    """Raised when gitingest processing exceeds timeout"""
    pass


def timeout_handler(signum, frame):
    """Signal handler for timeout enforcement"""
    raise TimeoutError("gitingest processing exceeded 5 minute timeout")


def upload_summary_to_r2(repo_url: str, summary: str) -> bool:
    """
    Upload gitingest summary to R2 with retry logic

    Extracts org and repo from GitHub URL and uploads with metadata.

    Args:
        repo_url: GitHub repository URL (e.g., "https://github.com/alphagov/govuk-frontend")
        summary: gitingest summary text

    Returns:
        bool: True if upload successful, False otherwise
    """
    try:
        # Import R2 client (lazy import to avoid errors if env vars missing)
        from r2_client import upload_with_retry

        # Extract org and repo from URL
        # Expected format: https://github.com/org/repo or https://github.com/org/repo.git
        url_parts = repo_url.rstrip("/").rstrip(".git").split("/")
        if len(url_parts) < 2:
            logger.error(
                f"Invalid GitHub URL format: {repo_url}",
                extra={"metadata": {"repo_url": repo_url}}
            )
            return False

        org = url_parts[-2]
        repo = url_parts[-1]

        # Prepare metadata
        metadata = {
            "pushedAt": "",  # Will be populated by orchestrator with repos.json data
            "url": repo_url,
            "processedAt": datetime.utcnow().isoformat() + "Z"
        }

        # Upload with retry logic
        return upload_with_retry(org, repo, summary, metadata)

    except ImportError as e:
        logger.warning(
            f"R2 client not available: {str(e)}",
            extra={"metadata": {"error": str(e)}}
        )
        return False
    except Exception as e:
        logger.error(
            f"Unexpected error uploading to R2: {str(e)}",
            extra={"metadata": {"repo_url": repo_url, "error": str(e)}}
        )
        return False


def retry_with_backoff(func, max_attempts=3, delays=[1, 2, 4]):
    """
    Retry function with exponential backoff

    Pattern matches src/utils/retry.ts for consistency across Workers and container.

    Args:
        func: Function to retry
        max_attempts: Maximum number of attempts (default: 3)
        delays: Delay in seconds between retries (default: [1, 2, 4])

    Returns:
        Function result on success

    Raises:
        Exception: Last exception if all retries fail
    """
    for attempt in range(max_attempts):
        try:
            return func()
        except Exception as e:
            if attempt == max_attempts - 1:
                # Last attempt failed
                raise

            delay = delays[attempt] if attempt < len(delays) else delays[-1]
            logger.warning(
                f"Retry attempt {attempt + 1}/{max_attempts} after {delay}s delay",
                extra={"metadata": {"error": str(e), "attempt": attempt + 1, "delay": delay}}
            )
            time.sleep(delay)


def fetch_repos_json(feed_url: str = "https://uk-x-gov-software-community.github.io/xgov-opensource-repo-scraper/repos.json") -> List[Dict[str, Any]]:
    """
    Fetch and parse repos.json feed

    Args:
        feed_url: URL to repos.json feed (default: xgov-opensource-repo-scraper)

    Returns:
        List of repository objects with url, pushedAt, org, name fields

    Raises:
        Exception: If fetch fails after retries
    """
    def fetch():
        logger.info(f"Fetching repos.json from {feed_url}")
        response = requests.get(feed_url, timeout=30)
        response.raise_for_status()
        repos = response.json()

        logger.info(
            f"Fetched {len(repos)} repositories from feed",
            extra={"metadata": {"total_repos": len(repos), "feed_url": feed_url}}
        )

        return repos

    try:
        return retry_with_backoff(fetch, max_attempts=3, delays=[1, 2, 4])
    except Exception as e:
        logger.error(
            f"Failed to fetch repos.json after retries: {str(e)}",
            extra={"metadata": {"feed_url": feed_url, "error": str(e)}}
        )
        raise


def filter_repos_for_batch(repos: List[Dict[str, Any]], batch_size: int, offset: int) -> List[Dict[str, Any]]:
    """
    Filter repositories using modulo arithmetic for parallel execution

    Args:
        repos: List of repository objects from repos.json
        batch_size: Total number of parallel containers
        offset: This container's offset (0 to batch_size-1)

    Returns:
        List of repos assigned to this batch

    Example:
        batch_size=10, offset=0 → repos at indices [0, 10, 20, 30...]
        batch_size=10, offset=3 → repos at indices [3, 13, 23, 33...]
    """
    filtered = [
        repo for idx, repo in enumerate(repos)
        if idx % batch_size == offset
    ]

    logger.info(
        f"Batch filtering: {len(filtered)}/{len(repos)} repos assigned "
        f"(batch_size={batch_size}, offset={offset})",
        extra={"metadata": {
            "batch_size": batch_size,
            "offset": offset,
            "total_repos": len(repos),
            "assigned_repos": len(filtered)
        }}
    )

    return filtered


def process_repository(repo_url: str, upload_to_r2: bool = True) -> Dict[str, Any]:
    """
    Process a single repository with gitingest and optionally upload to R2

    Args:
        repo_url: GitHub repository URL to process
        upload_to_r2: Whether to upload summary to R2 (default: True)

    Returns:
        Dict with success status, summary (if successful), uploaded (if R2 upload attempted), and error (if failed)
    """
    start_time = time.time()

    logger.info(
        "Processing repository",
        extra={"metadata": {"repo_url": repo_url}}
    )

    try:
        # Import gitingest library (lazy import for better error handling)
        try:
            from gitingest import ingest
        except ImportError as e:
            logger.error(
                "gitingest library not installed",
                extra={"metadata": {"error": str(e)}}
            )
            return {
                "success": False,
                "error": "gitingest library not installed",
                "repo_url": repo_url
            }

        # Set 5 minute timeout (300 seconds)
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(5 * 60)

        try:
            # Execute gitingest with retry logic
            # Note: ingest() returns IngestionResult object with .summary attribute
            # max_file_size=524288 (512KB) to limit file sizes for LLM context
            result = retry_with_backoff(
                lambda: ingest(repo_url, max_file_size=524288),
                max_attempts=3,
                delays=[1, 2, 4]
            )

            # Handle different return types from gitingest library
            # Check for .summary attribute FIRST (IngestionResult is a named tuple)
            if hasattr(result, 'summary'):
                # Current API: returns IngestionResult object with .summary attribute
                summary = result.summary
            elif isinstance(result, tuple) and len(result) == 2:
                # Old API: returns (summary, tree) tuple
                summary, tree = result
            else:
                # Fallback: convert to string
                summary = str(result)
                logger.warning(
                    f"Unexpected return type from gitingest: {type(result)}",
                    extra={"metadata": {"repo_url": repo_url, "result_type": str(type(result))}}
                )

            # Cancel timeout
            signal.alarm(0)

            duration = time.time() - start_time
            stats.record_success(duration)

            # No truncation - Vertex AI Search handles large documents
            summary_length = len(summary) if isinstance(summary, str) else 0

            logger.info(
                "Summary generated successfully",
                extra={"metadata": {
                    "repo_url": repo_url,
                    "duration_seconds": round(duration, 2),
                    "summary_type": str(type(summary)),
                    "summary_length": summary_length
                }}
            )

            # Upload to R2 if enabled
            uploaded = False
            if upload_to_r2:
                logger.info(
                    f"Attempting R2 upload for {repo_url}",
                    extra={"metadata": {"summary_is_string": isinstance(summary, str)}}
                )
                uploaded = upload_summary_to_r2(repo_url, summary)
                logger.info(
                    f"R2 upload result for {repo_url}: {'success' if uploaded else 'failed'}",
                    extra={"metadata": {"uploaded": uploaded}}
                )

            return {
                "success": True,
                "summary": summary,
                "repo_url": repo_url,
                "duration": duration,
                "uploaded": uploaded
            }

        except TimeoutError as e:
            signal.alarm(0)  # Cancel alarm
            duration = time.time() - start_time
            stats.record_failure()

            logger.error(
                "Processing timeout",
                extra={"metadata": {
                    "repo_url": repo_url,
                    "error": "Exceeded 5 minute timeout",
                    "duration_seconds": round(duration, 2)
                }}
            )

            return {
                "success": False,
                "error": "Timeout after 5 minutes",
                "repo_url": repo_url
            }

        finally:
            signal.alarm(0)  # Ensure alarm is cancelled

    except Exception as e:
        duration = time.time() - start_time
        stats.record_failure()

        logger.error(
            "Processing failed",
            extra={"metadata": {
                "repo_url": repo_url,
                "error": str(e),
                "duration_seconds": round(duration, 2)
            }}
        )

        return {
            "success": False,
            "error": str(e),
            "repo_url": repo_url
        }


def main():
    """CLI entrypoint"""
    parser = argparse.ArgumentParser(
        description="govscraperepo gitingest ingestion pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Sequential (process all repos)
  python ingest.py

  # Parallel (10 containers)
  python ingest.py --batch-size=10 --offset=0  # Container 0
  python ingest.py --batch-size=10 --offset=1  # Container 1
  ...
  python ingest.py --batch-size=10 --offset=9  # Container 9

  # Dry run (test without processing)
  python ingest.py --batch-size=10 --offset=0 --dry-run
        """
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        default=1,
        help="Process every Nth repository (for parallel execution)"
    )

    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Offset within batch (0 to batch-size-1)"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate processing without actually running gitingest"
    )

    args = parser.parse_args()

    # Validate offset < batch_size
    if args.offset >= args.batch_size:
        parser.error(f"offset ({args.offset}) must be less than batch-size ({args.batch_size})")

    logger.info(
        f"Container started - Batch {args.batch_size}, offset {args.offset}",
        extra={"metadata": {
            "batch_size": args.batch_size,
            "offset": args.offset,
            "dry_run": args.dry_run
        }}
    )

    # Validate environment variables
    required_env_vars = ["R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY", "R2_SECRET_KEY"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]

    if missing_vars:
        logger.warning(
            "Missing environment variables (R2 upload will be skipped)",
            extra={"metadata": {"missing_vars": missing_vars}}
        )

    try:
        # Fetch all repos from feed
        repos = fetch_repos_json()

        # Filter repos for this batch
        batch_repos = filter_repos_for_batch(repos, args.batch_size, args.offset)

        logger.info(
            f"Processing batch {args.batch_size}, offset {args.offset}: "
            f"{len(batch_repos)} repos assigned",
            extra={"metadata": {
                "batch_size": args.batch_size,
                "offset": args.offset,
                "assigned_repos": len(batch_repos)
            }}
        )

        # Process each repository in batch
        for idx, repo in enumerate(batch_repos):
            repo_url = repo.get("url", "")

            if args.dry_run:
                logger.info(
                    f"[DRY RUN] Would process {idx + 1}/{len(batch_repos)}: {repo_url}",
                    extra={"metadata": {
                        "repo_url": repo_url,
                        "progress": f"{idx + 1}/{len(batch_repos)}"
                    }}
                )
                stats.record_success(0)  # Simulate success for dry run
            else:
                logger.info(
                    f"Processing {idx + 1}/{len(batch_repos)}: {repo_url}",
                    extra={"metadata": {
                        "repo_url": repo_url,
                        "progress": f"{idx + 1}/{len(batch_repos)}",
                        "batch_size": args.batch_size,
                        "offset": args.offset
                    }}
                )

                result = process_repository(repo_url, upload_to_r2=not args.dry_run)

                if not result["success"]:
                    logger.warning(
                        f"Failed to process {repo_url}: {result.get('error')}",
                        extra={"metadata": {
                            "repo_url": repo_url,
                            "error": result.get("error")
                        }}
                    )

        # Log final statistics with batch context
        stats.log_stats(batch_size=args.batch_size, offset=args.offset)

        logger.info(
            f"Container completed successfully - Batch {args.batch_size}, offset {args.offset}",
            extra={"metadata": {
                "batch_size": args.batch_size,
                "offset": args.offset,
                "total_repos": len(batch_repos)
            }}
        )
        sys.exit(0)

    except Exception as e:
        logger.error(
            f"Container failed with error: {str(e)}",
            extra={"metadata": {
                "error": str(e),
                "batch_size": args.batch_size,
                "offset": args.offset
            }}
        )
        stats.log_stats(batch_size=args.batch_size, offset=args.offset)
        sys.exit(1)


if __name__ == "__main__":
    main()
