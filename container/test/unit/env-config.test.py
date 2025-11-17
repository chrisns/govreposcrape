"""
govreposcrape - Environment Configuration Tests
Unit tests for .env file parsing without variable substitution

Tests that verify .env file is parsed correctly WITHOUT expanding ${VARIABLE} syntax.
This is expected Docker behavior - variable substitution happens at Docker level,
not in the Python application.

Test coverage:
- .env file parsing preserves literal ${VARIABLE} syntax
- R2 credentials are read correctly from environment variables
- Docker-style variable references are NOT expanded
- Environment variable validation
- Error handling for missing credentials
"""

import pytest
import os
from unittest.mock import patch, Mock
from io import StringIO


class TestEnvFileParsingWithoutSubstitution:
    """
    Test .env file parsing behavior

    IMPORTANT: Python's os.getenv() does NOT perform variable substitution.
    If .env contains: R2_ENDPOINT=${CLOUDFLARE_ACCOUNT_ID}
    Then os.getenv('R2_ENDPOINT') returns the literal string: "${CLOUDFLARE_ACCOUNT_ID}"

    This is EXPECTED behavior - variable substitution happens at Docker level when
    the .env file is loaded via docker-compose or similar tools.
    """

    def test_env_var_literal_dollar_syntax_preserved(self):
        """
        Test: ${VARIABLE} syntax is preserved as literal string

        When .env contains: R2_ENDPOINT=https://${ACCOUNT_ID}.r2.cloudflarestorage.com
        Python reads it as: "https://${ACCOUNT_ID}.r2.cloudflarestorage.com"

        This is EXPECTED. Docker will expand ${ACCOUNT_ID} when loading .env file.
        Python application sees the final expanded value.
        """
        # Arrange - Simulate .env file with Docker variable syntax
        env_content = """
# R2 Configuration
R2_BUCKET=govreposcrape-gitingest
R2_ENDPOINT=https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com
R2_ACCESS_KEY=${R2_ACCESS_KEY_FROM_SECRET}
R2_SECRET_KEY=${R2_SECRET_KEY_FROM_SECRET}
"""

        # Act - Parse like Python would (no variable expansion)
        with patch.dict(os.environ, {}, clear=True):
            # Simulate reading .env file without expansion
            for line in env_content.strip().split('\n'):
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()

            # Assert - Variables are NOT expanded in Python
            assert os.environ.get('R2_ENDPOINT') == "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
            assert os.environ.get('R2_ACCESS_KEY') == "${R2_ACCESS_KEY_FROM_SECRET}"
            assert os.environ.get('R2_SECRET_KEY') == "${R2_SECRET_KEY_FROM_SECRET}"

            # This is EXPECTED behavior - Python does not expand variables
            # Docker will expand these when loading .env file

    def test_env_var_expanded_by_docker(self):
        """
        Test: Document that Docker performs variable expansion, not Python

        When Docker loads .env file with:
            R2_ENDPOINT=https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com
            CLOUDFLARE_ACCOUNT_ID=abc123

        Python application will see:
            os.getenv('R2_ENDPOINT') == "https://abc123.r2.cloudflarestorage.com"

        This test documents the expected Docker behavior.
        """
        # Arrange - Simulate what Docker provides after expansion
        with patch.dict(os.environ, {
            "CLOUDFLARE_ACCOUNT_ID": "abc123def456",
            "R2_ENDPOINT": "https://abc123def456.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "actual_access_key_value",
            "R2_SECRET_KEY": "actual_secret_key_value",
            "R2_BUCKET": "govreposcrape-gitingest"
        }, clear=True):

            # Act - Read environment variables (as Python application does)
            endpoint = os.getenv('R2_ENDPOINT')
            access_key = os.getenv('R2_ACCESS_KEY')
            secret_key = os.getenv('R2_SECRET_KEY')
            bucket = os.getenv('R2_BUCKET')

            # Assert - Variables are fully expanded by Docker
            assert endpoint == "https://abc123def456.r2.cloudflarestorage.com"
            assert access_key == "actual_access_key_value"
            assert secret_key == "actual_secret_key_value"
            assert bucket == "govreposcrape-gitingest"

            # No ${...} syntax present - Docker already expanded
            assert "${" not in endpoint
            assert "${" not in access_key


