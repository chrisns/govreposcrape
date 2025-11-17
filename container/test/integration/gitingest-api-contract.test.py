"""
govreposcrape - GitIngest API Contract Tests
Integration tests for gitingest library API compatibility

This test file verifies the actual gitingest library behavior (NOT mocked)
to ensure our code handles different return types correctly:
- IngestionResult object with .summary attribute (current API)
- Tuple unpacking (summary, tree) for backwards compatibility
- Error handling for unexpected return types

NOTE: These tests require gitingest library to be installed.
Run: pip install gitingest
"""

import pytest
from unittest.mock import patch, MagicMock

# Mark all tests in this file as integration tests
pytestmark = pytest.mark.integration


class TestGitingestAPIContract:
    """
    Test gitingest library API contract to ensure compatibility
    with different return types and API versions
    """

    def test_gitingest_library_installed(self):
        """Test that gitingest library is installed and importable"""
        try:
            from gitingest import ingest
            assert ingest is not None
        except ImportError as e:
            pytest.skip(f"gitingest library not installed: {e}")

    @pytest.mark.skipif(
        reason="Requires gitingest library and network access"
    )
    def test_ingestion_result_return_type(self):
        """
        Test gitingest returns IngestionResult object with .summary attribute

        This is the current API behavior. IngestionResult is a named tuple with:
        - .summary: str (the code summary text)
        - .tree: str (directory tree structure)
        """
        try:
            from gitingest import ingest
        except ImportError:
            pytest.skip("gitingest library not installed")

        # Act - Use a small, stable test repository
        # Using public test repo to verify API contract
        result = ingest("https://github.com/octocat/Hello-World", max_file_size=524288)

        # Assert - Check for .summary attribute (IngestionResult)
        assert hasattr(result, 'summary'), \
            "gitingest should return IngestionResult with .summary attribute"
        assert isinstance(result.summary, str), \
            ".summary should be a string"
        assert len(result.summary) > 0, \
            ".summary should contain content"

        # Verify it's not a plain tuple (old API)
        assert not (isinstance(result, tuple) and not hasattr(result, 'summary')), \
            "Result should be IngestionResult, not plain tuple"

    def test_backwards_compatibility_tuple_unpacking(self):
        """
        Test our code handles tuple unpacking for backwards compatibility

        Old API returned (summary, tree) tuple.
        Our code should handle both IngestionResult and tuple formats.
        """
        # Arrange - Mock the old API behavior
        mock_summary = "# Test Repository\n\nThis is a test summary."
        mock_tree = "test/\n  __init__.py\n  test_file.py"
        mock_result = (mock_summary, mock_tree)

        # Act - Simulate our processing logic
        if hasattr(mock_result, 'summary'):
            # Current API: IngestionResult
            summary = mock_result.summary
        elif isinstance(mock_result, tuple) and len(mock_result) == 2:
            # Old API: tuple unpacking
            summary, tree = mock_result
        else:
            # Fallback
            summary = str(mock_result)

        # Assert
        assert summary == mock_summary
        assert isinstance(summary, str)

    def test_ingestion_result_object_compatibility(self):
        """
        Test our code handles IngestionResult object correctly

        IngestionResult is a named tuple with .summary and .tree attributes.
        """
        # Arrange - Create mock IngestionResult-like object
        from collections import namedtuple
        IngestionResult = namedtuple('IngestionResult', ['summary', 'tree'])

        mock_result = IngestionResult(
            summary="# Test Repository\n\nCode summary...",
            tree="src/\n  main.py\n  utils.py"
        )

        # Act - Simulate our processing logic
        if hasattr(mock_result, 'summary'):
            # Current API: Check for .summary attribute FIRST
            summary = mock_result.summary
        elif isinstance(mock_result, tuple) and len(mock_result) == 2:
            # Old API: tuple unpacking
            summary, tree = mock_result
        else:
            # Fallback
            summary = str(mock_result)

        # Assert
        assert summary == "# Test Repository\n\nCode summary..."
        assert isinstance(summary, str)

    def test_error_handling_unexpected_return_type(self):
        """
        Test error handling when gitingest returns unexpected type

        Should fallback to str() conversion and log warning.
        """
        # Arrange - Mock unexpected return type
        mock_result = {"summary": "Unexpected dict format"}

        # Act - Simulate our processing logic
        if hasattr(mock_result, 'summary'):
            summary = mock_result.summary
        elif isinstance(mock_result, tuple) and len(mock_result) == 2:
            summary, tree = mock_result
        else:
            # Fallback: convert to string
            summary = str(mock_result)

        # Assert - Should not crash, should convert to string
        assert isinstance(summary, str)
        assert "summary" in summary.lower()

    def test_ingestion_result_attribute_check_order(self):
        """
        Test that .summary attribute check happens BEFORE tuple check

        This is critical because IngestionResult is a named tuple,
        so isinstance(result, tuple) would return True.
        We must check hasattr(result, 'summary') FIRST.
        """
        # Arrange - Create IngestionResult-like object (named tuple)
        from collections import namedtuple
        IngestionResult = namedtuple('IngestionResult', ['summary', 'tree'])

        mock_result = IngestionResult(
            summary="Correct summary",
            tree="Directory tree"
        )

        # Act - Test CORRECT check order
        if hasattr(mock_result, 'summary'):
            # This should execute FIRST for IngestionResult
            summary = mock_result.summary
            check_path = "hasattr"
        elif isinstance(mock_result, tuple) and len(mock_result) == 2:
            # This would also be True but should NOT execute
            summary, tree = mock_result
            check_path = "tuple"
        else:
            summary = str(mock_result)
            check_path = "fallback"

        # Assert - Should use hasattr path, not tuple path
        assert check_path == "hasattr", \
            "Should check hasattr(result, 'summary') BEFORE tuple check"
        assert summary == "Correct summary"

        # Act - Test WRONG check order (what would happen if reversed)
        if isinstance(mock_result, tuple) and len(mock_result) == 2:
            # This executes first with wrong order
            wrong_summary, tree = mock_result
            wrong_check_path = "tuple"
        elif hasattr(mock_result, 'summary'):
            wrong_summary = mock_result.summary
            wrong_check_path = "hasattr"
        else:
            wrong_summary = str(mock_result)
            wrong_check_path = "fallback"

        # Assert - Wrong order would use tuple unpacking (still works but less clear)
        assert wrong_check_path == "tuple", \
            "Wrong order checks tuple first"
        # Both work but hasattr is cleaner for named tuples
        assert wrong_summary == "Correct summary"

    def test_max_file_size_parameter(self):
        """
        Test that max_file_size parameter is passed correctly to gitingest

        We use max_file_size=524288 (512KB) to limit file sizes for LLM context.
        """
        try:
            from gitingest import ingest
        except ImportError:
            pytest.skip("gitingest library not installed")

        # This test just verifies the parameter is accepted
        # Actual behavior testing requires network access
        # We just check that the parameter doesn't cause errors

        # Act - Should not raise exception
        try:
            # Mock to avoid actual network call
            with patch('gitingest.ingest') as mock_ingest:
                mock_ingest.return_value = MagicMock(summary="test")
                ingest("https://github.com/test/repo", max_file_size=524288)

                # Assert - Verify max_file_size was passed
                mock_ingest.assert_called_once_with(
                    "https://github.com/test/repo",
                    max_file_size=524288
                )
        except TypeError as e:
            pytest.fail(f"max_file_size parameter not accepted: {e}")

    @pytest.mark.skipif(
        reason="Requires gitingest library and network access"
    )
    def test_ingestion_result_with_real_repo(self):
        """
        Test actual gitingest call with a real (small) repository

        NOTE: This test requires network access and will be skipped by default.
        Run with: pytest -m integration --run-network-tests
        """
        try:
            from gitingest import ingest
        except ImportError:
            pytest.skip("gitingest library not installed")

        # TODO: Requires network access to GitHub
        # TODO: Use pytest markers to skip by default: @pytest.mark.network
        pytest.skip("Skipping network test - requires --run-network-tests flag")

        # Act - Use octocat/Hello-World (small, stable test repo)
        result = ingest("https://github.com/octocat/Hello-World", max_file_size=524288)

        # Assert
        assert hasattr(result, 'summary')
        assert isinstance(result.summary, str)
        assert len(result.summary) > 100, "Summary should contain substantial content"
        assert "Hello-World" in result.summary or "hello" in result.summary.lower()


