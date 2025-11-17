/**
 * Unit tests for metrics collection module
 *
 * Tests Story 6.3 acceptance criteria:
 * - AC-6.3.1: Custom metrics collection (cache hit rate, empty results, slow queries)
 * - AC-6.3.2: MVP success tracking and evaluation
 * - AC-6.3.3: Metrics alignment with PRD requirements
 *
 * Coverage goal: 80%+ on metrics.ts logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	createMetricsCollector,
	calculateCacheHitRate,
	calculateEmptyResultRate,
	calculateSlowQueryRate,
	trackCacheCheck,
	trackQueryResult,
	trackQueryDuration,
	trackError,
	generateMetricsSnapshot,
	evaluateMVPSuccess,
	type MetricsCollector,
} from "../../src/utils/metrics";

describe("Unit: Metrics Calculation Functions", () => {
	let collector: MetricsCollector;

	beforeEach(() => {
		collector = createMetricsCollector();
	});

	it("should calculate cache hit rate correctly", () => {
		// AC-6.3.1: Verify cache hit rate calculation
		collector.total_cache_checks = 100;
		collector.cache_hits = 92;

		const hitRate = calculateCacheHitRate(collector);

		expect(hitRate).toBe(92.0);
	});

	it("should return 0% hit rate when no cache checks performed", () => {
		const hitRate = calculateCacheHitRate(collector);
		expect(hitRate).toBe(0);
	});

	it("should calculate empty result rate correctly", () => {
		// AC-6.3.1: Verify empty result tracking
		collector.total_queries = 100;
		collector.queries_with_zero_results = 15;

		const emptyRate = calculateEmptyResultRate(collector);

		expect(emptyRate).toBe(15.0);
	});

	it("should return 0% empty rate when no queries performed", () => {
		const emptyRate = calculateEmptyResultRate(collector);
		expect(emptyRate).toBe(0);
	});

	it("should calculate slow query rate correctly", () => {
		// AC-6.3.1: Verify slow query tracking (>2s threshold)
		collector.total_queries = 100;
		collector.queries_over_2s = 3;

		const slowRate = calculateSlowQueryRate(collector);

		expect(slowRate).toBe(3.0);
	});

	it("should return 0% slow rate when no queries performed", () => {
		const slowRate = calculateSlowQueryRate(collector);
		expect(slowRate).toBe(0);
	});
});

describe("Unit: Metrics Tracking Functions", () => {
	let collector: MetricsCollector;

	beforeEach(() => {
		collector = createMetricsCollector();
	});

	it("should track cache hits", () => {
		// AC-6.3.1: Track cache efficiency metrics
		trackCacheCheck(collector, true);
		trackCacheCheck(collector, true);
		trackCacheCheck(collector, false);

		expect(collector.total_cache_checks).toBe(3);
		expect(collector.cache_hits).toBe(2);
		expect(calculateCacheHitRate(collector)).toBeCloseTo(66.67, 1);
	});

	it("should track query results with empty results", () => {
		// AC-6.3.1: Track empty result rate
		trackQueryResult(collector, 5); // Query with results
		trackQueryResult(collector, 0); // Empty result
		trackQueryResult(collector, 3); // Query with results
		trackQueryResult(collector, 0); // Empty result

		expect(collector.total_queries).toBe(4);
		expect(collector.queries_with_zero_results).toBe(2);
		expect(calculateEmptyResultRate(collector)).toBe(50.0);
	});

	it("should track slow query durations", () => {
		// AC-6.3.1: Track slow queries (>2s threshold)
		trackQueryDuration(collector, 1200); // Fast query (1.2s)
		trackQueryDuration(collector, 2500); // Slow query (2.5s)
		trackQueryDuration(collector, 1800); // Fast query (1.8s)
		trackQueryDuration(collector, 3000); // Slow query (3.0s)

		expect(collector.queries_over_2s).toBe(2);
	});

	it("should track error types breakdown", () => {
		// AC-6.3.1: Track error types for analysis
		trackError(collector, "VALIDATION_ERROR");
		trackError(collector, "AI_SEARCH_TIMEOUT");
		trackError(collector, "VALIDATION_ERROR");
		trackError(collector, "SERVICE_ERROR");

		expect(collector.errors_by_type["VALIDATION_ERROR"]).toBe(2);
		expect(collector.errors_by_type["AI_SEARCH_TIMEOUT"]).toBe(1);
		expect(collector.errors_by_type["SERVICE_ERROR"]).toBe(1);
	});
});

describe("Unit: Metrics Snapshot Generation", () => {
	let collector: MetricsCollector;

	beforeEach(() => {
		collector = createMetricsCollector();
		// Simulate metrics collection
		collector.total_cache_checks = 100;
		collector.cache_hits = 92;
		collector.total_queries = 100;
		collector.queries_with_zero_results = 12;
		collector.queries_over_2s = 3;
	});

	it("should generate metrics snapshot with correct structure", () => {
		// AC-6.3.3: Verify metrics format matches ObservabilityMetrics interface
		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456, // p50
			1234, // p95
			1876, // p99
			0.04, // 0.04% error rate
		);

		expect(snapshot).toHaveProperty("period", "2025-11-15");
		expect(snapshot).toHaveProperty("query_volume", 100);
		expect(snapshot).toHaveProperty("response_time_p50", 456);
		expect(snapshot).toHaveProperty("response_time_p95", 1234);
		expect(snapshot).toHaveProperty("response_time_p99", 1876);
		expect(snapshot).toHaveProperty("error_rate", 0.04);
		expect(snapshot).toHaveProperty("cache_hit_rate", 92);
		expect(snapshot).toHaveProperty("empty_result_rate", 12);
		expect(snapshot).toHaveProperty("slow_query_rate", 3);
	});

	it("should generate MVP success metrics when weekly data provided", () => {
		// AC-6.3.2: MVP success criteria tracking
		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1234,
			1876,
			0.04,
			250, // weekly queries
			220, // previous week
		);

		expect(snapshot.mvp_success_metrics).toBeDefined();
		expect(snapshot.mvp_success_metrics?.weekly_queries).toBe(250);
		expect(snapshot.mvp_success_metrics?.adoption_trend).toBe("increasing");
		expect(snapshot.mvp_success_metrics?.performance_compliance).toBe(true);
		expect(snapshot.mvp_success_metrics?.reliability_compliance).toBe(true);
		expect(snapshot.mvp_success_metrics?.cache_efficiency_compliance).toBe(true);
	});

	it("should detect performance non-compliance when p95 > 2s", () => {
		// AC-6.3.3: Test NFR-1.1 performance requirement (<2s p95)
		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			2500, // p95 exceeds 2s threshold
			3000,
			0.04,
			250,
			220,
		);

		expect(snapshot.mvp_success_metrics?.performance_compliance).toBe(false);
	});

	it("should detect reliability non-compliance when error rate > 1%", () => {
		// AC-6.3.3: Test NFR-6.3 reliability requirement (<1% error rate)
		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1234,
			1876,
			1.5, // error rate exceeds 1% threshold
			250,
			220,
		);

		expect(snapshot.mvp_success_metrics?.reliability_compliance).toBe(false);
	});

	it("should detect cache efficiency non-compliance when hit rate < 90%", () => {
		// AC-6.3.3: Test NFR-1.4 cache efficiency requirement (>90% hit rate)
		collector.cache_hits = 85; // 85% hit rate

		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1234,
			1876,
			0.04,
			250,
			220,
		);

		expect(snapshot.mvp_success_metrics?.cache_efficiency_compliance).toBe(false);
	});

	it("should detect adoption trend correctly", () => {
		// AC-6.3.2: Adoption trend tracking
		const increasing = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1234,
			1876,
			0.04,
			250,
			200, // >5% growth
		);
		expect(increasing.mvp_success_metrics?.adoption_trend).toBe("increasing");

		const decreasing = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1234,
			1876,
			0.04,
			180,
			200, // >5% decline
		);
		expect(decreasing.mvp_success_metrics?.adoption_trend).toBe("decreasing");

		const stable = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1234,
			1876,
			0.04,
			202,
			200, // <5% change
		);
		expect(stable.mvp_success_metrics?.adoption_trend).toBe("stable");
	});
});

describe("Unit: MVP Success Evaluation", () => {
	let collector: MetricsCollector;

	beforeEach(() => {
		collector = createMetricsCollector();
		collector.total_cache_checks = 100;
		collector.cache_hits = 92;
		collector.total_queries = 100;
	});

	it("should evaluate MVP success when all criteria met", () => {
		// AC-6.3.2 & AC-6.3.3: Validate all MVP criteria
		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1800, // p95 < 2s ✓
			2000,
			0.05, // error rate < 1% ✓
			250, // weekly queries >= 200 ✓
			220, // adoption increasing ✓
		);

		const success = evaluateMVPSuccess(snapshot);
		expect(success).toBe(true);
	});

	it("should fail MVP when weekly queries below threshold", () => {
		// AC-6.3.2: "Hundreds of uses per week" = 200+ queries
		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1800,
			2000,
			0.05,
			150, // Below 200 threshold
			140,
		);

		const success = evaluateMVPSuccess(snapshot);
		expect(success).toBe(false);
	});

	it("should fail MVP when performance degraded", () => {
		// AC-6.3.2: Performance compliance (p95 < 2s)
		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			2500, // p95 exceeds 2s
			3000,
			0.05,
			250,
			220,
		);

		const success = evaluateMVPSuccess(snapshot);
		expect(success).toBe(false);
	});

	it("should fail MVP when adoption declining", () => {
		// AC-6.3.2: Adoption trend monitoring
		const snapshot = generateMetricsSnapshot(
			collector,
			"2025-11-15",
			456,
			1800,
			2000,
			0.05,
			250,
			300, // Decreasing trend
		);

		const success = evaluateMVPSuccess(snapshot);
		expect(success).toBe(false);
	});

	it("should return false when MVP metrics not available", () => {
		// AC-6.3.2: Cannot evaluate without MVP data
		const snapshot = generateMetricsSnapshot(collector, "2025-11-15", 456, 1800, 2000, 0.05);

		const success = evaluateMVPSuccess(snapshot);
		expect(success).toBe(false);
	});
});