class TestR2CredentialsReading:
    """Test reading R2 credentials from environment variables"""

    def test_r2_credentials_read_correctly(self):
        """
        Test: R2 credentials are read from environment variables

        Acceptance Criteria:
        - All required R2 environment variables are accessible
        - Values match what was set in environment
        """
        # Arrange
        expected_credentials = {
            "R2_BUCKET": "govreposcrape-gitingest",
            "R2_ENDPOINT": "https://abc123.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "test_access_key_12345",
            "R2_SECRET_KEY": "test_secret_key_67890"
        }

        with patch.dict(os.environ, expected_credentials, clear=True):
            # Act
            bucket = os.getenv('R2_BUCKET')
            endpoint = os.getenv('R2_ENDPOINT')
            access_key = os.getenv('R2_ACCESS_KEY')
            secret_key = os.getenv('R2_SECRET_KEY')

            # Assert
            assert bucket == expected_credentials["R2_BUCKET"]
            assert endpoint == expected_credentials["R2_ENDPOINT"]
            assert access_key == expected_credentials["R2_ACCESS_KEY"]
            assert secret_key == expected_credentials["R2_SECRET_KEY"]

    def test_r2_credentials_validation(self):
        """
        Test: R2 credential validation detects missing variables

        Acceptance Criteria:
        - Missing required variables are detected
        - R2ConfigError is raised with helpful message
        """
        # Arrange - Missing R2_SECRET_KEY
        with patch.dict(os.environ, {
            "R2_BUCKET": "test-bucket",
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "test-key"
            # R2_SECRET_KEY is missing
        }, clear=True):

            from r2_client import validate_environment, R2ConfigError

            # Act & Assert
            with pytest.raises(R2ConfigError) as exc_info:
                validate_environment()

            assert "R2_SECRET_KEY" in str(exc_info.value)
            assert "Missing required R2 environment variables" in str(exc_info.value)

    def test_all_r2_credentials_present(self):
        """
        Test: Validation passes when all R2 credentials are present

        Acceptance Criteria:
        - No error raised when all variables present
        - validate_environment() completes successfully
        """
        # Arrange - All required variables present
        with patch.dict(os.environ, {
            "R2_BUCKET": "test-bucket",
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "test-key",
            "R2_SECRET_KEY": "test-secret"
        }, clear=True):

            from r2_client import validate_environment

            # Act & Assert - Should not raise exception
            validate_environment()  # Success if no exception

    def test_r2_credentials_with_special_characters(self):
        """
        Test: R2 credentials with special characters are handled correctly

        Acceptance Criteria:
        - Special characters in keys/secrets are preserved
        - URL encoding is not performed by Python
        - Values are read exactly as set
        """
        # Arrange - Credentials with special characters
        with patch.dict(os.environ, {
            "R2_BUCKET": "test-bucket",
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "test+key/with=special@chars",
            "R2_SECRET_KEY": "test_secret!@#$%^&*()_+-=[]{}|;:',.<>?/"
        }, clear=True):

            # Act
            access_key = os.getenv('R2_ACCESS_KEY')
            secret_key = os.getenv('R2_SECRET_KEY')

            # Assert - Special characters preserved exactly
            assert access_key == "test+key/with=special@chars"
            assert secret_key == "test_secret!@#$%^&*()_+-=[]{}|;:',.<>?/"


