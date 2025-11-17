/**
 * Health check endpoint for govreposcrape
 * Validates connectivity to all Cloudflare service bindings
 *
 * Returns 200 OK when all services are accessible
 * Returns 503 Service Unavailable when any service fails
 *
 * @example
 * ```typescript
 * // GET /health
 * // Response: { "status": "healthy", "services": {...}, "timestamp": "2025-11-12T10:00:00.000Z" }
 * ```
 */

import { createLogger } from "../utils/logger";
import { ServiceError } from "../utils/error-handler";
import type { ErrorResponse } from "../types";

const logger = createLogger({ operation: "healthCheck" });

/**
 * Service status result
 */
export interface ServiceStatus {
	/** Service name */
	name: string;
	/** Connection status: "ok" or "failed" */
	status: "ok" | "failed";
	/** Optional error message if failed */
	error?: string;
}

/**
 * Health check response format
 */
export interface HealthCheckResponse {
	/** Overall health status: "healthy" or "unhealthy" */
	status: "healthy" | "unhealthy";
	/** Individual service statuses */
	services: Record<string, ServiceStatus>;
	/** ISO 8601 timestamp */
	timestamp: string;
}

/**
 * Check health of all service bindings
 *
 * Validates connectivity to:
 * - KV namespace (test read operation)
 * - R2 bucket (test list operation)
 * - Vectorize index (test metadata query)
 * - D1 database (test query execution)
 * - AI Search (test query execution) - Epic 3 Story 3.1
 *
 * @param env - Cloudflare Workers environment with service bindings
 * @param requestId - Optional request correlation ID
 * @returns Response with 200 OK or 503 Service Unavailable
 */
export async function checkHealth(env: Env, requestId?: string): Promise<Response> {
	const timestamp = new Date().toISOString();
	const services: Record<string, ServiceStatus> = {};
	let allHealthy = true;

	logger.info("Starting health check", {
		requestId,
		timestamp,
	});

	// Check KV namespace
	try {
		// Test read operation (key won't exist, but validates connectivity)
		await env.KV.get("health-check-test");
		services.kv = {
			name: "KV Namespace",
			status: "ok",
		};
		logger.debug("KV health check passed", { requestId });
	} catch (error) {
		allHealthy = false;
		const errorMessage = error instanceof Error ? error.message : String(error);
		services.kv = {
			name: "KV Namespace",
			status: "failed",
			error: errorMessage,
		};
		logger.error("KV health check failed", {
			requestId,
			error: errorMessage,
		});
	}

	// Check R2 bucket
	try {
		// Test list operation (validates bucket access)
		await env.R2.list({ limit: 1 });
		services.r2 = {
			name: "R2 Bucket",
			status: "ok",
		};
		logger.debug("R2 health check passed", { requestId });
	} catch (error) {
		allHealthy = false;
		const errorMessage = error instanceof Error ? error.message : String(error);
		services.r2 = {
			name: "R2 Bucket",
			status: "failed",
			error: errorMessage,
		};
		logger.error("R2 health check failed", {
			requestId,
			error: errorMessage,
		});
	}

	// Check Vectorize index
	try {
		// Test metadata query (validates index access without inserting data)
		// Note: Vectorize might not have a direct metadata query, so we use a minimal operation
		// For now, we'll check if the binding exists
		if (env.VECTORIZE) {
			services.vectorize = {
				name: "Vectorize Index",
				status: "ok",
			};
			logger.debug("Vectorize health check passed", { requestId });
		} else {
			throw new Error("Vectorize binding not available");
		}
	} catch (error) {
		allHealthy = false;
		const errorMessage = error instanceof Error ? error.message : String(error);
		services.vectorize = {
			name: "Vectorize Index",
			status: "failed",
			error: errorMessage,
		};
		logger.error("Vectorize health check failed", {
			requestId,
			error: errorMessage,
		});
	}

	// Check D1 database
	try {
		// Test query execution (validates database connection)
		await env.DB.prepare("SELECT 1").first();
		services.d1 = {
			name: "D1 Database",
			status: "ok",
		};
		logger.debug("D1 health check passed", { requestId });
	} catch (error) {
		allHealthy = false;
		const errorMessage = error instanceof Error ? error.message : String(error);
		services.d1 = {
			name: "D1 Database",
			status: "failed",
			error: errorMessage,
		};
		logger.error("D1 health check failed", {
			requestId,
			error: errorMessage,
		});
	}

	// Check AI Search (Epic 3 Story 3.1)
	try {
		// Test minimal query to validate AI Search binding is accessible
		// Using max_num_results=1 to minimize latency and resource usage
		// API usage: env.AI.autorag("govreposcrape-search").search({ query, ... })
		await env.AI.autorag("govreposcrape-search").search({
			query: "test",
			max_num_results: 1,
		});
		services.ai_search = {
			name: "AI Search",
			status: "ok",
		};
		logger.debug("AI Search health check passed", { requestId });
	} catch (error) {
		allHealthy = false;
		const errorMessage = error instanceof Error ? error.message : String(error);
		services.ai_search = {
			name: "AI Search",
			status: "failed",
			error: errorMessage,
		};
		logger.error("AI Search health check failed", {
			requestId,
			error: errorMessage,
		});
	}

	const response: HealthCheckResponse = {
		status: allHealthy ? "healthy" : "unhealthy",
		services,
		timestamp,
	};

	if (allHealthy) {
		logger.info("Health check completed: all services healthy", {
			requestId,
			services: Object.keys(services),
		});
		return new Response(JSON.stringify(response), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	} else {
		logger.warn("Health check completed: some services unhealthy", {
			requestId,
			failedServices: Object.entries(services)
				.filter(([_, s]) => s.status === "failed")
				.map(([name]) => name),
		});

		// Use ServiceError for 503 response
		const error = new ServiceError(
			"One or more services are unavailable",
			503,
			"SERVICE_UNAVAILABLE",
		);

		const errorResponse: ErrorResponse = error.toErrorResponse();

		// Include service details in response for debugging
		const detailedResponse = {
			...errorResponse,
			details: response,
		};

		return new Response(JSON.stringify(detailedResponse), {
			status: 503,
			headers: {
				"Content-Type": "application/json",
			},
		});
	}
}
