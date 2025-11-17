/**
 * Metrics Export Script
 *
 * Exports observability metrics from Cloudflare Workers Analytics
 * Implements Story 6.3 requirements for metrics export functionality
 *
 * Usage:
 *   npm run metrics-export              # Export last 7 days as JSON to stdout
 *   npm run metrics-export -- --format csv --output metrics.csv
 *   npm run metrics-export -- --start-date 2025-11-01 --end-date 2025-11-15
 *   npm run metrics-export:weekly       # Export last 7 days
 *   npm run metrics-export:monthly      # Export last 30 days
 *
 * @see docs/PRD.md#NFR-1 - Performance metrics <2s p95
 * @see docs/PRD.md#NFR-6 - Reliability metrics <1% error rate
 * @see .bmad-ephemeral/stories/tech-spec-epic-6.md - Complete design
 */

import { createLogger } from "../src/utils/logger.js";
import type { ObservabilityMetrics } from "../src/utils/metrics.js";

const logger = createLogger({ operation: "metrics-export" });

/**
 * CLI arguments configuration
 */
interface ExportConfig {
	/** Output format: csv or json */
	format: "csv" | "json";
	/** Start date (ISO 8601: YYYY-MM-DD) */
	startDate: string;
	/** End date (ISO 8601: YYYY-MM-DD) */
	endDate: string;
	/** Output file path (stdout if not specified) */
	outputFile?: string;
}

/**
 * Cloudflare GraphQL Analytics API response structure
 * Source: https://developers.cloudflare.com/analytics/graphql-api/
 */
interface CloudflareAnalyticsResponse {
	data: {
		viewer: {
			accounts: Array<{
				workersInvocationsAdaptive: Array<{
					dimensions: {
						date: string; // ISO 8601 date
					};
					sum: {
						requests: number;
						errors: number;
					};
					quantiles: {
						duration: {
							p50: number;
							p95: number;
							p99: number;
						};
					};
				}>;
			}>;
		};
	};
}

/**
 * Configuration constants
 */
const CONFIG = {
	/** Cloudflare GraphQL API endpoint */
	GRAPHQL_API_URL: "https://api.cloudflare.com/client/v4/graphql",
	/** Cloudflare account ID (from environment) */
	ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "",
	/** Cloudflare API token (from environment) */
	API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || "",
	/** Default date range: last 7 days */
	DEFAULT_DAYS: 7,
} as const;

/**
 * Parse CLI arguments into export configuration
 *
 * @returns Export configuration with format, dates, and output file
 *
 * @example
 * ```bash
 * # Export as CSV
 * npm run metrics-export -- --format csv --output metrics.csv
 *
 * # Export specific date range
 * npm run metrics-export -- --start-date 2025-11-01 --end-date 2025-11-15
 * ```
 */
function parseArguments(): ExportConfig {
	const args = process.argv.slice(2);
	const config: ExportConfig = {
		format: "json",
		startDate: "",
		endDate: "",
	};

	// Parse arguments
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--format" && args[i + 1]) {
			const format = args[i + 1].toLowerCase();
			if (format !== "csv" && format !== "json") {
				throw new Error(`Invalid format: ${format}. Use 'csv' or 'json'`);
			}
			config.format = format;
			i++;
		} else if (arg === "--start-date" && args[i + 1]) {
			config.startDate = args[i + 1];
			i++;
		} else if (arg === "--end-date" && args[i + 1]) {
			config.endDate = args[i + 1];
			i++;
		} else if (arg === "--output-file" && args[i + 1]) {
			config.outputFile = args[i + 1];
			i++;
		}
	}

	// Calculate default dates if not provided (last 7 days)
	const now = new Date();
	if (!config.endDate) {
		config.endDate = now.toISOString().split("T")[0]; // Today (YYYY-MM-DD)
	}
	if (!config.startDate) {
		const startDate = new Date(now);
		startDate.setDate(startDate.getDate() - CONFIG.DEFAULT_DAYS);
		config.startDate = startDate.toISOString().split("T")[0];
	}

	// Validate dates
	const start = new Date(config.startDate);
	const end = new Date(config.endDate);
	if (isNaN(start.getTime())) {
		throw new Error(`Invalid start date: ${config.startDate}. Use YYYY-MM-DD format`);
	}
	if (isNaN(end.getTime())) {
		throw new Error(`Invalid end date: ${config.endDate}. Use YYYY-MM-DD format`);
	}
	if (start > end) {
		throw new Error(`Start date ${config.startDate} is after end date ${config.endDate}`);
	}

	return config;
}

/**
 * Fetch metrics from Cloudflare GraphQL Analytics API
 *
 * Queries Workers Analytics for request volume, latency percentiles, and error rates
 *
 * @param accountId - Cloudflare account ID
 * @param apiToken - Cloudflare API token
 * @param startDate - Start date (ISO 8601: YYYY-MM-DD)
 * @param endDate - End date (ISO 8601: YYYY-MM-DD)
 * @returns Array of daily metrics
 * @throws Error if API call fails
 */
