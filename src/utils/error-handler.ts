/**
 * Custom error classes for govreposcrape
 * Provides structured error handling with HTTP status codes and formatted responses
 *
 * All error classes follow the PRD FR-3 specification:
 * ErrorResponse format: { error: { code: string, message: string, retry_after?: number } }
 *
 * @example
 * ```typescript
 * throw new ValidationError('Query too short', 'INVALID_QUERY');
 * throw new ServiceError('AI Search unavailable', 503, 'SEARCH_UNAVAILABLE', 60);
 * throw new APIError('External API failed', 502, 'EXTERNAL_API_ERROR');
 * ```
 */

import type { ErrorResponse } from "../types";

/**
 * Base application error class
 * Extends Error with statusCode and code properties
 */
export class AppError extends Error {
	/** HTTP status code for this error */
	statusCode: number;
	/** Machine-readable error code */
	code: string;

	constructor(message: string, statusCode: number, code: string) {
		super(message);
		this.name = "AppError";
		this.statusCode = statusCode;
		this.code = code;
	}

	/**
	 * Convert error to PRD FR-3 compliant ErrorResponse format
	 * @returns Formatted error response object
	 */
	toErrorResponse(): ErrorResponse {
		return {
			error: {
				code: this.code,
				message: this.message,
			},
		};
	}
}

/**
 * Validation error for invalid input or malformed requests
 * Always returns HTTP 400 status code
 *
 * Use cases:
 * - Invalid query parameters
 * - Malformed request bodies
 * - Missing required fields
 * - Input validation failures
 *
 * @example
 * ```typescript
 * if (query.length < 3) {
 *   throw new ValidationError(
 *     'Query must be at least 3 characters',
 *     'QUERY_TOO_SHORT'
 *   );
 * }
 * ```
 */
export class ValidationError extends AppError {
	constructor(message: string, code = "VALIDATION_ERROR") {
		super(message, 400, code);
		this.name = "ValidationError";
	}
}

/**
 * Service error for internal service failures or dependency unavailability
 * Supports both 500 (internal error) and 503 (service unavailable) status codes
 *
 * Use cases:
 * - Internal service failures
 * - Database unavailability
 * - External dependency failures
 * - Temporary service outages
 *
 * @example
 * ```typescript
 * throw new ServiceError(
 *   'AI Search temporarily unavailable',
 *   503,
 *   'SEARCH_UNAVAILABLE',
 *   60  // retry after 60 seconds
 * );
 * ```
 */
export class ServiceError extends AppError {
	/** Optional: seconds to wait before retrying */
	retryAfter?: number;

	constructor(message: string, statusCode = 500, code = "SERVICE_ERROR", retryAfter?: number) {
		super(message, statusCode, code);
		this.name = "ServiceError";
		this.retryAfter = retryAfter;
	}

	/**
	 * Convert error to PRD FR-3 compliant ErrorResponse format
	 * Includes retry_after field if specified
	 * @returns Formatted error response object
	 */
	toErrorResponse(): ErrorResponse {
		const response: ErrorResponse = {
			error: {
				code: this.code,
				message: this.message,
			},
		};

		if (this.retryAfter !== undefined) {
			response.error.retry_after = this.retryAfter;
		}

		return response;
	}
}

/**
 * Generic API error with custom HTTP status code
 * Used for specific HTTP error scenarios not covered by other error classes
 *
 * Use cases:
 * - External API failures (502 Bad Gateway)
 * - Rate limiting (429 Too Many Requests)
 * - Custom HTTP status codes
 * - Proxy errors
 *
 * @example
 * ```typescript
 * throw new APIError(
 *   'External API rate limit exceeded',
 *   429,
 *   'RATE_LIMIT_EXCEEDED'
 * );
 * ```
 */
export class APIError extends AppError {
	constructor(message: string, statusCode: number, code: string) {
		super(message, statusCode, code);
		this.name = "APIError";
	}
}
