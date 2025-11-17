/**
 * Cache Proxy API - Quality Story 1 Fix
 * Provides HTTP endpoints for Docker containers to access Workers KV namespace
 *
 * Architecture: Docker Container → HTTP → Worker KV Proxy → KV Namespace
 *
 * Endpoints:
 * - GET /cache/:org/:repo - Check if repository is cached
 * - PUT /cache/:org/:repo - Update cache after processing
 * - GET /cache/stats - Get cache statistics
 */

import type { CacheEntry } from "../types";
import { createLogger } from "../utils/logger";
import { checkCache, updateCache, getCacheStats } from "../ingestion/cache";

const logger = createLogger({ operation: "cache-proxy" });

/**
 * Parse org and repo from URL path
 * Expected format: /cache/:org/:repo
 *
 * @param pathname - URL pathname
 * @returns Object with org and repo, or null if invalid
 */
function parseOrgRepo(pathname: string): { org: string; repo: string } | null {
	const match = pathname.match(/^\/cache\/([^/]+)\/([^/]+)$/);
	if (!match) {
		return null;
	}

	return {
		org: decodeURIComponent(match[1]),
		repo: decodeURIComponent(match[2]),
	};
}

/**
 * GET /cache/:org/:repo
 * Check if repository exists in cache
 *
 * Response:
 * - 200: Cache entry found { pushedAt, processedAt, status }
 * - 404: Not in cache or stale
 * - 400: Invalid parameters
 * - 500: Server error
 */
export async function getCacheEntry(url: URL, env: Env, requestId: string): Promise<Response> {
	const parsed = parseOrgRepo(url.pathname);

	if (!parsed) {
		logger.warn("Invalid cache GET request", {
			requestId,
			path: url.pathname,
		});
		return new Response(
			JSON.stringify({
				error: {
					code: "INVALID_PATH",
					message: "Expected format: /cache/:org/:repo",
				},
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const { org, repo } = parsed;

	try {
		// Check pushedAt from query parameter (required for cache comparison)
		const pushedAt = url.searchParams.get("pushedAt");
		if (!pushedAt) {
			return new Response(
				JSON.stringify({
					error: {
						code: "MISSING_PUSHED_AT",
						message: "Query parameter 'pushedAt' is required",
					},
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Use existing cache checking logic
		const result = await checkCache(
			{ org, name: repo, pushedAt, url: `https://github.com/${org}/${repo}` },
			env.KV,
		);

		if (result.needsProcessing) {
			// Cache miss or stale - return 404
			logger.info("Cache proxy: miss/stale", {
				requestId,
				org,
				repo,
				reason: result.reason,
			});

			return new Response(
				JSON.stringify({
					needsProcessing: true,
					reason: result.reason,
				}),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Cache hit - return entry
		logger.info("Cache proxy: hit", {
			requestId,
			org,
			repo,
		});

		return new Response(JSON.stringify(result.cachedEntry), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		logger.error("Cache GET failed", {
			requestId,
			org,
			repo,
			error: error instanceof Error ? error.message : String(error),
		});

		return new Response(
			JSON.stringify({
				error: {
					code: "CACHE_READ_ERROR",
					message: "Failed to read from cache",
				},
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

/**
 * PUT /cache/:org/:repo
 * Update cache entry after successful processing
 *
 * Request Body:
 * {
 *   pushedAt: string,      // ISO 8601 timestamp from repos.json
 *   processedAt: string,   // ISO 8601 timestamp when processed
 *   status: string         // "complete"
 * }
 *
 * Response:
 * - 204: Cache updated successfully
 * - 400: Invalid parameters or body
 * - 500: Server error
 */
export async function putCacheEntry(
	url: URL,
	request: Request,
	env: Env,
	requestId: string,
): Promise<Response> {
	const parsed = parseOrgRepo(url.pathname);

	if (!parsed) {
		logger.warn("Invalid cache PUT request", {
			requestId,
			path: url.pathname,
		});
		return new Response(
			JSON.stringify({
				error: {
					code: "INVALID_PATH",
					message: "Expected format: /cache/:org/:repo",
				},
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const { org, repo } = parsed;

	try {
		// Parse request body
		const body = (await request.json()) as CacheEntry;

		if (!body.pushedAt || !body.processedAt || !body.status) {
			return new Response(
				JSON.stringify({
					error: {
						code: "INVALID_BODY",
						message: "Request body must include: pushedAt, processedAt, status",
					},
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Use existing cache update logic
		await updateCache(
			{ org, name: repo, pushedAt: body.pushedAt, url: `https://github.com/${org}/${repo}` },
			env.KV,
		);

		logger.info("Cache proxy: updated", {
			requestId,
			org,
			repo,
			pushedAt: body.pushedAt,
		});

		return new Response(null, {
			status: 204,
		});
	} catch (error) {
		logger.error("Cache PUT failed", {
			requestId,
			org,
			repo,
			error: error instanceof Error ? error.message : String(error),
		});

		return new Response(
			JSON.stringify({
				error: {
					code: "CACHE_WRITE_ERROR",
					message: "Failed to update cache",
				},
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

/**
 * GET /cache/stats
 * Get cache performance statistics
 *
 * Response:
 * {
 *   totalChecks: number,
 *   hits: number,
 *   misses: number,
 *   hitRate: number  // percentage
 * }
 */
export async function getCacheStatistics(requestId: string): Promise<Response> {
	const stats = getCacheStats();

	logger.info("Cache stats requested", {
		requestId,
		hitRate: `${stats.hitRate.toFixed(1)}%`,
	});

	return new Response(JSON.stringify(stats), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}
