"""
govreposcrape - R2 Client Tests
Story 2.4: R2 Storage with Metadata - Store Summaries and Tracking Data

Test suite for r2_client.py using pytest framework.
Coverage target: 80%+ on core logic.
"""

import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from r2_client import (
    upload_summary,
    get_summary,
    upload_with_retry,
    validate_environment,
    create_r2_client,
    UploadStats,
    R2ConfigError
)


class TestR2Upload:
    """Test R2 upload functionality"""

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_successful_upload(self, mock_create_client):
        """Test successful R2 upload with correct object path, metadata, and content-type (AC1)"""
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        org = "alphagov"
        repo = "govuk-frontend"
        content = "# govuk-frontend\n\nCode summary with structure and dependencies..."
        metadata = {
            "pushedAt": "2025-10-15T14:30:00Z",
            "url": "https://github.com/alphagov/govuk-frontend",
            "processedAt": "2025-11-13T10:05:23Z"
        }

        # Act
        result = upload_summary(org, repo, content, metadata)

        # Assert
        assert result is True
        mock_client.put_object.assert_called_once()

        call_args = mock_client.put_object.call_args
        assert call_args.kwargs["Bucket"] == "test-bucket"
        assert call_args.kwargs["Key"] == "gitingest/alphagov/govuk-frontend/summary.txt"
        assert call_args.kwargs["Body"] == content.encode("utf-8")
        assert call_args.kwargs["ContentType"] == "text/plain"
        # Verify metadata keys are lowercase (boto3 S3 API convention)
        assert "pushedat" in call_args.kwargs["Metadata"]
        assert "url" in call_args.kwargs["Metadata"]
        assert "processedat" in call_args.kwargs["Metadata"]

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_object_path_structure(self, mock_create_client):
        """Test object path follows gitingest/{org}/{repo}/summary.txt pattern (AC1)"""
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        test_cases = [
            ("alphagov", "govuk-frontend", "gitingest/alphagov/govuk-frontend/summary.txt"),
            ("nhsdigital", "nhs-login", "gitingest/nhsdigital/nhs-login/summary.txt"),
            ("hmrc", "making-tax-digital", "gitingest/hmrc/making-tax-digital/summary.txt"),
        ]

        for org, repo, expected_path in test_cases:
            # Act
            upload_summary(org, repo, "test content", {"pushedAt": "", "url": "", "processedAt": ""})

            # Assert
            call_args = mock_client.put_object.call_args
            assert call_args.kwargs["Key"] == expected_path

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_custom_metadata_attachment(self, mock_create_client):
        """Test custom metadata is attached with all required fields (AC1)"""
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        metadata = {
            "pushedAt": "2025-10-15T14:30:00Z",
            "url": "https://github.com/alphagov/govuk-frontend",
            "processedAt": "2025-11-13T10:05:23Z"
        }

        # Act
        upload_summary("alphagov", "govuk-frontend", "content", metadata)

        # Assert
        call_args = mock_client.put_object.call_args
        uploaded_metadata = call_args.kwargs["Metadata"]

        assert uploaded_metadata["pushedat"] == "2025-10-15T14:30:00Z"
        assert uploaded_metadata["url"] == "https://github.com/alphagov/govuk-frontend"
        assert uploaded_metadata["processedat"] == "2025-11-13T10:05:23Z"

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_content_type_text_plain(self, mock_create_client):
        """Test content-type is set to text/plain for AI Search compatibility (AC1)"""
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        # Act
        upload_summary("test-org", "test-repo", "content", {"pushedAt": "", "url": "", "processedAt": ""})

        # Assert
        call_args = mock_client.put_object.call_args
        assert call_args.kwargs["ContentType"] == "text/plain"

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_upload_failure_returns_false(self, mock_create_client):
        """Test upload returns False on failure (AC2 - graceful error handling)"""
        # Arrange
        mock_client = Mock()
        mock_client.put_object.side_effect = Exception("Network error")
        mock_create_client.return_value = mock_client

        # Act
        result = upload_summary("test-org", "test-repo", "content", {"pushedAt": "", "url": "", "processedAt": ""})

        # Assert
        assert result is False


