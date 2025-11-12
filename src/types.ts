/**
 * Shared TypeScript types for govreposcrape
 * Following PRD specifications and architecture patterns
 */

/**
 * Repository metadata from repos.json feed
 * Source: xgov-opensource-repo-scraper feed
 */
export interface Repository {
	/** Full repository name (e.g., "alphagov/govuk-frontend") */
	full_name: string;
	/** GitHub repository URL */
	html_url: string;
	/** Repository description */
	description: string | null;
	/** Primary programming language */
	language: string | null;
	/** Number of stars */
	stargazers_count: number;
	/** Number of forks */
	forks_count: number;
	/** Repository creation timestamp (ISO 8601) */
	created_at: string;
	/** Last update timestamp (ISO 8601) */
	updated_at: string;
	/** Last push timestamp (ISO 8601) - used for smart caching */
	pushed_at: string;
	/** Repository topics/tags */
	topics: string[];
	/** Repository visibility */
	visibility: "public";
	/** Whether repository is a template */
	is_template: boolean;
}

/**
 * Search result returned by the MCP API
 * Follows PRD FR-1.1 specification
 */
export interface SearchResult {
	/** Repository identifier (e.g., "alphagov/govuk-frontend") */
	repository: string;
	/** File path within repository */
	file_path: string;
	/** Code snippet matching the query */
	match_snippet: string;
	/** Relevance score from AI Search (0.0-1.0) */
	relevance_score: number;
	/** Additional metadata about the result */
	metadata: {
		/** Programming language */
		language: string;
		/** Star count */
		stars: number;
		/** Last updated timestamp (ISO 8601) */
		last_updated: string;
		/** Direct GitHub URL */
		github_url: string;
	};
}

/**
 * Error response format for API errors
 * Follows PRD FR-3 specification
 */
export interface ErrorResponse {
	error: {
		/** Machine-readable error code (e.g., "INVALID_QUERY", "SERVICE_UNAVAILABLE") */
		code: string;
		/** Human-readable error message */
		message: string;
		/** Optional: seconds to wait before retrying (for rate limiting) */
		retry_after?: number;
	};
}

/**
 * MCP v2 search response format
 * Wraps SearchResult array with query metadata
 */
export interface MCPSearchResponse {
	/** Array of search results */
	results: SearchResult[];
	/** Total number of results */
	total: number;
	/** Original query string */
	query: string;
}

/**
 * Cache entry stored in KV for smart caching
 * Used to track repository processing status
 */
export interface CacheEntry {
	/** Push timestamp from repos.json (ISO 8601) */
	pushedAt: string;
	/** Timestamp when gitingest processing completed (ISO 8601) */
	processedAt: string;
	/** Processing status */
	status: "complete";
}

/**
 * Repository metadata extracted from repos.json
 * Used during ingestion pipeline
 */
export interface RepoMetadata {
	/** GitHub repository URL */
	url: string;
	/** Last push timestamp (ISO 8601) */
	pushedAt: string;
	/** GitHub organization name */
	org: string;
	/** Repository name */
	name: string;
}

/**
 * MCP API request payload
 * Follows MCP v2 protocol
 */
export interface MCPRequest {
	/** Search query (3-500 characters) */
	query: string;
	/** Optional: number of results to return (1-20, default 5) */
	limit?: number;
}
