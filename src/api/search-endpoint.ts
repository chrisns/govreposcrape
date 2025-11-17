/**
 * Search Endpoint for MCP API
 * Integrates Cloudflare AI Search with MCP response format
 *
 * This module orchestrates the search pipeline:
 * 1. Execute AI Search query via searchCode() (Epic 3 Story 3.2)
 * 2. Enrich results with metadata via enrichResults() (Epic 3 Story 3.3)
 * 3. Map enriched results to MCP SearchResult format
 * 4. Build MCPResponse with timing information
 *
 * @module search-endpoint
 */

import { searchCode } from "../search/ai-search-client";
import { enrichResults } from "../search/result-enricher";
import { createLogger } from "../utils/logger";
import { ServiceError } from "../utils/error-handler";
import {
	trackQueryResult,
	trackQueryDuration,
	trackError,
	type MetricsCollector,
} from "../utils/metrics";
import type { MCPRequest, MCPResponse, SearchResult, EnrichedSearchResult } from "../types";

/**
 * Execute semantic search and return MCP-formatted results
 *
 * Orchestrates the complete search pipeline:
 * - Queries Cloudflare AI Search for code snippets
 * - Enriches results with repository metadata and links
 * - Maps to MCP SearchResult format
 * - Tracks performance metrics
 *
 * @param request - Validated MCPRequest with query and optional limit
 * @param env - Cloudflare Workers environment bindings
 * @param metricsCollector - Optional metrics collector for tracking custom metrics (Story 6.3)
 * @returns MCPResponse with enriched search results and timing
 * @throws ServiceError on AI Search failures (503 with retry_after)
 *
 * @example
 * ```typescript
 * const request = { query: "authentication methods", limit: 5 };
 * const response = await executeSearch(request, env);
 * // response = { results: [{ repository: "alphagov/...", ... }], took_ms: 234 }
 * ```
 */
export async function executeSearch(
	request: MCPRequest,
	env: Env,
	metricsCollector?: MetricsCollector,
): Promise<MCPResponse> {
	const startTime = Date.now();
	const requestId = crypto.randomUUID();
	const logger = createLogger({ operation: "execute_search", requestId });

	logger.info("Search request started", {
		query: request.query.substring(0, 100), // Truncate for privacy (Story 4.1 pattern)
		limit: request.limit,
	});

	try {
		// Step 1: Execute AI Search query (Epic 3 Story 3.2)
		// searchCode handles retry logic, throws ServiceError on failure
		const aiSearchStartTime = Date.now();
		const aiResults = await searchCode(env, request.query, request.limit);
		const aiSearchDuration = Date.now() - aiSearchStartTime;

		logger.info("AI Search completed", {
			duration: aiSearchDuration,
			resultCount: aiResults.length,
		});

		// Warn if AI Search is slow (>800ms threshold from Story 3.4)
		if (aiSearchDuration > 800) {
			logger.warn("Slow AI Search query detected", {
				duration: aiSearchDuration,
				threshold: 800,
				query: request.query.substring(0, 100),
			});
		}

		// Step 2: Handle empty results gracefully (AC #4)
		if (aiResults.length === 0) {
			const emptyDuration = Date.now() - startTime;
			logger.info("No results found for query", {
				duration: emptyDuration,
				query: request.query.substring(0, 100),
			});

			// Track empty result for observability metrics (Story 6.3)
			if (metricsCollector) {
				trackQueryResult(metricsCollector, 0, logger);
				trackQueryDuration(metricsCollector, emptyDuration, logger);
			}

			return {
				results: [],
				took_ms: emptyDuration,
			};
		}

		// Step 3: Enrich results with metadata (Epic 3 Story 3.3)
		const enrichStartTime = Date.now();
		const enrichedResults = await enrichResults(env, aiResults);
		const enrichDuration = Date.now() - enrichStartTime;

		logger.info("Result enrichment completed", {
			duration: enrichDuration,
			resultCount: enrichedResults.length,
		});

		// Step 4: Map enriched results to MCP SearchResult format
		const mappedResults = enrichedResults.map((enriched) => mapToSearchResult(enriched));

		// Step 5: Build MCPResponse with total timing
		const totalDuration = Date.now() - startTime;

		logger.info("Search request completed", {
			duration: totalDuration,
			resultCount: mappedResults.length,
			aiSearchDuration,
			enrichDuration,
		});

		// Track custom metrics for observability (Story 6.3)
		if (metricsCollector) {
			trackQueryResult(metricsCollector, mappedResults.length, logger);
			trackQueryDuration(metricsCollector, totalDuration, logger);
		}

		// Warn if total response time exceeds 2s target (NFR-1.1 from tech spec)
		if (totalDuration > 2000) {
			logger.warn("Search request exceeded performance target", {
				duration: totalDuration,
				target: 2000,
				query: request.query.substring(0, 100),
			});
		}

		return {
			results: mappedResults,
			took_ms: totalDuration,
		};
	} catch (error) {
		const errorDuration = Date.now() - startTime;

		// Log error with context
		logger.error("Search request failed", {
			error: error instanceof Error ? error.message : "Unknown error",
			duration: errorDuration,
			query: request.query.substring(0, 100),
		});

		// Track error by type for observability metrics (Story 6.3)
		if (metricsCollector) {
			const errorType =
				error instanceof ServiceError ? error.code : error instanceof Error ? error.name : "UNKNOWN_ERROR";
			trackError(metricsCollector, errorType, logger);
		}

		// ServiceError from searchCode (AI Search timeout/failure) should propagate
		// formatErrorResponse() in mcp-handler will map it to 503 with retry_after
		if (error instanceof ServiceError) {
			throw error;
		}

		// Unexpected errors become ServiceError for consistent error handling
		throw new ServiceError("Search service temporarily unavailable", 503, "SEARCH_ERROR", 60);
	}
}

/**
 * Map EnrichedSearchResult to MCP SearchResult format
 *
 * Transforms Epic 3 enrichment format to MCP API response format.
 * Handles field mapping and default values for missing data.
 *
 * @param enriched - Enriched search result from Epic 3 result-enricher
 * @returns SearchResult matching MCP specification
 *
 * Field mappings:
 * - enriched.repository.fullName → repository
 * - enriched.r2Path → file_path (parsed from path)
 * - enriched.content → match_snippet
 * - enriched.score → relevance_score
 * - enriched.metadata.language → metadata.language (default: "Unknown")
 * - enriched.metadata.pushedAt → metadata.last_updated
 * - enriched.links.github → metadata.github_url
 * - stars → 0 (not available in R2 metadata, could add in Phase 2)
 */
function mapToSearchResult(enriched: EnrichedSearchResult): SearchResult {
	// Parse file_path from R2 path: "gitingest/{org}/{repo}/summary.txt" → "summary.txt"
	// For now, use the full R2 path as file_path since gitingest processes entire repos
	// Phase 2 could add file-level indexing for more granular results
	const filePath = enriched.r2Path || "summary.txt";

	return {
		repository: enriched.repository.fullName,
		file_path: filePath,
		match_snippet: enriched.content,
		relevance_score: enriched.score,
		metadata: {
			language: enriched.metadata?.language || "Unknown",
			stars: 0, // Not available in R2 metadata (could add from repos.json in Phase 2)
			last_updated:
				enriched.metadata?.pushedAt || enriched.metadata?.processedAt || new Date().toISOString(),
			github_url: enriched.links.github,
		},
	};
}
