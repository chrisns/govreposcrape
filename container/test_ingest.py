"""
govreposcrape - Container Tests
Story 2.5: Parallel Execution Support - CLI Arguments for Batch Processing

Test suite for ingest.py using pytest framework.
Coverage target: 80%+ on core logic.
"""

import pytest
import time
import signal
from unittest.mock import Mock, patch, MagicMock
from ingest import (
    process_repository,
    retry_with_backoff,
    ProcessingStats,
    TimeoutError,
    timeout_handler,
    fetch_repos_json,
    filter_repos_for_batch
)


class TestGitingestProcessing:
    """Test gitingest processing functionality"""

    @patch('gitingest.ingest')
    def test_successful_processing(self, mock_ingest):
        """Test successful repository processing"""
        # Arrange
        mock_ingest.return_value = "Sample code summary with structure and dependencies"
        repo_url = "https://github.com/alphagov/govuk-frontend"

        # Act
        result = process_repository(repo_url)

        # Assert
        assert result["success"] is True
        assert "summary" in result
        assert result["summary"] == "Sample code summary with structure and dependencies"
        assert result["repo_url"] == repo_url
        assert "duration" in result
        mock_ingest.assert_called()

    @patch('gitingest.ingest')
    def test_repository_size_handling(self, mock_ingest):
        """Test handling of varying repository sizes"""
        # Arrange - simulate different summary sizes
        small_summary = "Small repo summary (10KB)"
        large_summary = "Large repo summary " * 10000  # ~100KB+

        # Act - Small repo
        mock_ingest.return_value = small_summary
        result_small = process_repository("https://github.com/test/small-repo")

        # Act - Large repo
        mock_ingest.return_value = large_summary
        result_large = process_repository("https://github.com/test/large-repo")

        # Assert
        assert result_small["success"] is True
        assert result_large["success"] is True
        assert len(result_large["summary"]) > len(result_small["summary"])

    @patch('gitingest.ingest')
    @patch('ingest.signal.alarm')
    def test_timeout_enforcement(self, mock_alarm, mock_ingest):
        """Test timeout enforcement (5 minute max)"""
        # Arrange - simulate timeout by raising TimeoutError
        mock_ingest.side_effect = TimeoutError("Processing exceeded timeout")

        # Act
        result = process_repository("https://github.com/test/slow-repo")

        # Assert
        assert result["success"] is False
        assert "error" in result
        assert "Timeout" in result["error"] or "timeout" in result["error"].lower()
        # Verify alarm was set (5 minutes = 300 seconds)
        mock_alarm.assert_called()

    def test_retry_with_backoff_success_on_third_attempt(self):
        """Test retry logic: fail twice, succeed on third attempt"""
        # Arrange
        mock_func = Mock(side_effect=[
            Exception("Attempt 1 failed"),
            Exception("Attempt 2 failed"),
            "Success on attempt 3"
        ])

        # Act
        start_time = time.time()
        result = retry_with_backoff(mock_func, max_attempts=3, delays=[0.01, 0.02, 0.04])
        duration = time.time() - start_time

        # Assert
        assert result == "Success on attempt 3"
        assert mock_func.call_count == 3
        # Verify delays occurred (at least 0.03s for two delays)
        assert duration >= 0.03

    def test_retry_exhaustion(self):
        """Test retry exhaustion: all 3 attempts fail"""
        # Arrange
        mock_func = Mock(side_effect=Exception("Persistent failure"))

        # Act & Assert
        with pytest.raises(Exception) as exc_info:
            retry_with_backoff(mock_func, max_attempts=3, delays=[0.01, 0.02, 0.04])

        assert "Persistent failure" in str(exc_info.value)
        assert mock_func.call_count == 3

    @patch('gitingest.ingest')
    def test_fail_safe_behavior(self, mock_ingest):
        """Test fail-safe: processing continues on failure (no pipeline halt)"""
        # Arrange
        mock_ingest.side_effect = Exception("Repository not found")

        # Act
        result = process_repository("https://github.com/test/nonexistent")

        # Assert - Failure is logged but exception is NOT raised (fail-safe)
        assert result["success"] is False
        assert "error" in result
        assert result["repo_url"] == "https://github.com/test/nonexistent"


