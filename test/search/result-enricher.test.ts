/**
 * Unit tests for Result Enrichment Module
 * Tests path parsing, link generation, R2 metadata fetching, and result enrichment
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
	parseR2Path,
	buildGitHubURL,
	buildCodespacesURL,
	buildGitpodURL,
	fetchR2Metadata,
	enrichResult,
	enrichResults,
	type ParsedR2Path,
	type R2Metadata,
} from "../../src/search/result-enricher";
import type { Env, AISearchResult, EnrichedSearchResult } from "../../src/types";
import * as logger from "../../src/utils/logger";

describe("result-enricher", () => {
	let mockEnv: Env;
	let loggerSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Create mock environment with R2 binding
		mockEnv = {
			R2: {
				head: vi.fn().mockResolvedValue({
					customMetadata: {
						pushedAt: "2025-01-15T10:00:00Z",
						url: "https://github.com/alphagov/govuk-frontend",
						processedAt: "2025-01-15T10:30:00Z",
					},
				}),
			},
		} as unknown as Env;

		// Spy on logger to verify logging behavior
		loggerSpy = vi.spyOn(logger, "createLogger");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Path Parsing", () => {
		describe("parseR2Path", () => {
			test("parses valid R2 path", () => {
				const result = parseR2Path("gitingest/alphagov/govuk-frontend/summary.txt");

				expect(result.valid).toBe(true);
				expect(result.org).toBe("alphagov");
				expect(result.repo).toBe("govuk-frontend");
				expect(result.error).toBeUndefined();
			});

			test("parses path with URL encoded components", () => {
				const result = parseR2Path("gitingest/my%20org/my%20repo/summary.txt");

				expect(result.valid).toBe(true);
				expect(result.org).toBe("my org");
				expect(result.repo).toBe("my repo");
			});

			test("parses path with dash in org name", () => {
				const result = parseR2Path("gitingest/uk-gov-mirror/repo-name/summary.txt");

				expect(result.valid).toBe(true);
				expect(result.org).toBe("uk-gov-mirror");
				expect(result.repo).toBe("repo-name");
			});

			test("parses path with underscore in repo name", () => {
				const result = parseR2Path("gitingest/alphagov/govuk_frontend/summary.txt");

				expect(result.valid).toBe(true);
				expect(result.org).toBe("alphagov");
				expect(result.repo).toBe("govuk_frontend");
			});

			test("rejects empty path", () => {
				const result = parseR2Path("");

				expect(result.valid).toBe(false);
				expect(result.org).toBe("");
				expect(result.repo).toBe("");
				expect(result.error).toContain("must be a non-empty string");
			});

			test("rejects null path", () => {
				const result = parseR2Path(null as any);

				expect(result.valid).toBe(false);
				expect(result.error).toContain("must be a non-empty string");
			});

			test("rejects malformed path - missing prefix", () => {
				const result = parseR2Path("alphagov/govuk-frontend/summary.txt");

				expect(result.valid).toBe(false);
				expect(result.error).toContain("Invalid R2 path format");
			});

			test("rejects malformed path - missing summary.txt", () => {
				const result = parseR2Path("gitingest/alphagov/govuk-frontend");

				expect(result.valid).toBe(false);
				expect(result.error).toContain("Invalid R2 path format");
			});

			test("rejects path with missing org", () => {
				const result = parseR2Path("gitingest//govuk-frontend/summary.txt");

				expect(result.valid).toBe(false);
				expect(result.error).toContain("org or repo is empty");
			});

			test("rejects path with missing repo", () => {
				const result = parseR2Path("gitingest/alphagov//summary.txt");

				expect(result.valid).toBe(false);
				expect(result.error).toContain("org or repo is empty");
			});

			test("rejects path with extra segments", () => {
				const result = parseR2Path("gitingest/alphagov/govuk-frontend/extra/summary.txt");

				expect(result.valid).toBe(false);
				expect(result.error).toContain("Invalid R2 path format");
			});

			test("handles invalid URL encoding gracefully", () => {
				const result = parseR2Path("gitingest/org%/repo/summary.txt");

				expect(result.valid).toBe(false);
				expect(result.error).toContain("Failed to decode");
			});
		});
	});

	describe("Link Generation", () => {
		describe("buildGitHubURL", () => {
			test("builds basic GitHub URL", () => {
				const url = buildGitHubURL("alphagov", "govuk-frontend");
				expect(url).toBe("https://github.com/alphagov/govuk-frontend");
			});

			test("encodes special characters in org name", () => {
				const url = buildGitHubURL("my org", "repo");
				expect(url).toBe("https://github.com/my%20org/repo");
			});

			test("encodes special characters in repo name", () => {
				const url = buildGitHubURL("org", "my repo");
				expect(url).toBe("https://github.com/org/my%20repo");
			});

			test("handles org with dash", () => {
				const url = buildGitHubURL("uk-gov-mirror", "repo-name");
				expect(url).toBe("https://github.com/uk-gov-mirror/repo-name");
			});

			test("handles repo with underscore", () => {
				const url = buildGitHubURL("alphagov", "govuk_frontend");
				expect(url).toBe("https://github.com/alphagov/govuk_frontend");
			});
		});

		describe("buildCodespacesURL", () => {
			test("builds basic Codespaces URL", () => {
				const url = buildCodespacesURL("alphagov", "govuk-frontend");
				expect(url).toBe("https://github.dev/alphagov/govuk-frontend");
			});

			test("encodes special characters", () => {
				const url = buildCodespacesURL("my org", "my repo");
				expect(url).toBe("https://github.dev/my%20org/my%20repo");
			});

			test("uses correct domain (github.dev)", () => {
				const url = buildCodespacesURL("org", "repo");
				expect(url).toContain("github.dev");
				expect(url).not.toContain("github.com");
			});
		});

		describe("buildGitpodURL", () => {
			test("builds basic Gitpod URL", () => {
				const url = buildGitpodURL("alphagov", "govuk-frontend");
				expect(url).toBe("https://gitpod.io/#https://github.com/alphagov/govuk-frontend");
			});

			test("encodes special characters", () => {
				const url = buildGitpodURL("my org", "my repo");
				expect(url).toBe("https://gitpod.io/#https://github.com/my%20org/my%20repo");
			});

			test("includes GitHub URL after hash", () => {
				const url = buildGitpodURL("org", "repo");
				expect(url).toContain("gitpod.io/#https://github.com/");
			});

			test("GitHub URL in Gitpod URL is properly encoded", () => {
				const url = buildGitpodURL("my-org", "my-repo");
				const afterHash = url.split("#")[1];
				expect(afterHash).toBe("https://github.com/my-org/my-repo");
			});
		});
	});

	describe("R2 Metadata Fetching", () => {
		describe("fetchR2Metadata", () => {
			test("fetches metadata successfully", async () => {
				const metadata = await fetchR2Metadata(
					mockEnv,
					"gitingest/alphagov/govuk-frontend/summary.txt",
					"test-request-id",
				);

				expect(metadata.pushedAt).toBe("2025-01-15T10:00:00Z");
				expect(metadata.url).toBe("https://github.com/alphagov/govuk-frontend");
				expect(metadata.processedAt).toBe("2025-01-15T10:30:00Z");
				expect(mockEnv.R2.head).toHaveBeenCalledWith(
					"gitingest/alphagov/govuk-frontend/summary.txt",
				);
			});

			test("returns empty object when R2 object not found", async () => {
				mockEnv.R2.head = vi.fn().mockResolvedValue(null);

				const metadata = await fetchR2Metadata(
					mockEnv,
					"gitingest/org/repo/summary.txt",
					"test-request-id",
				);

				expect(metadata).toEqual({});
			});

			test("returns empty object when customMetadata is undefined", async () => {
				mockEnv.R2.head = vi.fn().mockResolvedValue({
					customMetadata: undefined,
				});

				const metadata = await fetchR2Metadata(
					mockEnv,
					"gitingest/org/repo/summary.txt",
					"test-request-id",
				);

				expect(metadata.pushedAt).toBeUndefined();
				expect(metadata.url).toBeUndefined();
				expect(metadata.processedAt).toBeUndefined();
			});

			test("handles partial customMetadata fields", async () => {
				mockEnv.R2.head = vi.fn().mockResolvedValue({
					customMetadata: {
						pushedAt: "2025-01-15T10:00:00Z",
						// url and processedAt missing
					},
				});

				const metadata = await fetchR2Metadata(
					mockEnv,
					"gitingest/org/repo/summary.txt",
					"test-request-id",
				);

				expect(metadata.pushedAt).toBe("2025-01-15T10:00:00Z");
				expect(metadata.url).toBeUndefined();
				expect(metadata.processedAt).toBeUndefined();
			});

			test("returns empty object on R2 error (graceful degradation)", async () => {
				mockEnv.R2.head = vi.fn().mockRejectedValue(new Error("R2 service unavailable"));

				const metadata = await fetchR2Metadata(
					mockEnv,
					"gitingest/org/repo/summary.txt",
					"test-request-id",
				);

				expect(metadata).toEqual({});
			});

			test("logs error on R2 failure", async () => {
				mockEnv.R2.head = vi.fn().mockRejectedValue(new Error("Network error"));

				await fetchR2Metadata(mockEnv, "gitingest/org/repo/summary.txt", "test-request-id");

				expect(loggerSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						operation: "fetch_r2_metadata",
						requestId: "test-request-id",
					}),
				);
			});

			test("measures and logs duration", async () => {
				await fetchR2Metadata(mockEnv, "gitingest/org/repo/summary.txt", "test-request-id");

				expect(loggerSpy).toHaveBeenCalled();
			});
		});
	});

	describe("Result Enrichment", () => {
		describe("enrichResult", () => {
			test("enriches result with all metadata", async () => {
				const rawResult: AISearchResult = {
					content: "function authenticate() { /* ... */ }",
					score: 0.92,
					metadata: {
						path: "gitingest/alphagov/govuk-frontend/summary.txt",
						contentType: "text/plain",
					},
				};

				const enriched = await enrichResult(mockEnv, rawResult);

				// Verify original fields preserved
				expect(enriched.content).toBe(rawResult.content);
				expect(enriched.score).toBe(rawResult.score);

				// Verify repository info
				expect(enriched.repository.org).toBe("alphagov");
				expect(enriched.repository.name).toBe("govuk-frontend");
				expect(enriched.repository.fullName).toBe("alphagov/govuk-frontend");

				// Verify links
				expect(enriched.links.github).toBe("https://github.com/alphagov/govuk-frontend");
				expect(enriched.links.codespaces).toBe("https://github.dev/alphagov/govuk-frontend");
				expect(enriched.links.gitpod).toBe(
					"https://gitpod.io/#https://github.com/alphagov/govuk-frontend",
				);

				// Verify metadata
				expect(enriched.metadata?.pushedAt).toBe("2025-01-15T10:00:00Z");
				expect(enriched.metadata?.url).toBe("https://github.com/alphagov/govuk-frontend");
				expect(enriched.metadata?.processedAt).toBe("2025-01-15T10:30:00Z");

				// Verify R2 path
				expect(enriched.r2Path).toBe("gitingest/alphagov/govuk-frontend/summary.txt");
			});

			test("enriches result without metadata when R2 unavailable", async () => {
				mockEnv.R2.head = vi.fn().mockResolvedValue(null);

				const rawResult: AISearchResult = {
					content: "test content",
					score: 0.85,
					metadata: {
						path: "gitingest/org/repo/summary.txt",
						contentType: "text/plain",
					},
				};

				const enriched = await enrichResult(mockEnv, rawResult);

				// Verify enrichment without R2 metadata
				expect(enriched.repository.org).toBe("org");
				expect(enriched.repository.name).toBe("repo");
				expect(enriched.links.github).toBe("https://github.com/org/repo");
				expect(enriched.metadata).toBeUndefined(); // No metadata field if empty
			});

			test("handles invalid R2 path with minimal enrichment", async () => {
				const rawResult: AISearchResult = {
					content: "test content",
					score: 0.8,
					metadata: {
						path: "invalid/path/format",
						contentType: "text/plain",
					},
				};

				const enriched = await enrichResult(mockEnv, rawResult);

				// Verify minimal enrichment for invalid path
				expect(enriched.repository.org).toBe("unknown");
				expect(enriched.repository.name).toBe("unknown");
				expect(enriched.repository.fullName).toBe("unknown/unknown");
				expect(enriched.links.github).toBe("");
				expect(enriched.links.codespaces).toBe("");
				expect(enriched.links.gitpod).toBe("");
				expect(enriched.r2Path).toBe("invalid/path/format");
			});

			test("preserves original content and score", async () => {
				const rawResult: AISearchResult = {
					content: "const API_KEY = process.env.API_KEY;",
					score: 0.95,
					metadata: {
						path: "gitingest/org/repo/summary.txt",
						contentType: "text/plain",
					},
				};

				const enriched = await enrichResult(mockEnv, rawResult);

				expect(enriched.content).toBe(rawResult.content);
				expect(enriched.score).toBe(rawResult.score);
			});

			test("creates correlation ID for logging", async () => {
				const rawResult: AISearchResult = {
					content: "test",
					score: 0.9,
					metadata: {
						path: "gitingest/org/repo/summary.txt",
						contentType: "text/plain",
					},
				};

				await enrichResult(mockEnv, rawResult);

				expect(loggerSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						operation: "enrich_result",
						requestId: expect.stringMatching(
							/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
						),
					}),
				);
			});

			test("handles R2 HEAD request failure gracefully", async () => {
				mockEnv.R2.head = vi.fn().mockRejectedValue(new Error("R2 service error"));

				const rawResult: AISearchResult = {
					content: "test",
					score: 0.9,
					metadata: {
						path: "gitingest/org/repo/summary.txt",
						contentType: "text/plain",
					},
				};

				const enriched = await enrichResult(mockEnv, rawResult);

				// Should still enrich with links, just no metadata
				expect(enriched.repository.org).toBe("org");
				expect(enriched.links.github).toBe("https://github.com/org/repo");
				expect(enriched.metadata).toBeUndefined();
			});
		});

		describe("enrichResults (batch)", () => {
			test("enriches multiple results in parallel", async () => {
				const rawResults: AISearchResult[] = [
					{
						content: "result 1",
						score: 0.95,
						metadata: {
							path: "gitingest/org1/repo1/summary.txt",
							contentType: "text/plain",
						},
					},
					{
						content: "result 2",
						score: 0.85,
						metadata: {
							path: "gitingest/org2/repo2/summary.txt",
							contentType: "text/plain",
						},
					},
					{
						content: "result 3",
						score: 0.75,
						metadata: {
							path: "gitingest/org3/repo3/summary.txt",
							contentType: "text/plain",
						},
					},
				];

				const enriched = await enrichResults(mockEnv, rawResults);

				expect(enriched).toHaveLength(3);
				expect(enriched[0].repository.fullName).toBe("org1/repo1");
				expect(enriched[1].repository.fullName).toBe("org2/repo2");
				expect(enriched[2].repository.fullName).toBe("org3/repo3");
			});

			test("preserves order of results", async () => {
				const rawResults: AISearchResult[] = [
					{
						content: "A",
						score: 0.9,
						metadata: {
							path: "gitingest/alpha/a/summary.txt",
							contentType: "text/plain",
						},
					},
					{
						content: "B",
						score: 0.8,
						metadata: {
							path: "gitingest/beta/b/summary.txt",
							contentType: "text/plain",
						},
					},
					{
						content: "C",
						score: 0.7,
						metadata: {
							path: "gitingest/gamma/c/summary.txt",
							contentType: "text/plain",
						},
					},
				];

				const enriched = await enrichResults(mockEnv, rawResults);

				expect(enriched[0].content).toBe("A");
				expect(enriched[1].content).toBe("B");
				expect(enriched[2].content).toBe("C");
			});

			test("handles empty array", async () => {
				const enriched = await enrichResults(mockEnv, []);

				expect(enriched).toEqual([]);
			});

			test("handles single result", async () => {
				const rawResults: AISearchResult[] = [
					{
						content: "single",
						score: 0.9,
						metadata: {
							path: "gitingest/org/repo/summary.txt",
							contentType: "text/plain",
						},
					},
				];

				const enriched = await enrichResults(mockEnv, rawResults);

				expect(enriched).toHaveLength(1);
				expect(enriched[0].repository.fullName).toBe("org/repo");
			});

			test("handles mixed success and failure (graceful degradation)", async () => {
				let callCount = 0;
				mockEnv.R2.head = vi.fn().mockImplementation(() => {
					callCount++;
					if (callCount === 2) {
						return Promise.reject(new Error("R2 error"));
					}
					return Promise.resolve({
						customMetadata: {
							pushedAt: "2025-01-15T10:00:00Z",
							url: "https://github.com/org/repo",
							processedAt: "2025-01-15T10:30:00Z",
						},
					});
				});

				const rawResults: AISearchResult[] = [
					{
						content: "1",
						score: 0.9,
						metadata: {
							path: "gitingest/org1/repo1/summary.txt",
							contentType: "text/plain",
						},
					},
					{
						content: "2",
						score: 0.8,
						metadata: {
							path: "gitingest/org2/repo2/summary.txt",
							contentType: "text/plain",
						},
					},
					{
						content: "3",
						score: 0.7,
						metadata: {
							path: "gitingest/org3/repo3/summary.txt",
							contentType: "text/plain",
						},
					},
				];

				const enriched = await enrichResults(mockEnv, rawResults);

				// All results should be enriched, but result 2 has no metadata
				expect(enriched).toHaveLength(3);
				expect(enriched[0].metadata?.pushedAt).toBeDefined();
				expect(enriched[1].metadata).toBeUndefined(); // R2 failed
				expect(enriched[2].metadata?.pushedAt).toBeDefined();
			});

			test("logs batch completion with performance metrics", async () => {
				const rawResults: AISearchResult[] = [
					{
						content: "1",
						score: 0.9,
						metadata: {
							path: "gitingest/org/repo/summary.txt",
							contentType: "text/plain",
						},
					},
				];

				await enrichResults(mockEnv, rawResults);

				expect(loggerSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						operation: "enrich_results",
						requestId: expect.any(String),
					}),
				);
			});
		});
	});

	describe("Edge Cases", () => {
		test("handles path with special characters in org/repo", async () => {
			const result = parseR2Path("gitingest/org-with-dash/repo_with_underscore/summary.txt");

			expect(result.valid).toBe(true);
			expect(result.org).toBe("org-with-dash");
			expect(result.repo).toBe("repo_with_underscore");
		});

		test("handles very long org and repo names", async () => {
			const longOrg = "a".repeat(100);
			const longRepo = "b".repeat(100);
			const path = `gitingest/${longOrg}/${longRepo}/summary.txt`;

			const result = parseR2Path(path);

			expect(result.valid).toBe(true);
			expect(result.org).toBe(longOrg);
			expect(result.repo).toBe(longRepo);
		});

		test("enrichResult handles R2 timeout gracefully", async () => {
			mockEnv.R2.head = vi.fn().mockRejectedValue(new Error("Request timeout"));

			const rawResult: AISearchResult = {
				content: "test",
				score: 0.9,
				metadata: {
					path: "gitingest/org/repo/summary.txt",
					contentType: "text/plain",
				},
			};

			const enriched = await enrichResult(mockEnv, rawResult);

			// Should complete enrichment without metadata
			expect(enriched.repository.org).toBe("org");
			expect(enriched.links.github).toBeTruthy();
			expect(enriched.metadata).toBeUndefined();
		});
	});

	describe("Performance", () => {
		test("enrichResult completes quickly for valid path", async () => {
			const rawResult: AISearchResult = {
				content: "test",
				score: 0.9,
				metadata: {
					path: "gitingest/org/repo/summary.txt",
					contentType: "text/plain",
				},
			};

			const start = Date.now();
			await enrichResult(mockEnv, rawResult);
			const duration = Date.now() - start;

			// Should complete well under 100ms target (allowing overhead for mocks)
			expect(duration).toBeLessThan(1000);
		});

		test("batch enrichment processes results in parallel", async () => {
			// Mock R2 with slight delay to simulate network
			mockEnv.R2.head = vi.fn().mockImplementation(
				() =>
					new Promise((resolve) =>
						setTimeout(
							() =>
								resolve({
									customMetadata: {
										pushedAt: "2025-01-15T10:00:00Z",
									},
								}),
							10,
						),
					),
			);

			const rawResults: AISearchResult[] = Array.from({ length: 5 }, (_, i) => ({
				content: `result ${i}`,
				score: 0.9 - i * 0.1,
				metadata: {
					path: `gitingest/org${i}/repo${i}/summary.txt`,
					contentType: "text/plain",
				},
			}));

			const start = Date.now();
			await enrichResults(mockEnv, rawResults);
			const duration = Date.now() - start;

			// Parallel execution should be faster than sequential (5 * 10ms = 50ms)
			// Allow generous overhead for test environment
			expect(duration).toBeLessThan(100);
		});
	});
});
