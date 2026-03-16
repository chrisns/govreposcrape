#!/usr/bin/env python3
"""
Snippets Mode Example - Python

Use case: AI assistants, web UI, standard search (DEFAULT mode)
Performance: <1500ms p95, ~5KB per result
Returns: Metadata + focused code snippets (3-5 lines with context)
"""

import os
import requests
from typing import List, Dict, Optional, TypedDict


class SnippetResult(TypedDict):
    """Snippet result format (default mode)"""
    repo_url: str
    repo_org: str
    repo_name: str
    language: str
    last_updated: str
    similarity_score: float
    github_link: str
    metadata: Dict[str, any]
    # Snippet-specific fields
    snippet: str
    snippet_file_path: str
    snippet_line_range: str
    context_lines_before: int
    context_lines_after: int
    codespaces_link: str


class SearchMetadata(TypedDict):
    """Search metadata"""
    query: str
    limit: int
    resultCount: int
    duration: int


class SearchResponse(TypedDict):
    """Complete search response"""
    results: List[SnippetResult]
    metadata: SearchMetadata
    mode: str


def search_snippets(query: str, limit: int = 5, api_url: Optional[str] = None) -> SearchResponse:
    """
    Search repositories using snippets mode (explicit).

    Args:
        query: Search query string
        limit: Maximum number of results (default: 5)
        api_url: API endpoint URL (default: from API_URL env var)

    Returns:
        SearchResponse with snippet results

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
            "resultMode": "snippets"  # Explicit mode
        },
        headers={"Content-Type": "application/json"}
    )

    response.raise_for_status()
    return response.json()


def search_default(query: str, limit: int = 5, api_url: Optional[str] = None) -> SearchResponse:
    """
    Search repositories using default mode (omit resultMode parameter).
    Defaults to snippets mode for backward compatibility.

    Args:
        query: Search query string
        limit: Maximum number of results (default: 5)
        api_url: API endpoint URL (default: from API_URL env var)

    Returns:
        SearchResponse with snippet results

    Raises:
        requests.HTTPError: If API request fails
    """
    if api_url is None:
        api_url = os.environ.get('API_URL', 'https://govreposcrape-api-xxxxx-uc.a.run.app')

    response = requests.post(
        f"{api_url}/mcp/search",
        json={
            "query": query,
            "limit": limit
            # resultMode omitted - defaults to 'snippets'
        },
        headers={"Content-Type": "application/json"}
    )

    response.raise_for_status()
    return response.json()


def main():
    """Example usage"""
    try:
        results = search_snippets("OAuth2 implementation patterns", limit=3)

        print(f"Found {results['metadata']['resultCount']} repositories "
              f"(took {results['metadata']['duration']}ms)")
        print(f"Mode: {results['mode']}\n")

        for i, repo in enumerate(results['results'], 1):
            print(f"{i}. {repo['repo_org']}/{repo['repo_name']} ({repo['language']})")
            print(f"   Score: {repo['similarity_score']:.2f}")
            print(f"   File: {repo['snippet_file_path']} (lines {repo['snippet_line_range']})")
            print(f"   Snippet:")
            for line in repo['snippet'].split('\n'):
                print(f"     {line}")
            print(f"   GitHub: {repo['github_link']}")
            print(f"   Codespaces: {repo['codespaces_link']}")
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
