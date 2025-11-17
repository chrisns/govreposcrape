/**
 * Tests for repos-fetcher module
 * Story 2.1: Repository Discovery - Fetch and Parse repos.json Feed
 *
 * Test coverage:
 * - AC #1: Fetch, parse, extract fields
 * - AC #2: Retry logic with exponential backoff
 * - AC #3: Validation and statistics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	fetchReposJson,
	validateRepository,
	type FetchReposResult,
} from "../../src/ingestion/repos-fetcher";

// Mock the utilities
vi.mock("../../src/utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	}),
}));

describe("repos-fetcher", () => {
	// Save original fetch
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		global.fetch = originalFetch;
		vi.useRealTimers();
	});

	describe("validateRepository", () => {
		it("should validate repository with all required fields", () => {
			const validRepo = {
				html_url: "https://github.com/alphagov/govuk-frontend",
				pushed_at: "2025-10-15T14:30:00Z",
				full_name: "alphagov/govuk-frontend",
			};

			expect(validateRepository(validRepo)).toBe(true);
		});

		it("should reject repository with missing html_url", () => {
			const invalidRepo = {
				pushed_at: "2025-10-15T14:30:00Z",
				full_name: "alphagov/govuk-frontend",
			};

			expect(validateRepository(invalidRepo)).toBe(false);
		});

		it("should reject repository with missing pushed_at", () => {
			const invalidRepo = {
				html_url: "https://github.com/alphagov/govuk-frontend",
				full_name: "alphagov/govuk-frontend",
			};

			expect(validateRepository(invalidRepo)).toBe(false);
		});

		it("should reject repository with missing full_name", () => {
			const invalidRepo = {
				html_url: "https://github.com/alphagov/govuk-frontend",
				pushed_at: "2025-10-15T14:30:00Z",
			};

			expect(validateRepository(invalidRepo)).toBe(false);
		});

		it("should reject repository with non-string html_url", () => {
			const invalidRepo = {
				html_url: 12345,
				pushed_at: "2025-10-15T14:30:00Z",
				full_name: "alphagov/govuk-frontend",
			};

			expect(validateRepository(invalidRepo)).toBe(false);
		});

		it("should reject repository with invalid full_name format", () => {
			const invalidRepo = {
				html_url: "https://github.com/alphagov/govuk-frontend",
				pushed_at: "2025-10-15T14:30:00Z",
				full_name: "invalid-format",
			};

			expect(validateRepository(invalidRepo)).toBe(false);
		});
	});

	describe("fetchReposJson", () => {
		it("should successfully fetch and parse repos.json", async () => {
			const mockRepos = [
				{
					html_url: "https://github.com/alphagov/govuk-frontend",
					pushed_at: "2025-10-15T14:30:00Z",
					full_name: "alphagov/govuk-frontend",
				},
				{
					html_url: "https://github.com/nhsdigital/nhs-notify",
					pushed_at: "2025-11-01T10:00:00Z",
					full_name: "nhsdigital/nhs-notify",
				},
			];

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => JSON.stringify(mockRepos),
			});

			const result: FetchReposResult = await fetchReposJson("https://test.example.com/repos.json");

			expect(result.repositories).toHaveLength(2);
			expect(result.repositories[0]).toEqual({
				url: "https://github.com/alphagov/govuk-frontend",
				pushedAt: "2025-10-15T14:30:00Z",
				org: "alphagov",
				name: "govuk-frontend",
			});
			expect(result.stats.total).toBe(2);
			expect(result.stats.valid).toBe(2);
			expect(result.stats.invalid).toBe(0);
		});

		it("should handle empty array", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => JSON.stringify([]),
			});

			const result = await fetchReposJson("https://test.example.com/repos.json");

			expect(result.repositories).toHaveLength(0);
			expect(result.stats.total).toBe(0);
			expect(result.stats.valid).toBe(0);
		});

		it("should filter out invalid repositories", async () => {
			const mockRepos = [
				{
					html_url: "https://github.com/alphagov/govuk-frontend",
					pushed_at: "2025-10-15T14:30:00Z",
					full_name: "alphagov/govuk-frontend",
				},
				{
					// Missing pushed_at
					html_url: "https://github.com/invalid/repo",
					full_name: "invalid/repo",
				},
				{
					html_url: "https://github.com/hmrc/tax-calc",
					pushed_at: "2025-11-05T12:00:00Z",
					full_name: "hmrc/tax-calc",
				},
			];

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => JSON.stringify(mockRepos),
			});

			const result = await fetchReposJson("https://test.example.com/repos.json");

			expect(result.repositories).toHaveLength(2);
			expect(result.stats.total).toBe(3);
			expect(result.stats.valid).toBe(2);
			expect(result.stats.invalid).toBe(1);
		});

		it("should handle malformed JSON", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => "invalid json {",
			});

			await expect(fetchReposJson("https://test.example.com/repos.json")).rejects.toThrow(
				"Malformed JSON in repos.json feed",
			);
		});

		it("should handle non-array JSON", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => JSON.stringify({ error: "not an array" }),
			});

			await expect(fetchReposJson("https://test.example.com/repos.json")).rejects.toThrow(
				"Malformed JSON in repos.json feed",
			);
		});

		it("should retry on network error with exponential backoff", async () => {
			let attemptCount = 0;

			global.fetch = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 3) {
					return Promise.reject(new Error("Network error"));
				}
				return Promise.resolve({
					ok: true,
					text: async () => JSON.stringify([]),
				});
			});

			const promise = fetchReposJson("https://test.example.com/repos.json");

			// Advance timers for retry delays
			await vi.advanceTimersByTimeAsync(1000); // First retry delay
			await vi.advanceTimersByTimeAsync(2000); // Second retry delay

			const result = await promise;

			expect(attemptCount).toBe(3);
			expect(result.repositories).toHaveLength(0);
		});

		it("should fail after 3 retry attempts", async () => {
			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const promise = fetchReposJson("https://test.example.com/repos.json");

			// Advance timers for all retry delays
			await vi.advanceTimersByTimeAsync(1000); // First retry
			await vi.advanceTimersByTimeAsync(2000); // Second retry
			await vi.advanceTimersByTimeAsync(4000); // Third retry

			await expect(promise).rejects.toThrow("Failed to fetch repos.json after 3 attempts");
			expect(global.fetch).toHaveBeenCalledTimes(3);
		});

		it("should handle HTTP error status", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const promise = fetchReposJson("https://test.example.com/repos.json");

			// Advance timers for all retry delays
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(2000);
			await vi.advanceTimersByTimeAsync(4000);

			await expect(promise).rejects.toThrow("Failed to fetch repos.json after 3 attempts");
		});

		it("should handle 500 server error with retry", async () => {
			let attemptCount = 0;

			global.fetch = vi.fn().mockImplementation(() => {
				attemptCount++;
				if (attemptCount < 3) {
					return Promise.resolve({
						ok: false,
						status: 500,
						statusText: "Internal Server Error",
					});
				}
				return Promise.resolve({
					ok: true,
					text: async () => JSON.stringify([]),
				});
			});

			const promise = fetchReposJson("https://test.example.com/repos.json");

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(2000);

			const result = await promise;

			expect(attemptCount).toBe(3);
			expect(result.stats.total).toBe(0);
		});

		it("should extract correct fields from repositories", async () => {
			const mockRepos = [
				{
					html_url: "https://github.com/dwpdigital/benefits-calc",
					pushed_at: "2025-11-10T15:45:00Z",
					full_name: "dwpdigital/benefits-calc",
					description: "Benefits calculator",
					language: "TypeScript",
				},
			];

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => JSON.stringify(mockRepos),
			});

			const result = await fetchReposJson("https://test.example.com/repos.json");

			expect(result.repositories[0].url).toBe("https://github.com/dwpdigital/benefits-calc");
			expect(result.repositories[0].pushedAt).toBe("2025-11-10T15:45:00Z");
			expect(result.repositories[0].org).toBe("dwpdigital");
			expect(result.repositories[0].name).toBe("benefits-calc");
		});

		it("should calculate statistics correctly", async () => {
			const mockRepos = [
				{
					html_url: "https://github.com/org1/repo1",
					pushed_at: "2025-01-01T00:00:00Z",
					full_name: "org1/repo1",
				},
				{
					html_url: "https://github.com/org2/repo2",
					pushed_at: "2025-01-02T00:00:00Z",
					full_name: "org2/repo2",
				},
				{
					// Invalid - missing pushed_at
					html_url: "https://github.com/org3/repo3",
					full_name: "org3/repo3",
				},
				{
					html_url: "https://github.com/org4/repo4",
					pushed_at: "2025-01-04T00:00:00Z",
					full_name: "org4/repo4",
				},
			];

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => JSON.stringify(mockRepos),
			});

			const result = await fetchReposJson("https://test.example.com/repos.json");

			expect(result.stats.total).toBe(4);
			expect(result.stats.valid).toBe(3);
			expect(result.stats.invalid).toBe(1);
			expect(result.stats.parseErrors).toBe(0);
		});

		it("should handle timeout with AbortSignal", async () => {
			// Mock fetch to simulate timeout via AbortError
			global.fetch = vi.fn().mockRejectedValue(
				Object.assign(new Error("The operation was aborted"), {
					name: "AbortError",
				}),
			);

			const promise = fetchReposJson("https://test.example.com/repos.json");

			// Advance past retry delays
			await vi.advanceTimersByTimeAsync(1000); // First retry
			await vi.advanceTimersByTimeAsync(2000); // Second retry
			await vi.advanceTimersByTimeAsync(4000); // Third retry

			await expect(promise).rejects.toThrow("Failed to fetch repos.json after 3 attempts");
			expect(global.fetch).toHaveBeenCalledTimes(3);
		});

		it("should set correct User-Agent header", async () => {
			let capturedOptions: RequestInit | undefined;

			global.fetch = vi.fn().mockImplementation((url, options) => {
				capturedOptions = options;
				return Promise.resolve({
					ok: true,
					text: async () => JSON.stringify([]),
				});
			});

			await fetchReposJson("https://test.example.com/repos.json");

			expect(capturedOptions?.headers).toEqual({
				Accept: "application/json",
				"User-Agent": "govreposcrape/1.0",
			});
		});
	});
});
