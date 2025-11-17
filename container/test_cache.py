#!/usr/bin/env python3
"""
Unit tests for cache.py module (Quality Story 1)
Tests the KV caching integration via Worker HTTP proxy
"""

import pytest
from unittest.mock import Mock, patch
from cache import check_cache, update_cache, get_cache_stats


class TestCacheModule:
    """Test cache client module"""

    def test_check_cache_hit(self):
        """Test cache check returns hit for cached repo"""
        with patch('cache.requests.get') as mock_get:
            # Simulate cache hit (200 response)
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "pushedAt": "2025-01-01T00:00:00Z",
                "processedAt": "2025-01-13T10:00:00Z",
                "status": "complete"
            }
            mock_get.return_value = mock_response

            result = check_cache(
                org="alphagov",
                repo="govuk-frontend",
                pushed_at="2025-01-01T00:00:00Z"
            )

            assert result["needs_processing"] == False
            assert result["reason"] == "cache-hit"
            assert result["cached_entry"] is not None
            assert result["cached_entry"]["pushedAt"] == "2025-01-01T00:00:00Z"

    def test_check_cache_miss(self):
        """Test cache check returns miss for uncached repo"""
        with patch('cache.requests.get') as mock_get:
            # Simulate cache miss (404 response)
            mock_response = Mock()
            mock_response.status_code = 404
            mock_response.json.return_value = {
                "needsProcessing": True,
                "reason": "cache-miss"
            }
            mock_get.return_value = mock_response

            result = check_cache(
                org="alphagov",
                repo="new-repo",
                pushed_at="2025-01-01T00:00:00Z"
            )

            assert result["needs_processing"] == True
            assert result["reason"] == "cache-miss"
            assert result["cached_entry"] is None

    def test_check_cache_network_error(self):
        """Test cache check handles network errors gracefully"""
        with patch('cache.requests') as mock_requests:
            # Simulate network error (RequestException)
            import requests
            mock_requests.RequestException = requests.RequestException
            mock_requests.get.side_effect = requests.RequestException("Network error")

            result = check_cache(
                org="alphagov",
                repo="govuk-frontend",
                pushed_at="2025-01-01T00:00:00Z"
            )

            # Should fail-safe: treat as cache miss
            assert result["needs_processing"] == True
            assert result["reason"] == "cache-miss"
            assert result["cached_entry"] is None

    def test_update_cache_success(self):
        """Test cache update succeeds"""
        with patch('cache.requests.put') as mock_put:
            # Simulate successful update (204 response)
            mock_response = Mock()
            mock_response.status_code = 204
            mock_put.return_value = mock_response

            entry = {
                "pushedAt": "2025-01-01T00:00:00Z",
                "processedAt": "2025-01-13T10:00:00Z",
                "status": "complete"
            }

            result = update_cache(
                org="alphagov",
                repo="govuk-frontend",
                entry=entry
            )

            assert result == True

    def test_update_cache_failure(self):
        """Test cache update handles failures gracefully"""
        with patch('cache.requests.put') as mock_put:
            # Simulate failed update (500 response)
            mock_response = Mock()
            mock_response.status_code = 500
            mock_put.return_value = mock_response

            entry = {
                "pushedAt": "2025-01-01T00:00:00Z",
                "processedAt": "2025-01-13T10:00:00Z",
                "status": "complete"
            }

            result = update_cache(
                org="alphagov",
                repo="govuk-frontend",
                entry=entry
            )

            # Should not throw, return False
            assert result == False

    def test_get_cache_stats(self):
        """Test cache statistics retrieval"""
        with patch('cache.requests.get') as mock_get:
            # Simulate stats response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "totalChecks": 100,
                "hits": 95,
                "misses": 5,
                "hitRate": 95.0
            }
            mock_get.return_value = mock_response

            stats = get_cache_stats()

            assert stats["totalChecks"] == 100
            assert stats["hits"] == 95
            assert stats["misses"] == 5
            assert stats["hitRate"] == 95.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
