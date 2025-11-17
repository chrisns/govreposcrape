"""
Google File Search client for uploading gitingest summaries.

Handles File Search Store creation, file uploads with metadata,
and operation polling for completion tracking.
"""

import os
import time
import asyncio
import logging
from typing import Dict, Optional, Any
from google import genai
from google.genai import types

# Set up logger
logger = logging.getLogger("gitingest-container")


class GoogleFileSearchClient:
    """Client for interacting with Google File Search API."""

    def __init__(self):
        """Initialize the File Search client with credentials."""
        self.api_key = os.getenv('GOOGLE_GEMINI_API_KEY')
        if not self.api_key:
            raise ValueError("GOOGLE_GEMINI_API_KEY environment variable not set")

        self.client = genai.Client(api_key=self.api_key)
        self.store_name = os.getenv('GOOGLE_FILE_SEARCH_STORE_NAME')

        # Stats tracking
        self.stats = {
            'total_uploaded': 0,
            'total_failed': 0,
            'total_bytes': 0
        }

    def get_or_create_store(self, display_name: str = "govreposcrape-uk-code") -> str:
        """
        Get existing File Search Store or create new one.

        Args:
            display_name: Display name for the store

        Returns:
            Store name (full resource path)
        """
        # If store name is set in env, use it
        if self.store_name:
            logger.info(f"Using existing File Search Store: {self.store_name}")
            return self.store_name

        # Create new store
        logger.info(f"Creating new File Search Store: {display_name}")
        try:
            file_search_store = self.client.file_search_stores.create(
                config={'display_name': display_name}
            )
            self.store_name = file_search_store.name
            logger.info(f"✓ Created store: {self.store_name}")
            logger.warning(f"⚠️  Add to .env: GOOGLE_FILE_SEARCH_STORE_NAME={self.store_name}")
            return self.store_name
        except Exception as e:
            logger.error(f"✗ Failed to create File Search Store: {e}")
            raise

    def upload_summary_sync(
        self,
        org: str,
        repo: str,
        summary_content: str,
        metadata: Dict[str, Any],
        max_retries: int = 5
    ) -> bool:
        """
        Upload gitingest summary to File Search Store with retry logic.

        Args:
            org: GitHub organization name
            repo: Repository name
            summary_content: Gitingest summary text
            metadata: Repository metadata (pushedAt, url, etc.)
            max_retries: Maximum retry attempts (default 5 for 503 resilience)

        Returns:
            True if upload succeeded, False otherwise
        """
        import tempfile

        if not self.store_name:
            self.store_name = self.get_or_create_store()

        # Longer exponential backoff for 503 service unavailability
        delays = [2, 5, 10, 20, 40]  # Up to 40 seconds for transient API issues
        last_error = None

        for attempt in range(max_retries):
            tmp_file_path = None
            try:
                # Google File Search has trouble with very large files
                # Conservative 100KB limit to avoid 503 token counting errors
                max_size = 100 * 1024  # 100KB limit for reliable uploads
                upload_content = summary_content
                if len(summary_content) > max_size:
                    upload_content = summary_content[:max_size]
                    truncation_note = f"\n\n[Summary truncated from {len(summary_content)} to {max_size} bytes for Google File Search compatibility]"
                    upload_content = upload_content[:max_size - len(truncation_note)] + truncation_note

                # Create temporary file with (possibly truncated) summary content
                with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp_file:
                    tmp_file.write(upload_content)
                    tmp_file_path = tmp_file.name

                # Upload file to Files API
                # Use display_name for human-readable name (supports slashes)
                file = self.client.files.upload(
                    file=tmp_file_path,
                    config={'display_name': f'{org}/{repo}'}
                )

                # Import file into File Search Store (following official documentation)
                # Note: custom_metadata not supported in import_file per docs
                operation = self.client.file_search_stores.import_file(
                    file_search_store_name=self.store_name,
                    file_name=file.name
                )

                # CRITICAL: Poll until import operation completes
                # This was the missing piece causing all uploads to fail
                max_poll_attempts = 60  # 5 minutes max (60 * 5 seconds)
                poll_count = 0
                while not operation.done and poll_count < max_poll_attempts:
                    time.sleep(5)
                    operation = self.client.operations.get(operation)
                    poll_count += 1

                if not operation.done:
                    raise Exception(f"Import operation timed out after {max_poll_attempts * 5} seconds")

                # Check for operation errors
                if hasattr(operation, 'error') and operation.error:
                    raise Exception(f"Import operation failed: {operation.error}")

                # Clean up temporary file
                if tmp_file_path and os.path.exists(tmp_file_path):
                    os.unlink(tmp_file_path)

                # Success
                self.stats['total_uploaded'] += 1
                self.stats['total_bytes'] += len(summary_content)
                logger.info(f"✓ Uploaded {org}/{repo} ({len(summary_content)} bytes)")
                return True

            except Exception as e:
                last_error = e
                # Clean up temporary file on error
                if tmp_file_path and os.path.exists(tmp_file_path):
                    try:
                        os.unlink(tmp_file_path)
                    except:
                        pass

                if attempt < max_retries - 1:
                    delay = delays[attempt] if attempt < len(delays) else delays[-1]
                    error_msg = str(e)

                    # Check if it's a 503 service unavailable error
                    is_503 = '503' in error_msg or 'UNAVAILABLE' in error_msg.upper()

                    logger.error(f"✗ Upload failed (attempt {attempt + 1}/{max_retries}): {type(e).__name__}: {e}")
                    if is_503:
                        logger.warning(f"  Service temporarily unavailable - retrying in {delay}s...")
                    else:
                        logger.warning(f"  Retrying in {delay}s...")
                    time.sleep(delay)
                else:
                    logger.error(f"✗ Upload failed after {max_retries} attempts: {type(e).__name__}: {e}")
                    self.stats['total_failed'] += 1
                    return False

        return False

    def upload_summary(
        self,
        org: str,
        repo: str,
        summary_content: str,
        metadata: Dict[str, Any],
        max_retries: int = 5
    ) -> bool:
        """
        Upload gitingest summary to File Search Store.

        Args:
            org: GitHub organization name
            repo: Repository name
            summary_content: Gitingest summary text
            metadata: Repository metadata
            max_retries: Maximum retry attempts (default 5 for 503 resilience)

        Returns:
            True if upload succeeded, False otherwise
        """
        return self.upload_summary_sync(org, repo, summary_content, metadata, max_retries)

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
        print("Google File Search Upload Statistics")
        print("="*60)
        print(f"Total Uploaded:  {stats['total_uploaded']}")
        print(f"Total Failed:    {stats['total_failed']}")
        print(f"Success Rate:    {stats['success_rate']}%")
        print(f"Total Data:      {stats['total_mb']} MB ({stats['total_bytes']} bytes)")
        print("="*60 + "\n")
