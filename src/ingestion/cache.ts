/**
 * Smart Caching Module - Story 2.2
 * Implements KV-based caching to achieve 90%+ cache hit rate
 *
 * Strategy: Only reprocess repositories when pushedAt timestamp changes
 * Performance: Low latency KV reads (<10ms), eventually consistent writes (1-60s)
 * Error Handling: Cache read failures treated as miss (fail-safe), write failures retried
 */

import type { RepoMetadata, CacheEntry, CacheCheckResult, CacheStats } from "../types";
import { createLogger } from "../utils/logger";
import { withRetry } from "../utils/retry";

const logger = createLogger({ operation: "cache" });

/**
 * In-memory cache statistics for the current run
 * Reset on Worker restart
 */
let cacheStats: CacheStats = {
	totalChecks: 0,
	hits: 0,
	misses: 0,
	hitRate: 0,
};

/**
 * Generate KV cache key from repository metadata
 * Pattern: `repo:{org}/{name}`
 *
 * @param org - GitHub organization name
 * @param name - Repository name
 * @returns KV cache key
 *
 * @example
 * ```typescript
 * const key = getCacheKey("alphagov", "govuk-frontend");
 * // Returns: "repo:alphagov/govuk-frontend"
 * ```
 */
export function getCacheKey(org: string, name: string): string {
	return `repo:${org}/${name}`;
}

/**
 * Check if repository needs processing by comparing pushedAt timestamps
 * Queries KV for cached entry and compares timestamps
 *
 * Cache Decision Logic:
 * - No cache entry → needs processing (cache miss)
 * - pushedAt matches → skip processing (cache hit)
 * - pushedAt differs → needs processing (stale cache)
 * - KV read error → needs processing (fail-safe)
 *
 * @param repo - Repository metadata from repos.json
 * @param kv - KV namespace binding
 * @returns Cache check result with needsProcessing flag and reason
 *
 * @example
 * ```typescript
 * const result = await checkCache(repo, env.CACHE_KV);
 * if (!result.needsProcessing) {
 *   logger.info("Skipping cached repository", { repo: repo.name });
 * }
 * ```
 */
export async function checkCache(repo: RepoMetadata, kv: KVNamespace): Promise<CacheCheckResult> {
	const key = getCacheKey(repo.org, repo.name);
	cacheStats.totalChecks++;

	try {
		logger.debug("Checking cache", {
			repo: `${repo.org}/${repo.name}`,
			key,
		});

		const cached = await kv.get<CacheEntry>(key, "json");

		if (!cached) {
			cacheStats.misses++;
			logger.info("Cache miss - no entry", {
				repo: `${repo.org}/${repo.name}`,
			});
			return {
				needsProcessing: true,
				reason: "cache-miss",
			};
		}

		// Validate cache entry structure
		if (!cached.pushedAt || !cached.processedAt || !cached.status) {
			cacheStats.misses++;
			logger.warn("Cache miss - malformed entry", {
				repo: `${repo.org}/${repo.name}`,
				cached,
			});
			return {
				needsProcessing: true,
				reason: "cache-miss",
			};
		}

		if (cached.pushedAt === repo.pushedAt) {
			cacheStats.hits++;
			logger.info("Cache hit", {
				repo: `${repo.org}/${repo.name}`,
				cachedPushedAt: cached.pushedAt,
			});
			return {
				needsProcessing: false,
				reason: "cache-hit",
				cachedEntry: cached,
			};
		}

		cacheStats.misses++;
		logger.info("Cache stale - pushedAt changed", {
			repo: `${repo.org}/${repo.name}`,
			cachedPushedAt: cached.pushedAt,
			currentPushedAt: repo.pushedAt,
		});
		return {
			needsProcessing: true,
			reason: "stale-cache",
			cachedEntry: cached,
		};
	} catch (error) {
		// Treat KV read errors as cache miss (fail-safe)
		cacheStats.misses++;
		logger.error("Cache check failed - treating as miss", {
			repo: `${repo.org}/${repo.name}`,
			error: error instanceof Error ? error.message : String(error),
		});
		return {
			needsProcessing: true,
			reason: "cache-miss",
		};
	}
}

/**
 * Update cache after successful repository processing
 * Writes cache entry to KV with retry logic for resilience
 *
 * Cache Entry Structure:
 * - pushedAt: Timestamp from repos.json
 * - processedAt: Current timestamp
 * - status: "complete"
 *
 * @param repo - Repository metadata from repos.json
 * @param kv - KV namespace binding
 * @returns Promise that resolves when cache is updated
 *
 * @example
 * ```typescript
 * await processRepository(repo);
 * await updateCache(repo, env.CACHE_KV);
 * logger.info("Repository processed and cached", { repo: repo.name });
 * ```
 */
export async function updateCache(repo: RepoMetadata, kv: KVNamespace): Promise<void> {
	const key = getCacheKey(repo.org, repo.name);

	const entry: CacheEntry = {
		pushedAt: repo.pushedAt,
		processedAt: new Date().toISOString(),
		status: "complete",
	};

	try {
		await withRetry(
			async () => {
				await kv.put(key, JSON.stringify(entry));
			},
			3,
			[1000, 2000, 4000],
		);

		logger.info("Cache updated", {
			repo: `${repo.org}/${repo.name}`,
			pushedAt: repo.pushedAt,
		});
	} catch (error) {
		// Log error but don't throw - cache write failure shouldn't block processing
		logger.error("Cache update failed after retries", {
			repo: `${repo.org}/${repo.name}`,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Get current cache performance statistics
 * Calculates hit rate percentage: (hits / totalChecks) * 100
 *
 * Statistics tracked in-memory per Worker instance:
 * - totalChecks: Total cache check operations
 * - hits: Successful cache hits (no reprocessing needed)
 * - misses: Cache misses + stale cache (reprocessing needed)
 * - hitRate: Percentage of hits (target: 90%+)
 *
 * @returns Current cache statistics
 *
 * @example
 * ```typescript
 * const stats = getCacheStats();
 * logger.info("Cache performance", {
 *   hitRate: `${stats.hitRate.toFixed(1)}%`,
 *   checks: stats.totalChecks,
 * });
 * ```
 */
export function getCacheStats(): CacheStats {
	const hitRate = cacheStats.totalChecks > 0 ? (cacheStats.hits / cacheStats.totalChecks) * 100 : 0;

	return {
		...cacheStats,
		hitRate,
	};
}

/**
 * Reset cache statistics
 * Useful for testing and periodic statistics reporting
 *
 * @example
 * ```typescript
 * resetCacheStats();
 * // Process batch of repositories
 * const stats = getCacheStats();
 * logger.info("Batch cache performance", stats);
 * ```
 */
export function resetCacheStats(): void {
	cacheStats = {
		totalChecks: 0,
		hits: 0,
		misses: 0,
		hitRate: 0,
	};
	logger.debug("Cache statistics reset");
}
