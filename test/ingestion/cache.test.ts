/**
 * Tests for cache module
 * Story 2.2: Smart Caching with KV - Avoid Unnecessary Reprocessing
 *
 * Test coverage:
 * - AC #1: Cache checking logic with KV queries and timestamp comparison
 * - AC #2: Cache updates with atomic KV writes and retry logic
 * - AC #3: Cache statistics tracking and hit rate calculation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	checkCache,
	updateCache,
	getCacheStats,
	resetCacheStats,
	getCacheKey,
} from "../../src/ingestion/cache";
import type { RepoMetadata, CacheEntry } from "../../src/types";
import type { KVNamespace } from "@cloudflare/workers-types";

// Mock the utilities
vi.mock("../../src/utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	}),
}));

vi.mock("../../src/utils/retry", () => ({
	withRetry: vi.fn(async (fn) => await fn()),
}));

describe("cache", () => {
	let mockKV: KVNamespace;
	let mockRepo: RepoMetadata;

	beforeEach(() => {
		// Reset statistics before each test
		resetCacheStats();

		// Create mock KV namespace
		mockKV = {
			get: vi.fn(),
			put: vi.fn(),
		} as unknown as KVNamespace;

		// Create mock repository metadata
		mockRepo = {
			url: "https://github.com/alphagov/govuk-frontend",
			pushedAt: "2025-10-15T14:30:00Z",
			org: "alphagov",
			name: "govuk-frontend",
		};
	});

	describe("getCacheKey", () => {
		it("should generate cache key with correct pattern repo:{org}/{name}", () => {
			const key = getCacheKey("alphagov", "govuk-frontend");
			expect(key).toBe("repo:alphagov/govuk-frontend");
		});

		it("should handle different organization and repository names", () => {
			const key = getCacheKey("nhsdigital", "nhs-notify");
			expect(key).toBe("repo:nhsdigital/nhs-notify");
		});

		it("should handle repositories with hyphens and numbers", () => {
			const key = getCacheKey("hmrc", "tax-calc-2024");
			expect(key).toBe("repo:hmrc/tax-calc-2024");
		});
	});

	describe("checkCache", () => {
		it("should return cache hit when pushedAt matches", async () => {
			const cachedEntry: CacheEntry = {
				pushedAt: "2025-10-15T14:30:00Z",
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedEntry);

			const result = await checkCache(mockRepo, mockKV);

			expect(result.needsProcessing).toBe(false);
			expect(result.reason).toBe("cache-hit");
			expect(result.cachedEntry).toEqual(cachedEntry);
			expect(mockKV.get).toHaveBeenCalledWith("repo:alphagov/govuk-frontend", "json");
		});

		it("should return cache miss when no entry exists", async () => {
			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await checkCache(mockRepo, mockKV);

			expect(result.needsProcessing).toBe(true);
			expect(result.reason).toBe("cache-miss");
			expect(result.cachedEntry).toBeUndefined();
		});

		it("should return stale cache when pushedAt differs", async () => {
			const cachedEntry: CacheEntry = {
				pushedAt: "2025-10-10T10:00:00Z", // Different from mockRepo
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedEntry);

			const result = await checkCache(mockRepo, mockKV);

			expect(result.needsProcessing).toBe(true);
			expect(result.reason).toBe("stale-cache");
			expect(result.cachedEntry).toEqual(cachedEntry);
		});

		it("should treat KV read error as cache miss (fail-safe)", async () => {
			(mockKV.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("KV read failed"));

			const result = await checkCache(mockRepo, mockKV);

			expect(result.needsProcessing).toBe(true);
			expect(result.reason).toBe("cache-miss");
			expect(result.cachedEntry).toBeUndefined();
		});

		it("should treat malformed cache entry as cache miss", async () => {
			const malformedEntry = {
				pushedAt: "2025-10-15T14:30:00Z",
				// Missing processedAt and status
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(malformedEntry);

			const result = await checkCache(mockRepo, mockKV);

			expect(result.needsProcessing).toBe(true);
			expect(result.reason).toBe("cache-miss");
		});

		it("should treat cache entry with missing pushedAt as cache miss", async () => {
			const invalidEntry = {
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(invalidEntry);

			const result = await checkCache(mockRepo, mockKV);

			expect(result.needsProcessing).toBe(true);
			expect(result.reason).toBe("cache-miss");
		});

		it("should handle multiple repositories with different organizations", async () => {
			const nhsRepo: RepoMetadata = {
				url: "https://github.com/nhsdigital/nhs-notify",
				pushedAt: "2025-11-01T10:00:00Z",
				org: "nhsdigital",
				name: "nhs-notify",
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await checkCache(nhsRepo, mockKV);

			expect(mockKV.get).toHaveBeenCalledWith("repo:nhsdigital/nhs-notify", "json");
		});
	});

	describe("updateCache", () => {
		it("should write cache entry to KV with correct structure", async () => {
			(mockKV.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			await updateCache(mockRepo, mockKV);

			expect(mockKV.put).toHaveBeenCalledTimes(1);
			const [key, value] = (mockKV.put as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(key).toBe("repo:alphagov/govuk-frontend");

			const entry = JSON.parse(value);
			expect(entry.pushedAt).toBe("2025-10-15T14:30:00Z");
			expect(entry.status).toBe("complete");
			expect(entry.processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO 8601 format
		});

		it("should use withRetry for KV write operations", async () => {
			const { withRetry } = await import("../../src/utils/retry");
			(mockKV.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			await updateCache(mockRepo, mockKV);

			expect(withRetry).toHaveBeenCalledWith(expect.any(Function), 3, [1000, 2000, 4000]);
		});

		it("should not throw error on KV write failure (graceful degradation)", async () => {
			(mockKV.put as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("KV write failed"));

			// Should not throw
			await expect(updateCache(mockRepo, mockKV)).resolves.toBeUndefined();
		});

		it("should handle multiple cache updates for different repositories", async () => {
			(mockKV.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

			await updateCache(mockRepo, mockKV);

			const hmrcRepo: RepoMetadata = {
				url: "https://github.com/hmrc/tax-calc",
				pushedAt: "2025-11-05T12:00:00Z",
				org: "hmrc",
				name: "tax-calc",
			};

			await updateCache(hmrcRepo, mockKV);

			expect(mockKV.put).toHaveBeenCalledTimes(2);
			expect((mockKV.put as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
				"repo:alphagov/govuk-frontend",
			);
			expect((mockKV.put as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe("repo:hmrc/tax-calc");
		});
	});

	describe("getCacheStats", () => {
		it("should return initial statistics with zero values", () => {
			const stats = getCacheStats();

			expect(stats.totalChecks).toBe(0);
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
			expect(stats.hitRate).toBe(0);
		});

		it("should track cache hit statistics", async () => {
			const cachedEntry: CacheEntry = {
				pushedAt: "2025-10-15T14:30:00Z",
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedEntry);

			await checkCache(mockRepo, mockKV);
			await checkCache(mockRepo, mockKV);

			const stats = getCacheStats();
			expect(stats.totalChecks).toBe(2);
			expect(stats.hits).toBe(2);
			expect(stats.misses).toBe(0);
			expect(stats.hitRate).toBe(100);
		});

		it("should track cache miss statistics", async () => {
			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await checkCache(mockRepo, mockKV);
			await checkCache(mockRepo, mockKV);
			await checkCache(mockRepo, mockKV);

			const stats = getCacheStats();
			expect(stats.totalChecks).toBe(3);
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(3);
			expect(stats.hitRate).toBe(0);
		});

		it("should calculate correct hit rate percentage", async () => {
			const cachedEntry: CacheEntry = {
				pushedAt: "2025-10-15T14:30:00Z",
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			// 2 hits
			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedEntry);
			await checkCache(mockRepo, mockKV);
			await checkCache(mockRepo, mockKV);

			// 1 miss
			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			await checkCache(mockRepo, mockKV);

			const stats = getCacheStats();
			expect(stats.totalChecks).toBe(3);
			expect(stats.hits).toBe(2);
			expect(stats.misses).toBe(1);
			expect(stats.hitRate).toBeCloseTo(66.67, 1);
		});

		it("should track stale cache as miss", async () => {
			const staleEntry: CacheEntry = {
				pushedAt: "2025-10-10T10:00:00Z",
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(staleEntry);

			await checkCache(mockRepo, mockKV);

			const stats = getCacheStats();
			expect(stats.totalChecks).toBe(1);
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(1);
			expect(stats.hitRate).toBe(0);
		});

		it("should track KV read errors as misses", async () => {
			(mockKV.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("KV read failed"));

			await checkCache(mockRepo, mockKV);

			const stats = getCacheStats();
			expect(stats.totalChecks).toBe(1);
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(1);
		});

		it("should achieve 90%+ hit rate in realistic scenario", async () => {
			const cachedEntry: CacheEntry = {
				pushedAt: "2025-10-15T14:30:00Z",
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			// Simulate 20 repos: 18 cached (90%), 2 new (10%)
			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedEntry);
			for (let i = 0; i < 18; i++) {
				await checkCache(mockRepo, mockKV);
			}

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			for (let i = 0; i < 2; i++) {
				await checkCache(mockRepo, mockKV);
			}

			const stats = getCacheStats();
			expect(stats.totalChecks).toBe(20);
			expect(stats.hits).toBe(18);
			expect(stats.misses).toBe(2);
			expect(stats.hitRate).toBe(90);
		});
	});

	describe("resetCacheStats", () => {
		it("should reset all statistics to zero", async () => {
			const cachedEntry: CacheEntry = {
				pushedAt: "2025-10-15T14:30:00Z",
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedEntry);
			await checkCache(mockRepo, mockKV);

			let stats = getCacheStats();
			expect(stats.totalChecks).toBe(1);
			expect(stats.hits).toBe(1);

			resetCacheStats();

			stats = getCacheStats();
			expect(stats.totalChecks).toBe(0);
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
			expect(stats.hitRate).toBe(0);
		});

		it("should allow fresh statistics tracking after reset", async () => {
			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			await checkCache(mockRepo, mockKV);

			resetCacheStats();

			const cachedEntry: CacheEntry = {
				pushedAt: "2025-10-15T14:30:00Z",
				processedAt: "2025-11-12T10:00:00Z",
				status: "complete",
			};

			(mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedEntry);
			await checkCache(mockRepo, mockKV);

			const stats = getCacheStats();
			expect(stats.totalChecks).toBe(1);
			expect(stats.hits).toBe(1);
			expect(stats.hitRate).toBe(100);
		});
	});
});
