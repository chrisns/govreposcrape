/**
 * MCP v2 Protocol Handler for govreposcrape
 * Implements request validation, CORS handling, and error formatting
 * for the POST /mcp/search endpoint
 *
 * Follows MCP v2 protocol specification:
 * - JSON request/response format
 * - X-MCP-Version: 2 header
 * - Structured error responses
 * - CORS support for web-based clients
 *
 * @module mcp-handler
 */

import { createLogger } from "../utils/logger";
import { ValidationError, ServiceError } from "../utils/error-handler";
import { executeSearch } from "./search-endpoint";
import { createMetricsCollector } from "../utils/metrics";
import type { MCPRequest, ErrorResponse } from "../types";

// Validation constants
const QUERY_MIN_LENGTH = 3;
const QUERY_MAX_LENGTH = 500;
const LIMIT_MIN = 1;
const LIMIT_MAX = 20;
const LIMIT_DEFAULT = 5;
const MAX_PAYLOAD_SIZE_KB = 1;
const MCP_VERSION = "2";

/**
 * MCP error codes following PRD specification
 * Machine-readable codes for client error handling
 */
export const ERROR_CODES = {
	INVALID_QUERY: "INVALID_QUERY",
	INVALID_LIMIT: "INVALID_LIMIT",
	INVALID_CONTENT_TYPE: "INVALID_CONTENT_TYPE",
	MALFORMED_JSON: "MALFORMED_JSON",
	PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
	SEARCH_ERROR: "SEARCH_ERROR",
	INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/**
 * Validates MCP v2 request and returns parsed MCPRequest
 *
 * Validation rules:
 * - Content-Type must be application/json
 * - Request payload must be <1KB
 * - query: required, 3-500 characters (trimmed), UTF-8 string
 * - limit: optional, integer 1-20 (default 5)
 * - X-MCP-Version: warn if not "2" but continue
 *
 * @param request - HTTP Request object
 * @returns Validated MCPRequest with trimmed query and default limit
 * @throws ValidationError if validation fails with appropriate error code
 *
 * @example
 * ```typescript
 * const mcpRequest = await validateMCPRequest(request);
 * // mcpRequest = { query: "authentication methods", limit: 5 }
 * ```
 */
export async function validateMCPRequest(request: Request): Promise<MCPRequest> {
	const logger = createLogger({ operation: "validate_mcp_request" });

	// Validate Content-Type header
	const contentType = request.headers.get("content-type");
	if (!contentType || !contentType.includes("application/json")) {
		throw new ValidationError(
			"Content-Type must be application/json",
			ERROR_CODES.INVALID_CONTENT_TYPE,
		);
	}

	// Check payload size (approximate via Content-Length header)
	const contentLength = request.headers.get("content-length");
	if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE_KB * 1024) {
		throw new ValidationError(
			`Request payload must be less than ${MAX_PAYLOAD_SIZE_KB}KB`,
			ERROR_CODES.PAYLOAD_TOO_LARGE,
		);
	}

	// Parse JSON body with error handling
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ValidationError("Request body must be valid JSON", ERROR_CODES.MALFORMED_JSON);
	}

	// Type guard for body structure
	if (typeof body !== "object" || body === null) {
		throw new ValidationError("Request body must be a JSON object", ERROR_CODES.MALFORMED_JSON);
	}

	const requestBody = body as Record<string, unknown>;

	// Validate query field
	if (!requestBody.query || typeof requestBody.query !== "string") {
		throw new ValidationError(
			"Query field is required and must be a string",
			ERROR_CODES.INVALID_QUERY,
		);
	}

	const trimmedQuery = requestBody.query.trim();
	if (trimmedQuery.length < QUERY_MIN_LENGTH) {
		throw new ValidationError(
			`Query must be at least ${QUERY_MIN_LENGTH} characters`,
			ERROR_CODES.INVALID_QUERY,
		);
	}

	if (trimmedQuery.length > QUERY_MAX_LENGTH) {
		throw new ValidationError(
			`Query must be at most ${QUERY_MAX_LENGTH} characters`,
			ERROR_CODES.INVALID_QUERY,
		);
	}

	// Validate limit field (optional)
	let limit = LIMIT_DEFAULT;
	if (requestBody.limit !== undefined) {
		const limitValue = requestBody.limit;
		if (typeof limitValue !== "number" || !Number.isInteger(limitValue)) {
			throw new ValidationError("Limit must be an integer", ERROR_CODES.INVALID_LIMIT);
		}

		if (limitValue < LIMIT_MIN || limitValue > LIMIT_MAX) {
			throw new ValidationError(
				`Limit must be between ${LIMIT_MIN} and ${LIMIT_MAX}`,
				ERROR_CODES.INVALID_LIMIT,
			);
		}

		limit = limitValue;
	}

	// Validate X-MCP-Version header (warn if missing/incorrect, but continue)
	const mcpVersion = request.headers.get("x-mcp-version");
	if (mcpVersion !== MCP_VERSION) {
		logger.warn("MCP version mismatch or missing", {
			expected: MCP_VERSION,
			received: mcpVersion || "none",
		});
	}

	return {
		query: trimmedQuery,
		limit,
	};
}

/**
 * Adds CORS headers to response for MCP clients
 *
 * CORS configuration:
 * - Access-Control-Allow-Origin: * (open access per ADR-002)
 * - Access-Control-Allow-Methods: POST, OPTIONS, GET
 * - Access-Control-Allow-Headers: Content-Type, X-MCP-Version, X-Request-ID
 *
 * @param response - Response object to add headers to
 * @returns Response with CORS headers added
 *
 * @example
 * ```typescript
 * const response = new Response(JSON.stringify({ results: [] }));
 * return addCORSHeaders(response);
 * ```
 */
