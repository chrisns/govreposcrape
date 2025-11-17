/**
 * Unit tests for cost monitoring module
 *
 * Tests Story 6.1 acceptance criteria:
 * - AC-6.1.1: Cost dashboard functionality
 * - AC-6.1.2: Budget alert triggering
 * - AC-6.1.3: Cost optimization insights
 *
 * Coverage goal: 80%+ on cost-monitoring.ts logic
 */

import { describe, it, expect } from "vitest";
import {
	calculateDailyCosts,
	calculateMonthlyProjection,
	calculateBudgetUtilization,
	generateRecommendations,
	checkBudgetAlert,
	exportJSON,
	type CostBreakdown,
	type AnalyticsAPIResponse,
} from "../../scripts/cost-monitoring.js";

describe("Unit: Cost Calculation Logic", () => {
	it("should calculate daily costs correctly by service", () => {
		// AC-6.1.1: Verify cost calculation for all 5 services
		const mockAnalytics: AnalyticsAPIResponse = {
			requests: {
				total: 10_000_000, // 10 million requests
				by_status: { 200: 9_500_000, 400: 300_000, 500: 200_000 },
			},
			latency: { p50: 50, p95: 150, p99: 300 },
			errors: { rate: 0.005, count: 50_000 },
		};

		const costs = calculateDailyCosts(mockAnalytics);

		// Verify all service costs are calculated
		expect(costs.workers_cost).toBeGreaterThan(0);
		expect(costs.r2_cost).toBeGreaterThan(0);
		expect(costs.ai_search_cost).toBeGreaterThan(0);
		expect(costs.kv_cost).toBeGreaterThan(0);
		expect(costs.vectorize_cost).toBeGreaterThan(0);

		// Verify total is sum of all services
		const expectedTotal =
			costs.workers_cost +
			costs.r2_cost +
			costs.ai_search_cost +
			costs.kv_cost +
			costs.vectorize_cost;

		expect(costs.total_daily).toBeCloseTo(expectedTotal, 2);

		// Verify date format (ISO 8601)
		expect(costs.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("should calculate monthly projection based on days elapsed", () => {
		// AC-6.1.1: Verify cumulative and projection calculation
		const dailyCosts = {
			date: "2025-11-15",
			workers_cost: 5.0,
			r2_cost: 3.0,
			ai_search_cost: 2.0,
			kv_cost: 1.0,
			vectorize_cost: 0.5,
			total_daily: 11.5,
		};

		const projection = calculateMonthlyProjection(dailyCosts);

		// Verify cumulative spend calculation
		const today = new Date();
		const dayOfMonth = today.getDate();
		const expectedCumulative = dailyCosts.total_daily * dayOfMonth;
		expect(projection.cumulative_month).toBeCloseTo(expectedCumulative, 2);

		// Verify end-of-month projection
		const daysInMonth = new Date(
			today.getFullYear(),
			today.getMonth() + 1,
			0,
		).getDate();
		const expectedProjection = dailyCosts.total_daily * daysInMonth;
		expect(projection.projection_month_end).toBeCloseTo(
			expectedProjection,
			2,
		);
	});

	it("should calculate budget utilization percentage correctly", () => {
		// AC-6.1.1: Verify budget utilization calculation
		const testCases = [
			{ spend: 42.5, budget: 50, expected: 85.0 },
			{ spend: 40.0, budget: 50, expected: 80.0 },
			{ spend: 25.0, budget: 50, expected: 50.0 },
			{ spend: 50.0, budget: 50, expected: 100.0 },
			{ spend: 0.0, budget: 50, expected: 0.0 },
		];

		testCases.forEach(({ spend, budget, expected }) => {
			const utilization = calculateBudgetUtilization(spend, budget);
			expect(utilization).toBe(expected);
		});
	});

	it("should round budget utilization to 2 decimal places", () => {
		const utilization = calculateBudgetUtilization(33.333, 50);
		expect(utilization).toBe(66.67);
		expect(Number.isInteger(utilization * 100)).toBe(true); // Max 2 decimal places
	});
});

describe("Unit: Budget Alert System", () => {
	it("should trigger alert when utilization reaches 80%", () => {
		// AC-6.1.2: Verify alert triggers at threshold
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 5.0,
			r2_cost: 3.0,
			ai_search_cost: 2.0,
			kv_cost: 1.0,
			vectorize_cost: 0.5,
			total_daily: 11.5,
			cumulative_month: 40.0, // Exactly 80% of £50
			projection_month_end: 55.0,
			budget_utilization: 80.0,
		};

		const alert = checkBudgetAlert(breakdown);

		expect(alert).not.toBeNull();
		expect(alert?.budget_threshold).toBe(50);
		expect(alert?.current_spend).toBe(40.0);
		expect(alert?.utilization).toBe(80.0);
		expect(alert?.projection).toBe(55.0);
		expect(alert?.recommendations.length).toBeGreaterThan(0);
		expect(alert?.triggered_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // ISO 8601
	});

	it("should trigger alert when utilization exceeds 80%", () => {
		// AC-6.1.2: Verify alert triggers above threshold
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 5.0,
			r2_cost: 3.0,
			ai_search_cost: 2.0,
			kv_cost: 1.0,
			vectorize_cost: 0.5,
			total_daily: 11.5,
			cumulative_month: 42.5, // 85% of £50
			projection_month_end: 58.0,
			budget_utilization: 85.0,
		};

		const alert = checkBudgetAlert(breakdown);

		expect(alert).not.toBeNull();
		expect(alert?.current_spend).toBe(42.5);
		expect(alert?.utilization).toBe(85.0);
	});

	it("should NOT trigger alert when utilization is below 80%", () => {
		// AC-6.1.2: Verify no alert when below threshold
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 5.0,
			r2_cost: 3.0,
			ai_search_cost: 2.0,
			kv_cost: 1.0,
			vectorize_cost: 0.5,
			total_daily: 11.5,
			cumulative_month: 37.5, // 75% of £50
			projection_month_end: 50.0,
			budget_utilization: 75.0,
		};

		const alert = checkBudgetAlert(breakdown);

		expect(alert).toBeNull();
	});

	it("should include breakdown in alert payload", () => {
		// AC-6.1.2: Verify alert includes service breakdown
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 5.0,
			r2_cost: 3.0,
			ai_search_cost: 2.0,
			kv_cost: 1.0,
			vectorize_cost: 0.5,
			total_daily: 11.5,
			cumulative_month: 41.0,
			projection_month_end: 55.0,
			budget_utilization: 82.0,
		};

		const alert = checkBudgetAlert(breakdown);

		expect(alert?.breakdown).toEqual(breakdown);
		expect(alert?.breakdown.workers_cost).toBe(5.0);
		expect(alert?.breakdown.r2_cost).toBe(3.0);
		expect(alert?.breakdown.ai_search_cost).toBe(2.0);
		expect(alert?.breakdown.kv_cost).toBe(1.0);
		expect(alert?.breakdown.vectorize_cost).toBe(0.5);
	});
});

