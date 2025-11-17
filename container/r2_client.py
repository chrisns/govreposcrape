#!/usr/bin/env python3
"""
govreposcrape - R2 Storage Client
Story 2.4: R2 Storage with Metadata - Store Summaries and Tracking Data

Provides R2 storage operations for gitingest summaries with custom metadata.
Uses boto3 S3-compatible API for Cloudflare R2 access.

Usage:
    from r2_client import upload_with_retry, get_summary

    # Upload summary with retry logic
    success = upload_with_retry(
        org="alphagov",
        repo="govuk-frontend",
        content=summary_text,
        metadata={
            "pushedAt": "2025-10-15T14:30:00Z",
            "url": "https://github.com/alphagov/govuk-frontend",
            "processedAt": "2025-11-13T10:05:23Z"
        }
    )

    # Retrieve summary
    summary = get_summary(org="alphagov", repo="govuk-frontend")

Environment Variables:
    R2_BUCKET: Cloudflare R2 bucket name
    R2_ENDPOINT: R2 endpoint URL (e.g., https://[account-id].r2.cloudflarestorage.com)
    R2_ACCESS_KEY: R2 access key ID
    R2_SECRET_KEY: R2 secret access key
"""

import os
import logging
from typing import Dict, Optional
from datetime import datetime

# Logger will be configured by ingest.py
logger = logging.getLogger("gitingest-container.r2-client")


class R2ConfigError(Exception):
    """Raised when R2 configuration is invalid or missing"""
    pass


def validate_environment():
    """
    Validate that all required R2 environment variables are present

    Raises:
        R2ConfigError: If any required environment variable is missing
    """
    required_vars = ["R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY", "R2_SECRET_KEY"]
    missing_vars = [var for var in required_vars if not os.environ.get(var)]

    if missing_vars:
        raise R2ConfigError(
            f"Missing required R2 environment variables: {', '.join(missing_vars)}"
        )


def create_r2_client():
    """
    Create boto3 S3 client configured for Cloudflare R2

    Uses environment variables for configuration:
        - R2_ENDPOINT: R2 endpoint URL
        - R2_ACCESS_KEY: R2 access key ID
        - R2_SECRET_KEY: R2 secret access key

    Returns:
        boto3.client: Configured S3 client for R2

    Raises:
        R2ConfigError: If required environment variables are missing
    """
    validate_environment()

    try:
        import boto3
    except ImportError as e:
        raise ImportError("boto3 library not installed. Run: pip install boto3") from e

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"]
    )


def upload_summary(org: str, repo: str, content: str, metadata: Dict[str, str]) -> bool:
    """
    Upload gitingest summary to R2 with custom metadata

    Object path structure: gitingest/{org}/{repo}/summary.txt
    Content-type: text/plain (required for AI Search compatibility)

    Args:
        org: GitHub organization name (e.g., "alphagov")
        repo: Repository name (e.g., "govuk-frontend")
        content: gitingest summary text
        metadata: Dict with keys: pushedAt, url, processedAt (ISO 8601 timestamps)

    Returns:
        bool: True if upload successful, False if failed

    Example:
        >>> success = upload_summary(
        ...     org="alphagov",
        ...     repo="govuk-frontend",
        ...     content="# govuk-frontend\\n\\nCode summary...",
        ...     metadata={
        ...         "pushedAt": "2025-10-15T14:30:00Z",
        ...         "url": "https://github.com/alphagov/govuk-frontend",
        ...         "processedAt": "2025-11-13T10:05:23Z"
        ...     }
        ... )
        >>> print(success)
        True
    """
    try:
        client = create_r2_client()
        bucket = os.environ["R2_BUCKET"]
        key = f"gitingest/{org}/{repo}/summary.txt"

        logger.info(
            f"Uploading summary to R2: {org}/{repo}",
            extra={"metadata": {"org": org, "repo": repo, "key": key}}
        )

        # Note: boto3 S3 API converts metadata keys to lowercase automatically
        # So pushedAt becomes pushedat, processedAt becomes processedat
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=content.encode("utf-8"),
            ContentType="text/plain",
            Metadata={
                "pushedat": metadata.get("pushedAt", ""),
                "url": metadata.get("url", ""),
                "processedat": metadata.get("processedAt", "")
            }
        )

        logger.info(
            f"Successfully uploaded summary to R2: {org}/{repo}",
            extra={"metadata": {"org": org, "repo": repo, "size_bytes": len(content)}}
        )
        return True

    except Exception as e:
        logger.error(
            f"R2 upload failed for {org}/{repo}: {str(e)}",
            extra={"metadata": {"org": org, "repo": repo, "error": str(e)}}
        )
        return False