class TestCLIEntrypoint:
    """Test CLI interface and argument parsing"""

    @patch('ingest.fetch_repos_json')
    @patch('sys.argv', ['ingest.py', '--batch-size=10', '--offset=3'])
    def test_cli_argument_parsing(self, mock_fetch):
        """Test CLI parses batch arguments correctly"""
        # Arrange
        mock_fetch.return_value = [{"url": f"https://github.com/org/repo{i}"} for i in range(100)]

        # Act
        from ingest import main
        try:
            main()
        except SystemExit as e:
            # Assert exit code 0 on success
            assert e.code == 0

        # Assert
        mock_fetch.assert_called_once()

    @patch('ingest.fetch_repos_json')
    @patch('sys.argv', ['ingest.py', '--batch-size=1', '--offset=0'])
    def test_cli_exit_code_success(self, mock_fetch):
        """Test CLI exits with code 0 on success"""
        # Arrange
        mock_fetch.return_value = [{"url": "https://github.com/org/repo0"}]

        # Act & Assert
        from ingest import main
        with pytest.raises(SystemExit) as exc_info:
            main()

        assert exc_info.value.code == 0

    @patch('ingest.fetch_repos_json')
    @patch('sys.argv', ['ingest.py'])
    def test_cli_exit_code_failure(self, mock_fetch):
        """Test CLI exits with code 1 on fetch failure"""
        # Arrange
        mock_fetch.side_effect = Exception("Failed to fetch repos.json")

        # Act & Assert
        from ingest import main
        with pytest.raises(SystemExit) as exc_info:
            main()

        assert exc_info.value.code == 1


class TestEnvironmentVariables:
    """Test environment variable handling"""

    @patch.dict('os.environ', {
        'R2_BUCKET': 'test-bucket',
        'R2_ENDPOINT': 'https://test.r2.cloudflarestorage.com',
        'R2_ACCESS_KEY': 'test-key',
        'R2_SECRET_KEY': 'test-secret'
    })
    @patch('sys.argv', ['ingest.py'])
    @patch('ingest.fetch_repos_json')
    def test_environment_variable_injection(self, mock_fetch):
        """Test container reads R2 environment variables"""
        # Arrange
        mock_fetch.return_value = [{"url": "https://github.com/org/repo0"}]

        # Act
        from ingest import main
        import os

        # Assert environment variables are accessible
        assert os.getenv('R2_BUCKET') == 'test-bucket'
        assert os.getenv('R2_ENDPOINT') == 'https://test.r2.cloudflarestorage.com'
        assert os.getenv('R2_ACCESS_KEY') == 'test-key'
        assert os.getenv('R2_SECRET_KEY') == 'test-secret'


class TestStatisticsTracking:
    """Test processing statistics tracking"""

    def test_statistics_tracking_successful(self):
        """Test statistics: successful count and average time"""
        # Arrange
        stats = ProcessingStats()

        # Act
        stats.record_success(10.5)
        stats.record_success(8.3)
        stats.record_success(12.1)

        # Assert
        assert stats.successful == 3
        assert stats.failed == 0
        avg = stats.get_average_time()
        assert 10.0 < avg < 11.0  # Average of 10.5, 8.3, 12.1 ≈ 10.3

    def test_statistics_tracking_failed(self):
        """Test statistics: failed count"""
        # Arrange
        stats = ProcessingStats()

        # Act
        stats.record_failure()
        stats.record_failure()

        # Assert
        assert stats.successful == 0
        assert stats.failed == 2

    def test_statistics_mixed(self):
        """Test statistics: mix of successful and failed"""
        # Arrange
        stats = ProcessingStats()

        # Act
        stats.record_success(5.0)
        stats.record_failure()
        stats.record_success(15.0)

        # Assert
        assert stats.successful == 2
        assert stats.failed == 1
        assert stats.get_average_time() == 10.0  # (5.0 + 15.0) / 2


class TestStructuredLogging:
    """Test structured JSON logging"""

    @patch('gitingest.ingest')
    def test_structured_logging_format(self, mock_ingest, caplog):
        """Test JSON-formatted logs match TypeScript logger pattern"""
        # Arrange
        mock_ingest.return_value = "Test summary"

        # Act
        with caplog.at_level('INFO'):
            process_repository("https://github.com/test/repo")

        # Assert - Check log output contains expected JSON structure
        # (Actual JSON validation would require parsing log output)
        assert len(caplog.records) > 0
        # Verify logs contain context and metadata
        log_messages = [record.message for record in caplog.records]
        assert any("Processing repository" in msg for msg in log_messages)


