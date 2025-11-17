"""
Google File Search client for uploading gitingest summaries.

Handles File Search Store creation, file uploads with metadata,
and operation polling for completion tracking.
"""

import os
import time
import asyncio
from typing import Dict, Optional, Any
from google import genai
from google.genai import types


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
            print(f"Using existing File Search Store: {self.store_name}")
            return self.store_name

        # Create new store
        print(f"Creating new File Search Store: {display_name}")
        try:
            store = self.client.aio.file_search_stores.create(
                config={'displayName': display_name}
            )
            # Run async create in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            store_result = loop.run_until_complete(store)
            loop.close()

            self.store_name = store_result.name
            print(f"✓ Created store: {self.store_name}")
            print(f"⚠️  Add to .env: GOOGLE_FILE_SEARCH_STORE_NAME={self.store_name}")
            return self.store_name
        except Exception as e:
            print(f"✗ Failed to create File Search Store: {e}")
            raise

    async def upload_summary_async(
        self,
        org: str,
        repo: str,
        summary_content: str,
        metadata: Dict[str, Any],
        max_retries: int = 3
    ) -> bool:
        """
        Upload gitingest summary to File Search Store with retry logic.

        Args:
            org: GitHub organization name
            repo: Repository name
            summary_content: Gitingest summary text
            metadata: Repository metadata (pushedAt, url, etc.)
            max_retries: Maximum retry attempts

        Returns:
            True if upload succeeded, False otherwise
        """
        if not self.store_name:
            self.store_name = self.get_or_create_store()

        delays = [1, 2, 4]  # Exponential backoff delays
        last_error = None

        for attempt in range(max_retries):
            try:
                # Upload file to File Search Store
                operation = await self.client.aio.file_search_stores.upload_to_file_search_store(
                    file=summary_content.encode('utf-8'),
                    file_search_store_name=self.store_name,
                    config={
                        'displayName': f'{org}/{repo}',
                        'customMetadata': {
                            'org': org,
                            'repo': repo,
                            'pushedAt': metadata.get('pushedAt', ''),
                            'url': metadata.get('url', ''),
                            'processedAt': metadata.get('processedAt', ''),
                            'size': str(len(summary_content))
                        }
                    }
                )

                # Poll for completion
                print(f"  Polling operation for {org}/{repo}...")
                while not operation.done:
                    await asyncio.sleep(5)
                    operation = await self.client.aio.operations.get(operation=operation.name)

                # Check for errors
                if operation.error:
                    raise Exception(f"Operation failed: {operation.error}")

                # Success
                self.stats['total_uploaded'] += 1
                self.stats['total_bytes'] += len(summary_content)
                print(f"✓ Uploaded {org}/{repo} ({len(summary_content)} bytes)")
                return True

            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    delay = delays[attempt]
                    print(f"✗ Upload failed (attempt {attempt + 1}/{max_retries}): {e}")
                    print(f"  Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    print(f"✗ Upload failed after {max_retries} attempts: {e}")
                    self.stats['total_failed'] += 1
                    return False

        return False

    def upload_summary(
        self,
        org: str,
        repo: str,
        summary_content: str,
        metadata: Dict[str, Any],
        max_retries: int = 3
    ) -> bool:
        """
        Synchronous wrapper for upload_summary_async.

        Args:
            org: GitHub organization name
            repo: Repository name
            summary_content: Gitingest summary text
            metadata: Repository metadata
            max_retries: Maximum retry attempts

        Returns:
            True if upload succeeded, False otherwise
        """
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                self.upload_summary_async(org, repo, summary_content, metadata, max_retries)
            )
            return result
        finally:
            loop.close()

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
