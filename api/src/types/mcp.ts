/**
 * MCP API Type Definitions
 * Types for Model Context Protocol v2 search API
 */

/**
 * Result mode options for search responses
 * - minimal: Metadata only, fastest response
 * - snippets: Default mode with code snippets (balanced)
 * - full: Complete gitingest summaries (comprehensive)
 */
export type ResultMode = "minimal" | "snippets" | "full";

/**
 * MCP Search Request Schema
 */
export interface MCPSearchRequest {
	/** Search query string (required) */
	query: string;
	/** Maximum number of results to return (1-100, default: 20) */
	limit?: number;
	/** Result detail level (default: "snippets") */
	resultMode?: ResultMode;
}

/**
 * MCP Search Response Schema
 */
export interface MCPSearchResponse {
	/** Array of search results */
	results: SearchResult[];
	/** Request metadata */
	metadata: {
		query: string;
		limit: number;
		resultCount: number;
		duration: number;
	};
	/** Effective result mode used (echoes request or default) */
	mode: ResultMode;
}

/**
 * Search Result Item
 * Base result structure returned by Vertex AI Search
 */
export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	metadata: {
		org: string;
		repo: string;
		pushedAt?: string;
		processedAt?: string;
	};
}

/**
 * Minimal Result Item
 * Lightweight result format for fast browsing and low-bandwidth clients
 * Optimized for performance by excluding snippets and summaries
 */
export interface MinimalResult {
	/** Repository URL (GitHub HTTPS URL) */
	repo_url: string;
	/** GitHub organization name */
	repo_org: string;
	/** Repository name */
	repo_name: string;
	/** Primary programming language */
	language: string;
	/** Last update timestamp (ISO 8601 format) */
	last_updated: string;
	/** Semantic relevance score (0-1) from Vertex AI Search */
	similarity_score: number;
	/** Direct link to GitHub repository */
	github_link: string;
	/** SBOM (Software Bill of Materials) download URL - SPDX 2.3 format, gzipped */
	sbom_url: string;
	/** Optional metadata fields */
	metadata: {
		/** Repository star count */
		stars?: number;
		/** Repository license type */
		license?: string;
	};
}

/**
 * Snippet Result Item
 * Balanced default mode providing focused code excerpts with context
 * Extends minimal mode fields with snippet-specific information
 * Target: ~5KB per result, p95 latency <1500ms
 */
export interface SnippetResult extends MinimalResult {
	/** Code snippet (3-5 lines from Vertex AI Search highlights) */
	snippet: string;
	/** File path where snippet originates (extracted from metadata) */
	snippet_file_path: string;
	/** Line range in format "45-50" */
	snippet_line_range: string;
	/** Context lines before snippet (fixed at 2) */
	context_lines_before: number;
	/** Context lines after snippet (fixed at 2) */
	context_lines_after: number;
	/** GitHub Codespaces quick edit link */
	codespaces_link: string;
}

/**
 * Dependency entry parsed from repository metadata
 */
export interface Dependency {
	/** Package/module name */
	name: string;
	/** Version string (e.g., "^1.2.3", ">=2.0.0") */
	version: string;
	/** Dependency type: runtime or development */
	type: "runtime" | "dev";
}

/**
 * Repository statistics and metadata
 */
export interface RepositoryStats {
	/** Number of contributors to the repository */
	contributors: number;
	/** Number of commits in the last month */
	commits_last_month: number;
	/** Number of open issues */
	open_issues: number;
	/** Last commit timestamp (ISO 8601 format) */
	last_commit: string;
}

/**
 * Full Result Item
 * Comprehensive mode for deep analysis - includes complete gitingest summaries and enhanced metadata
 * Extends snippet mode fields with Cloud Storage integration
 * Target: <3000ms p95 latency, ~50KB per result
 *
 * Use case: CLI tools, researchers, and developers needing complete repository context
 * for in-depth analysis, comprehensive code review, or full understanding of a repository's
 * architecture and dependencies.
 */
export interface FullResult extends SnippetResult {
	/** Complete gitingest Markdown summary from Cloud Storage */
	gitingest_summary: string;
	/** Full file context (future enhancement - complete file if available) */
	full_file_context?: string;
	/** README excerpt (first 500 characters or first paragraph) */
	readme_excerpt?: string;
	/** Repository statistics and activity metrics */
	repository_stats?: RepositoryStats;
	/** Parsed dependencies from package manifests */
	dependencies?: Dependency[];
}

/**
 * MCP Error Response
 * Standard error format for MCP v2 protocol
 */
export interface MCPErrorResponse {
	error: {
		/** Error code (e.g., "INVALID_REQUEST", "INVALID_RESULT_MODE") */
		code: string;
		/** Human-readable error message */
		message: string;
		/** Optional additional error details */
		details?: any;
		/** For enum validation errors: array of allowed values */
		allowed_values?: string[];
	};
}
