/**
 * Custom Metrics Collection for govscraperepo Observability Dashboard
 *
 * Extends Cloudflare Workers Analytics with custom tracking:
 * - Cache hit rate (KV cache efficiency)
 * - Empty result rate (queries returning zero results)
 * - Slow query rate (queries exceeding 2s threshold)
 * - Error type breakdown (categorized error tracking)
 *
 * Metrics are emitted via structured JSON logging (src/utils/logger.ts)
 * compatible with Cloudflare Workers log streaming.
 *
 * @see Story 6.3: Observability Dashboard - Key Metrics and KPIs
 * @see docs/PRD.md - FR-8 (usage metrics), NFR-1 (performance), NFR-6 (reliability)
 */

import type { Logger } from "./logger";

/**
 * Observability metrics snapshot for a given period
 * Aligned with PRD success criteria and MVP targets
 */
export interface ObservabilityMetrics {
	/** Time period for these metrics (e.g., "2025-11-15", "2025-W46") */
	period: string;
	/** Total query volume in the period */
	query_volume: number;
	/** Unique users (optional, if trackable) */
	unique_users?: number;
	/** 50th percentile response time (milliseconds) */
	response_time_p50: number;
	/** 95th percentile response time (milliseconds) - <2000ms target (NFR-1.1) */
	response_time_p95: number;
	/** 99th percentile response time (milliseconds) */
	response_time_p99: number;
	/** Error rate as percentage (0-100) - <1% target (NFR-6.3) */
	error_rate: number;
	/** Cache hit rate as percentage (0-100) - 90%+ target (NFR-1.4) */
	cache_hit_rate: number;
	/** Empty result rate as percentage (0-100) */
	empty_result_rate: number;
	/** Slow query rate as percentage (0-100) - queries >2s */
	slow_query_rate: number;
	/** MVP success metrics */
	mvp_success_metrics?: MVPSuccessMetrics;
}

/**
 * MVP success criteria metrics
 * Tracks "hundreds of uses per week" and performance/reliability targets
 */
export interface MVPSuccessMetrics {
	/** Weekly query volume (target: 200+ queries/week = "hundreds") */
	weekly_queries: number;
	/** Adoption trend: increasing, stable, decreasing */
	adoption_trend: "increasing" | "stable" | "decreasing";
	/** Performance compliance: p95 < 2s (NFR-1.1) */
	performance_compliance: boolean;
	/** Reliability compliance: error rate < 1% (NFR-6.3) */
	reliability_compliance: boolean;
	/** Cache efficiency compliance: hit rate > 90% (NFR-1.4) */
	cache_efficiency_compliance: boolean;
}

/**
 * Custom metrics collector state
 * Tracks counters for cache hits, empty results, and slow queries
 */
export interface MetricsCollector {
	/** Total cache checks performed */
	total_cache_checks: number;
	/** Successful cache hits */
	cache_hits: number;
	/** Total queries executed */
	total_queries: number;
	/** Queries returning zero results */
	queries_with_zero_results: number;
	/** Queries exceeding 2-second threshold */
	queries_over_2s: number;
	/** Error count by type */
	errors_by_type: Record<string, number>;
}

/**
 * Calculate cache hit rate from collector state
 *
 * @param collector - Metrics collector with cache statistics
 * @returns Cache hit rate as percentage (0-100)
 *
 * @example
 * ```typescript
 * const collector = { total_cache_checks: 100, cache_hits: 92, ... };
 * const hitRate = calculateCacheHitRate(collector);
 * // hitRate = 92.0
 * ```
 */
export function calculateCacheHitRate(collector: MetricsCollector): number {
	if (collector.total_cache_checks === 0) {
		return 0;
	}
	return (collector.cache_hits / collector.total_cache_checks) * 100;
}

/**
 * Calculate empty result rate from collector state
 *
 * @param collector - Metrics collector with query statistics
 * @returns Empty result rate as percentage (0-100)
 *
 * @example
 * ```typescript
 * const collector = { total_queries: 100, queries_with_zero_results: 15, ... };
 * const emptyRate = calculateEmptyResultRate(collector);
 * // emptyRate = 15.0
 * ```
 */
export function calculateEmptyResultRate(collector: MetricsCollector): number {
	if (collector.total_queries === 0) {
		return 0;
	}
	return (collector.queries_with_zero_results / collector.total_queries) * 100;
}

/**
 * Calculate slow query rate from collector state
 *
 * @param collector - Metrics collector with query timing statistics
 * @returns Slow query rate as percentage (0-100)
 *
 * @example
 * ```typescript
 * const collector = { total_queries: 100, queries_over_2s: 3, ... };
 * const slowRate = calculateSlowQueryRate(collector);
 * // slowRate = 3.0
 * ```
 */
export function calculateSlowQueryRate(collector: MetricsCollector): number {
	if (collector.total_queries === 0) {
		return 0;
	}
	return (collector.queries_over_2s / collector.total_queries) * 100;
}

