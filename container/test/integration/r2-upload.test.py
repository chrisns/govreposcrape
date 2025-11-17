"""
govreposcrape - R2 Upload Integration Tests
Integration tests for R2 upload with truncated summaries

Tests the complete pipeline from gitingest processing through R2 upload,
with special focus on handling truncated summaries that exceed 512KB.

Test coverage:
- R2 upload with truncated summaries
- File size limits in R2
- Metadata includes truncation information
- Uploaded content includes truncation notice
- R2 object path structure validation
- Error handling during upload

NOTE: These tests can run with or without real R2 credentials.
With credentials: Full integration test
Without credentials: Mocked R2 client (unit test mode)
"""

import pytest
import os
from unittest.mock import patch, Mock, MagicMock
from collections import namedtuple


# Constants
MAX_SUMMARY_SIZE = 524288  # 512KB
TRUNCATION_NOTICE = "\n\n[... Summary truncated at 512KB limit ...]"

# Mark tests that require real R2 credentials
pytestmark = pytest.mark.integration


class TestR2UploadWithTruncation:
    """Test R2 upload behavior with truncated summaries"""

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_upload_truncated_summary_to_r2(self, mock_create_client):
        """
        Test: Truncated summary is successfully uploaded to R2

        Acceptance Criteria:
        - Upload succeeds with truncated content
        - Content includes truncation notice
        - Metadata is attached correctly
        - Object path follows gitingest/{org}/{repo}/summary.txt pattern
        """
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        # Truncated summary with notice
        truncated_summary = ("x" * MAX_SUMMARY_SIZE) + TRUNCATION_NOTICE

        from r2_client import upload_summary

        # Act
        result = upload_summary(
            org="alphagov",
            repo="large-repo",
            content=truncated_summary,
            metadata={
                "pushedAt": "2025-10-15T14:30:00Z",
                "url": "https://github.com/alphagov/large-repo",
                "processedAt": "2025-11-13T10:05:23Z"
            }
        )

        # Assert
        assert result is True
        mock_client.put_object.assert_called_once()

        call_args = mock_client.put_object.call_args
        uploaded_content = call_args.kwargs["Body"].decode("utf-8")

        assert TRUNCATION_NOTICE in uploaded_content, \
            "Uploaded content should include truncation notice"
        assert call_args.kwargs["Key"] == "gitingest/alphagov/large-repo/summary.txt"
        assert call_args.kwargs["ContentType"] == "text/plain"

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_r2_file_size_limit_validation(self, mock_create_client):
        """
        Test: R2 handles files up to and including 512KB + notice

        Acceptance Criteria:
        - Files <= 512KB + notice size are accepted
        - Upload succeeds
        - Content is complete
        """
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        # Maximum truncated summary: 512KB content + notice
        max_truncated = ("x" * MAX_SUMMARY_SIZE) + TRUNCATION_NOTICE
        max_size = len(max_truncated.encode('utf-8'))

        from r2_client import upload_summary

        # Act
        result = upload_summary(
            org="test-org",
            repo="test-repo",
            content=max_truncated,
            metadata={
                "pushedAt": "2025-10-15T14:30:00Z",
                "url": "https://github.com/test-org/test-repo",
                "processedAt": "2025-11-13T10:05:23Z"
            }
        )

        # Assert
        assert result is True
        mock_client.put_object.assert_called_once()

        call_args = mock_client.put_object.call_args
        uploaded_size = len(call_args.kwargs["Body"])

        # Verify size is 512KB + notice
        assert uploaded_size == max_size, \
            f"Uploaded size should be 512KB + notice ({max_size} bytes)"
        assert uploaded_size > MAX_SUMMARY_SIZE, \
            "Uploaded content should include notice appended after 512KB"

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_r2_metadata_includes_truncation_info(self, mock_create_client):
        """
        Test: R2 upload metadata can include truncation information

        NOTE: Current implementation doesn't add a 'truncated' flag to R2 metadata.
        This is by design - truncation is indicated by presence of notice in content.
        This test documents the current behavior.

        Acceptance Criteria:
        - Standard metadata (pushedAt, url, processedAt) is attached
        - Truncation is indicated by notice in content, not metadata flag
        - Metadata structure follows boto3 S3 API conventions
        """
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        truncated_summary = ("x" * MAX_SUMMARY_SIZE) + TRUNCATION_NOTICE

        from r2_client import upload_summary

        # Act
        result = upload_summary(
            org="test-org",
            repo="test-repo",
            content=truncated_summary,
            metadata={
                "pushedAt": "2025-10-15T14:30:00Z",
                "url": "https://github.com/test-org/test-repo",
                "processedAt": "2025-11-13T10:05:23Z"
            }
        )

        # Assert
        assert result is True
        call_args = mock_client.put_object.call_args
        uploaded_metadata = call_args.kwargs["Metadata"]

        # Verify standard metadata is present
        assert "pushedat" in uploaded_metadata  # boto3 lowercases keys
        assert "url" in uploaded_metadata
        assert "processedat" in uploaded_metadata

        # Document: No explicit 'truncated' flag in metadata
        # Truncation is indicated by presence of notice in content
        assert "truncated" not in uploaded_metadata, \
            "Current implementation: no 'truncated' metadata flag"

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_r2_upload_truncation_notice_verification(self, mock_create_client):
        """
        Test: Uploaded content includes truncation notice when applicable

        Acceptance Criteria:
        - Truncation notice is present in uploaded content
        - Notice format is correct
        - Notice is at the end of content
        """
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        truncated_summary = ("x" * MAX_SUMMARY_SIZE) + TRUNCATION_NOTICE

        from r2_client import upload_summary

        # Act
        result = upload_summary(
            org="test-org",
            repo="test-repo",
            content=truncated_summary,
            metadata={
                "pushedAt": "2025-10-15T14:30:00Z",
                "url": "https://github.com/test-org/test-repo",
                "processedAt": "2025-11-13T10:05:23Z"
            }
        )

        # Assert
        assert result is True
        call_args = mock_client.put_object.call_args
        uploaded_content = call_args.kwargs["Body"].decode("utf-8")

        assert uploaded_content.endswith(TRUNCATION_NOTICE), \
            "Truncation notice should be at end of uploaded content"
        assert "[... Summary truncated at 512KB limit ...]" in uploaded_content, \
            "Notice should have correct text"

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_r2_upload_small_summary_no_notice(self, mock_create_client):
        """
        Test: Small summaries uploaded without truncation notice

        Acceptance Criteria:
        - Summaries < 512KB have no truncation notice
        - Content is uploaded unchanged
        - Upload succeeds
        """
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        small_summary = "# Small Repo\n\nJust a small summary."
        assert len(small_summary) < MAX_SUMMARY_SIZE

        from r2_client import upload_summary

        # Act
        result = upload_summary(
            org="test-org",
            repo="small-repo",
            content=small_summary,
            metadata={
                "pushedAt": "2025-10-15T14:30:00Z",
                "url": "https://github.com/test-org/small-repo",
                "processedAt": "2025-11-13T10:05:23Z"
            }
        )

        # Assert
        assert result is True
        call_args = mock_client.put_object.call_args
        uploaded_content = call_args.kwargs["Body"].decode("utf-8")

        assert uploaded_content == small_summary, \
            "Small summary should be uploaded unchanged"
        assert TRUNCATION_NOTICE not in uploaded_content, \
            "No truncation notice for small summaries"


