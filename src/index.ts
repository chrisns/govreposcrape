/**
 * govreposcrape - Cloudflare Workers application
 * Main entry point for the Workers application
 *
 * Routes:
 * - POST /mcp/search - MCP v2 semantic search endpoint (Epic 4 Story 4.1)
 * - OPTIONS * - CORS preflight handler
 * - GET /health - Health check endpoint for service connectivity validation
 * - GET /mcp/health - MCP API health check (Epic 3 Story 3.1)
 * - GET /openapi.json - OpenAPI 3.0 specification (Epic 5 Story 5.2)
 * - GET /cache/:org/:repo - Cache proxy for Docker containers (Quality Story 1)
 * - PUT /cache/:org/:repo - Cache proxy for Docker containers (Quality Story 1)
 * - GET /cache/stats - Cache statistics (Quality Story 1)
 * - GET / - Welcome message
 */

import { checkHealth } from "./api/health";
import { getCacheEntry, putCacheEntry, getCacheStatistics } from "./api/cache-proxy";
import { handleMCPSearch, handleOPTIONS, formatErrorResponse } from "./api/mcp-handler";
import { createLogger, type LogLevel } from "./utils/logger";
import openapiSpec from "../static/openapi.json";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const requestId = crypto.randomUUID();
		const startTime = Date.now();

		// Create logger with environment-specific log level
		// LOG_LEVEL from wrangler.jsonc: debug (dev), info (staging/prod)
		const logLevel = (env.LOG_LEVEL as LogLevel) || "debug";
		const logger = createLogger({ operation: "fetch", requestId }, logLevel);

		// Log request start
		logger.info("Request received", {
			method: request.method,
			path: url.pathname,
		});

		try {
			let response: Response;

			// Handle OPTIONS preflight requests for CORS
			if (request.method === "OPTIONS") {
				response = handleOPTIONS();
			}
			// MCP v2 search endpoint (Epic 4 Story 4.1)
			else if (request.method === "POST" && url.pathname === "/mcp/search") {
				response = await handleMCPSearch(request, env);
			}
			// Health check endpoints
			else if (
				(url.pathname === "/health" || url.pathname === "/mcp/health") &&
				request.method === "GET"
			) {
				response = await checkHealth(env, requestId);
			}
			// OpenAPI 3.0 specification endpoint (Epic 5 Story 5.2)
			else if (url.pathname === "/openapi.json" && request.method === "GET") {
				response = new Response(JSON.stringify(openapiSpec), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "GET, OPTIONS",
						"Access-Control-Allow-Headers": "Content-Type",
					},
				});
				logger.info("OpenAPI spec served", { requestId });
			}
			// Cache proxy endpoints (Quality Story 1)
			else if (url.pathname === "/cache/stats" && request.method === "GET") {
				response = await getCacheStatistics(requestId);
			} else if (url.pathname.startsWith("/cache/") && url.pathname !== "/cache/stats") {
				if (request.method === "GET") {
					response = await getCacheEntry(url, env, requestId);
				} else if (request.method === "PUT") {
					response = await putCacheEntry(url, request, env, requestId);
				} else {
					// Unsupported method for cache endpoints
					response = new Response(
						JSON.stringify({
							error: {
								code: "METHOD_NOT_ALLOWED",
								message: "Method not allowed for cache endpoints",
							},
						}),
						{
							status: 405,
							headers: {
								"Content-Type": "application/json",
								Allow: "GET, PUT",
							},
						},
					);
				}
			}
			// Default route
			else if (url.pathname === "/" && request.method === "GET") {
				response = new Response(
					JSON.stringify({
						name: "govreposcrape",
						version: "1.0.0",
						status: "running",
						message: "UK Government Code Repository Search - Cloudflare Workers",
						endpoints: {
							mcp_search: "/mcp/search",
							health: "/health",
							mcp_health: "/mcp/health",
							openapi_spec: "/openapi.json",
							cache_get: "/cache/:org/:repo?pushedAt=<timestamp>",
							cache_put: "/cache/:org/:repo",
							cache_stats: "/cache/stats",
						},
					}),
					{
						status: 200,
						headers: {
							"Content-Type": "application/json",
						},
					},
				);
			} else {
				// 404 for unknown routes - moved below
				response = new Response(
					JSON.stringify({
						error: {
							code: "NOT_FOUND",
							message: "Route not found",
						},
					}),
					{
						status: 404,
						headers: {
							"Content-Type": "application/json",
						},
					},
				);
				logger.warn("Route not found", {
					path: url.pathname,
				});
			}

			// Log request completion with performance monitoring
			const duration = Date.now() - startTime;

			// Warn if request took longer than 2s (NFR-1.1 threshold)
			if (duration > 2000) {
				logger.warn("Slow request detected", {
					duration,
					statusCode: response.status,
					path: url.pathname,
					threshold: "2000ms (NFR-1.1)",
				});
			}

			logger.info("Request completed", {
				duration,
				statusCode: response.status,
				path: url.pathname,
			});

			return response;
		} catch (error) {
			// Global error handler - catches all unhandled errors
			const duration = Date.now() - startTime;

			// Log error with full context
			// NOTE: No sanitizeLogData() needed - this is a public API with no authentication,
			// no user data, and no secrets. All logged fields (requestId, path, method, error)
			// are safe to expose in logs.
			logger.error("Request failed with unhandled error", {
				duration,
				path: url.pathname,
				method: request.method,
				error: error instanceof Error ? error.message : "Unknown error",
				errorName: error instanceof Error ? error.name : undefined,
				// Stack trace filtered in production to avoid exposing internal implementation details
				...(env.ENVIRONMENT !== "production" &&
					error instanceof Error && { stack: error.stack }),
			});

			// Format error response using Story 4.1 formatErrorResponse
			// This handles ValidationError → 400, ServiceError → 500/503, unknown → 500
			const errorResponse = formatErrorResponse(error);

			// Log response status
			logger.info("Request completed with error", {
				duration,
				statusCode: errorResponse.status,
			});

			return errorResponse;
		}
	},
} satisfies ExportedHandler<Env>;
