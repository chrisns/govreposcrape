#!/usr/bin/env python3
"""
Full Mode Example - Python

Use case: Deep research, CLI tools, comprehensive code review
Performance: <3000ms p95, ~50KB per result
Returns: All snippet fields + complete gitingest summaries + repository stats + dependencies
"""

import os
import requests
from typing import List, Dict, Optional, TypedDict


class Dependency(TypedDict):
    """Dependency entry"""
    name: str
    version: str
    type: str  # 'runtime' or 'dev'


class RepositoryStats(TypedDict):
    """Repository statistics"""
    contributors: int
    commits_last_month: int
    open_issues: int
    last_commit: str


class FullResult(TypedDict):
    """Full result format (comprehensive mode)"""
    repo_url: str
    repo_org: str
    repo_name: str
    language: str
    last_updated: str
    similarity_score: float
    github_link: str
    metadata: Dict[str, any]
    # Snippet fields
    snippet: str
    snippet_file_path: str
    snippet_line_range: str
    context_lines_before: int
    context_lines_after: int
    codespaces_link: str
    # Full mode fields
    gitingest_summary: str
    full_file_context: Optional[str]
    readme_excerpt: Optional[str]
    repository_stats: Optional[RepositoryStats]
    dependencies: Optional[List[Dependency]]


class SearchMetadata(TypedDict):
    """Search metadata"""
    query: str
    limit: int
    resultCount: int
    duration: int


class SearchResponse(TypedDict):
    """Complete search response"""
    results: List[FullResult]
    metadata: SearchMetadata
    mode: str


def search_full(query: str, limit: int = 2, api_url: Optional[str] = None) -> SearchResponse:
    """
    Search repositories using full mode.

    Args:
        query: Search query string
        limit: Maximum number of results (default: 2, full mode is slower)
        api_url: API endpoint URL (default: from API_URL env var)

    Returns:
        SearchResponse with full results including gitingest summaries

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
            "resultMode": "full"
        },
        headers={"Content-Type": "application/json"},
        timeout=10  # Full mode may take longer
    )

    response.raise_for_status()
    return response.json()


def main():
    """Example usage"""
    try:
        results = search_full("microservices architecture patterns", limit=2)

        print(f"Found {results['metadata']['resultCount']} repositories "
              f"(took {results['metadata']['duration']}ms)")
        print(f"Mode: {results['mode']}\n")

        for i, repo in enumerate(results['results'], 1):
            print("=" * 80)
            print(f"{i}. {repo['repo_org']}/{repo['repo_name']} ({repo['language']})")
            print("=" * 80)
            print(f"Score: {repo['similarity_score']:.2f}")
            print(f"Last Updated: {repo['last_updated']}")
            print(f"License: {repo['metadata'].get('license', 'Unknown')}")
            print(f"Stars: {repo['metadata'].get('stars', 'N/A')}")

            if repo.get('repository_stats'):
                stats = repo['repository_stats']
                print(f"\nRepository Stats:")
                print(f"  Contributors: {stats['contributors']}")
                print(f"  Recent Commits: {stats['commits_last_month']}")
                print(f"  Open Issues: {stats['open_issues']}")
                print(f"  Last Commit: {stats['last_commit']}")

            print(f"\nCode Snippet ({repo['snippet_file_path']}, "
                  f"lines {repo['snippet_line_range']}):")
            for line in repo['snippet'].split('\n'):
                print(f"  {line}")

            if repo.get('readme_excerpt'):
                print(f"\nREADME Excerpt:")
                print(repo['readme_excerpt'][:200] + "...")

            if repo.get('dependencies'):
                deps = repo['dependencies']
                print(f"\nKey Dependencies ({len(deps)} total):")
                for dep in deps[:5]:
                    print(f"  - {dep['name']} {dep['version']} ({dep['type']})")
                if len(deps) > 5:
                    print(f"  ... and {len(deps) - 5} more")

            summary = repo['gitingest_summary']
            print(f"\nGitingest Summary ({len(summary)} chars):")
            print(summary[:300] + "...\n")

            print(f"Links:")
            print(f"  GitHub: {repo['github_link']}")
            print(f"  Codespaces: {repo['codespaces_link']}")
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