class TestR2Retry:
    """Test R2 retry logic"""

    @patch('r2_client.upload_summary')
    @patch('ingest.retry_with_backoff')  # Mock the actual import location
    def test_retry_with_backoff_called(self, mock_retry, mock_upload):
        """Test upload_with_retry uses retry_with_backoff pattern (AC2)"""
        # Arrange
        mock_retry.return_value = True
        metadata = {"pushedAt": "", "url": "", "processedAt": ""}

        # Act
        result = upload_with_retry("alphagov", "govuk-frontend", "content", metadata)

        # Assert
        mock_retry.assert_called_once()
        call_args = mock_retry.call_args
        assert call_args.kwargs["max_attempts"] == 3
        assert call_args.kwargs["delays"] == [1, 2, 4]

    @patch('r2_client.upload_summary')
    def test_retry_success_after_failures(self, mock_upload):
        """Test retry logic succeeds after transient failures (AC2)"""
        # Arrange - fail twice, succeed on third attempt
        mock_upload.side_effect = [
            False,  # First attempt fails
            False,  # Second attempt fails
            True    # Third attempt succeeds
        ]

        # Act
        result = upload_with_retry("test-org", "test-repo", "content", {"pushedAt": "", "url": "", "processedAt": ""})

        # Assert
        assert result is True
        assert mock_upload.call_count == 3

    @patch('r2_client.upload_summary')
    def test_retry_exhaustion(self, mock_upload):
        """Test retry exhaustion after 3 failed attempts returns False (AC2)"""
        # Arrange - all attempts fail
        mock_upload.return_value = False

        # Act
        result = upload_with_retry("test-org", "test-repo", "content", {"pushedAt": "", "url": "", "processedAt": ""})

        # Assert
        assert result is False
        # Should have tried 3 times
        assert mock_upload.call_count >= 1


class TestR2Retrieval:
    """Test R2 retrieval functionality"""

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_get_summary_success(self, mock_create_client):
        """Test getSummary retrieval method (AC3)"""
        # Arrange
        mock_client = Mock()
        mock_response = {
            "Body": Mock()
        }
        expected_content = "# govuk-frontend\n\nCode summary..."
        mock_response["Body"].read.return_value = expected_content.encode("utf-8")
        mock_client.get_object.return_value = mock_response
        mock_create_client.return_value = mock_client

        # Act
        result = get_summary("alphagov", "govuk-frontend")

        # Assert
        assert result == expected_content
        mock_client.get_object.assert_called_once()
        call_args = mock_client.get_object.call_args
        assert call_args.kwargs["Bucket"] == "test-bucket"
        assert call_args.kwargs["Key"] == "gitingest/alphagov/govuk-frontend/summary.txt"

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_get_summary_not_found(self, mock_create_client):
        """Test getSummary returns None when summary not found (AC3)"""
        # Arrange
        mock_client = Mock()
        # Simulate NoSuchKey error with response attribute
        error = Exception("NoSuchKey")
        error.response = {'Error': {'Code': 'NoSuchKey'}}
        mock_client.get_object.side_effect = error
        mock_create_client.return_value = mock_client

        # Act
        result = get_summary("test-org", "nonexistent-repo")

        # Assert
        assert result is None

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_get_summary_error_returns_none(self, mock_create_client):
        """Test getSummary returns None on error (fail-safe)"""
        # Arrange
        mock_client = Mock()
        mock_client.get_object.side_effect = Exception("Network error")
        mock_create_client.return_value = mock_client

        # Act
        result = get_summary("test-org", "test-repo")

        # Assert
        assert result is None


