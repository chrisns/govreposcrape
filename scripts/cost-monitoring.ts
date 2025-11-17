/**
 * Cost Monitoring Dashboard and Alerts
 *
 * Monitors Cloudflare service costs and triggers budget alerts
 * Implements Story 6.1 requirements for <£50/month MVP validation
 *
 * Usage:
 *   npm run cost-monitor              # Display current month costs
 *   npm run cost-monitor --alert      # Check and send alerts if threshold exceeded
 *   npm run cost-monitor --export json # Export cost data as JSON
 *
 * @see docs/PRD.md#NFR-7.1 - Infrastructure cost <£50/month
 * @see .bmad-ephemeral/stories/tech-spec-epic-6.md - Complete design
 */

import { createLogger } from "../src/utils/logger.js";
import { withRetry } from "../src/utils/retry.js";
import { ServiceError } from "../src/utils/error-handler.js";

const logger = createLogger({ operation: "cost-monitoring" });

/**
 * Cost breakdown by service for a specific date
 * Tracks daily costs and monthly projections
 */
export interface CostBreakdown {
	/** ISO 8601 date */
	date: string;
	/** Workers cost (£ per day) */
	workers_cost: number;
	/** R2 object storage cost (£ per day) */
	r2_cost: number;
	/** AI Search cost (£ per day) */
	ai_search_cost: number;
	/** KV namespace cost (£ per day) */
	kv_cost: number;
	/** Vectorize index cost (£ per day) */
	vectorize_cost: number;
	/** Total daily cost across all services (£) */
	total_daily: number;
	/** Cumulative cost month-to-date (£) */
	cumulative_month: number;
	/** Projected cost at month-end (£) */
	projection_month_end: number;
	/** Budget utilization as percentage (0-100) */
	budget_utilization: number;
}

/**
 * Budget alert payload when threshold exceeded
 * Triggered at 80% of £50/month budget (£40)
 */
export interface CostAlert {
	/** ISO 8601 timestamp when alert triggered */
	triggered_at: string;
	/** Monthly budget threshold in £ */
	budget_threshold: number;
	/** Current month-to-date spend in £ */
	current_spend: number;
	/** Budget utilization percentage */
	utilization: number;
	/** Projected end-of-month spend in £ */
	projection: number;
	/** Detailed cost breakdown */
	breakdown: CostBreakdown;
	/** Actionable cost optimization recommendations */
	recommendations: string[];
}

/**
 * Cloudflare Analytics API response structure
 * Source: https://developers.cloudflare.com/analytics/graphql-api/
 */
export interface AnalyticsAPIResponse {
	/** Request volume metrics */
	requests: {
		total: number;
		by_status: Record<number, number>;
	};
	/** Latency percentiles in milliseconds */
	latency: {
		p50: number;
		p95: number;
		p99: number;
	};
	/** Error metrics */
	errors: {
		rate: number;
		count: number;
	};
}

/**
 * Efficiency metrics for cost optimization
 */
export interface EfficiencyMetrics {
	/** Cost per AI Search query (£) */
	cost_per_query: number;
	/** Cost per repository ingestion (£) */
	cost_per_ingestion: number;
	/** Queries processed per £1 spent */
	queries_per_pound: number;
	/** Repositories ingested per £1 spent */
	repos_per_pound: number;
	/** Cache hit rate percentage (0-100) */
	cache_hit_rate: number;
}

/**
 * Configuration constants
 */
const CONFIG = {
	/** Monthly budget threshold in £ (from PRD NFR-7.1) */
	BUDGET_THRESHOLD: 50,
	/** Alert trigger percentage (80% of budget) */
	ALERT_THRESHOLD_PERCENT: 80,
	/** Cloudflare Analytics API base URL */
	ANALYTICS_API_BASE: "https://api.cloudflare.com/client/v4",
	/** Cloudflare account ID (from environment) */
	ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "",
	/** Cloudflare API token (from environment) */
	API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || "",
} as const;

/**
 * Fetch cost data from Cloudflare Analytics API
 *
 * Uses retry logic for resilience (3 attempts, exponential backoff)
 *
 * @param accountId - Cloudflare account ID
 * @param apiToken - Cloudflare API token
 * @returns Analytics data for Workers, R2, and other services
 * @throws ServiceError if API call fails after retries
 */