export function addCORSHeaders(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
	headers.set("Access-Control-Allow-Headers", "Content-Type, X-MCP-Version, X-Request-ID");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * Handles OPTIONS preflight requests for CORS
 *
 * Returns 204 No Content with appropriate CORS headers
 * Allows web-based MCP clients to make cross-origin requests
 *
 * @returns 204 No Content response with CORS headers
 *
 * @example
 * ```typescript
 * if (request.method === 'OPTIONS') {
 *   return handleOPTIONS();
 * }
 * ```
 */
export function handleOPTIONS(): Response {
	return addCORSHeaders(
		new Response(null, {
			status: 204,
			headers: {
				"Content-Type": "application/json",
			},
		}),
	);
}

/**
 * Formats error as MCP-compliant ErrorResponse JSON
 *
 * Maps error types to appropriate HTTP status codes:
 * - ValidationError → 400 Bad Request
 * - ServiceError → 500/503 (from error.statusCode)
 * - Other errors → 500 Internal Server Error
 *
 * All errors return structured JSON in PRD FR-3 format:
 * { error: { code, message, retry_after? } }
 *
 * @param error - Error object (ValidationError, ServiceError, or generic Error)
 * @returns Response with formatted error JSON and appropriate status code
 *
 * @example
 * ```typescript
 * try {
 *   await validateMCPRequest(request);
 * } catch (error) {
 *   return formatErrorResponse(error);
 * }
 * ```
 */
export function formatErrorResponse(error: unknown): Response {
	const logger = createLogger({ operation: "format_error_response" });

	let statusCode = 500;
	let errorResponse: ErrorResponse;

	if (error instanceof ValidationError) {
		statusCode = 400;
		errorResponse = {
			error: {
				code: error.code,
				message: error.message,
			},
		};
	} else if (error instanceof ServiceError) {
		statusCode = error.statusCode;
		errorResponse = {
			error: {
				code: error.code,
				message: error.message,
				retry_after: error.retryAfter,
			},
		};
	} else {
		// Unhandled exception - log details but return generic message
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		const errorStack = error instanceof Error ? error.stack : undefined;
		logger.error("Unhandled exception", {
			error: errorMessage,
			stack: errorStack,
		});

		errorResponse = {
			error: {
				code: ERROR_CODES.INTERNAL_ERROR,
				message: "An unexpected error occurred",
			},
		};
	}

	return addCORSHeaders(
		new Response(JSON.stringify(errorResponse), {
			status: statusCode,
			headers: {
				"Content-Type": "application/json",
			},
		}),
	);
}

/**
 * Handles POST /mcp/search requests with MCP v2 protocol
 *
 * Request flow:
 * 1. Extract/generate X-Request-ID for correlation
 * 2. Validate MCP request (query, limit, headers)
 * 3. Execute semantic search via executeSearch() (Story 4.2)
 * 4. Log request with structured JSON (requestId, duration, resultCount)
 *
 * Response includes:
 * - X-MCP-Version: 2 header
 * - X-Request-ID: correlation UUID
 * - CORS headers
 * - JSON body: { results: SearchResult[], took_ms: number }
 *
 * @param request - HTTP Request object
 * @param env - Workers environment bindings (AI_SEARCH, R2 for search and enrichment)
 * @returns MCPResponse JSON (200 OK) or ErrorResponse JSON (400/500/503)
 *
 * @example
 * ```bash
 * # Valid request
 * curl -X POST http://localhost:8787/mcp/search \
 *   -H "Content-Type: application/json" \
 *   -H "X-MCP-Version: 2" \
 *   -d '{"query":"authentication methods","limit":5}'
 *
 * # Invalid request (query too short)
 * curl -X POST http://localhost:8787/mcp/search \
 *   -H "Content-Type: application/json" \
 *   -d '{"query":"ab"}'
 * # Returns: 400 Bad Request with INVALID_QUERY error code
 *
 * # OPTIONS preflight
 * curl -X OPTIONS http://localhost:8787/mcp/search
 * # Returns: 204 No Content with CORS headers
 * ```
 */
export async function handleMCPSearch(request: Request, env: Env): Promise<Response> {
	// Generate or extract request ID for correlation
	const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
	const startTime = Date.now();
	const logger = createLogger({ operation: "mcp_search", requestId });

	try {
		// Validate MCP request
		const mcpRequest = await validateMCPRequest(request);
		logger.info("MCP request validated", {
			query: mcpRequest.query.substring(0, 100), // Truncate for privacy
			limit: mcpRequest.limit,
		});

		// Execute semantic search (Story 4.2)
		// executeSearch orchestrates: AI Search → enrichment → MCP format mapping
		// Create metrics collector for custom metrics tracking (Story 6.3)
		const metricsCollector = createMetricsCollector();
		const mcpResponse = await executeSearch(mcpRequest, env, metricsCollector);

		// Log request completion
		const duration = Date.now() - startTime;
		logger.info("MCP search completed", {
			duration,
			resultCount: mcpResponse.results.length,
			statusCode: 200,
		});

		return addCORSHeaders(
			new Response(JSON.stringify(mcpResponse), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
					"X-MCP-Version": MCP_VERSION,
					"X-Request-ID": requestId,
				},
			}),
		);
	} catch (error) {
		// Log error with duration
		logger.error("MCP search failed", {
			error: error instanceof Error ? error.message : "Unknown error",
			duration: Date.now() - startTime,
		});

		return formatErrorResponse(error);
	}
}