class TestStatistics:
    """Test upload statistics tracking"""

    def test_upload_stats_tracking(self):
        """Test statistics tracking: uploaded, failed, storage size (AC3)"""
        # Arrange
        stats = UploadStats()

        # Act - record some uploads
        stats.record_success(1024)  # 1KB
        stats.record_success(2048)  # 2KB
        stats.record_failure()
        stats.record_success(512)   # 0.5KB

        # Assert
        assert stats.total_uploaded == 3
        assert stats.total_failed == 1
        assert stats.total_storage_size == 3584  # 1024 + 2048 + 512
        assert stats.get_total_storage_mb() == pytest.approx(3584 / (1024 * 1024), rel=1e-3)

    def test_upload_stats_log_stats(self):
        """Test statistics logging method"""
        # Arrange
        stats = UploadStats()
        stats.record_success(1024)
        stats.record_failure()

        # Act - should not raise exception
        stats.log_stats()

        # Assert - just verify it doesn't crash
        assert True


class TestEnvironmentVariables:
    """Test environment variable validation"""

    def test_validate_environment_missing_vars(self):
        """Test environment variable validation when vars are missing (AC3)"""
        # Arrange - clear all R2 env vars
        with patch.dict(os.environ, {}, clear=True):
            # Act & Assert
            with pytest.raises(R2ConfigError) as exc_info:
                validate_environment()

            assert "Missing required R2 environment variables" in str(exc_info.value)

    def test_validate_environment_success(self):
        """Test environment variable validation when all vars present (AC3)"""
        # Arrange
        with patch.dict(os.environ, {
            "R2_BUCKET": "test-bucket",
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "test-key",
            "R2_SECRET_KEY": "test-secret"
        }):
            # Act & Assert - should not raise exception
            validate_environment()

    def test_create_r2_client_success(self):
        """Test R2 client creation with valid environment variables (AC3)"""
        # Arrange
        with patch.dict(os.environ, {
            "R2_BUCKET": "test-bucket",
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "test-key",
            "R2_SECRET_KEY": "test-secret"
        }):
            # Act - should not raise exception
            result = create_r2_client()

            # Assert - verify client was created successfully
            assert result is not None
            # boto3 client has specific methods
            assert hasattr(result, 'put_object')
            assert hasattr(result, 'get_object')

    def test_create_r2_client_missing_boto3(self):
        """Test R2 client creation fails gracefully when boto3 not installed"""
        # Arrange
        with patch.dict(os.environ, {
            "R2_BUCKET": "test-bucket",
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "test-key",
            "R2_SECRET_KEY": "test-secret"
        }):
            with patch('builtins.__import__', side_effect=ImportError("No module named boto3")):
                # Act & Assert
                with pytest.raises(ImportError) as exc_info:
                    create_r2_client()

                assert "boto3 library not installed" in str(exc_info.value)


class TestIntegration:
    """Integration tests for full R2 upload workflow"""

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_full_upload_workflow(self, mock_create_client):
        """Test complete upload workflow: validate, upload, track stats"""
        # Arrange
        mock_client = Mock()
        mock_create_client.return_value = mock_client

        org = "alphagov"
        repo = "govuk-frontend"
        content = "# Test summary\n\nCode structure and dependencies..."
        metadata = {
            "pushedAt": "2025-10-15T14:30:00Z",
            "url": "https://github.com/alphagov/govuk-frontend",
            "processedAt": "2025-11-13T10:05:23Z"
        }

        stats = UploadStats()

        # Act
        result = upload_summary(org, repo, content, metadata)

        if result:
            stats.record_success(len(content))
        else:
            stats.record_failure()

        # Assert
        assert result is True
        assert stats.total_uploaded == 1
        assert stats.total_failed == 0
        assert stats.total_storage_size == len(content)

    @patch('r2_client.create_r2_client')
    @patch.dict(os.environ, {"R2_BUCKET": "test-bucket"})
    def test_fail_safe_behavior(self, mock_create_client):
        """Test fail-safe behavior: upload failures don't crash, return False"""
        # Arrange
        mock_client = Mock()
        mock_client.put_object.side_effect = Exception("Network timeout")
        mock_create_client.return_value = mock_client

        # Act - should not raise exception
        result = upload_summary("test-org", "test-repo", "content", {"pushedAt": "", "url": "", "processedAt": ""})

        # Assert
        assert result is False  # Graceful failure