/**
 * Track cache check result and update collector state
 *
 * Increments total cache checks and hits counters.
 * Integrates with Epic 2 caching (KV-based smart caching).
 *
 * @param collector - Metrics collector to update
 * @param hit - Whether cache check resulted in a hit (true) or miss (false)
 * @param logger - Optional logger for structured logging
 *
 * @example
 * ```typescript
 * const collector = createMetricsCollector();
 * const logger = createLogger({ operation: 'cache_check' });
 *
 * // Cache hit
 * trackCacheCheck(collector, true, logger);
 *
 * // Cache miss
 * trackCacheCheck(collector, false, logger);
 * ```
 */
export function trackCacheCheck(collector: MetricsCollector, hit: boolean, logger?: Logger): void {
	collector.total_cache_checks++;
	if (hit) {
		collector.cache_hits++;
	}

	if (logger) {
		logger.debug("Cache check tracked", {
			hit,
			total_checks: collector.total_cache_checks,
			hits: collector.cache_hits,
			hit_rate: calculateCacheHitRate(collector).toFixed(2),
		});
	}
}

/**
 * Track query result and update collector state
 *
 * Increments total queries counter and tracks empty results.
 * Used to monitor query quality and relevance.
 *
 * @param collector - Metrics collector to update
 * @param resultCount - Number of results returned by the query
 * @param logger - Optional logger for structured logging
 *
 * @example
 * ```typescript
 * const collector = createMetricsCollector();
 * const logger = createLogger({ operation: 'execute_search' });
 *
 * // Query with results
 * trackQueryResult(collector, 5, logger);
 *
 * // Query with no results
 * trackQueryResult(collector, 0, logger);
 * ```
 */
export function trackQueryResult(
	collector: MetricsCollector,
	resultCount: number,
	logger?: Logger,
): void {
	collector.total_queries++;
	if (resultCount === 0) {
		collector.queries_with_zero_results++;
	}

	if (logger) {
		logger.debug("Query result tracked", {
			result_count: resultCount,
			empty: resultCount === 0,
			total_queries: collector.total_queries,
			empty_rate: calculateEmptyResultRate(collector).toFixed(2),
		});
	}
}

/**
 * Track query duration and update collector state
 *
 * Increments slow query counter if duration exceeds 2-second threshold (NFR-1.1).
 * Helps identify performance degradation and optimization opportunities.
 *
 * @param collector - Metrics collector to update
 * @param durationMs - Query execution time in milliseconds
 * @param logger - Optional logger for structured logging
 *
 * @example
 * ```typescript
 * const collector = createMetricsCollector();
 * const logger = createLogger({ operation: 'execute_search' });
 *
 * // Fast query (1.2s)
 * trackQueryDuration(collector, 1200, logger);
 *
 * // Slow query (2.5s)
 * trackQueryDuration(collector, 2500, logger);
 * ```
 */
export function trackQueryDuration(
	collector: MetricsCollector,
	durationMs: number,
	logger?: Logger,
): void {
	const SLOW_QUERY_THRESHOLD_MS = 2000; // NFR-1.1: <2s p95 target

	if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
		collector.queries_over_2s++;

		if (logger) {
			logger.warn("Slow query detected", {
				duration_ms: durationMs,
				threshold_ms: SLOW_QUERY_THRESHOLD_MS,
				slow_query_rate: calculateSlowQueryRate(collector).toFixed(2),
			});
		}
	} else if (logger) {
		logger.debug("Query duration tracked", {
			duration_ms: durationMs,
			slow: false,
		});
	}
}

/**
 * Track error by type and update collector state
 *
 * Categorizes errors for analysis (validation, AI Search timeout, service errors, etc.).
 * Helps identify systemic issues and prioritize fixes.
 *
 * @param collector - Metrics collector to update
 * @param errorType - Error category (e.g., "VALIDATION_ERROR", "AI_SEARCH_TIMEOUT", "SERVICE_ERROR")
 * @param logger - Optional logger for structured logging
 *
 * @example
 * ```typescript
 * const collector = createMetricsCollector();
 * const logger = createLogger({ operation: 'error_handler' });
 *
 * // Track validation error
 * trackError(collector, "VALIDATION_ERROR", logger);
 *
 * // Track AI Search timeout
 * trackError(collector, "AI_SEARCH_TIMEOUT", logger);
 * ```
 */
export function trackError(collector: MetricsCollector, errorType: string, logger?: Logger): void {
	if (!collector.errors_by_type[errorType]) {
		collector.errors_by_type[errorType] = 0;
	}
	collector.errors_by_type[errorType]++;

	if (logger) {
		logger.debug("Error tracked", {
			error_type: errorType,
			count: collector.errors_by_type[errorType],
			total_error_types: Object.keys(collector.errors_by_type).length,
		});
	}
}

/**
 * Create a new metrics collector instance
 *
 * Initializes all counters to zero for tracking session metrics.
 *
 * @returns Fresh metrics collector with zero counters
 *
 * @example
 * ```typescript
 * const collector = createMetricsCollector();
 * // collector = { total_cache_checks: 0, cache_hits: 0, ... }
 * ```
 */
