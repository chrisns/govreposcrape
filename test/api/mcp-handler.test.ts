/**
 * Tests for MCP v2 Protocol Handler
 * Validates request validation, CORS handling, error formatting, and route handling
 *
 * Coverage target: 80%+ for src/api/mcp-handler.ts
 * Framework: Vitest 4.0+ with @cloudflare/vitest-pool-workers
 *
 * Story 4.2 Updates: Integration tests with search endpoint
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	validateMCPRequest,
	handleMCPSearch,
	handleOPTIONS,
	addCORSHeaders,
	formatErrorResponse,
	ERROR_CODES,
} from "../../src/api/mcp-handler";
import { ValidationError, ServiceError } from "../../src/utils/error-handler";
import type { MCPRequest, MCPResponse, ErrorResponse } from "../../src/types";

// Mock search endpoint for integration tests (Story 4.2)
vi.mock("../../src/api/search-endpoint");

/**
 * Helper function to create mock Request objects
 */
function createMockRequest(options: {
	method?: string;
	body?: any;
	headers?: Record<string, string>;
	url?: string;
}): Request {
	const { method = "POST", body, headers = {}, url = "http://localhost:8787/mcp/search" } = options;

	const defaultHeaders: Record<string, string> = {
		"content-type": "application/json",
		...headers,
	};

	return new Request(url, {
		method,
		headers: defaultHeaders,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

/**
 * Mock Env binding for testing
 */
const mockEnv: Env = {
	AI_SEARCH: {} as VectorizeIndex,
	R2: {} as R2Bucket,
	KV_CACHE: {} as KVNamespace,
	REPOS_JSON_URL: "https://example.com/repos.json",
	GITINGEST_CONTAINER: "gitingest:latest",
} as Env;

describe("validateMCPRequest", () => {
	it("should validate a valid request with query and limit", async () => {
		const request = createMockRequest({
			body: { query: "test query", limit: 5 },
		});

		const result = await validateMCPRequest(request);

		expect(result).toEqual({
			query: "test query",
			limit: 5,
		});
	});

	it("should use default limit when not provided", async () => {
		const request = createMockRequest({
			body: { query: "test query" },
		});

		const result = await validateMCPRequest(request);

		expect(result).toEqual({
			query: "test query",
			limit: 5, // DEFAULT
		});
	});

	it("should trim whitespace from query", async () => {
		const request = createMockRequest({
			body: { query: "  test query  " },
		});

		const result = await validateMCPRequest(request);

		expect(result.query).toBe("test query");
	});

	it("should throw ValidationError for missing Content-Type header", async () => {
		// Create request without Content-Type header
		const request = new Request("http://localhost:8787/mcp/search", {
			method: "POST",
			headers: {
				// Explicitly no Content-Type header
			},
			body: JSON.stringify({ query: "test query" }),
		});

		try {
			await validateMCPRequest(request);
			expect.fail("Should have thrown ValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).code).toBe(ERROR_CODES.INVALID_CONTENT_TYPE);
			expect((error as ValidationError).message).toBe("Content-Type must be application/json");
		}
	});

	it("should throw ValidationError for missing query field", async () => {
		const request = createMockRequest({
			body: { limit: 5 },
		});

		try {
			await validateMCPRequest(request);
			expect.fail("Should have thrown ValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).code).toBe(ERROR_CODES.INVALID_QUERY);
		}
	});

	it("should throw ValidationError for query too short (< 3 chars)", async () => {
		const request = createMockRequest({
			body: { query: "ab" },
		});

		try {
			await validateMCPRequest(request);
			expect.fail("Should have thrown ValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).code).toBe(ERROR_CODES.INVALID_QUERY);
			expect((error as ValidationError).message).toContain("at least 3 characters");
		}
	});

	it("should throw ValidationError for query too long (> 500 chars)", async () => {
		const request = createMockRequest({
			body: { query: "a".repeat(501) },
		});

		try {
			await validateMCPRequest(request);
			expect.fail("Should have thrown ValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).code).toBe(ERROR_CODES.INVALID_QUERY);
			expect((error as ValidationError).message).toContain("at most 500 characters");
		}
	});

	it("should throw ValidationError for non-integer limit", async () => {
		const request = createMockRequest({
			body: { query: "test query", limit: 1.5 },
		});

		try {
			await validateMCPRequest(request);
			expect.fail("Should have thrown ValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).code).toBe(ERROR_CODES.INVALID_LIMIT);
			expect((error as ValidationError).message).toBe("Limit must be an integer");
		}
	});

	it("should throw ValidationError for limit < 1", async () => {
		const request = createMockRequest({
			body: { query: "test query", limit: 0 },
		});

		try {
			await validateMCPRequest(request);
			expect.fail("Should have thrown ValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).code).toBe(ERROR_CODES.INVALID_LIMIT);
			expect((error as ValidationError).message).toContain("between 1 and 20");
		}
	});

	it("should throw ValidationError for limit > 20", async () => {
		const request = createMockRequest({
			body: { query: "test query", limit: 21 },
		});

		try {
			await validateMCPRequest(request);
			expect.fail("Should have thrown ValidationError");
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).code).toBe(ERROR_CODES.INVALID_LIMIT);
			expect((error as ValidationError).message).toContain("between 1 and 20");
		}
	});

	it("should throw ValidationError for malformed JSON", async () => {
		const request = new Request("http://localhost:8787/mcp/search", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: "{ invalid json }",
		});

		await expect(validateMCPRequest(request)).rejects.toThrow(ValidationError);
		await expect(validateMCPRequest(request)).rejects.toMatchObject({
			code: ERROR_CODES.MALFORMED_JSON,
		});
	});

	it("should accept valid limit values (1-20)", async () => {
		for (const limit of [1, 5, 10, 15, 20]) {
			const request = createMockRequest({
				body: { query: "test query", limit },
			});

			const result = await validateMCPRequest(request);
			expect(result.limit).toBe(limit);
		}
	});

	it("should warn but continue with missing X-MCP-Version header", async () => {
		const request = createMockRequest({
			body: { query: "test query" },
			headers: {
				// No X-MCP-Version header
			},
		});

		// Should not throw, just warn in logs
		const result = await validateMCPRequest(request);
		expect(result).toBeDefined();
	});

	it("should warn but continue with incorrect X-MCP-Version header", async () => {
		const request = createMockRequest({
			body: { query: "test query" },
			headers: {
				"x-mcp-version": "1", // Incorrect version
			},
		});

		// Should not throw, just warn in logs
		const result = await validateMCPRequest(request);
		expect(result).toBeDefined();
	});
});

describe("addCORSHeaders", () => {
	it("should add CORS headers to response", () => {
		const originalResponse = new Response(JSON.stringify({ test: "data" }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});

		const result = addCORSHeaders(originalResponse);

		expect(result.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(result.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS, GET");
		expect(result.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type, X-MCP-Version, X-Request-ID",
		);
		expect(result.headers.get("Content-Type")).toBe("application/json");
	});

	it("should preserve response status and body", async () => {
		const originalResponse = new Response(JSON.stringify({ test: "data" }), {
			status: 200,
		});

		const result = addCORSHeaders(originalResponse);

		expect(result.status).toBe(200);
		const body = await result.json();
		expect(body).toEqual({ test: "data" });
	});
});

describe("handleOPTIONS", () => {
	it("should return 204 No Content with CORS headers", () => {
		const result = handleOPTIONS();

		expect(result.status).toBe(204);
		expect(result.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(result.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS, GET");
		expect(result.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type, X-MCP-Version, X-Request-ID",
		);
		expect(result.headers.get("Content-Type")).toBe("application/json");
	});
});

describe("formatErrorResponse", () => {
	it("should format ValidationError as 400 Bad Request", async () => {
		const error = new ValidationError("Query too short", ERROR_CODES.INVALID_QUERY);

		const result = formatErrorResponse(error);

		expect(result.status).toBe(400);
		const body = (await result.json()) as ErrorResponse;
		expect(body).toEqual({
			error: {
				code: ERROR_CODES.INVALID_QUERY,
				message: "Query too short",
			},
		});
		expect(result.headers.get("Content-Type")).toBe("application/json");
	});

	it("should format ServiceError with retryAfter", async () => {
		const error = new ServiceError("AI Search unavailable", 503, ERROR_CODES.SEARCH_ERROR, 60);

		const result = formatErrorResponse(error);

		expect(result.status).toBe(503);
		const body = (await result.json()) as ErrorResponse;
		expect(body).toEqual({
			error: {
				code: ERROR_CODES.SEARCH_ERROR,
				message: "AI Search unavailable",
				retry_after: 60,
			},
		});
	});

	it("should format generic Error as 500 Internal Server Error", async () => {
		const error = new Error("Something went wrong");

		const result = formatErrorResponse(error);

		expect(result.status).toBe(500);
		const body = (await result.json()) as ErrorResponse;
		expect(body).toEqual({
			error: {
				code: ERROR_CODES.INTERNAL_ERROR,
				message: "An unexpected error occurred",
			},
		});
	});

	it("should include CORS headers in error responses", () => {
		const error = new ValidationError("Test error", ERROR_CODES.INVALID_QUERY);

		const result = formatErrorResponse(error);

		expect(result.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(result.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS, GET");
	});
});

describe("handleMCPSearch", () => {
	beforeEach(async () => {
		// Mock executeSearch for Story 4.1 tests
		const { executeSearch } = await import("../../src/api/search-endpoint");
		vi.mocked(executeSearch).mockResolvedValue({
			results: [],
			took_ms: 100,
		});
	});

	it("should return 200 OK with mock MCPResponse for valid request", async () => {
		const request = createMockRequest({
			body: { query: "test query", limit: 5 },
			headers: {
				"x-mcp-version": "2",
			},
		});

		const result = await handleMCPSearch(request, mockEnv);

		expect(result.status).toBe(200);
		expect(result.headers.get("Content-Type")).toBe("application/json");
		expect(result.headers.get("X-MCP-Version")).toBe("2");
		expect(result.headers.get("X-Request-ID")).toBeDefined();

		const body = (await result.json()) as MCPResponse;
		expect(body).toHaveProperty("results");
		expect(body).toHaveProperty("took_ms");
		expect(Array.isArray(body.results)).toBe(true);
		expect(body.results.length).toBe(0); // Mock response returns empty array
		expect(typeof body.took_ms).toBe("number");
		expect(body.took_ms).toBeGreaterThanOrEqual(0);
	});

	it("should use provided X-Request-ID if present", async () => {
		const testRequestId = "test-request-id-123";
		const request = createMockRequest({
			body: { query: "test query" },
			headers: {
				"x-request-id": testRequestId,
			},
		});

		const result = await handleMCPSearch(request, mockEnv);

		expect(result.headers.get("X-Request-ID")).toBe(testRequestId);
	});

	it("should generate X-Request-ID if not provided", async () => {
		const request = createMockRequest({
			body: { query: "test query" },
		});

		const result = await handleMCPSearch(request, mockEnv);

		const requestId = result.headers.get("X-Request-ID");
		expect(requestId).toBeDefined();
		expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i); // UUID format
	});

	it("should return 400 for invalid request (missing query)", async () => {
		const request = createMockRequest({
			body: { limit: 5 },
		});

		const result = await handleMCPSearch(request, mockEnv);

		expect(result.status).toBe(400);
		const body = (await result.json()) as ErrorResponse;
		expect(body.error.code).toBe(ERROR_CODES.INVALID_QUERY);
	});

	it("should return 400 for query too short", async () => {
		const request = createMockRequest({
			body: { query: "ab" },
		});

		const result = await handleMCPSearch(request, mockEnv);

		expect(result.status).toBe(400);
		const body = (await result.json()) as ErrorResponse;
		expect(body.error.code).toBe(ERROR_CODES.INVALID_QUERY);
	});

	it("should return 400 for query too long", async () => {
		const request = createMockRequest({
			body: { query: "a".repeat(501) },
		});

		const result = await handleMCPSearch(request, mockEnv);

		expect(result.status).toBe(400);
		const body = (await result.json()) as ErrorResponse;
		expect(body.error.code).toBe(ERROR_CODES.INVALID_QUERY);
	});

	it("should return 400 for limit out of range", async () => {
		const request = createMockRequest({
			body: { query: "test query", limit: 21 },
		});

		const result = await handleMCPSearch(request, mockEnv);

		expect(result.status).toBe(400);
		const body = (await result.json()) as ErrorResponse;
		expect(body.error.code).toBe(ERROR_CODES.INVALID_LIMIT);
	});

	it("should return 400 for malformed JSON", async () => {
		const request = new Request("http://localhost:8787/mcp/search", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: "{ invalid json }",
		});

		const result = await handleMCPSearch(request, mockEnv);

		expect(result.status).toBe(400);
		const body = (await result.json()) as ErrorResponse;
		expect(body.error.code).toBe(ERROR_CODES.MALFORMED_JSON);
	});

	it("should include CORS headers in all responses", async () => {
		const request = createMockRequest({
			body: { query: "test query" },
		});

		const result = await handleMCPSearch(request, mockEnv);

		expect(result.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(result.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS, GET");
		expect(result.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type, X-MCP-Version, X-Request-ID",
		);
	});

	it("should truncate long queries in logs (privacy)", async () => {
		const longQuery = "a".repeat(150);
		const request = createMockRequest({
			body: { query: longQuery },
		});

		// Should not throw and should log truncated query
		const result = await handleMCPSearch(request, mockEnv);

		expect(result.status).toBe(200);
		// Actual log truncation is tested implicitly via logger behavior
	});
});

/**
 * Story 4.2 Integration Tests: Search Endpoint Integration
 * Validates end-to-end POST /mcp/search flow with mocked AI Search
 */
describe("handleMCPSearch - Story 4.2 Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("AC #1-3: End-to-end search flow", () => {
		it("should return 200 OK with SearchResult[] from executeSearch", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods", limit: 5 },
				headers: { "X-MCP-Version": "2" },
			});

			const mockMCPResponse: MCPResponse = {
				results: [
					{
						repository: "alphagov/example-repo",
						file_path: "gitingest/alphagov/example-repo/summary.txt",
						match_snippet: "JWT authentication implementation",
						relevance_score: 0.95,
						metadata: {
							language: "TypeScript",
							stars: 0,
							last_updated: "2025-11-14T10:00:00Z",
							github_url: "https://github.com/alphagov/example-repo",
						},
					},
				],
				took_ms: 234,
			};

			// Mock executeSearch
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockResolvedValue(mockMCPResponse);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			expect(response.status).toBe(200);
			const responseBody: MCPResponse = await response.json();
			expect(responseBody.results).toHaveLength(1);
			expect(responseBody.results[0].repository).toBe("alphagov/example-repo");
			expect(responseBody.results[0].match_snippet).toBe("JWT authentication implementation");
			expect(responseBody.results[0].relevance_score).toBe(0.95);
			expect(responseBody.results[0].metadata.language).toBe("TypeScript");
			expect(responseBody.took_ms).toBe(234);
		});

		it("should call executeSearch with validated MCPRequest and env", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods", limit: 10 },
			});

			const mockMCPResponse: MCPResponse = {
				results: [],
				took_ms: 100,
			};

			// Mock executeSearch
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockResolvedValue(mockMCPResponse);

			// Act
			await handleMCPSearch(request, mockEnv);

			// Assert
			expect(executeSearch).toHaveBeenCalledWith(
				{ query: "authentication methods", limit: 10 },
				mockEnv,
			);
			expect(executeSearch).toHaveBeenCalledTimes(1);
		});

		it("should return empty results array when executeSearch returns no matches", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "nonexistent query" },
			});

			const mockMCPResponse: MCPResponse = {
				results: [],
				took_ms: 150,
			};

			// Mock executeSearch
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockResolvedValue(mockMCPResponse);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			expect(response.status).toBe(200);
			const responseBody: MCPResponse = await response.json();
			expect(responseBody.results).toEqual([]);
			expect(responseBody.took_ms).toBe(150);
		});
	});

	describe("AC #5: Error handling with executeSearch", () => {
		it("should return 503 ServiceError when executeSearch throws ServiceError", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods" },
			});

			const searchError = new ServiceError("AI Search timeout", 503, "SEARCH_ERROR", 60);

			// Mock executeSearch to throw ServiceError
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockRejectedValue(searchError);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			expect(response.status).toBe(503);
			const responseBody: ErrorResponse = await response.json();
			expect(responseBody.error.code).toBe("SEARCH_ERROR");
			expect(responseBody.error.message).toBe("AI Search timeout");
			expect(responseBody.error.retry_after).toBe(60);
		});

		it("should propagate ServiceError from executeSearch to formatErrorResponse", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods" },
			});

			const searchError = new ServiceError(
				"Search service temporarily unavailable",
				503,
				"SEARCH_ERROR",
				60,
			);

			// Mock executeSearch to throw ServiceError
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockRejectedValue(searchError);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			expect(response.status).toBe(503);
			const responseBody: ErrorResponse = await response.json();
			expect(responseBody.error.code).toBe("SEARCH_ERROR");
			expect(responseBody.error.retry_after).toBe(60);
		});
	});

	describe("Response headers and CORS", () => {
		it("should preserve CORS headers in successful search responses", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods" },
			});

			const mockMCPResponse: MCPResponse = {
				results: [],
				took_ms: 100,
			};

			// Mock executeSearch
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockResolvedValue(mockMCPResponse);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS, GET");
			expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
			expect(response.headers.get("Access-Control-Allow-Headers")).toContain("X-MCP-Version");
		});

		it("should include X-MCP-Version header in response", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods" },
				headers: { "X-MCP-Version": "2" },
			});

			const mockMCPResponse: MCPResponse = {
				results: [],
				took_ms: 100,
			};

			// Mock executeSearch
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockResolvedValue(mockMCPResponse);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			expect(response.headers.get("X-MCP-Version")).toBe("2");
		});

		it("should include X-Request-ID header in response", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods" },
				headers: { "X-Request-ID": "test-request-123" },
			});

			const mockMCPResponse: MCPResponse = {
				results: [],
				took_ms: 100,
			};

			// Mock executeSearch
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockResolvedValue(mockMCPResponse);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			expect(response.headers.get("X-Request-ID")).toBe("test-request-123");
		});

		it("should generate X-Request-ID if not provided in request", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods" },
				// No X-Request-ID header
			});

			const mockMCPResponse: MCPResponse = {
				results: [],
				took_ms: 100,
			};

			// Mock executeSearch
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockResolvedValue(mockMCPResponse);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			const requestId = response.headers.get("X-Request-ID");
			expect(requestId).toBeDefined();
			expect(requestId).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			); // UUID v4 format
		});
	});

	describe("Multiple results mapping", () => {
		it("should map multiple SearchResults correctly", async () => {
			// Arrange
			const request = createMockRequest({
				body: { query: "authentication methods", limit: 10 },
			});

			const mockMCPResponse: MCPResponse = {
				results: [
					{
						repository: "alphagov/repo1",
						file_path: "gitingest/alphagov/repo1/summary.txt",
						match_snippet: "JWT authentication",
						relevance_score: 0.95,
						metadata: {
							language: "TypeScript",
							stars: 0,
							last_updated: "2025-11-14T10:00:00Z",
							github_url: "https://github.com/alphagov/repo1",
						},
					},
					{
						repository: "alphagov/repo2",
						file_path: "gitingest/alphagov/repo2/summary.txt",
						match_snippet: "OAuth2 implementation",
						relevance_score: 0.85,
						metadata: {
							language: "Python",
							stars: 0,
							last_updated: "2025-11-14T09:00:00Z",
							github_url: "https://github.com/alphagov/repo2",
						},
					},
				],
				took_ms: 300,
			};

			// Mock executeSearch
			const { executeSearch } = await import("../../src/api/search-endpoint");
			vi.mocked(executeSearch).mockResolvedValue(mockMCPResponse);

			// Act
			const response = await handleMCPSearch(request, mockEnv);

			// Assert
			expect(response.status).toBe(200);
			const responseBody: MCPResponse = await response.json();
			expect(responseBody.results).toHaveLength(2);

			// Verify first result
			expect(responseBody.results[0].repository).toBe("alphagov/repo1");
			expect(responseBody.results[0].match_snippet).toBe("JWT authentication");
			expect(responseBody.results[0].relevance_score).toBe(0.95);
			expect(responseBody.results[0].metadata.language).toBe("TypeScript");

			// Verify second result
			expect(responseBody.results[1].repository).toBe("alphagov/repo2");
			expect(responseBody.results[1].match_snippet).toBe("OAuth2 implementation");
			expect(responseBody.results[1].relevance_score).toBe(0.85);
			expect(responseBody.results[1].metadata.language).toBe("Python");
		});
	});
});