async function fetchCloudflareMetrics(
	accountId: string,
	apiToken: string,
	startDate: string,
	endDate: string,
): Promise<ObservabilityMetrics[]> {
	logger.info("Fetching Cloudflare Analytics data", {
		accountId,
		startDate,
		endDate,
	});

	// Validate credentials
	if (!accountId || !apiToken) {
		throw new Error(
			"Missing Cloudflare credentials. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.",
		);
	}

	// GraphQL query for Workers metrics
	const query = `
    query {
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          workersInvocationsAdaptive(
            limit: 1000
            filter: {
              date_geq: "${startDate}T00:00:00Z"
              date_leq: "${endDate}T23:59:59Z"
            }
            orderBy: [date_ASC]
          ) {
            dimensions {
              date
            }
            sum {
              requests
              errors
            }
            quantiles {
              duration {
                p50
                p95
                p99
              }
            }
          }
        }
      }
    }
  `;

	const response = await fetch(CONFIG.GRAPHQL_API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query }),
	});

	if (!response.ok) {
		throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as CloudflareAnalyticsResponse;

	if (!data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive) {
		throw new Error("Invalid API response structure");
	}

	const rawMetrics = data.data.viewer.accounts[0].workersInvocationsAdaptive;

	// Transform to ObservabilityMetrics format
	const metrics: ObservabilityMetrics[] = rawMetrics.map((metric) => {
		const errorRate = metric.sum.requests > 0 ? (metric.sum.errors / metric.sum.requests) * 100 : 0;

		return {
			period: metric.dimensions.date,
			query_volume: metric.sum.requests,
			response_time_p50: metric.quantiles.duration.p50,
			response_time_p95: metric.quantiles.duration.p95,
			response_time_p99: metric.quantiles.duration.p99,
			error_rate: errorRate,
			cache_hit_rate: 0, // Not available from Workers Analytics (tracked in custom metrics)
			empty_result_rate: 0, // Not available from Workers Analytics (tracked in custom metrics)
			slow_query_rate: 0, // Not available from Workers Analytics (tracked in custom metrics)
		};
	});

	logger.info("Metrics fetched successfully", {
		recordCount: metrics.length,
		dateRange: `${startDate} to ${endDate}`,
	});

	return metrics;
}

/**
 * Export metrics as CSV format
 *
 * @param metrics - Array of observability metrics
 * @returns CSV string with header and data rows
 *
 * @example
 * ```
 * date,query_volume,response_time_p50,response_time_p95,response_time_p99,error_rate,cache_hit_rate
 * 2025-11-15,234,456,1234,1876,0.04,92.3
 * ```
 */
function exportAsCSV(metrics: ObservabilityMetrics[]): string {
	const headers = [
		"date",
		"query_volume",
		"response_time_p50",
		"response_time_p95",
		"response_time_p99",
		"error_rate",
		"cache_hit_rate",
		"empty_result_rate",
		"slow_query_rate",
	];

	const rows = metrics.map((m) =>
		[
			m.period,
			m.query_volume,
			m.response_time_p50.toFixed(0),
			m.response_time_p95.toFixed(0),
			m.response_time_p99.toFixed(0),
			m.error_rate.toFixed(2),
			m.cache_hit_rate.toFixed(1),
			m.empty_result_rate.toFixed(1),
			m.slow_query_rate.toFixed(1),
		].join(","),
	);

	return [headers.join(","), ...rows].join("\n");
}

/**
 * Export metrics as JSON format
 *
 * @param metrics - Array of observability metrics
 * @param startDate - Start date for period metadata
 * @param endDate - End date for period metadata
 * @returns JSON string with metadata and metrics array
 *
 * @example
 * ```json
 * {
 *   "period": "weekly",
 *   "start_date": "2025-11-08",
 *   "end_date": "2025-11-15",
 *   "metrics": [...]
 * }
 * ```
 */
function exportAsJSON(metrics: ObservabilityMetrics[], startDate: string, endDate: string): string {
	const startObj = new Date(startDate);
	const endObj = new Date(endDate);
	const daysDiff = Math.ceil((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24));

	let period = "custom";
	if (daysDiff <= 7) {
		period = "weekly";
	} else if (daysDiff <= 31) {
		period = "monthly";
	}

	const output = {
		period,
		start_date: startDate,
		end_date: endDate,
		metrics,
	};

	return JSON.stringify(output, null, 2);
}

/**
 * Write output to file or stdout
 *
 * @param content - Content to write
 * @param outputFile - Optional output file path (stdout if not specified)
 */
async function writeOutput(content: string, outputFile?: string): Promise<void> {
	if (outputFile) {
		const fs = await import("fs/promises");
		await fs.writeFile(outputFile, content, "utf-8");
		logger.info("Metrics exported to file", { file: outputFile, size: content.length });
		console.error(`✅ Metrics exported to ${outputFile}`);
	} else {
		console.log(content);
		logger.info("Metrics exported to stdout", { size: content.length });
	}
}

/**
 * Main execution function
 */
async function main() {
	try {
		// Parse CLI arguments
		const config = parseArguments();
		logger.info("Export configuration", config);

		// Fetch metrics from Cloudflare Analytics
		const metrics = await fetchCloudflareMetrics(
			CONFIG.ACCOUNT_ID,
			CONFIG.API_TOKEN,
			config.startDate,
			config.endDate,
		);

		// Export in requested format
		let output: string;
		if (config.format === "csv") {
			output = exportAsCSV(metrics);
		} else {
			output = exportAsJSON(metrics, config.startDate, config.endDate);
		}

		// Write to file or stdout
		await writeOutput(output, config.outputFile);

		logger.info("Metrics export completed successfully");
		process.exit(0);
	} catch (error) {
		logger.error("Metrics export failed", {
			error: error instanceof Error ? error.message : "Unknown error",
		});
		console.error(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
		process.exit(1);
	}
}

// Run main function
main();