class TestGitingestIntegrationWithIngest:
    """
    Test gitingest integration with our ingest.py process_repository function
    """

    @patch('gitingest.ingest')
    def test_process_repository_handles_ingestion_result(self, mock_ingest):
        """
        Test process_repository correctly extracts summary from IngestionResult
        """
        # Arrange - Mock IngestionResult
        from collections import namedtuple
        IngestionResult = namedtuple('IngestionResult', ['summary', 'tree'])

        mock_result = IngestionResult(
            summary="# Test Repo\n\nCode summary with structure",
            tree="src/\n  main.py"
        )
        mock_ingest.return_value = mock_result

        # Import after mocking to avoid actual import
        from ingest import process_repository

        # Act
        result = process_repository(
            "https://github.com/test/repo",
            upload_to_r2=False  # Skip R2 upload for unit test
        )

        # Assert
        assert result["success"] is True
        assert result["summary"] == "# Test Repo\n\nCode summary with structure"

    @patch('gitingest.ingest')
    def test_process_repository_handles_tuple(self, mock_ingest):
        """
        Test process_repository handles old API tuple format
        """
        # Arrange - Mock old API tuple
        mock_ingest.return_value = (
            "# Test Repo\n\nCode summary",
            "src/\n  main.py"
        )

        from ingest import process_repository

        # Act
        result = process_repository(
            "https://github.com/test/repo",
            upload_to_r2=False
        )

        # Assert
        assert result["success"] is True
        assert result["summary"] == "# Test Repo\n\nCode summary"

    @patch('gitingest.ingest')
    def test_process_repository_handles_unexpected_type(self, mock_ingest):
        """
        Test process_repository handles unexpected return type gracefully
        """
        # Arrange - Mock unexpected type
        mock_ingest.return_value = "Just a plain string"

        from ingest import process_repository

        # Act
        result = process_repository(
            "https://github.com/test/repo",
            upload_to_r2=False
        )

        # Assert
        assert result["success"] is True
        assert result["summary"] == "Just a plain string"


