"""
Google Cloud Storage client for uploading gitingest summaries.

Handles GCS bucket access, file uploads with embedded metadata in JSON Lines format,
and operation tracking with retry logic.
"""

import os
import time
import json
import hashlib
import logging
from typing import Dict, Optional, Any
from google.cloud import storage
from google.api_core import exceptions
from google.api_core import retry

# Set up logger
logger = logging.getLogger("gitingest-container")


class CloudStorageClient:
    """Client for interacting with Google Cloud Storage."""

    def __init__(self):
        """Initialize the Cloud Storage client with credentials."""
        # Cloud Storage client uses GOOGLE_APPLICATION_CREDENTIALS env var automatically
        # In Cloud Run, it uses the service account metadata automatically
        self.bucket_name = os.getenv('GCS_BUCKET_NAME', 'govreposcrape-summaries')

        try:
            # In Cloud Run, this automatically uses the service account
            # Locally, it uses GOOGLE_APPLICATION_CREDENTIALS env var
            self.client = storage.Client()
        except Exception as e:
            logger.error(f"Failed to initialize GCS client: {e}")
            raise ValueError(f"Failed to initialize GCS client: {e}")

        self.bucket = None

        # Stats tracking
        self.stats = {
            'total_uploaded': 0,
            'total_failed': 0,
            'total_bytes': 0
        }

    def get_or_create_bucket(self) -> str:
        """
        Get existing GCS bucket or verify it exists.

        Returns:
            Bucket name

        Raises:
            Exception if bucket doesn't exist or can't be accessed
        """
        if self.bucket:
            return self.bucket_name

        try:
            self.bucket = self.client.bucket(self.bucket_name)
            # Verify bucket exists by getting its metadata
            if not self.bucket.exists():
                raise Exception(f"Bucket {self.bucket_name} does not exist. Create it first with: gcloud storage buckets create gs://{self.bucket_name} --location=us-central1")

            logger.info(f"Using GCS bucket: {self.bucket_name}")
            return self.bucket_name
        except exceptions.NotFound:
            raise Exception(f"Bucket {self.bucket_name} not found. Create it first with: gcloud storage buckets create gs://{self.bucket_name} --location=us-central1")
        except Exception as e:
            logger.error(f"✗ Failed to access GCS bucket: {e}")
            raise

    def _generate_commit_sha(self, org: str, repo: str, metadata: Dict[str, Any]) -> str:
        """
        Generate a deterministic commit-sha-like identifier from org/repo/pushedAt.

        Args:
            org: GitHub organization name
            repo: Repository name
            metadata: Repository metadata (must include pushedAt)

        Returns:
            40-character hex string (SHA-1 format)
        """
        # Use pushedAt timestamp to create deterministic identifier
        pushed_at = metadata.get('pushedAt', '')
        if not pushed_at:
            # Fallback to current timestamp if pushedAt not available
            pushed_at = metadata.get('processedAt', str(int(time.time())))

        # Create deterministic hash from org/repo/pushedAt
        content = f"{org}/{repo}/{pushed_at}"
        return hashlib.sha1(content.encode()).hexdigest()

    def upload_summary(
        self,
        org: str,
        repo: str,
        summary_content: str,
        metadata: Dict[str, Any],
        max_retries: int = 3
    ) -> bool:
        """
        Upload gitingest summary to GCS in JSON Lines format with embedded metadata.

        Args:
            org: GitHub organization name
            repo: Repository name
            summary_content: Gitingest summary text
            metadata: Repository metadata (pushedAt, url, processedAt, etc.)
            max_retries: Maximum retry attempts (default 3)

        Returns:
            True if upload succeeded, False otherwise
        """
        if not self.bucket:
            self.bucket_name = self.get_or_create_bucket()
            self.bucket = self.client.bucket(self.bucket_name)

        # Exponential backoff delays (1s, 2s, 4s per story spec)
        delays = [1, 2, 4]
        last_error = None

        # Simple object path: {org}/{repo}.md (one file per repo)
        object_path = f"{org}/{repo}.md"

        # Check if file exists and if pushedAt has changed
        try:
            check_blob = self.bucket.blob(object_path)
            check_blob.reload()  # Fetch metadata from GCS

            if check_blob.exists():
                existing_metadata = check_blob.metadata or {}
                existing_pushed_at = existing_metadata.get('pushedAt', '')
                new_pushed_at = str(metadata.get('pushedAt', ''))

                if existing_pushed_at == new_pushed_at:
                    logger.info(f"⊘ Skipping {org}/{repo} (already up-to-date, pushedAt: {existing_pushed_at})")
                    self.stats['total_uploaded'] += 1  # Count as success (already uploaded)
                    return True
                else:
                    logger.info(f"↻ Updating {org}/{repo} (pushedAt changed: {existing_pushed_at} → {new_pushed_at})")
        except exceptions.NotFound:
            # File doesn't exist, continue with upload
            logger.info(f"+ Creating new file {org}/{repo}")
        except Exception as e:
            logger.warning(f"Could not check existing file for {org}/{repo}: {e}")

        # Extract text content from gitingest summary
        # gitingest returns tuple: (summary_text, tree_structure, file_contents)
        if isinstance(summary_content, tuple):
            # Concatenate all parts into a single text string
            content_text = '\n\n'.join(str(part) for part in summary_content if part)
        else:
            content_text = str(summary_content)

        # Use plain text content without metadata header
        # Store metadata as GCS custom metadata for Vertex AI Search
        text_content = content_text

        for attempt in range(max_retries):
            try:
                # Create blob (GCS object)
                blob = self.bucket.blob(object_path)

                # Set custom metadata (x-goog-meta- prefix is automatic in GCS)
                blob.metadata = {
                    'org': org,
                    'repo': repo,
                    'url': metadata.get('url', f"https://github.com/{org}/{repo}"),
                    'pushedAt': str(metadata.get('pushedAt', '')),
                    'processedAt': str(metadata.get('processedAt', '')),
                    'size': str(len(text_content))
                }

                # Upload as Markdown
                blob.upload_from_string(
                    text_content,
                    content_type='text/markdown; charset=utf-8',
                    retry=retry.Retry(deadline=60.0)  # 60s timeout per upload
                )

                # Success
                self.stats['total_uploaded'] += 1
                self.stats['total_bytes'] += len(text_content)
                logger.info(f"✓ Uploaded {org}/{repo} to gs://{self.bucket_name}/{object_path} ({len(text_content)} bytes)")
                return True

            except Exception as e:
                last_error = e

                if attempt < max_retries - 1:
                    delay = delays[attempt] if attempt < len(delays) else delays[-1]
                    error_msg = str(e)

                    logger.error(f"✗ Upload failed (attempt {attempt + 1}/{max_retries}): {type(e).__name__}: {e}")
                    logger.warning(f"  Retrying in {delay}s...")
                    time.sleep(delay)
                else:
                    logger.error(f"✗ Upload failed after {max_retries} attempts: {type(e).__name__}: {e}")
                    self.stats['total_failed'] += 1
                    return False

        return False

    def get_stats(self) -> Dict[str, Any]:
        """
        Get upload statistics.

        Returns:
            Dictionary with upload stats
        """
        return {
            'total_uploaded': self.stats['total_uploaded'],
            'total_failed': self.stats['total_failed'],
            'total_bytes': self.stats['total_bytes'],
            'total_mb': round(self.stats['total_bytes'] / 1024 / 1024, 2),
            'success_rate': (
                round(self.stats['total_uploaded'] /
                      (self.stats['total_uploaded'] + self.stats['total_failed']) * 100, 2)
                if (self.stats['total_uploaded'] + self.stats['total_failed']) > 0
                else 0.0
            )
        }

    def print_stats(self):
        """Print upload statistics to console."""
        stats = self.get_stats()
        print("\n" + "="*60)
        print("Google Cloud Storage Upload Statistics")
        print("="*60)
        print(f"Total Uploaded:  {stats['total_uploaded']}")
        print(f"Total Failed:    {stats['total_failed']}")
        print(f"Success Rate:    {stats['success_rate']}%")
        print(f"Total Data:      {stats['total_mb']} MB ({stats['total_bytes']} bytes)")
        print("="*60 + "\n")