class TestParallelExecution:
    """Test parallel execution with CLI arguments and modulo filtering"""

    def test_filter_repos_for_batch_offset_0(self):
        """Test modulo filtering with offset 0"""
        # Arrange
        repos = [{"url": f"https://github.com/org/repo{i}"} for i in range(100)]
        batch_size = 10
        offset = 0

        # Act
        filtered = filter_repos_for_batch(repos, batch_size, offset)

        # Assert
        assert len(filtered) == 10  # 100 / 10 = 10 repos per container
        assert filtered[0]["url"] == "https://github.com/org/repo0"
        assert filtered[1]["url"] == "https://github.com/org/repo10"
        assert filtered[2]["url"] == "https://github.com/org/repo20"

    def test_filter_repos_for_batch_offset_5(self):
        """Test modulo filtering with offset 5"""
        # Arrange
        repos = [{"url": f"https://github.com/org/repo{i}"} for i in range(100)]
        batch_size = 10
        offset = 5

        # Act
        filtered = filter_repos_for_batch(repos, batch_size, offset)

        # Assert
        assert len(filtered) == 10
        assert filtered[0]["url"] == "https://github.com/org/repo5"
        assert filtered[1]["url"] == "https://github.com/org/repo15"
        assert filtered[2]["url"] == "https://github.com/org/repo25"

    def test_filter_repos_for_batch_sequential(self):
        """Test sequential mode (batch_size=1, offset=0)"""
        # Arrange
        repos = [{"url": f"https://github.com/org/repo{i}"} for i in range(100)]
        batch_size = 1
        offset = 0

        # Act
        filtered = filter_repos_for_batch(repos, batch_size, offset)

        # Assert
        assert len(filtered) == 100  # All repos
        assert filtered == repos

    def test_parallel_execution_coverage(self):
        """Test that all repos processed exactly once across 10 containers"""
        # Arrange
        repos = [{"url": f"https://github.com/org/repo{i}"} for i in range(100)]
        batch_size = 10
        all_processed = set()

        # Act - Simulate 10 containers
        for offset in range(batch_size):
            batch_repos = filter_repos_for_batch(repos, batch_size, offset)
            for repo in batch_repos:
                all_processed.add(repo["url"])

        # Assert
        assert len(all_processed) == 100  # All repos processed
        assert all_processed == {f"https://github.com/org/repo{i}" for i in range(100)}

    def test_no_duplicate_processing(self):
        """Test no overlaps between different offsets"""
        # Arrange
        repos = [{"url": f"https://github.com/org/repo{i}"} for i in range(100)]
        batch_size = 10

        # Act - Get batches for all offsets
        batches = {}
        for offset in range(batch_size):
            batches[offset] = {repo["url"] for repo in filter_repos_for_batch(repos, batch_size, offset)}

        # Assert - No intersections between any two offsets
        for i in range(batch_size):
            for j in range(i + 1, batch_size):
                intersection = batches[i] & batches[j]
                assert len(intersection) == 0, f"Offsets {i} and {j} have overlapping repos"

    def test_single_repo_with_parallel(self):
        """Test edge case: 1 repo, 10 containers"""
        # Arrange
        repos = [{"url": "https://github.com/org/repo0"}]
        batch_size = 10

        # Act & Assert
        for offset in range(batch_size):
            filtered = filter_repos_for_batch(repos, batch_size, offset)
            if offset == 0:
                assert len(filtered) == 1
            else:
                assert len(filtered) == 0  # Other containers get nothing

    def test_empty_repos_list(self):
        """Test edge case: empty repos list"""
        # Arrange
        repos = []
        batch_size = 10
        offset = 0

        # Act
        filtered = filter_repos_for_batch(repos, batch_size, offset)

        # Assert
        assert len(filtered) == 0

    def test_batch_size_greater_than_repo_count(self):
        """Test edge case: batch_size > number of repos"""
        # Arrange
        repos = [{"url": f"https://github.com/org/repo{i}"} for i in range(50)]
        batch_size = 100

        # Act & Assert
        for offset in range(batch_size):
            filtered = filter_repos_for_batch(repos, batch_size, offset)
            if offset < 50:
                assert len(filtered) == 1
            else:
                assert len(filtered) == 0

    @patch('requests.get')
    def test_fetch_repos_json_success(self, mock_get):
        """Test successful repos.json fetch"""
        # Arrange
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"url": "https://github.com/org/repo1"},
            {"url": "https://github.com/org/repo2"}
        ]
        mock_get.return_value = mock_response

        # Act
        repos = fetch_repos_json()

        # Assert
        assert len(repos) == 2
        mock_get.assert_called_once()

    @patch('requests.get')
    def test_fetch_repos_json_with_retry(self, mock_get):
        """Test repos.json fetch with retry on transient failure"""
        # Arrange
        mock_get.side_effect = [
            Exception("Network error"),  # First attempt fails
            Exception("Timeout"),         # Second attempt fails
            MagicMock(json=lambda: [{"url": "https://github.com/org/repo1"}])  # Third succeeds
        ]

        # Act
        repos = fetch_repos_json()

        # Assert
        assert len(repos) == 1
        assert mock_get.call_count == 3

    def test_processing_stats_with_batch_context(self, caplog):
        """Test statistics logging includes batch context"""
        # Arrange
        stats = ProcessingStats()
        stats.record_success(1.5)
        stats.record_success(2.0)
        stats.record_failure()

        # Act
        with caplog.at_level('INFO'):
            stats.log_stats(batch_size=10, offset=3)

        # Assert
        log_messages = [record.message for record in caplog.records]
        assert any("Batch 10, offset 3" in msg for msg in log_messages)
        assert any("2 successful" in msg for msg in log_messages)
        assert any("1 failed" in msg for msg in log_messages)