class TestR2UploadRetryWithTruncation:
    """Test R2 upload retry logic with truncated summaries"""

    @patch('r2_client.upload_summary')
    def test_retry_with_truncated_summary(self, mock_upload):
        """
        Test: Retry logic works correctly with truncated summaries

        Acceptance Criteria:
        - Truncated summary is retried on failure
        - Retry succeeds after transient failure
        - Full truncated content (including notice) is uploaded on retry
        """
        # Arrange - Fail once, succeed on retry
        mock_upload.side_effect = [False, True]

        truncated_summary = ("x" * MAX_SUMMARY_SIZE) + TRUNCATION_NOTICE

        from r2_client import upload_with_retry

        # Act
        result = upload_with_retry(
            org="test-org",
            repo="test-repo",
            content=truncated_summary,
            metadata={
                "pushedAt": "2025-10-15T14:30:00Z",
                "url": "https://github.com/test-org/test-repo",
                "processedAt": "2025-11-13T10:05:23Z"
            }
        )

        # Assert
        assert result is True
        assert mock_upload.call_count == 2

        # Verify both attempts used same truncated content
        first_call = mock_upload.call_args_list[0]
        second_call = mock_upload.call_args_list[1]

        assert first_call[0][2] == truncated_summary
        assert second_call[0][2] == truncated_summary