export function createMetricsCollector(): MetricsCollector {
	return {
		total_cache_checks: 0,
		cache_hits: 0,
		total_queries: 0,
		queries_with_zero_results: 0,
		queries_over_2s: 0,
		errors_by_type: {},
	};
}

/**
 * Generate observability metrics snapshot from collector state
 *
 * Aggregates collected metrics into a structured snapshot for export or reporting.
 * Calculates derived metrics (rates, percentages) and validates against MVP targets.
 *
 * @param collector - Metrics collector with accumulated statistics
 * @param period - Time period identifier (e.g., "2025-11-15", "2025-W46")
 * @param p50 - 50th percentile response time (milliseconds)
 * @param p95 - 95th percentile response time (milliseconds)
 * @param p99 - 99th percentile response time (milliseconds)
 * @param errorRate - Error rate as percentage (0-100)
 * @param weeklyQueries - Optional weekly query volume for MVP tracking
 * @param previousWeeklyQueries - Optional previous week's query volume for trend analysis
 * @returns Observability metrics snapshot
 *
 * @example
 * ```typescript
 * const collector = createMetricsCollector();
 * // ... accumulate metrics via track*() functions ...
 *
 * const snapshot = generateMetricsSnapshot(
 *   collector,
 *   "2025-11-15",
 *   456, // p50
 *   1234, // p95
 *   1876, // p99
 *   0.04, // 0.04% error rate
 *   234, // weekly queries
 *   198 // previous week
 * );
 * ```
 */
export function generateMetricsSnapshot(
	collector: MetricsCollector,
	period: string,
	p50: number,
	p95: number,
	p99: number,
	errorRate: number,
	weeklyQueries?: number,
	previousWeeklyQueries?: number,
): ObservabilityMetrics {
	const cacheHitRate = calculateCacheHitRate(collector);
	const emptyResultRate = calculateEmptyResultRate(collector);
	const slowQueryRate = calculateSlowQueryRate(collector);

	const metrics: ObservabilityMetrics = {
		period,
		query_volume: collector.total_queries,
		response_time_p50: p50,
		response_time_p95: p95,
		response_time_p99: p99,
		error_rate: errorRate,
		cache_hit_rate: cacheHitRate,
		empty_result_rate: emptyResultRate,
		slow_query_rate: slowQueryRate,
	};

	// Calculate MVP success metrics if weekly data available
	if (weeklyQueries !== undefined) {
		const performanceCompliance = p95 < 2000; // NFR-1.1: <2s p95
		const reliabilityCompliance = errorRate < 1; // NFR-6.3: <1% error rate
		const cacheEfficiencyCompliance = cacheHitRate > 90; // NFR-1.4: >90% hit rate

		let adoptionTrend: "increasing" | "stable" | "decreasing" = "stable";
		if (previousWeeklyQueries !== undefined) {
			const growth = ((weeklyQueries - previousWeeklyQueries) / previousWeeklyQueries) * 100;
			if (growth > 5) {
				adoptionTrend = "increasing";
			} else if (growth < -5) {
				adoptionTrend = "decreasing";
			}
		}

		metrics.mvp_success_metrics = {
			weekly_queries: weeklyQueries,
			adoption_trend: adoptionTrend,
			performance_compliance: performanceCompliance,
			reliability_compliance: reliabilityCompliance,
			cache_efficiency_compliance: cacheEfficiencyCompliance,
		};
	}

	return metrics;
}

/**
 * Evaluate MVP success criteria from metrics snapshot
 *
 * Validates metrics against PRD targets:
 * - Weekly query volume: ≥200 queries/week ("hundreds")
 * - Performance: p95 <2s (NFR-1.1)
 * - Reliability: error rate <1% (NFR-6.3)
 * - Cache efficiency: hit rate >90% (NFR-1.4)
 *
 * @param metrics - Observability metrics snapshot
 * @returns true if all MVP criteria met, false otherwise
 *
 * @example
 * ```typescript
 * const metrics = generateMetricsSnapshot(...);
 * const mvpSuccess = evaluateMVPSuccess(metrics);
 *
 * if (!mvpSuccess) {
 *   console.log("MVP success criteria NOT met - review metrics");
 * }
 * ```
 */
export function evaluateMVPSuccess(metrics: ObservabilityMetrics): boolean {
	if (!metrics.mvp_success_metrics) {
		return false; // Cannot evaluate without MVP metrics
	}

	const mvp = metrics.mvp_success_metrics;
	const MIN_WEEKLY_QUERIES = 200; // "Hundreds of uses per week" = 200+ queries

	return (
		mvp.weekly_queries >= MIN_WEEKLY_QUERIES &&
		mvp.performance_compliance &&
		mvp.reliability_compliance &&
		mvp.cache_efficiency_compliance &&
		mvp.adoption_trend !== "decreasing"
	);
}
