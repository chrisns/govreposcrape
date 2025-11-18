#!/usr/bin/env python3
"""
govscraperepo MCP API - Python Example
Demonstrates how to search UK government code repositories using requests library

Prerequisites: Python 3.7+, requests library
Installation: pip install requests
Usage: python3 examples/python.py

This example shows:
- Basic search query for NHS API integration patterns
- Type hints for better code documentation
- Comprehensive error handling with specific exception types
- Result parsing and display with metadata
"""

import os
import sys
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

try:
    import requests
except ImportError:
    print("❌ Error: 'requests' library not installed")
    print("   Install with: pip install requests")
    print("   Then run this script again")
    sys.exit(1)

# API Configuration
API_BASE = os.getenv('MCP_API_URL', 'https://govreposcrape-api-1060386346356.us-central1.run.app')
API_URL = f'{API_BASE}/mcp/search'
HEALTH_URL = f'{API_BASE}/mcp/health'

# ANSI color codes for terminal output
class Colors:
    """Terminal color codes"""
    GREEN = '\033[32m'
    RED = '\033[31m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    RESET = '\033[0m'


@dataclass
class SearchMetadata:
    """Metadata for a search result"""
    language: str
    stars: int
    last_updated: str
    github_url: str


@dataclass
class SearchResult:
    """Single search result from the MCP API"""
    repository: str
    file_path: str
    match_snippet: str
    relevance_score: float
    metadata: SearchMetadata

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SearchResult':
        """Create SearchResult from API response dictionary"""
        return cls(
            repository=data['repository'],
            file_path=data['file_path'],
            match_snippet=data['match_snippet'],
            relevance_score=data['relevance_score'],
            metadata=SearchMetadata(**data['metadata'])
        )


@dataclass
class SearchResponse:
    """Response from the MCP search API"""
    results: List[SearchResult]
    took_ms: int

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SearchResponse':
        """Create SearchResponse from API response dictionary"""
        return cls(
            results=[SearchResult.from_dict(r) for r in data['results']],
            took_ms=data['took_ms']
        )


class MCPAPIError(Exception):
    """Base exception for MCP API errors"""
    def __init__(self, message: str, code: str, status_code: int, details: Optional[Dict] = None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details


def search_code(query: str, limit: int = 5) -> SearchResponse:
    """
    Search UK government code repositories

    Args:
        query: Search query string (3-500 characters)
        limit: Number of results to return (1-20, default 5)

    Returns:
        SearchResponse object containing results and timing

    Raises:
        MCPAPIError: On API validation or server errors
        requests.exceptions.RequestException: On network errors
    """
    try:
        # Make POST request with required headers
        # - Content-Type: application/json is REQUIRED
        # - X-MCP-Version: 2 is optional but recommended
        response = requests.post(
            API_URL,
            headers={
                'Content-Type': 'application/json',
                'X-MCP-Version': '2',
            },
            json={
                'query': query,
                'limit': limit,
            },
            timeout=10  # 10 second timeout
        )

        # Parse JSON response
        data = response.json()

        # Check for HTTP errors
        if not response.ok:
            # API returned an error response
            error_data = data.get('error', {})
            raise MCPAPIError(
                message=error_data.get('message', 'API request failed'),
                code=error_data.get('code', 'UNKNOWN_ERROR'),
                status_code=response.status_code,
                details=error_data
            )

        # Parse successful response
        return SearchResponse.from_dict(data)

    except requests.exceptions.Timeout:
        raise MCPAPIError(
            message='Request timed out after 10 seconds',
            code='TIMEOUT_ERROR',
            status_code=0
        )
    except requests.exceptions.ConnectionError as e:
        raise MCPAPIError(
            message=f'Could not connect to API: {str(e)}',
            code='CONNECTION_ERROR',
            status_code=0
        )
    except requests.exceptions.RequestException as e:
        raise MCPAPIError(
            message=f'Network error: {str(e)}',
            code='NETWORK_ERROR',
            status_code=0
        )


def check_health() -> Dict[str, Any]:
    """
    Check API health status

    Returns:
        Dictionary with status, services, and timestamp
    """
    response = requests.get(HEALTH_URL, timeout=10)
    return response.json()


def display_results(response: SearchResponse) -> None:
    """
    Display search results in a user-friendly format

    Args:
        response: SearchResponse object to display
    """
    print(f'\n{Colors.BLUE}📊 Results: {len(response.results)} repositories found in {response.took_ms}ms{Colors.RESET}\n')

    if not response.results:
        print(f'{Colors.YELLOW}No results found. Try a different query.{Colors.RESET}')
        return

    # Display each result
    for index, result in enumerate(response.results, 1):
        print(f'{Colors.GREEN}[{index}] {result.repository}{Colors.RESET}')
        print(f'    Score: {result.relevance_score:.3f}')
        print(f'    Language: {result.metadata.language}')
        print(f'    GitHub: {result.metadata.github_url}')

        # Display snippet (truncated if too long)
        snippet = result.match_snippet[:200]
        truncated = '...' if len(result.match_snippet) > 200 else ''
        print(f'    Snippet: {snippet}{truncated}')
        print()


def display_error(error: MCPAPIError) -> None:
    """
    Display error in a user-friendly format

    Args:
        error: MCPAPIError object to display
    """
    print(f'\n{Colors.RED}❌ Error: {str(error)}{Colors.RESET}')
    print(f'   Code: {error.code}')

    if error.status_code:
        print(f'   HTTP Status: {error.status_code}')

    if error.details:
        print(f'   Details: {json.dumps(error.details, indent=2)}')

    print()


def main() -> None:
    """Main execution function"""
    print('🔍 govscraperepo MCP API - Python Example')
    print('==========================================\n')

    # Example 1: Successful search query
    print('📝 Example 1: Search for NHS API integration patterns')
    print("Query: 'NHS API integration authentication FHIR patient data'\n")

    try:
        results = search_code('NHS API integration authentication FHIR patient data', 5)
        print(f'{Colors.GREEN}✅ Success!{Colors.RESET}')
        display_results(results)
    except MCPAPIError as error:
        display_error(error)
    except Exception as error:
        print(f'{Colors.RED}Unexpected error: {str(error)}{Colors.RESET}\n')

    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    # Example 2: Error handling - Query too short
    print('📝 Example 2: Error handling - Query too short (< 3 chars)')
    print("Query: 'ab' (only 2 characters)\n")

    try:
        search_code('ab', 5)
    except MCPAPIError as error:
        print(f'{Colors.GREEN}✅ Error handling works correctly{Colors.RESET}')
        display_error(error)
    except Exception as error:
        print(f'{Colors.RED}Unexpected error: {str(error)}{Colors.RESET}\n')

    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    # Example 3: Error handling - Limit out of range
    print('📝 Example 3: Error handling - Limit out of range (> 20)')
    print('Limit: 100 (maximum is 20)\n')

    try:
        search_code('authentication middleware', 100)
    except MCPAPIError as error:
        print(f'{Colors.GREEN}✅ Validation works correctly{Colors.RESET}')
        display_error(error)
    except Exception as error:
        print(f'{Colors.RED}Unexpected error: {str(error)}{Colors.RESET}\n')

    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    # Example 4: Health check
    print('📝 Example 4: API Health Check')
    print(f'Endpoint: GET {HEALTH_URL}\n')

    try:
        health = check_health()

        if health.get('status') == 'healthy':
            print(f'{Colors.GREEN}✅ API is healthy{Colors.RESET}')
            print(f'   Status: {health["status"]}')
            print(f'   Services: {len(health.get("services", {}))} checked')
            print(f'   Timestamp: {health.get("timestamp")}\n')
        else:
            print(f'{Colors.YELLOW}⚠️ API has issues{Colors.RESET}')
            print(json.dumps(health, indent=2))
    except Exception as error:
        print(f'{Colors.RED}❌ Health check failed: {str(error)}{Colors.RESET}\n')

    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    print('🎉 Examples complete!\n')
    print('💡 Next steps:')
    print('   - Try your own queries by modifying the query string')
    print('   - Adjust limit (1-20) to get more or fewer results')
    print('   - See README.md for cURL and Node.js examples')
    print('   - Run ./scripts/test-mcp.sh to validate your integration\n')
    print('📚 API Documentation:')
    print(f'   - OpenAPI Spec: {API_BASE}/openapi.json')
    print('   - Integration Guide: docs/integration/claude-desktop.md\n')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f'\n{Colors.YELLOW}Interrupted by user{Colors.RESET}')
        sys.exit(0)
    except Exception as error:
        print(f'{Colors.RED}Fatal error: {str(error)}{Colors.RESET}')
        sys.exit(1)
