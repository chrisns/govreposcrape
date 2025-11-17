#!/usr/bin/env python3
"""
Cache Client - Quality Story 1 Fix
Python client for Docker containers to access Workers KV via HTTP proxy

Architecture: Docker Container → HTTP → Worker KV Proxy → KV Namespace

Usage:
    from cache import check_cache, update_cache, CacheEntry

    # Check if repo needs processing
    result = check_cache(org="alphagov", repo="govuk-frontend", pushed_at="2025-01-01T00:00:00Z")
    if result["needs_processing"]:
        # Process repository
        process_repository(...)

        # Update cache after success
        update_cache(
            org="alphagov",
            repo="govuk-frontend",
            entry={
                "pushedAt": "2025-01-01T00:00:00Z",
                "processedAt": "2025-01-13T10:30:00Z",
                "status": "complete"
            }
        )

Environment Variables:
    WORKER_URL: Cloudflare Worker URL (default: http://localhost:8787)
"""

import os
import requests
from typing import Dict, Any, Optional, TypedDict
from urllib.parse import quote


class CacheEntry(TypedDict):
    """Cache entry structure matching Workers KV schema"""
    pushedAt: str      # ISO 8601 timestamp from repos.json
    processedAt: str   # ISO 8601 timestamp when processed
    status: str        # "complete"


class CacheCheckResult(TypedDict):
    """Result of cache check operation"""
    needs_processing: bool   # True if repo should be processed
    reason: str             # "cache-hit" | "cache-miss" | "stale-cache"
    cached_entry: Optional[CacheEntry]  # Entry if found, None if miss


# Get Worker URL from environment
WORKER_URL = os.environ.get('WORKER_URL', 'http://localhost:8787')


def check_cache(org: str, repo: str, pushed_at: str) -> CacheCheckResult:
    """
    Check if repository is cached and needs processing

    Calls Worker KV proxy: GET /cache/:org/:repo?pushedAt=<timestamp>

    Args:
        org: GitHub organization name (e.g., "alphagov")
        repo: Repository name (e.g., "govuk-frontend")
        pushed_at: ISO 8601 timestamp from repos.json

    Returns:
        CacheCheckResult with needs_processing flag and cached entry

    Examples:
        >>> result = check_cache("alphagov", "govuk-frontend", "2025-01-01T00:00:00Z")
        >>> if result["needs_processing"]:
        ...     print("Cache miss - needs processing")
        >>> else:
        ...     print("Cache hit - skip processing")
    """
    # URL-encode org and repo for safety
    org_encoded = quote(org, safe='')
    repo_encoded = quote(repo, safe='')

    url = f"{WORKER_URL}/cache/{org_encoded}/{repo_encoded}"
    params = {"pushedAt": pushed_at}

    try:
        response = requests.get(url, params=params, timeout=10)

        if response.status_code == 200:
            # Cache hit - no processing needed
            cached_entry = response.json()
            return {
                "needs_processing": False,
                "reason": "cache-hit",
                "cached_entry": cached_entry
            }
        elif response.status_code == 404:
            # Cache miss or stale - needs processing
            data = response.json()
            return {
                "needs_processing": True,
                "reason": data.get("reason", "cache-miss"),
                "cached_entry": None
            }
        else:
            # Unexpected status - treat as cache miss (fail-safe)
            return {
                "needs_processing": True,
                "reason": "cache-miss",
                "cached_entry": None
            }

    except requests.RequestException as e:
        # Network error - treat as cache miss (fail-safe)
        # Don't block processing due to cache unavailability
        return {
            "needs_processing": True,
            "reason": "cache-miss",
            "cached_entry": None
        }


def update_cache(org: str, repo: str, entry: CacheEntry) -> bool:
    """
    Update cache after successful repository processing

    Calls Worker KV proxy: PUT /cache/:org/:repo

    Args:
        org: GitHub organization name
        repo: Repository name
        entry: Cache entry with pushedAt, processedAt, status

    Returns:
        True if cache updated successfully, False otherwise

    Examples:
        >>> entry = {
        ...     "pushedAt": "2025-01-01T00:00:00Z",
        ...     "processedAt": "2025-01-13T10:30:00Z",
        ...     "status": "complete"
        ... }
        >>> success = update_cache("alphagov", "govuk-frontend", entry)
        >>> if success:
        ...     print("Cache updated")
    """
    # URL-encode org and repo
    org_encoded = quote(org, safe='')
    repo_encoded = quote(repo, safe='')

    url = f"{WORKER_URL}/cache/{org_encoded}/{repo_encoded}"

    try:
        response = requests.put(url, json=entry, timeout=10)

        if response.status_code == 204:
            return True
        else:
            # Log error but don't throw - cache write failure shouldn't block pipeline
            return False

    except requests.RequestException as e:
        # Network error - log but don't throw
        return False


def get_cache_stats() -> Dict[str, Any]:
    """
    Get cache performance statistics from Worker

    Calls Worker KV proxy: GET /cache/stats

    Returns:
        Dictionary with totalChecks, hits, misses, hitRate

    Examples:
        >>> stats = get_cache_stats()
        >>> print(f"Cache hit rate: {stats['hitRate']:.1f}%")
    """
    url = f"{WORKER_URL}/cache/stats"

    try:
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            return response.json()
        else:
            # Return empty stats on error
            return {
                "totalChecks": 0,
                "hits": 0,
                "misses": 0,
                "hitRate": 0.0
            }

    except requests.RequestException as e:
        # Return empty stats on error
        return {
            "totalChecks": 0,
            "hits": 0,
            "misses": 0,
            "hitRate": 0.0
        }