def get_summary(org: str, repo: str) -> Optional[str]:
    """
    Retrieve gitingest summary from R2

    Object path structure: gitingest/{org}/{repo}/summary.txt

    Args:
        org: GitHub organization name (e.g., "alphagov")
        repo: Repository name (e.g., "govuk-frontend")

    Returns:
        Optional[str]: Summary text if found, None if not found or error occurred

    Example:
        >>> summary = get_summary(org="alphagov", repo="govuk-frontend")
        >>> print(summary[:50] if summary else "Not found")
        # govuk-frontend\n\nCode summary...
    """
    try:
        client = create_r2_client()
        bucket = os.environ["R2_BUCKET"]
        key = f"gitingest/{org}/{repo}/summary.txt"

        logger.info(
            f"Retrieving summary from R2: {org}/{repo}",
            extra={"metadata": {"org": org, "repo": repo, "key": key}}
        )

        response = client.get_object(Bucket=bucket, Key=key)
        content = response["Body"].read().decode("utf-8")

        logger.info(
            f"Successfully retrieved summary from R2: {org}/{repo}",
            extra={"metadata": {"org": org, "repo": repo, "size_bytes": len(content)}}
        )
        return content

    except Exception as e:
        # Check if it's a NoSuchKey error (boto3 specific exception)
        error_code = e.response.get('Error', {}).get('Code', '') if hasattr(e, 'response') else ''
        if error_code == 'NoSuchKey' or 'NoSuchKey' in str(type(e)):
            logger.warning(
                f"Summary not found in R2: {org}/{repo}",
                extra={"metadata": {"org": org, "repo": repo}}
            )
            return None
        # Other errors
        logger.error(
            f"R2 retrieval failed for {org}/{repo}: {str(e)}",
            extra={"metadata": {"org": org, "repo": repo, "error": str(e)}}
        )
        return None


def upload_with_retry(org: str, repo: str, content: str, metadata: Dict[str, str]) -> bool:
    """
    Upload gitingest summary to R2 with retry logic

    Uses retry_with_backoff pattern from ingest.py (3 attempts, delays [1s, 2s, 4s])

    Args:
        org: GitHub organization name
        repo: Repository name
        content: gitingest summary text
        metadata: Dict with pushedAt, url, processedAt

    Returns:
        bool: True if upload successful (possibly after retries), False if all attempts failed

    Example:
        >>> success = upload_with_retry(
        ...     org="alphagov",
        ...     repo="govuk-frontend",
        ...     content=summary_text,
        ...     metadata={"pushedAt": "2025-10-15T14:30:00Z", ...}
        ... )
    """
    # Import retry logic from ingest.py
    from ingest import retry_with_backoff

    try:
        # Wrap upload_summary in lambda for retry_with_backoff
        def upload_fn():
            success = upload_summary(org, repo, content, metadata)
            if not success:
                # Raise exception to trigger retry
                raise Exception(f"Upload failed for {org}/{repo}")
            return success

        return retry_with_backoff(upload_fn, max_attempts=3, delays=[1, 2, 4])

    except Exception as e:
        logger.error(
            f"Upload failed after all retries for {org}/{repo}: {str(e)}",
            extra={"metadata": {"org": org, "repo": repo, "error": str(e)}}
        )
        return False


# Upload statistics tracking
class UploadStats:
    """Track R2 upload statistics across multiple uploads"""

    def __init__(self):
        self.total_uploaded = 0
        self.total_failed = 0
        self.total_storage_size = 0

    def record_success(self, size_bytes: int):
        """Record successful upload"""
        self.total_uploaded += 1
        self.total_storage_size += size_bytes

    def record_failure(self):
        """Record failed upload"""
        self.total_failed += 1

    def get_total_storage_mb(self) -> float:
        """Get total storage size in megabytes"""
        return self.total_storage_size / (1024 * 1024)

    def log_stats(self):
        """Log upload statistics"""
        total = self.total_uploaded + self.total_failed
        storage_mb = self.get_total_storage_mb()

        logger.info(
            "R2 upload statistics",
            extra={"metadata": {
                "total": total,
                "uploaded": self.total_uploaded,
                "failed": self.total_failed,
                "storage_mb": round(storage_mb, 2)
            }}
        )
