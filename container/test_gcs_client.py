"""
Test script for CloudStorageClient - validates GCS upload functionality.

Tests cover:
- Small files (<10KB) - baseline test
- Medium files (50KB-100KB) - previously failed with Google File Search
- Large files (200KB-512KB) - full production size range
"""

import os
import sys
from gcs_client import CloudStorageClient

def test_gcs_upload():
    """Test GCS upload with various file sizes."""

    print("\n" + "="*70)
    print("Google Cloud Storage Upload Validation Test")
    print("Testing Cloud Storage client for Vertex AI Search backend")
    print("="*70 + "\n")

    # Initialize client
    try:
        client = CloudStorageClient()
        bucket_name = client.get_or_create_bucket()
        print(f"✓ Connected to GCS bucket: {bucket_name}\n")
    except Exception as e:
        print(f"✗ Failed to initialize GCS client: {e}")
        print("\nEnsure GOOGLE_APPLICATION_CREDENTIALS is set correctly")
        return False

    # Test cases with different file sizes
    test_sizes = [
        (1, "1KB - Tiny file"),
        (10, "10KB - Small file (Google File Search baseline)"),
        (50, "50KB - Medium file (File Search often fails here)"),
        (100, "100KB - Medium-large file"),
        (200, "200KB - Large file"),
        (512, "512KB - Maximum expected file size")
    ]

    metadata_template = {
        'url': 'https://github.com/test/test-repo',
        'pushedAt': '2025-01-01T00:00:00Z',
        'processedAt': '2025-01-17T00:00:00Z'
    }

    all_passed = True

    for size_kb, description in test_sizes:
        print(f"Testing: {description}")
        content = 'x' * (size_kb * 1024)  # Generate test content

        result = client.upload_summary(
            org='test',
            repo=f'size-test-{size_kb}kb',
            summary_content=content,
            metadata=metadata_template
        )

        if result:
            print(f"  ✓ SUCCESS - {size_kb}KB file uploaded\n")
        else:
            print(f"  ✗ FAILED - {size_kb}KB file upload failed\n")
            all_passed = False
            # Continue testing other sizes instead of breaking

    # Print final statistics
    print("\n" + "="*70)
    client.print_stats()

    if all_passed:
        print("\n✓ All tests PASSED - 100% success rate achieved!")
        print("Cloud Storage backend is production-ready for Vertex AI Search\n")
        return True
    else:
        print("\n✗ Some tests FAILED - review errors above")
        return False

if __name__ == "__main__":
    success = test_gcs_upload()
    sys.exit(0 if success else 1)
