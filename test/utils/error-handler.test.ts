/**
 * Tests for custom error classes
 * Validates error instantiation, status codes, toErrorResponse() formatting, and PRD FR-3 compliance
 */

import { describe, it, expect } from "vitest";
import { ValidationError, ServiceError, APIError, AppError } from "../../src/utils/error-handler";
import type { ErrorResponse } from "../../src/types";

describe("ValidationError", () => {
	it("should have statusCode 400", () => {
		const error = new ValidationError("Invalid input");
		expect(error.statusCode).toBe(400);
	});

	it("should set error name to ValidationError", () => {
		const error = new ValidationError("Invalid input");
		expect(error.name).toBe("ValidationError");
	});

	it("should use custom code when provided", () => {
		const error = new ValidationError("Query too short", "QUERY_TOO_SHORT");
		expect(error.code).toBe("QUERY_TOO_SHORT");
	});

	it("should use default code VALIDATION_ERROR when not provided", () => {
		const error = new ValidationError("Invalid input");
		expect(error.code).toBe("VALIDATION_ERROR");
	});

	it("should return correct ErrorResponse format", () => {
		const error = new ValidationError("Query must be at least 3 characters", "QUERY_TOO_SHORT");
		const response = error.toErrorResponse();

		expect(response).toEqual({
			error: {
				code: "QUERY_TOO_SHORT",
				message: "Query must be at least 3 characters",
			},
		});
	});

	it("should extend Error properly", () => {
		const error = new ValidationError("Invalid input");
		expect(error instanceof Error).toBe(true);
		expect(error instanceof ValidationError).toBe(true);
	});
});

describe("ServiceError", () => {
	it("should accept custom statusCode 500", () => {
		const error = new ServiceError("Internal error", 500);
		expect(error.statusCode).toBe(500);
	});

	it("should accept custom statusCode 503", () => {
		const error = new ServiceError("Service unavailable", 503, "SERVICE_UNAVAILABLE");
		expect(error.statusCode).toBe(503);
	});

	it("should use default statusCode 500 when not provided", () => {
		const error = new ServiceError("Internal error");
		expect(error.statusCode).toBe(500);
	});

	it("should set error name to ServiceError", () => {
		const error = new ServiceError("Internal error");
		expect(error.name).toBe("ServiceError");
	});

	it("should use custom code when provided", () => {
		const error = new ServiceError("DB unavailable", 503, "DB_UNAVAILABLE");
		expect(error.code).toBe("DB_UNAVAILABLE");
	});

	it("should use default code SERVICE_ERROR when not provided", () => {
		const error = new ServiceError("Internal error");
		expect(error.code).toBe("SERVICE_ERROR");
	});

	it("should include retry_after in toErrorResponse when provided", () => {
		const error = new ServiceError("Service unavailable", 503, "SERVICE_UNAVAILABLE", 60);
		const response = error.toErrorResponse();

		expect(response).toEqual({
			error: {
				code: "SERVICE_UNAVAILABLE",
				message: "Service unavailable",
				retry_after: 60,
			},
		});
	});

	it("should not include retry_after in toErrorResponse when not provided", () => {
		const error = new ServiceError("Internal error", 500, "INTERNAL_ERROR");
		const response = error.toErrorResponse();

		expect(response).toEqual({
			error: {
				code: "INTERNAL_ERROR",
				message: "Internal error",
			},
		});
		expect(response.error.retry_after).toBeUndefined();
	});

	it("should extend Error properly", () => {
		const error = new ServiceError("Internal error");
		expect(error instanceof Error).toBe(true);
		expect(error instanceof ServiceError).toBe(true);
	});
});

describe("APIError", () => {
	it("should accept custom statusCode", () => {
		const error = new APIError("External API failed", 502, "EXTERNAL_API_ERROR");
		expect(error.statusCode).toBe(502);
	});

	it("should set error name to APIError", () => {
		const error = new APIError("API error", 500, "API_ERROR");
		expect(error.name).toBe("APIError");
	});

	it("should use provided code", () => {
		const error = new APIError("Rate limit exceeded", 429, "RATE_LIMIT_EXCEEDED");
		expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
	});

	it("should return correct ErrorResponse format", () => {
		const error = new APIError("External API failed", 502, "EXTERNAL_API_ERROR");
		const response = error.toErrorResponse();

		expect(response).toEqual({
			error: {
				code: "EXTERNAL_API_ERROR",
				message: "External API failed",
			},
		});
	});

	it("should extend Error properly", () => {
		const error = new APIError("API error", 500, "API_ERROR");
		expect(error instanceof Error).toBe(true);
		expect(error instanceof APIError).toBe(true);
	});
});

describe("AppError (base class)", () => {
	it("should accept custom statusCode, code, and message", () => {
		const error = new AppError("Custom error", 418, "TEAPOT_ERROR");
		expect(error.statusCode).toBe(418);
		expect(error.code).toBe("TEAPOT_ERROR");
		expect(error.message).toBe("Custom error");
	});

	it("should return correct ErrorResponse format", () => {
		const error = new AppError("Custom error", 418, "TEAPOT_ERROR");
		const response = error.toErrorResponse();

		expect(response).toEqual({
			error: {
				code: "TEAPOT_ERROR",
				message: "Custom error",
			},
		});
	});
});

describe("PRD FR-3 Compliance", () => {
	it("should match PRD error response format exactly", () => {
		const error = new ValidationError("Invalid query", "INVALID_QUERY");
		const response: ErrorResponse = error.toErrorResponse();

		// Verify structure matches PRD FR-3
		expect(response).toHaveProperty("error");
		expect(response.error).toHaveProperty("code");
		expect(response.error).toHaveProperty("message");
		expect(typeof response.error.code).toBe("string");
		expect(typeof response.error.message).toBe("string");
	});

	it("should include retry_after as optional number when present", () => {
		const error = new ServiceError("Try again later", 503, "SERVICE_UNAVAILABLE", 30);
		const response: ErrorResponse = error.toErrorResponse();

		expect(response.error.retry_after).toBe(30);
		expect(typeof response.error.retry_after).toBe("number");
	});

	it("should provide user-friendly messages (no stack traces)", () => {
		const error = new ValidationError("Query too short", "QUERY_TOO_SHORT");
		const response = error.toErrorResponse();

		// Message should be human-readable
		expect(response.error.message).toBe("Query too short");
		// Should not contain stack trace markers
		expect(response.error.message).not.toContain("at ");
		expect(response.error.message).not.toContain("Error:");
	});
});
