#!/usr/bin/env python3
"""
Minimal Mode Example - Python

Use case: Fast repository discovery, low-bandwidth clients, metadata-only exploration
Performance: <500ms p95, ~1KB per result
Returns: Repository metadata only (no code snippets, no summaries)
"""

import os
import requests
from typing import List, Dict, Optional, TypedDict


class MinimalResult(TypedDict):
    """Minimal result format"""
    repo_url: str
    repo_org: str
    repo_name: str
    language: str
    last_updated: str
    similarity_score: float
    github_link: str
    metadata: Dict[str, any]


class SearchMetadata(TypedDict):
    """Search metadata"""
    query: str
    limit: int
    resultCount: int
    duration: int


class SearchResponse(TypedDict):
    """Complete search response"""
    results: List[MinimalResult]
    metadata: SearchMetadata
    mode: str


def search_minimal(query: str, limit: int = 5, api_url: Optional[str] = None) -> SearchResponse:
    """
    Search repositories using minimal mode.

    Args:
        query: Search query string
        limit: Maximum number of results (default: 5)
        api_url: API endpoint URL (default: from API_URL env var)

    Returns:
        SearchResponse with minimal results

    Raises:
        requests.HTTPError: If API request fails
    """
    if api_url is None:
        api_url = os.environ.get('API_URL', 'https://govreposcrape-api-xxxxx-uc.a.run.app')

    response = requests.post(
        f"{api_url}/mcp/search",
        json={
            "query": query,
            "limit": limit,
            "resultMode": "minimal"
        },
        headers={"Content-Type": "application/json"}
    )

    response.raise_for_status()
    return response.json()


def main():
    """Example usage"""
    try:
        results = search_minimal("authentication methods in UK government services", limit=5)

        print(f"Found {results['metadata']['resultCount']} repositories "
              f"(took {results['metadata']['duration']}ms)")
        print(f"Mode: {results['mode']}\n")

        for i, repo in enumerate(results['results'], 1):
            print(f"{i}. {repo['repo_org']}/{repo['repo_name']}")
            print(f"   Language: {repo['language']}")
            print(f"   Score: {repo['similarity_score']:.2f}")
            print(f"   URL: {repo['github_link']}")
            if 'stars' in repo['metadata']:
                print(f"   Stars: {repo['metadata']['stars']}")
            print()

    except requests.HTTPError as e:
        print(f"API Error: {e}")
        if e.response is not None:
            error_data = e.response.json()
            print(f"Error code: {error_data['error']['code']}")
            print(f"Message: {error_data['error']['message']}")
        exit(1)
    except Exception as e:
        print(f"Error: {e}")
        exit(1)


if __name__ == "__main__":
    main()