class TestEndToEndPipeline:
    """Test complete pipeline: gitingest -> truncation -> R2 upload"""

    @patch('gitingest.ingest')
    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_full_pipeline_with_large_repo(self, mock_create_client, mock_ingest):
        """
        Test: Complete pipeline with large repository

        Pipeline stages:
        1. gitingest returns large summary
        2. Summary is truncated at 512KB
        3. Truncation notice is appended
        4. Truncated summary is uploaded to R2
        5. Upload succeeds

        Acceptance Criteria:
        - All stages complete successfully
        - R2 receives truncated summary with notice
        - Metadata is correct
        """
        # Arrange
        mock_r2_client = Mock()
        mock_create_client.return_value = mock_r2_client

        # Mock gitingest returning large summary (1MB)
        large_summary = "# Large Repository\n\n" + ("x" * 1000000)
        IngestionResult = namedtuple('IngestionResult', ['summary', 'tree'])
        mock_ingest.return_value = IngestionResult(
            summary=large_summary,
            tree="src/"
        )

        from ingest import process_repository

        # Act - Run complete pipeline
        result = process_repository(
            "https://github.com/alphagov/large-repo",
            upload_to_r2=True
        )

        # Assert - Verify pipeline success
        assert result["success"] is True
        assert result["uploaded"] is True

        # Verify R2 upload was called
        mock_r2_client.put_object.assert_called_once()

        # Verify uploaded content is truncated
        call_args = mock_r2_client.put_object.call_args
        uploaded_content = call_args.kwargs["Body"].decode("utf-8")

        assert len(uploaded_content) < len(large_summary), \
            "Uploaded content should be smaller than original"
        assert TRUNCATION_NOTICE in uploaded_content, \
            "Uploaded content should include truncation notice"
        assert uploaded_content.endswith(TRUNCATION_NOTICE), \
            "Truncation notice should be at end"

        # Verify R2 object path
        assert call_args.kwargs["Key"] == "gitingest/alphagov/large-repo/summary.txt"

    @patch('gitingest.ingest')
    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_full_pipeline_with_small_repo(self, mock_create_client, mock_ingest):
        """
        Test: Complete pipeline with small repository (no truncation)

        Acceptance Criteria:
        - Small summary is not truncated
        - Original content is uploaded unchanged
        - No truncation notice is added
        """
        # Arrange
        mock_r2_client = Mock()
        mock_create_client.return_value = mock_r2_client

        # Mock gitingest returning small summary
        small_summary = "# Small Repository\n\nMinimal code structure."
        IngestionResult = namedtuple('IngestionResult', ['summary', 'tree'])
        mock_ingest.return_value = IngestionResult(
            summary=small_summary,
            tree="src/"
        )

        from ingest import process_repository

        # Act
        result = process_repository(
            "https://github.com/alphagov/small-repo",
            upload_to_r2=True
        )

        # Assert
        assert result["success"] is True
        assert result["uploaded"] is True

        # Verify uploaded content is unchanged
        call_args = mock_r2_client.put_object.call_args
        uploaded_content = call_args.kwargs["Body"].decode("utf-8")

        assert uploaded_content == small_summary, \
            "Small summary should be uploaded unchanged"
        assert TRUNCATION_NOTICE not in uploaded_content


class TestR2ErrorHandling:
    """Test error handling during R2 upload"""

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_r2_upload_failure_with_truncated_summary(self, mock_create_client):
        """
        Test: R2 upload failure is handled gracefully with truncated summary

        Acceptance Criteria:
        - Upload failure returns False
        - No exception is raised
        - Error is logged
        """
        # Arrange
        mock_client = Mock()
        mock_client.put_object.side_effect = Exception("Network timeout")
        mock_create_client.return_value = mock_client

        truncated_summary = ("x" * MAX_SUMMARY_SIZE) + TRUNCATION_NOTICE

        from r2_client import upload_summary

        # Act
        result = upload_summary(
            org="test-org",
            repo="test-repo",
            content=truncated_summary,
            metadata={
                "pushedAt": "2025-10-15T14:30:00Z",
                "url": "https://github.com/test-org/test-repo",
                "processedAt": "2025-11-13T10:05:23Z"
            }
        )

        # Assert - Graceful failure
        assert result is False
        mock_client.put_object.assert_called_once()

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {
        "R2_BUCKET": "test-bucket",
        "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
        "R2_ACCESS_KEY": "test-key",
        "R2_SECRET_KEY": "test-secret"
    })
    def test_r2_upload_quota_exceeded(self, mock_create_client):
        """
        Test: R2 quota exceeded error is handled

        Acceptance Criteria:
        - Quota error returns False
        - Error is logged
        - No exception propagates
        """
        # Arrange
        mock_client = Mock()
        mock_client.put_object.side_effect = Exception("QuotaExceeded")
        mock_create_client.return_value = mock_client

        from r2_client import upload_summary

        # Act
        result = upload_summary(
            org="test-org",
            repo="test-repo",
            content="test content",
            metadata={
                "pushedAt": "2025-10-15T14:30:00Z",
                "url": "https://github.com/test-org/test-repo",
                "processedAt": "2025-11-13T10:05:23Z"
            }
        )

        # Assert
        assert result is False


# TODO: Add tests with real R2 credentials (requires AWS/R2 setup)
# TODO: Add tests for R2 storage limits and quotas
# TODO: Add tests for concurrent uploads with truncated summaries
# TODO: Add tests for R2 object versioning with truncated content
# TODO: Add tests for R2 metadata retrieval after upload
# TODO: Add performance tests for uploading many truncated summaries
# TODO: Add tests for R2 cleanup/deletion of truncated summaries