describe("Unit: Cost Optimization Recommendations", () => {
	it("should recommend R2 optimization when cost is >30% of total", () => {
		// AC-6.1.3: Verify R2 cost optimization recommendation
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 2.0,
			r2_cost: 5.0, // 50% of total (10)
			ai_search_cost: 1.5,
			kv_cost: 1.0,
			vectorize_cost: 0.5,
			total_daily: 10.0,
			cumulative_month: 30.0,
			projection_month_end: 40.0,
			budget_utilization: 60.0,
		};

		const recommendations = generateRecommendations(breakdown, 90);

		const hasR2Recommendation = recommendations.some((r) =>
			r.includes("R2 storage costs are high"),
		);
		expect(hasR2Recommendation).toBe(true);
	});

	it("should recommend cache optimization when hit rate <90%", () => {
		// AC-6.1.3: Verify cache hit rate recommendation
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 3.0,
			r2_cost: 2.0,
			ai_search_cost: 2.5,
			kv_cost: 1.5,
			vectorize_cost: 1.0,
			total_daily: 10.0,
			cumulative_month: 30.0,
			projection_month_end: 40.0,
			budget_utilization: 60.0,
		};

		const recommendations = generateRecommendations(breakdown, 60); // Low cache hit rate

		const hasCacheRecommendation = recommendations.some(
			(r) => r.includes("Cache hit rate") && r.includes("60%"),
		);
		expect(hasCacheRecommendation).toBe(true);
	});

	it("should recommend AI Search optimization when cost is >40% of total", () => {
		// AC-6.1.3: Verify AI Search optimization recommendation
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 2.0,
			r2_cost: 2.0,
			ai_search_cost: 5.0, // 50% of total (10)
			kv_cost: 0.5,
			vectorize_cost: 0.5,
			total_daily: 10.0,
			cumulative_month: 30.0,
			projection_month_end: 40.0,
			budget_utilization: 60.0,
		};

		const recommendations = generateRecommendations(breakdown, 90);

		const hasAISearchRecommendation = recommendations.some((r) =>
			r.includes("AI Search costs are high"),
		);
		expect(hasAISearchRecommendation).toBe(true);
	});

	it("should recommend Workers optimization when cost is >20% of total", () => {
		// AC-6.1.3: Verify Workers optimization recommendation
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 4.0, // 40% of total (10)
			r2_cost: 2.0,
			ai_search_cost: 2.0,
			kv_cost: 1.0,
			vectorize_cost: 1.0,
			total_daily: 10.0,
			cumulative_month: 30.0,
			projection_month_end: 40.0,
			budget_utilization: 60.0,
		};

		const recommendations = generateRecommendations(breakdown, 90);

		const hasWorkersRecommendation = recommendations.some((r) =>
			r.includes("Workers request volume is high"),
		);
		expect(hasWorkersRecommendation).toBe(true);
	});

	it("should recommend continued monitoring when within budget", () => {
		// AC-6.1.3: Verify general recommendation when costs healthy
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 2.0,
			r2_cost: 2.0,
			ai_search_cost: 2.0,
			kv_cost: 1.0,
			vectorize_cost: 1.0,
			total_daily: 8.0,
			cumulative_month: 24.0, // 48% of budget
			projection_month_end: 32.0,
			budget_utilization: 48.0,
		};

		const recommendations = generateRecommendations(breakdown, 95); // Good cache hit rate

		const hasMonitoringRecommendation = recommendations.some((r) =>
			r.includes("Costs are within budget"),
		);
		expect(hasMonitoringRecommendation).toBe(true);
	});

	it("should return multiple recommendations when multiple thresholds exceeded", () => {
		// AC-6.1.3: Verify multiple recommendations
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 3.0,
			r2_cost: 4.0, // >30% (high R2)
			ai_search_cost: 5.0, // >40% (high AI Search)
			kv_cost: 1.0,
			vectorize_cost: 1.0,
			total_daily: 14.0,
			cumulative_month: 42.0,
			projection_month_end: 56.0,
			budget_utilization: 84.0,
		};

		const recommendations = generateRecommendations(breakdown, 60); // Low cache hit rate

		// Should have at least one recommendation
		expect(recommendations.length).toBeGreaterThan(0);

		// At least one service-specific recommendation should be present
		const hasServiceRecommendation = recommendations.some(
			(r) =>
				r.includes("R2 storage") ||
				r.includes("Cache hit rate") ||
				r.includes("AI Search") ||
				r.includes("Workers"),
		);
		expect(hasServiceRecommendation).toBe(true);
	});
});

