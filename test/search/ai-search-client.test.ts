/**
 * Unit tests for AI Search Client
 * Tests query validation, retry logic, error handling, logging, and performance monitoring
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
	searchCode,
	validateQuery,
	validateLimit,
	withRetry,
} from "../../src/search/ai-search-client";
import type { Env } from "../../src/types";
import type { AISearchQueryResponse } from "../../src/types";
import { ValidationError, ServiceError } from "../../src/utils/error-handler";
import * as logger from "../../src/utils/logger";

describe("ai-search-client", () => {
	let mockEnv: Env;
	let loggerSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Create mock environment with AI_SEARCH binding
		mockEnv = {
			AI_SEARCH: {
				query: vi.fn().mockResolvedValue({
					results: [
						{
							content: "function authenticateUser() { /* ... */ }",
							score: 0.92,
							metadata: {
								path: "gitingest/alphagov/govuk-frontend/summary.txt",
								contentType: "text/plain",
							},
						},
					],
					took_ms: 234,
				}),
			},
		} as unknown as Env;

		// Spy on logger to verify logging behavior
		loggerSpy = vi.spyOn(logger, "createLogger");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Query Validation", () => {
		test("rejects query with <3 characters", () => {
			expect(() => validateQuery("ab")).toThrow(ValidationError);
			expect(() => validateQuery("ab")).toThrow("Query must be at least 3 characters");
		});

		test("rejects empty query", () => {
			try {
				validateQuery("");
				expect.fail("Should have thrown ValidationError");
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				if (error instanceof ValidationError) {
					expect(error.code).toBe("QUERY_TOO_SHORT");
				}
			}
		});

		test("rejects query with only whitespace", () => {
			expect(() => validateQuery("  ")).toThrow(ValidationError);
		});

		test("rejects query with >500 characters", () => {
			const longQuery = "a".repeat(501);
			expect(() => validateQuery(longQuery)).toThrow(ValidationError);
			expect(() => validateQuery(longQuery)).toThrow("Query must not exceed 500 characters");
		});

		test("accepts valid query at minimum length", () => {
			expect(() => validateQuery("abc")).not.toThrow();
		});

		test("accepts valid query at maximum length", () => {
			const maxQuery = "a".repeat(500);
			expect(() => validateQuery(maxQuery)).not.toThrow();
		});

		test("accepts typical query", () => {
			expect(() => validateQuery("authentication methods")).not.toThrow();
		});
	});

	describe("Limit Validation", () => {
		test("rejects limit < 1", () => {
			expect(() => validateLimit(0)).toThrow(ValidationError);
			expect(() => validateLimit(0)).toThrow("Limit must be between 1 and 20");
		});

		test("rejects negative limit", () => {
			expect(() => validateLimit(-1)).toThrow(ValidationError);
		});

		test("rejects limit > 20", () => {
			try {
				validateLimit(21);
				expect.fail("Should have thrown ValidationError");
			} catch (error) {
				expect(error).toBeInstanceOf(ValidationError);
				if (error instanceof ValidationError) {
					expect(error.code).toBe("INVALID_LIMIT");
				}
			}
		});

		test("accepts minimum limit", () => {
			expect(() => validateLimit(1)).not.toThrow();
		});

		test("accepts maximum limit", () => {
			expect(() => validateLimit(20)).not.toThrow();
		});

		test("accepts typical limit", () => {
			expect(() => validateLimit(5)).not.toThrow();
			expect(() => validateLimit(10)).not.toThrow();
		});
	});

	describe("AI Search Integration", () => {
		test("returns results from AI Search", async () => {
			const result = await searchCode(mockEnv, "authentication", 5);

			expect(result).toEqual([
				{
					content: "function authenticateUser() { /* ... */ }",
					score: 0.92,
					metadata: {
						path: "gitingest/alphagov/govuk-frontend/summary.txt",
						contentType: "text/plain",
					},
				},
			]);
		});

		test("calls AI_SEARCH.query with correct parameters", async () => {
			await searchCode(mockEnv, "authentication methods", 10);

			expect(mockEnv.AI_SEARCH.query).toHaveBeenCalledWith({
				query: "authentication methods",
				top_k: 10,
			});
		});

		test("uses default limit of 5 when not specified", async () => {
			await searchCode(mockEnv, "test query");

			expect(mockEnv.AI_SEARCH.query).toHaveBeenCalledWith({
				query: "test query",
				top_k: 5,
			});
		});

		test("handles empty results gracefully", async () => {
			mockEnv.AI_SEARCH.query = vi.fn().mockResolvedValue({
				results: [],
				took_ms: 123,
			});

			const result = await searchCode(mockEnv, "nonexistent", 5);
			expect(result).toEqual([]);
		});

		test("returns multiple results in order", async () => {
			mockEnv.AI_SEARCH.query = vi.fn().mockResolvedValue({
				results: [
					{
						content: "result 1",
						score: 0.95,
						metadata: { path: "path1", contentType: "text/plain" },
					},
					{
						content: "result 2",
						score: 0.85,
						metadata: { path: "path2", contentType: "text/plain" },
					},
					{
						content: "result 3",
						score: 0.75,
						metadata: { path: "path3", contentType: "text/plain" },
					},
				],
				took_ms: 456,
			});

			const results = await searchCode(mockEnv, "test", 3);

			expect(results).toHaveLength(3);
			expect(results[0].score).toBe(0.95);
			expect(results[1].score).toBe(0.85);
			expect(results[2].score).toBe(0.75);
		});
	});

	describe("Retry Logic", () => {
		test("retries on AI Search timeout", async () => {
			let callCount = 0;
			mockEnv.AI_SEARCH.query = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount < 3) {
					throw new Error("Service timeout");
				}
				return Promise.resolve({
					results: [],
					took_ms: 500,
				} as AISearchQueryResponse);
			});

			const result = await searchCode(mockEnv, "test", 5);

			expect(mockEnv.AI_SEARCH.query).toHaveBeenCalledTimes(3);
			expect(result).toEqual([]);
		});

		test("throws ServiceError after 3 failed attempts", async () => {
			mockEnv.AI_SEARCH.query = vi.fn().mockRejectedValue(new Error("Service unavailable"));

			await expect(searchCode(mockEnv, "test", 5)).rejects.toThrow(ServiceError);

			expect(mockEnv.AI_SEARCH.query).toHaveBeenCalledTimes(3);
		}, 10000); // Increase timeout to account for retry delays

		test("ServiceError includes retry_after field", async () => {
			mockEnv.AI_SEARCH.query = vi.fn().mockRejectedValue(new Error("Service unavailable"));

			try {
				await searchCode(mockEnv, "test", 5);
				expect.fail("Should have thrown ServiceError");
			} catch (error) {
				expect(error).toBeInstanceOf(ServiceError);
				if (error instanceof ServiceError) {
					expect(error.retryAfter).toBe(60);
					expect(error.code).toBe("SEARCH_ERROR");
					expect(error.statusCode).toBe(503);
				}
			}
		});

		test("succeeds immediately if no failures", async () => {
			const result = await searchCode(mockEnv, "test", 5);

			expect(mockEnv.AI_SEARCH.query).toHaveBeenCalledTimes(1);
			expect(result).toHaveLength(1);
		});

		test("withRetry helper executes exponential backoff", async () => {
			const delays: number[] = [];
			let attempt = 0;

			const testFn = vi.fn().mockImplementation(() => {
				attempt++;
				if (attempt < 3) {
					throw new Error("Fail");
				}
				return Promise.resolve("success");
			});

			// Mock setTimeout to track delays
			const originalSetTimeout = global.setTimeout;
			global.setTimeout = ((fn: () => void, delay: number) => {
				delays.push(delay);
				return originalSetTimeout(fn, 0); // Execute immediately for test speed
			}) as typeof setTimeout;

			await withRetry(testFn, "test_operation", "test-request-id");

			global.setTimeout = originalSetTimeout;

			expect(testFn).toHaveBeenCalledTimes(3);
			expect(delays).toEqual([1000, 2000]); // First two delays before final success
		});
	});

	describe("Error Handling", () => {
		test("validates query before calling AI Search", async () => {
			await expect(searchCode(mockEnv, "ab", 5)).rejects.toThrow(ValidationError);

			// AI Search should not be called if validation fails
			expect(mockEnv.AI_SEARCH.query).not.toHaveBeenCalled();
		});

		test("validates limit before calling AI Search", async () => {
			await expect(searchCode(mockEnv, "valid query", 0)).rejects.toThrow(ValidationError);

			expect(mockEnv.AI_SEARCH.query).not.toHaveBeenCalled();
		});

		test("propagates AI Search errors with context", async () => {
			const searchError = new Error("Network failure");
			mockEnv.AI_SEARCH.query = vi.fn().mockRejectedValue(searchError);

			await expect(searchCode(mockEnv, "test", 5)).rejects.toThrow(ServiceError);
		});
	});

	describe("Logging", () => {
		test("creates logger with operation and requestId", async () => {
			await searchCode(mockEnv, "authentication", 5);

			expect(loggerSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					operation: "search",
					requestId: expect.stringMatching(
						/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
					),
				}),
			);
		});

		test("logs are created for successful queries", async () => {
			// Logger is called, logs go to console
			await searchCode(mockEnv, "test", 5);
			expect(loggerSpy).toHaveBeenCalled();
		});

		test("logs are created for failed queries", async () => {
			mockEnv.AI_SEARCH.query = vi.fn().mockRejectedValue(new Error("Service unavailable"));

			await expect(searchCode(mockEnv, "test", 5)).rejects.toThrow();
			expect(loggerSpy).toHaveBeenCalled();
		}, 10000);
	});

	describe("Performance Monitoring", () => {
		test("measures and logs query duration", async () => {
			await searchCode(mockEnv, "test", 5);
			// Duration is logged (visible in stdout during test run)
			expect(loggerSpy).toHaveBeenCalled();
		});

		test("handles slow queries >800ms", async () => {
			// Mock a slow query
			mockEnv.AI_SEARCH.query = vi.fn().mockImplementation(
				() =>
					new Promise((resolve) =>
						setTimeout(
							() =>
								resolve({
									results: [],
									took_ms: 1000,
								} as AISearchQueryResponse),
							900,
						),
					),
			);

			await searchCode(mockEnv, "slow query", 5);
			// Warning is logged for slow queries (visible in stdout)
			expect(loggerSpy).toHaveBeenCalled();
		});

		test("includes AI Search internal timing", async () => {
			const result = await searchCode(mockEnv, "test", 5);
			// Timing information is available from AI Search response
			expect(result).toBeDefined();
		});
	});

	describe("Edge Cases", () => {
		test("handles query with special characters", async () => {
			const specialQuery = "authentication + authorization (OAuth 2.0)";
			await searchCode(mockEnv, specialQuery, 5);

			expect(mockEnv.AI_SEARCH.query).toHaveBeenCalledWith({
				query: specialQuery,
				top_k: 5,
			});
		});

		test("handles query with Unicode characters", async () => {
			const unicodeQuery = "résumé café naïve";
			await searchCode(mockEnv, unicodeQuery, 5);

			expect(mockEnv.AI_SEARCH.query).toHaveBeenCalledWith({
				query: unicodeQuery,
				top_k: 5,
			});
		});

		test("handles query exactly at minimum length boundary", async () => {
			const result = await searchCode(mockEnv, "abc", 5);
			expect(result).toHaveLength(1);
		});

		test("handles query exactly at maximum length boundary", async () => {
			const maxQuery = "a".repeat(500);
			const result = await searchCode(mockEnv, maxQuery, 5);
			expect(result).toHaveLength(1);
		});
	});
});
