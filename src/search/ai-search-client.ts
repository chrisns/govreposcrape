/**
 * AI Search Client for Cloudflare Workers
 * Provides semantic search functionality over gitingest summaries using Cloudflare AI Search
 *
 * Features:
 * - Query validation (length, format)
 * - Retry logic with exponential backoff
 * - Structured JSON logging
 * - Performance monitoring
 * - Error handling with custom error types
 *
 * @example
 * ```typescript
 * import { searchCode } from './search/ai-search-client';
 *
 * const results = await searchCode(env, 'authentication methods', 5);
 * console.log(`Found ${results.length} results`);
 * ```
 */

import type { AISearchResult } from "../types";
import { ValidationError, ServiceError } from "../utils/error-handler";
import { createLogger } from "../utils/logger";

// Validation constants
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 500;
const MIN_LIMIT = 1;
const MAX_LIMIT = 20;

// AI Search index name (configured in Cloudflare Dashboard)
const AI_SEARCH_INDEX_NAME = "govreposcrape-search";

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // milliseconds

// Performance threshold
const SLOW_QUERY_THRESHOLD = 800; // milliseconds

/**
 * Sleep for specified milliseconds
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate search query string
 * @param query Search query to validate
 * @throws ValidationError if query is invalid
 */
export function validateQuery(query: string): void {
	if (!query || query.trim().length < MIN_QUERY_LENGTH) {
		throw new ValidationError(
			`Query must be at least ${MIN_QUERY_LENGTH} characters`,
			"QUERY_TOO_SHORT",
		);
	}

	if (query.length > MAX_QUERY_LENGTH) {
		throw new ValidationError(
			`Query must not exceed ${MAX_QUERY_LENGTH} characters`,
			"QUERY_TOO_LONG",
		);
	}
}

/**
 * Validate result limit parameter
 * @param limit Number of results to return
 * @throws ValidationError if limit is out of range
 */
export function validateLimit(limit: number): void {
	if (limit < MIN_LIMIT || limit > MAX_LIMIT) {
		throw new ValidationError(
			`Limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`,
			"INVALID_LIMIT",
		);
	}
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param operation Operation name for logging
 * @param requestId Request correlation ID
 * @returns Promise of function result
 * @throws ServiceError after max retries exceeded
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	operation: string,
	requestId: string,
): Promise<T> {
	const logger = createLogger({ operation, requestId });
	let lastError: Error;

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			logger.info("Retry attempt", {
				attempt: attempt + 1,
				maxRetries: MAX_RETRIES,
				error: lastError.message,
			});

			// Don't sleep after the last attempt
			if (attempt < MAX_RETRIES - 1) {
				await sleep(RETRY_DELAYS[attempt]);
			}
		}
	}

	// All retries failed
	throw new ServiceError(
		`AI Search service unavailable after ${MAX_RETRIES} attempts`,
		503,
		"SEARCH_ERROR",
		60, // retry_after in seconds
	);
}

/**
 * Execute semantic search query against indexed gitingest summaries
 *
 * Validates input parameters, executes query with retry logic,
 * logs performance metrics, and returns ranked results.
 *
 * @param env Workers environment with AI_SEARCH binding (Env from worker-configuration.d.ts)
 * @param query Natural language search query (3-500 chars)
 * @param limit Number of results to return (1-20)
 * @returns Array of search results ranked by similarity
 * @throws ValidationError if query/limit invalid
 * @throws ServiceError if AI Search unavailable after retries
 *
 * @example
 * ```typescript
 * const results = await searchCode(env, 'authentication methods', 5);
 * results.forEach(result => {
 *   console.log(`Score: ${result.score}, Path: ${result.metadata.path}`);
 * });
 * ```
 */
export async function searchCode(
	env: Env,
	query: string,
	limit: number = 5,
): Promise<AISearchResult[]> {
	// Generate correlation ID for distributed tracing
	const requestId = crypto.randomUUID();
	const startTime = Date.now();
	const logger = createLogger({ operation: "search", requestId });

	// Validate inputs before making any external calls
	validateQuery(query);
	validateLimit(limit);

	logger.info("AI Search query started", {
		query,
		limit,
	});

	try {
		// Execute query with retry logic
		// API usage: env.AI.autorag("index-name").search({ query, max_num_results })
		const response = await withRetry(
			() =>
				env.AI.autorag(AI_SEARCH_INDEX_NAME).search({
					query,
					max_num_results: limit,
				}),
			"ai_search_query",
			requestId,
		);

		const duration = Date.now() - startTime;
		const resultCount = response.data.length;

		// Log successful completion with performance metrics
		logger.info("AI Search query completed", {
			duration,
			resultCount,
			aiSearchTookMs: response.took_ms,
			searchQuery: response.search_query,
		});

		// Warn on slow queries for investigation
		if (duration > SLOW_QUERY_THRESHOLD) {
			logger.warn("Slow AI Search query detected", {
				duration,
				threshold: SLOW_QUERY_THRESHOLD,
				query,
			});
		}

		return response.data;
	} catch (error) {
		const duration = Date.now() - startTime;

		// Log query failure with context
		logger.error("AI Search query failed", {
			duration,
			error: error instanceof Error ? error.message : String(error),
			query,
		});

		// Re-throw the error for caller to handle
		throw error;
	}
}