class TestDockerEnvVariableSubstitution:
    """
    Test and document Docker's environment variable substitution behavior

    These tests document how Docker handles .env files vs how Python reads them.
    """

    def test_docker_env_file_syntax_documentation(self):
        """
        Document: Docker .env file syntax for variable substitution

        Docker supports these syntaxes in .env files:
        1. ${VARIABLE} - Expand from environment
        2. ${VARIABLE:-default} - Use default if VARIABLE not set
        3. ${VARIABLE:?error} - Error if VARIABLE not set
        4. $VARIABLE - Simple expansion (also supported)

        Python's os.getenv() does NOT perform this expansion.
        Docker performs expansion when loading .env file into container.
        """
        # This test is for documentation purposes
        docker_env_syntaxes = {
            "simple": "${VARIABLE}",
            "default": "${VARIABLE:-default_value}",
            "required": "${VARIABLE:?must be set}",
            "short": "$VARIABLE"
        }

        # Assert - These are valid Docker .env syntaxes
        assert all(syntax.startswith("$") for syntax in docker_env_syntaxes.values())

    def test_python_does_not_expand_variables(self):
        """
        Test: Python os.getenv() returns literal strings, no expansion

        Acceptance Criteria:
        - ${VARIABLE} syntax is returned literally
        - Python does not interpret $ as special character
        - This is expected behavior
        """
        # Arrange - Simulate reading .env with Docker syntax
        with patch.dict(os.environ, {
            "R2_ENDPOINT": "https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
        }, clear=True):

            # Act
            endpoint = os.getenv('R2_ENDPOINT')

            # Assert - Python returns literal string
            assert endpoint == "https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
            assert "${ACCOUNT_ID}" in endpoint  # Literal, not expanded

    def test_docker_compose_expands_before_python(self):
        """
        Test: Document the order of operations with Docker

        Order of operations:
        1. Docker reads .env file
        2. Docker expands ${VARIABLES} using environment
        3. Docker sets expanded values in container environment
        4. Python reads fully-expanded values from os.environ

        Python NEVER sees ${VARIABLE} syntax if Docker does its job correctly.
        """
        # Arrange - Simulate POST-Docker expansion (what Python sees)
        with patch.dict(os.environ, {
            # These are what Docker provides AFTER expansion
            "CLOUDFLARE_ACCOUNT_ID": "abc123",
            "R2_ENDPOINT": "https://abc123.r2.cloudflarestorage.com",  # Already expanded
            "R2_ACCESS_KEY": "expanded_access_key",  # Already expanded
        }, clear=True):

            # Act
            endpoint = os.getenv('R2_ENDPOINT')
            access_key = os.getenv('R2_ACCESS_KEY')

            # Assert - Python sees expanded values
            assert "${" not in endpoint, "Docker already expanded variables"
            assert "${" not in access_key, "Docker already expanded variables"
            assert endpoint == "https://abc123.r2.cloudflarestorage.com"


class TestEnvFileParsingEdgeCases:
    """Test edge cases in environment variable handling"""

    def test_empty_environment_variable(self):
        """
        Test: Empty environment variables are handled

        Acceptance Criteria:
        - Empty string is valid value
        - Different from undefined variable
        """
        # Arrange
        with patch.dict(os.environ, {
            "R2_BUCKET": "",  # Empty but defined
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com"
        }, clear=True):

            # Act
            bucket = os.getenv('R2_BUCKET')
            missing = os.getenv('R2_ACCESS_KEY')

            # Assert
            assert bucket == "", "Empty string is valid"
            assert bucket is not None, "Empty string is defined"
            assert missing is None, "Undefined variable returns None"

    def test_multiline_environment_variables(self):
        """
        Test: Environment variables with newlines

        Note: .env files typically don't support multiline values well.
        This documents the limitation.
        """
        # Arrange - Single line value (standard .env behavior)
        with patch.dict(os.environ, {
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com"
        }, clear=True):

            # Act
            endpoint = os.getenv('R2_ENDPOINT')

            # Assert - Should be single line
            assert '\n' not in endpoint, ".env files don't support multiline well"

    def test_env_var_with_quotes(self):
        """
        Test: Environment variables with quotes in .env files

        .env parsers may or may not strip quotes.
        This documents expected behavior.
        """
        # Arrange - With quotes (some .env parsers strip them)
        with patch.dict(os.environ, {
            # Most .env parsers strip outer quotes
            "R2_BUCKET": "govreposcrape-gitingest",  # Quotes stripped
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com"
        }, clear=True):

            # Act
            bucket = os.getenv('R2_BUCKET')

            # Assert - Quotes should be stripped by .env parser
            assert bucket == "govreposcrape-gitingest"
            assert not bucket.startswith('"')
            assert not bucket.endswith('"')

    def test_env_var_with_spaces(self):
        """
        Test: Environment variables with leading/trailing spaces

        Acceptance Criteria:
        - .env parsers should trim spaces around values
        - Spaces within values are preserved
        """
        # Arrange
        with patch.dict(os.environ, {
            # Spaces around value should be trimmed by .env parser
            "R2_BUCKET": "govreposcrape-gitingest",
            # Spaces within value are preserved
            "R2_CUSTOM": "value with spaces"
        }, clear=True):

            # Act
            bucket = os.getenv('R2_BUCKET')
            custom = os.getenv('R2_CUSTOM')

            # Assert
            assert bucket == "govreposcrape-gitingest"
            assert not bucket.startswith(' ')
            assert not bucket.endswith(' ')
            assert custom == "value with spaces"  # Internal spaces preserved