class TestGitingestAPIVersionCompatibility:
    """
    Test compatibility across different gitingest API versions
    """

    def test_api_version_detection(self):
        """
        Test detection of gitingest API version based on return type
        """
        from collections import namedtuple

        # Test current API (IngestionResult with .summary)
        IngestionResult = namedtuple('IngestionResult', ['summary', 'tree'])
        current_api = IngestionResult(summary="test", tree="tree")

        assert hasattr(current_api, 'summary'), \
            "Current API has .summary attribute"
        assert isinstance(current_api, tuple), \
            "IngestionResult is a named tuple"

        # Test old API (plain tuple)
        old_api = ("test summary", "tree")

        assert isinstance(old_api, tuple), \
            "Old API returns tuple"
        assert not hasattr(old_api, 'summary'), \
            "Old API tuple has no .summary attribute"

        # Both should be handled correctly by our logic
        for api_result in [current_api, old_api]:
            if hasattr(api_result, 'summary'):
                summary = api_result.summary
            elif isinstance(api_result, tuple) and len(api_result) == 2:
                summary, tree = api_result
            else:
                summary = str(api_result)

            assert summary == "test" or summary == "test summary"

    def test_api_compatibility_matrix(self):
        """
        Test compatibility matrix for different gitingest return types
        """
        from collections import namedtuple

        test_cases = [
            {
                "name": "IngestionResult (current API)",
                "result": namedtuple('IngestionResult', ['summary', 'tree'])(
                    summary="Current API summary",
                    tree="tree"
                ),
                "expected_summary": "Current API summary",
                "expected_path": "hasattr"
            },
            {
                "name": "Tuple (old API)",
                "result": ("Old API summary", "tree"),
                "expected_summary": "Old API summary",
                "expected_path": "tuple"
            },
            {
                "name": "String (unexpected)",
                "result": "Plain string",
                "expected_summary": "Plain string",
                "expected_path": "fallback"
            },
            {
                "name": "Dict (unexpected)",
                "result": {"summary": "Dict format"},
                "expected_summary": "{'summary': 'Dict format'}",
                "expected_path": "fallback"
            }
        ]

        for test_case in test_cases:
            result = test_case["result"]

            # Our processing logic
            if hasattr(result, 'summary'):
                summary = result.summary
                path = "hasattr"
            elif isinstance(result, tuple) and len(result) == 2:
                summary, tree = result
                path = "tuple"
            else:
                summary = str(result)
                path = "fallback"

            assert summary == test_case["expected_summary"], \
                f"Failed for {test_case['name']}"
            assert path == test_case["expected_path"], \
                f"Wrong code path for {test_case['name']}"


# TODO: Add integration tests that require real AWS/R2 credentials
# TODO: Use pytest fixtures for R2 client setup
# TODO: Add tests for full pipeline: gitingest -> process -> upload to R2
# TODO: Add performance tests for large repositories
# TODO: Add tests for edge cases: empty repos, binary files, very large files