async function fetchCloudflareAnalytics(
	accountId: string,
	apiToken: string,
): Promise<AnalyticsAPIResponse> {
	logger.info("Fetching Cloudflare Analytics data", { accountId });

	// Validate credentials
	if (!accountId || !apiToken) {
		throw new ServiceError(
			"Missing Cloudflare credentials. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.",
			500,
			"MISSING_CREDENTIALS",
		);
	}

	const url = `${CONFIG.ANALYTICS_API_BASE}/accounts/${accountId}/analytics/workers`;

	try {
		const response = await withRetry(
			async () => {
				const res = await fetch(url, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${apiToken}`,
						"Content-Type": "application/json",
					},
				});

				if (!res.ok) {
					throw new ServiceError(
						`Cloudflare Analytics API returned ${res.status}: ${res.statusText}`,
						res.status,
						"ANALYTICS_API_ERROR",
					);
				}

				return res.json();
			},
			3,
			[1000, 2000, 4000],
		);

		logger.info("Successfully fetched Analytics data");
		return response as AnalyticsAPIResponse;
	} catch (error) {
		logger.error("Failed to fetch Analytics data after retries", {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Calculate daily costs by service
 *
 * Note: Actual cost calculation requires Cloudflare billing API integration
 * This implementation uses estimated costs based on usage metrics
 *
 * @param analytics - Analytics data from Cloudflare API
 * @returns Cost breakdown by service
 */
export function calculateDailyCosts(analytics: AnalyticsAPIResponse): Omit<
	CostBreakdown,
	"cumulative_month" | "projection_month_end" | "budget_utilization"
> {
	const date = new Date().toISOString().split("T")[0];

	// Estimated cost calculations (£ per day)
	// TODO: Replace with actual Cloudflare billing API data when available
	const workers_cost = (analytics.requests.total / 1_000_000) * 0.50; // £0.50 per million requests
	const r2_cost = 0.50; // Estimated daily R2 storage cost
	const ai_search_cost = (analytics.requests.total / 1000) * 0.01; // £0.01 per 1000 queries
	const kv_cost = 0.20; // Estimated daily KV cost
	const vectorize_cost = 0.10; // Estimated daily Vectorize cost

	const total_daily =
		workers_cost + r2_cost + ai_search_cost + kv_cost + vectorize_cost;

	logger.info("Calculated daily costs", {
		date,
		total_daily,
		workers_cost,
		r2_cost,
		ai_search_cost,
		kv_cost,
		vectorize_cost,
	});

	return {
		date,
		workers_cost,
		r2_cost,
		ai_search_cost,
		kv_cost,
		vectorize_cost,
		total_daily,
	};
}

/**
 * Calculate cumulative monthly spend and projection
 *
 * @param dailyCosts - Daily cost breakdown
 * @returns Monthly cumulative and projected costs
 */
export function calculateMonthlyProjection(
	dailyCosts: Omit<CostBreakdown, "cumulative_month" | "projection_month_end" | "budget_utilization">,
): Pick<CostBreakdown, "cumulative_month" | "projection_month_end"> {
	const today = new Date();
	const dayOfMonth = today.getDate();
	const daysInMonth = new Date(
		today.getFullYear(),
		today.getMonth() + 1,
		0,
	).getDate();

	// Simulate cumulative spend (in production, this would come from billing API)
	const cumulative_month = dailyCosts.total_daily * dayOfMonth;

	// Project end-of-month cost based on daily average
	const projection_month_end = dailyCosts.total_daily * daysInMonth;

	logger.info("Calculated monthly projection", {
		dayOfMonth,
		daysInMonth,
		cumulative_month,
		projection_month_end,
	});

	return {
		cumulative_month,
		projection_month_end,
	};
}

/**
 * Calculate budget utilization percentage
 *
 * @param cumulativeSpend - Current month-to-date spend in £
 * @param budgetThreshold - Monthly budget limit in £
 * @returns Budget utilization as percentage (0-100)
 */
export function calculateBudgetUtilization(
	cumulativeSpend: number,
	budgetThreshold: number,
): number {
	const utilization = (cumulativeSpend / budgetThreshold) * 100;
	return Math.round(utilization * 100) / 100; // Round to 2 decimal places
}

/**
 * Generate cost optimization recommendations
 *
 * @param breakdown - Cost breakdown by service
 * @param cacheHitRate - Current cache hit rate percentage
 * @returns Array of actionable recommendations
 */
export function generateRecommendations(
	breakdown: CostBreakdown,
	cacheHitRate: number,
): string[] {
	const recommendations: string[] = [];

	// R2 cost optimization
	if (breakdown.r2_cost > breakdown.total_daily * 0.3) {
		recommendations.push(
			"R2 storage costs are high (>30% of total). Consider implementing data lifecycle policies to archive old repository summaries.",
		);
	}

	// Cache hit rate optimization
	if (cacheHitRate < 90) {
		recommendations.push(
			`Cache hit rate is ${cacheHitRate}% (target: 90%+). Increase cache TTL or review cache invalidation logic to reduce R2 reads.`,
		);
	}

	// AI Search optimization
	if (breakdown.ai_search_cost > breakdown.total_daily * 0.4) {
		recommendations.push(
			"AI Search costs are high (>40% of total). Consider batch processing queries or caching search results for common queries.",
		);
	}

	// Workers optimization
	if (breakdown.workers_cost > breakdown.total_daily * 0.2) {
		recommendations.push(
			"Workers request volume is high. Review ingestion frequency and consider reducing Cron trigger rate if acceptable.",
		);
	}

	// General recommendation if within budget
	if (breakdown.budget_utilization < 80) {
		recommendations.push(
			"Costs are within budget. Continue monitoring weekly to detect trend changes early.",
		);
	}

	return recommendations;
}

/**
 * Check if budget alert should be triggered
 *
 * @param breakdown - Cost breakdown with budget utilization
 * @returns Cost alert if threshold exceeded, null otherwise
 */
export function checkBudgetAlert(breakdown: CostBreakdown): CostAlert | null {
	const alertThreshold =
		(CONFIG.ALERT_THRESHOLD_PERCENT / 100) * CONFIG.BUDGET_THRESHOLD;

	if (breakdown.cumulative_month >= alertThreshold) {
		const alert: CostAlert = {
			triggered_at: new Date().toISOString(),
			budget_threshold: CONFIG.BUDGET_THRESHOLD,
			current_spend: breakdown.cumulative_month,
			utilization: breakdown.budget_utilization,
			projection: breakdown.projection_month_end,
			breakdown,
			recommendations: generateRecommendations(breakdown, 90), // TODO: Fetch actual cache hit rate
		};

		logger.warn("Budget alert triggered", {
			utilization: alert.utilization,
			current_spend: alert.current_spend,
			projection: alert.projection,
		});

		return alert;
	}

	return null;
}

/**
 * Display cost dashboard to console
 *
 * @param breakdown - Cost breakdown to display
 */
export function displayDashboard(breakdown: CostBreakdown): void {
	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("  Cost Monitoring Dashboard - govreposcrape MVP");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log(`Date: ${breakdown.date}\n`);

	console.log("Daily Costs by Service:");
	console.log(`  Workers:    £${breakdown.workers_cost.toFixed(2)}`);
	console.log(`  R2:         £${breakdown.r2_cost.toFixed(2)}`);
	console.log(`  AI Search:  £${breakdown.ai_search_cost.toFixed(2)}`);
	console.log(`  KV:         £${breakdown.kv_cost.toFixed(2)}`);
	console.log(`  Vectorize:  £${breakdown.vectorize_cost.toFixed(2)}`);
	console.log(`  ──────────────────────`);
	console.log(`  Total:      £${breakdown.total_daily.toFixed(2)}/day\n`);

	console.log("Monthly Summary:");
	console.log(
		`  Current Spend:     £${breakdown.cumulative_month.toFixed(2)}`,
	);
	console.log(
		`  Projected End:     £${breakdown.projection_month_end.toFixed(2)}`,
	);
	console.log(
		`  Budget:            £${CONFIG.BUDGET_THRESHOLD.toFixed(2)}/month`,
	);
	console.log(
		`  Utilization:       ${breakdown.budget_utilization.toFixed(1)}%\n`,
	);

	// Budget status indicator
	if (breakdown.budget_utilization >= CONFIG.ALERT_THRESHOLD_PERCENT) {
		console.log("⚠️  STATUS: Budget alert threshold exceeded");
	} else if (breakdown.budget_utilization >= 60) {
		console.log("⚡ STATUS: Approaching budget threshold");
	} else {
		console.log("✅ STATUS: Well within budget");
	}

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

/**
 * Send budget alert (console log + optional webhooks)
 *
 * @param alert - Cost alert to send
 */
export function sendAlert(alert: CostAlert): void {
	// Console log always succeeds
	console.log("\n🚨 BUDGET ALERT TRIGGERED 🚨\n");
	console.log(`Triggered: ${alert.triggered_at}`);
	console.log(
		`Utilization: ${alert.utilization.toFixed(1)}% (Threshold: ${CONFIG.ALERT_THRESHOLD_PERCENT}%)`,
	);
	console.log(
		`Current Spend: £${alert.current_spend.toFixed(2)} / £${alert.budget_threshold.toFixed(2)}`,
	);
	console.log(
		`Projected End-of-Month: £${alert.projection.toFixed(2)}\n`,
	);

	console.log("Cost Optimization Recommendations:");
	alert.recommendations.forEach((rec, idx) => {
		console.log(`  ${idx + 1}. ${rec}`);
	});
	console.log("");

	// Log alert to structured logs for monitoring
	logger.warn("Budget alert sent", {
		utilization: alert.utilization,
		current_spend: alert.current_spend,
		projection: alert.projection,
		recommendations_count: alert.recommendations.length,
	});

	// TODO: Optional email/Slack webhook integration (graceful degradation)
	// if (process.env.SLACK_WEBHOOK_URL) {
	//   await sendSlackAlert(alert);
	// }
}

/**
 * Export cost data as JSON
 *
 * @param breakdown - Cost breakdown to export
 * @returns JSON string
 */
export function exportJSON(breakdown: CostBreakdown): string {
	return JSON.stringify(breakdown, null, 2);
}

/**
 * Main cost monitoring execution
 *
 * Orchestrates the cost monitoring workflow:
 * 1. Fetch Analytics data
 * 2. Calculate costs and projections
 * 3. Display dashboard
 * 4. Check for alerts
 * 5. Export data if requested
 */
async function main(): Promise<void> {
	try {
		logger.info("Starting cost monitoring workflow");

		// Parse command-line arguments
		const args = process.argv.slice(2);
		const alertMode = args.includes("--alert");
		const exportMode = args.includes("--export") && args.includes("json");

		// Fetch Analytics data
		const analytics = await fetchCloudflareAnalytics(
			CONFIG.ACCOUNT_ID,
			CONFIG.API_TOKEN,
		);

		// Calculate costs
		const dailyCosts = calculateDailyCosts(analytics);
		const monthlyProjection = calculateMonthlyProjection(dailyCosts);
		const budgetUtilization = calculateBudgetUtilization(
			monthlyProjection.cumulative_month,
			CONFIG.BUDGET_THRESHOLD,
		);

		const breakdown: CostBreakdown = {
			...dailyCosts,
			...monthlyProjection,
			budget_utilization: budgetUtilization,
		};

		// Display dashboard (unless export-only mode)
		if (!exportMode) {
			displayDashboard(breakdown);
		}

		// Check for budget alerts
		if (alertMode) {
			const alert = checkBudgetAlert(breakdown);
			if (alert) {
				sendAlert(alert);
			} else {
				logger.info("No budget alert triggered", {
					utilization: budgetUtilization,
					threshold: CONFIG.ALERT_THRESHOLD_PERCENT,
				});
			}
		}

		// Export JSON if requested
		if (exportMode) {
			const json = exportJSON(breakdown);
			console.log(json);
		}

		logger.info("Cost monitoring workflow completed successfully");
	} catch (error) {
		logger.error("Cost monitoring workflow failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		process.exit(1);
	}
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
