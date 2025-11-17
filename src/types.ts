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
 * Result of cache check operation
 * Indicates whether repository needs processing based on cache status
 */
export interface CacheCheckResult {
	/** Whether repository needs processing */
	needsProcessing: boolean;
	/** Reason for cache decision */
	reason: "cache-hit" | "cache-miss" | "stale-cache";
	/** Optional: cached entry if available */
	cachedEntry?: CacheEntry;
}

/**
 * Cache performance statistics
 * Tracks cache hit rate and usage metrics
 */
export interface CacheStats {
	/** Total number of cache checks performed */
	totalChecks: number;
	/** Number of cache hits */
	hits: number;
	/** Number of cache misses */
	misses: number;
	/** Cache hit rate as percentage (0-100) */
	hitRate: number;
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

/**
 * MCP API response payload
 * Follows MCP v2 protocol specification
 * Returns search results with query execution time
 */
export interface MCPResponse {
	/** Array of search results (may be empty if no matches found) */
	results: SearchResult[];
	/** Query execution time in milliseconds */
	took_ms: number;
}

/**
 * AI Search result from Cloudflare AI Search
 * Represents a single search result with code snippet and relevance score
 */
export interface AISearchResult {
	/** Code snippet from indexed file */
	content: string;
	/** Similarity score (0.0-1.0) */
	score: number;
	/** Metadata about the search result */
	metadata: {
		/** R2 object path: gitingest/{org}/{repo}/summary.txt */
		path: string;
		/** Content type (text/plain) */
		contentType: string;
	};
}

/**
 * AI Search query response from Cloudflare AI Search API
 * Contains array of results and query execution time
 */
export interface AISearchQueryResponse {
	/** The processed search query */
	search_query: string;
	/** Array of search results ranked by similarity */
	data: AISearchResult[];
	/** Whether there are more results available */
	has_more?: boolean;
	/** Query execution time in milliseconds */
	took_ms?: number;
}

/**
 * Cloudflare AI Search service binding
 * Provides semantic search over indexed R2 content via Workers binding
 * API usage: env.AI.autorag("govreposcrape-search").search({ query, ... })
 */
export interface AISearchBinding {
	/**
	 * Access AI Search index by name
	 * @param indexName Name of the AI Search index (e.g., "govreposcrape-search")
	 * @returns AI Search index interface with search methods
	 */
	autorag(indexName: string): {
		/**
		 * Execute raw search query (returns search results without RAG generation)
		 * @param request Query parameters
		 * @returns Promise of query response with results
		 */
		search(request: {
			/** Natural language search query */
			query: string;
			/** Optional: number of results to return (default: 10, max: 50) */
			max_num_results?: number;
			/** Optional: filters for search results based on metadata */
			filters?: Record<string, any>;
			/** Optional: reranking configuration */
			reranking?: {
				enabled: boolean;
				model?: string;
			};
		}): Promise<AISearchQueryResponse>;
	};
}

/**
 * Enriched search result with repository metadata and actionable links
 * Extends AISearchResult with GitHub links and R2 custom metadata
 */
export interface EnrichedSearchResult {
	/** Code snippet from indexed file (from AISearchResult) */
	content: string;
	/** Similarity score 0.0-1.0 (from AISearchResult) */
	score: number;

	/** Repository information extracted from R2 path */
	repository: {
		/** GitHub organization name */
		org: string;
		/** Repository name */
		name: string;
		/** Full repository identifier: org/name */
		fullName: string;
	};

	/** Quick-launch links for immediate access */
	links: {
		/** GitHub repository URL: https://github.com/{org}/{repo} */
		github: string;
		/** GitHub Codespaces URL: https://github.dev/{org}/{repo} */
		codespaces: string;
		/** Gitpod URL: https://gitpod.io/#https://github.com/{org}/{repo} */
		gitpod: string;
	};

	/** Optional R2 custom metadata (graceful degradation if unavailable) */
	metadata?: {
		/** Repository last push timestamp (ISO 8601) */
		pushedAt?: string;
		/** Full GitHub URL from R2 metadata */
		url?: string;
		/** Gitingest processing timestamp (ISO 8601) */
		processedAt?: string;
		/** Detected language (if available) */
		language?: string;
	};

	/** R2 object path for reference */
	r2Path: string;
}