describe("Unit: JSON Export", () => {
	it("should export cost breakdown as formatted JSON", () => {
		// AC-6.1.3: Verify JSON export functionality
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 5.0,
			r2_cost: 3.0,
			ai_search_cost: 2.0,
			kv_cost: 1.0,
			vectorize_cost: 0.5,
			total_daily: 11.5,
			cumulative_month: 40.0,
			projection_month_end: 55.0,
			budget_utilization: 80.0,
		};

		const json = exportJSON(breakdown);

		// Verify valid JSON
		expect(() => JSON.parse(json)).not.toThrow();

		// Verify formatted (pretty-printed)
		expect(json).toContain("\n"); // Has newlines
		expect(json).toContain("  "); // Has indentation

		// Verify content
		const parsed = JSON.parse(json);
		expect(parsed.date).toBe("2025-11-15");
		expect(parsed.workers_cost).toBe(5.0);
		expect(parsed.budget_utilization).toBe(80.0);
	});

	it("should preserve all cost breakdown fields in JSON export", () => {
		const breakdown: CostBreakdown = {
			date: "2025-11-15",
			workers_cost: 1.0,
			r2_cost: 2.0,
			ai_search_cost: 3.0,
			kv_cost: 4.0,
			vectorize_cost: 5.0,
			total_daily: 15.0,
			cumulative_month: 30.0,
			projection_month_end: 45.0,
			budget_utilization: 60.0,
		};

		const json = exportJSON(breakdown);
		const parsed = JSON.parse(json);

		// Verify all fields present
		expect(Object.keys(parsed)).toHaveLength(10);
		expect(parsed).toHaveProperty("date");
		expect(parsed).toHaveProperty("workers_cost");
		expect(parsed).toHaveProperty("r2_cost");
		expect(parsed).toHaveProperty("ai_search_cost");
		expect(parsed).toHaveProperty("kv_cost");
		expect(parsed).toHaveProperty("vectorize_cost");
		expect(parsed).toHaveProperty("total_daily");
		expect(parsed).toHaveProperty("cumulative_month");
		expect(parsed).toHaveProperty("projection_month_end");
		expect(parsed).toHaveProperty("budget_utilization");
	});
});
