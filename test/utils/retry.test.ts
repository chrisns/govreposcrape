/**
 * Tests for retry utility with exponential backoff
 * Validates retry logic, exponential delays, max retries, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../../src/utils/retry";

describe("withRetry", () => {
	// Mock console.log to suppress logger output in tests
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Success scenarios", () => {
		it("should succeed on first attempt when function succeeds", async () => {
			const fn = vi.fn().mockResolvedValue("success");

			const result = await withRetry(fn);

			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("should return the resolved value", async () => {
			const expectedValue = { data: "test" };
			const fn = vi.fn().mockResolvedValue(expectedValue);

			const result = await withRetry(fn);

			expect(result).toEqual(expectedValue);
		});
	});

	describe("Retry logic", () => {
		it("should retry on failure with exponential backoff", async () => {
			vi.useFakeTimers();

			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockResolvedValueOnce("success");

			const promise = withRetry(fn, 3, [1000, 2000, 4000]);

			// First attempt fails immediately
			await vi.advanceTimersByTimeAsync(0);

			// Wait for first retry (1000ms)
			await vi.advanceTimersByTimeAsync(1000);

			// Wait for second retry (2000ms)
			await vi.advanceTimersByTimeAsync(2000);

			const result = await promise;

			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(3);

			vi.useRealTimers();
		});

		it("should respect maxRetries limit and throw last error", async () => {
			const error1 = new Error("Fail 1");
			const error2 = new Error("Fail 2");
			const error3 = new Error("Fail 3");

			const fn = vi
				.fn()
				.mockRejectedValueOnce(error1)
				.mockRejectedValueOnce(error2)
				.mockRejectedValueOnce(error3);

			await expect(withRetry(fn, 3, [100, 200, 300])).rejects.toThrow("Fail 3");

			expect(fn).toHaveBeenCalledTimes(3);
		});

		it("should succeed after 2 failures (retry success path)", async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockResolvedValueOnce("success");

			const result = await withRetry(fn, 3, [100, 200, 300]);

			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(3);
		});
	});

	describe("Delay timing", () => {
		it("should use correct exponential backoff delays", async () => {
			vi.useFakeTimers();

			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockResolvedValueOnce("success");

			const promise = withRetry(fn, 3, [1000, 2000, 4000]);

			// First attempt (immediate)
			await vi.advanceTimersByTimeAsync(0);
			expect(fn).toHaveBeenCalledTimes(1);

			// First retry after 1000ms
			await vi.advanceTimersByTimeAsync(999);
			expect(fn).toHaveBeenCalledTimes(1); // Not yet
			await vi.advanceTimersByTimeAsync(1);
			expect(fn).toHaveBeenCalledTimes(2);

			// Second retry after 2000ms
			await vi.advanceTimersByTimeAsync(1999);
			expect(fn).toHaveBeenCalledTimes(2); // Not yet
			await vi.advanceTimersByTimeAsync(1);
			expect(fn).toHaveBeenCalledTimes(3);

			await promise;

			vi.useRealTimers();
		});

		it("should handle custom delays array", async () => {
			vi.useFakeTimers();

			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockResolvedValueOnce("success");

			const promise = withRetry(fn, 3, [500, 1000, 1500]);

			// First retry after 500ms
			await vi.advanceTimersByTimeAsync(500);

			// Second retry after 1000ms
			await vi.advanceTimersByTimeAsync(1000);

			await promise;

			expect(fn).toHaveBeenCalledTimes(3);

			vi.useRealTimers();
		});
	});

	describe("Custom configuration", () => {
		it("should work with custom maxRetries value", async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockRejectedValueOnce(new Error("Fail 3"))
				.mockRejectedValueOnce(new Error("Fail 4"))
				.mockResolvedValueOnce("success");

			const result = await withRetry(fn, 5, [50, 50, 50, 50, 50]);

			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(5);
		});

		it("should use last delay if delays array is shorter than retries", async () => {
			vi.useFakeTimers();

			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockRejectedValueOnce(new Error("Fail 3"))
				.mockRejectedValueOnce(new Error("Fail 4"))
				.mockResolvedValueOnce("success");

			const promise = withRetry(fn, 5, [100, 200]); // Only 2 delays for 5 retries

			// Retries should use: 100ms, 200ms, 200ms (last), 200ms (last)
			await vi.advanceTimersByTimeAsync(100); // First retry
			await vi.advanceTimersByTimeAsync(200); // Second retry
			await vi.advanceTimersByTimeAsync(200); // Third retry (uses last delay)
			await vi.advanceTimersByTimeAsync(200); // Fourth retry (uses last delay)

			const result = await promise;

			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(5);

			vi.useRealTimers();
		});
	});

	describe("Error handling", () => {
		it("should throw last error when all retries exhausted", async () => {
			const lastError = new Error("Final failure");
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockRejectedValueOnce(lastError);

			await expect(withRetry(fn, 3, [50, 50, 50])).rejects.toThrow("Final failure");
		});

		it("should handle non-Error thrown values", async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce("string error")
				.mockRejectedValueOnce({ error: "object error" })
				.mockRejectedValueOnce(404);

			await expect(withRetry(fn, 3, [50, 50, 50])).rejects.toBe(404);
		});
	});

	describe("Default parameters", () => {
		it("should use default maxRetries (3) when not provided", async () => {
			const fn = vi.fn().mockRejectedValue(new Error("Always fails"));

			await expect(withRetry(fn)).rejects.toThrow();

			expect(fn).toHaveBeenCalledTimes(3);
		});

		it("should use default delays [1000, 2000, 4000] when not provided", async () => {
			vi.useFakeTimers();

			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("Fail 1"))
				.mockRejectedValueOnce(new Error("Fail 2"))
				.mockResolvedValueOnce("success");

			const promise = withRetry(fn); // Using defaults

			// Verify default delays: 1000ms, 2000ms
			await vi.advanceTimersByTimeAsync(1000);
			expect(fn).toHaveBeenCalledTimes(2);

			await vi.advanceTimersByTimeAsync(2000);
			expect(fn).toHaveBeenCalledTimes(3);

			await promise;

			vi.useRealTimers();
		});
	});
});