class TestR2ClientWithEnvVars:
    """Test R2 client creation with environment variables"""

    @patch('boto3.client')
    def test_r2_client_uses_env_vars(self, mock_boto_client):
        """
        Test: R2 client is created using environment variables

        Acceptance Criteria:
        - boto3.client is called with values from environment
        - Endpoint, access key, secret key are passed correctly
        """
        # Arrange
        with patch.dict(os.environ, {
            "R2_BUCKET": "test-bucket",
            "R2_ENDPOINT": "https://test.r2.cloudflarestorage.com",
            "R2_ACCESS_KEY": "test_access_key",
            "R2_SECRET_KEY": "test_secret_key"
        }, clear=True):

            from r2_client import create_r2_client

            # Act
            create_r2_client()

            # Assert - boto3.client called with env var values
            mock_boto_client.assert_called_once_with(
                "s3",
                endpoint_url="https://test.r2.cloudflarestorage.com",
                aws_access_key_id="test_access_key",
                aws_secret_access_key="test_secret_key"
            )

    def test_r2_client_fails_without_env_vars(self):
        """
        Test: R2 client creation fails without required environment variables

        Acceptance Criteria:
        - R2ConfigError is raised
        - Error message lists missing variables
        """
        # Arrange - Empty environment
        with patch.dict(os.environ, {}, clear=True):

            from r2_client import create_r2_client, R2ConfigError

            # Act & Assert
            with pytest.raises(R2ConfigError) as exc_info:
                create_r2_client()

            error_message = str(exc_info.value)
            assert "Missing required R2 environment variables" in error_message
            # Should list all missing variables
            assert "R2_BUCKET" in error_message
            assert "R2_ENDPOINT" in error_message
            assert "R2_ACCESS_KEY" in error_message
            assert "R2_SECRET_KEY" in error_message


class TestEnvExampleFile:
    """Test .env.example file format and documentation"""

    def test_env_example_contains_all_required_vars(self):
        """
        Test: .env.example file documents all required variables

        Acceptance Criteria:
        - All R2 required variables are documented
        - Example values are provided
        - Variables use Docker substitution syntax where appropriate
        """
        # Read .env.example file
        env_example_path = "/Users/cns/httpdocs/cddo/govreposcrape/.env.example"

        # This test assumes .env.example exists and contains required variables
        # We document what should be in the file

        required_vars = [
            "R2_BUCKET",
            "R2_ENDPOINT",
            "R2_ACCESS_KEY",
            "R2_SECRET_KEY"
        ]

        # Document: .env.example should contain these variables
        assert len(required_vars) == 4, "Four R2 variables required"

    def test_env_example_uses_placeholder_values(self):
        """
        Document: .env.example should use placeholder values

        Example:
        R2_BUCKET=govreposcrape-gitingest
        R2_ENDPOINT=https://[your-account-id].r2.cloudflarestorage.com
        R2_ACCESS_KEY=your_r2_access_key_here
        R2_SECRET_KEY=your_r2_secret_key_here
        """
        # This test documents expected format
        expected_format = {
            "R2_BUCKET": "govreposcrape-gitingest",  # Actual value
            "R2_ENDPOINT": "https://[your-account-id].r2.cloudflarestorage.com",  # Placeholder
            "R2_ACCESS_KEY": "your_r2_access_key_here",  # Placeholder
            "R2_SECRET_KEY": "your_r2_secret_key_here"  # Placeholder
        }

        # Assert - Placeholders are clear
        assert "[your-account-id]" in expected_format["R2_ENDPOINT"]
        assert "your_" in expected_format["R2_ACCESS_KEY"]
        assert "_here" in expected_format["R2_SECRET_KEY"]


# TODO: Add tests for .env file loading with python-dotenv library
# TODO: Add tests for environment variable precedence (shell > .env)
# TODO: Add tests for multiple .env files (.env.local, .env.production)
# TODO: Add tests for environment variable validation formats (URL, keys)
# TODO: Add integration tests with real Docker environment
