/**
 * Unit and Integration Tests for Search Endpoint
 * Story 4.2: Semantic Search Endpoint - Integrate AI Search with MCP Response Format
 *
 * Test Coverage:
 * - Task 9: Unit tests for executeSearch() orchestration
 * - Task 10: Integration tests with mocked dependencies
 * - Validates AC #1-7 from Story 4.2
 *
 * Testing Pattern: Follow Story 4.1 patterns:
 * - try-catch blocks for error cases (avoid Request stream consumption)
 * - Mocked env bindings (AI_SEARCH, R2)
 * - Specific assertions for field mappings
 * - Performance metric validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeSearch } from "../../src/api/search-endpoint";
import { searchCode } from "../../src/search/ai-search-client";
import { enrichResults } from "../../src/search/result-enricher";
import type { MCPRequest, AISearchResult, EnrichedSearchResult } from "../../src/types";

// Mock Epic 3 modules
vi.mock("../../src/search/ai-search-client");
vi.mock("../../src/search/result-enricher");

describe("executeSearch()", () => {
	let mockEnv: Env;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock env bindings (not used directly in search-endpoint, but passed to Epic 3 modules)
		mockEnv = {
			AI_SEARCH: {} as VectorizeIndex,
			R2: {} as R2Bucket,
			KV_CACHE: {} as KVNamespace,
			REPOS_JSON_URL: "https://example.com/repos.json",
			GITINGEST_CONTAINER: "gitingest:latest",
		} as Env;
	});

	describe("AC #1: AI Search integration", () => {
		it("should call searchCode with query and limit from MCPRequest", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 10,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					metadata: {
						path: "gitingest/alphagov/example-repo/summary.txt",
					},
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					r2Path: "gitingest/alphagov/example-repo/summary.txt",
					repository: {
						fullName: "alphagov/example-repo",
						org: "alphagov",
						name: "example-repo",
					},
					links: {
						github: "https://github.com/alphagov/example-repo",
						codespaces: "https://codespaces.new/alphagov/example-repo",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/example-repo",
					},
					metadata: {
						language: "TypeScript",
						pushedAt: "2025-11-14T10:00:00Z",
						processedAt: "2025-11-14T12:00:00Z",
					},
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			await executeSearch(request, mockEnv);

			// Assert
			expect(searchCode).toHaveBeenCalledWith(mockEnv, "authentication methods", 10);
			expect(searchCode).toHaveBeenCalledTimes(1);
		});

		it("should use default limit=5 when limit is undefined", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				// limit not specified
			};

			vi.mocked(searchCode).mockResolvedValue([]);

			// Act
			await executeSearch(request, mockEnv);

			// Assert
			expect(searchCode).toHaveBeenCalledWith(
				mockEnv,
				"authentication methods",
				undefined, // searchCode has default parameter limit=5
			);
		});
	});

	describe("AC #2: Result enrichment", () => {
		it("should call enrichResults with AI Search results", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					metadata: {
						path: "gitingest/alphagov/example-repo/summary.txt",
					},
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					r2Path: "gitingest/alphagov/example-repo/summary.txt",
					repository: {
						fullName: "alphagov/example-repo",
						org: "alphagov",
						name: "example-repo",
					},
					links: {
						github: "https://github.com/alphagov/example-repo",
						codespaces: "https://codespaces.new/alphagov/example-repo",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/example-repo",
					},
					metadata: {
						language: "TypeScript",
						pushedAt: "2025-11-14T10:00:00Z",
						processedAt: "2025-11-14T12:00:00Z",
					},
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			await executeSearch(request, mockEnv);

			// Assert
			expect(enrichResults).toHaveBeenCalledWith(mockEnv, mockAIResults);
			expect(enrichResults).toHaveBeenCalledTimes(1);
		});

		it("should not call enrichResults if AI Search returns empty results", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "nonexistent query",
				limit: 5,
			};

			vi.mocked(searchCode).mockResolvedValue([]);

			// Act
			await executeSearch(request, mockEnv);

			// Assert
			expect(enrichResults).not.toHaveBeenCalled();
		});
	});

	describe("AC #3: MCP format mapping", () => {
		it("should map EnrichedSearchResult to SearchResult with all required fields", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					metadata: {
						path: "gitingest/alphagov/example-repo/summary.txt",
					},
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					r2Path: "gitingest/alphagov/example-repo/summary.txt",
					repository: {
						fullName: "alphagov/example-repo",
						org: "alphagov",
						name: "example-repo",
					},
					links: {
						github: "https://github.com/alphagov/example-repo",
						codespaces: "https://codespaces.new/alphagov/example-repo",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/example-repo",
					},
					metadata: {
						language: "TypeScript",
						pushedAt: "2025-11-14T10:00:00Z",
						processedAt: "2025-11-14T12:00:00Z",
					},
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert
			expect(response.results).toHaveLength(1);
			const result = response.results[0];

			// Verify field mappings from context.xml:
			// enriched.repository.fullName → repository
			expect(result.repository).toBe("alphagov/example-repo");

			// enriched.r2Path → file_path
			expect(result.file_path).toBe("gitingest/alphagov/example-repo/summary.txt");

			// enriched.content → match_snippet
			expect(result.match_snippet).toBe("JWT authentication implementation");

			// enriched.score → relevance_score
			expect(result.relevance_score).toBe(0.95);

			// Verify metadata object
			expect(result.metadata).toBeDefined();
			expect(result.metadata.language).toBe("TypeScript");
			expect(result.metadata.stars).toBe(0); // Default value (not in R2 metadata)
			expect(result.metadata.last_updated).toBe("2025-11-14T10:00:00Z"); // From pushedAt
			expect(result.metadata.github_url).toBe("https://github.com/alphagov/example-repo");
		});

		it("should handle missing r2Path with default value", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					metadata: {
						path: "gitingest/alphagov/example-repo/summary.txt",
					},
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					// r2Path is undefined
					repository: {
						fullName: "alphagov/example-repo",
						org: "alphagov",
						name: "example-repo",
					},
					links: {
						github: "https://github.com/alphagov/example-repo",
						codespaces: "https://codespaces.new/alphagov/example-repo",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/example-repo",
					},
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert
			expect(response.results[0].file_path).toBe("summary.txt"); // Default value
		});

		it("should handle missing metadata with default values", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					metadata: {
						path: "gitingest/alphagov/example-repo/summary.txt",
					},
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					r2Path: "gitingest/alphagov/example-repo/summary.txt",
					repository: {
						fullName: "alphagov/example-repo",
						org: "alphagov",
						name: "example-repo",
					},
					links: {
						github: "https://github.com/alphagov/example-repo",
						codespaces: "https://codespaces.new/alphagov/example-repo",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/example-repo",
					},
					// metadata is undefined
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert
			const result = response.results[0];
			expect(result.metadata.language).toBe("Unknown"); // Default value
			expect(result.metadata.stars).toBe(0); // Default value
			expect(result.metadata.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // Current timestamp
			expect(result.metadata.github_url).toBe("https://github.com/alphagov/example-repo");
		});

		it("should use processedAt fallback if pushedAt is missing", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					metadata: {
						path: "gitingest/alphagov/example-repo/summary.txt",
					},
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication implementation",
					score: 0.95,
					r2Path: "gitingest/alphagov/example-repo/summary.txt",
					repository: {
						fullName: "alphagov/example-repo",
						org: "alphagov",
						name: "example-repo",
					},
					links: {
						github: "https://github.com/alphagov/example-repo",
						codespaces: "https://codespaces.new/alphagov/example-repo",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/example-repo",
					},
					metadata: {
						language: "TypeScript",
						// pushedAt missing
						processedAt: "2025-11-14T12:00:00Z",
					},
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert
			expect(response.results[0].metadata.last_updated).toBe("2025-11-14T12:00:00Z"); // From processedAt
		});

		it("should map multiple results correctly", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					metadata: { path: "gitingest/alphagov/repo1/summary.txt" },
				},
				{
					id: "result2",
					content: "OAuth2 implementation",
					score: 0.85,
					metadata: { path: "gitingest/alphagov/repo2/summary.txt" },
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					r2Path: "gitingest/alphagov/repo1/summary.txt",
					repository: {
						fullName: "alphagov/repo1",
						org: "alphagov",
						name: "repo1",
					},
					links: {
						github: "https://github.com/alphagov/repo1",
						codespaces: "https://codespaces.new/alphagov/repo1",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/repo1",
					},
					metadata: {
						language: "TypeScript",
						pushedAt: "2025-11-14T10:00:00Z",
					},
				},
				{
					id: "result2",
					content: "OAuth2 implementation",
					score: 0.85,
					r2Path: "gitingest/alphagov/repo2/summary.txt",
					repository: {
						fullName: "alphagov/repo2",
						org: "alphagov",
						name: "repo2",
					},
					links: {
						github: "https://github.com/alphagov/repo2",
						codespaces: "https://codespaces.new/alphagov/repo2",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/repo2",
					},
					metadata: {
						language: "Python",
						pushedAt: "2025-11-14T09:00:00Z",
					},
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert
			expect(response.results).toHaveLength(2);

			// Verify first result
			expect(response.results[0].repository).toBe("alphagov/repo1");
			expect(response.results[0].match_snippet).toBe("JWT authentication");
			expect(response.results[0].relevance_score).toBe(0.95);
			expect(response.results[0].metadata.language).toBe("TypeScript");

			// Verify second result
			expect(response.results[1].repository).toBe("alphagov/repo2");
			expect(response.results[1].match_snippet).toBe("OAuth2 implementation");
			expect(response.results[1].relevance_score).toBe(0.85);
			expect(response.results[1].metadata.language).toBe("Python");
		});
	});

	describe("AC #4: Empty results handling", () => {
		it("should return 200 OK with empty results array when AI Search returns no matches", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "nonexistent query",
				limit: 5,
			};

			vi.mocked(searchCode).mockResolvedValue([]);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert
			expect(response.results).toEqual([]);
			expect(response.results).toHaveLength(0);
			expect(response.took_ms).toBeGreaterThanOrEqual(0);
		});

		it("should include took_ms in empty results response", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "nonexistent query",
				limit: 5,
			};

			vi.mocked(searchCode).mockResolvedValue([]);

			// Act
			const startTime = Date.now();
			const response = await executeSearch(request, mockEnv);
			const endTime = Date.now();

			// Assert
			expect(response.took_ms).toBeGreaterThanOrEqual(0);
			expect(response.took_ms).toBeLessThanOrEqual(endTime - startTime + 50); // Allow 50ms margin
		});
	});

	describe("AC #5: Error handling", () => {
		it("should throw ServiceError when AI Search fails", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const { ServiceError } = await import("../../src/utils/error-handler");
			const searchError = new ServiceError("AI Search timeout", 503, "SEARCH_ERROR", 60);

			vi.mocked(searchCode).mockRejectedValue(searchError);

			// Act & Assert
			try {
				await executeSearch(request, mockEnv);
				expect.fail("Should have thrown ServiceError");
			} catch (error) {
				expect(error).toBeInstanceOf(ServiceError);
				const serviceError = error as InstanceType<typeof ServiceError>;
				expect(serviceError.statusCode).toBe(503);
				expect(serviceError.code).toBe("SEARCH_ERROR");
				expect(serviceError.retryAfter).toBe(60);
			}
		});

		it("should convert generic errors to ServiceError with 503 status", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			vi.mocked(searchCode).mockRejectedValue(new Error("Unknown error"));

			// Act & Assert
			try {
				await executeSearch(request, mockEnv);
				expect.fail("Should have thrown ServiceError");
			} catch (error) {
				const { ServiceError } = await import("../../src/utils/error-handler");
				expect(error).toBeInstanceOf(ServiceError);
				const serviceError = error as InstanceType<typeof ServiceError>;
				expect(serviceError.statusCode).toBe(503);
				expect(serviceError.code).toBe("SEARCH_ERROR");
				expect(serviceError.retryAfter).toBe(60);
				expect(serviceError.message).toBe("Search service temporarily unavailable");
			}
		});

		it("should throw ServiceError when enrichResults fails", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					metadata: { path: "gitingest/alphagov/repo1/summary.txt" },
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockRejectedValue(new Error("R2 unavailable"));

			// Act & Assert
			try {
				await executeSearch(request, mockEnv);
				expect.fail("Should have thrown ServiceError");
			} catch (error) {
				const { ServiceError } = await import("../../src/utils/error-handler");
				expect(error).toBeInstanceOf(ServiceError);
				const serviceError = error as InstanceType<typeof ServiceError>;
				expect(serviceError.statusCode).toBe(503);
				expect(serviceError.code).toBe("SEARCH_ERROR");
			}
		});
	});

	describe("AC #7: Performance metrics", () => {
		it("should calculate took_ms including AI Search and enrichment duration", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					metadata: { path: "gitingest/alphagov/repo1/summary.txt" },
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					r2Path: "gitingest/alphagov/repo1/summary.txt",
					repository: {
						fullName: "alphagov/repo1",
						org: "alphagov",
						name: "repo1",
					},
					links: {
						github: "https://github.com/alphagov/repo1",
						codespaces: "https://codespaces.new/alphagov/repo1",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/repo1",
					},
					metadata: {
						language: "TypeScript",
						pushedAt: "2025-11-14T10:00:00Z",
					},
				},
			];

			// Simulate latency with setTimeout
			vi.mocked(searchCode).mockImplementation(
				async () =>
					new Promise((resolve) => {
						setTimeout(() => resolve(mockAIResults), 50);
					}),
			);
			vi.mocked(enrichResults).mockImplementation(
				async () =>
					new Promise((resolve) => {
						setTimeout(() => resolve(mockEnrichedResults), 30);
					}),
			);

			// Act
			const startTime = Date.now();
			const response = await executeSearch(request, mockEnv);
			const endTime = Date.now();

			// Assert
			const actualDuration = endTime - startTime;
			expect(response.took_ms).toBeGreaterThanOrEqual(80); // 50ms + 30ms
			expect(response.took_ms).toBeLessThanOrEqual(actualDuration + 50); // Allow 50ms margin
		});

		it("should return results within performance target (<2000ms)", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					metadata: { path: "gitingest/alphagov/repo1/summary.txt" },
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					r2Path: "gitingest/alphagov/repo1/summary.txt",
					repository: {
						fullName: "alphagov/repo1",
						org: "alphagov",
						name: "repo1",
					},
					links: {
						github: "https://github.com/alphagov/repo1",
						codespaces: "https://codespaces.new/alphagov/repo1",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/repo1",
					},
					metadata: {
						language: "TypeScript",
						pushedAt: "2025-11-14T10:00:00Z",
					},
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert
			expect(response.took_ms).toBeLessThan(2000); // p95 target from NFR-1.1
		});
	});

	describe("Integration: MCPResponse structure", () => {
		it("should return MCPResponse with results and took_ms fields", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			const mockAIResults: AISearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					metadata: { path: "gitingest/alphagov/repo1/summary.txt" },
				},
			];

			const mockEnrichedResults: EnrichedSearchResult[] = [
				{
					id: "result1",
					content: "JWT authentication",
					score: 0.95,
					r2Path: "gitingest/alphagov/repo1/summary.txt",
					repository: {
						fullName: "alphagov/repo1",
						org: "alphagov",
						name: "repo1",
					},
					links: {
						github: "https://github.com/alphagov/repo1",
						codespaces: "https://codespaces.new/alphagov/repo1",
						gitpod: "https://gitpod.io/#https://github.com/alphagov/repo1",
					},
					metadata: {
						language: "TypeScript",
						pushedAt: "2025-11-14T10:00:00Z",
					},
				},
			];

			vi.mocked(searchCode).mockResolvedValue(mockAIResults);
			vi.mocked(enrichResults).mockResolvedValue(mockEnrichedResults);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert
			expect(response).toHaveProperty("results");
			expect(response).toHaveProperty("took_ms");
			expect(Array.isArray(response.results)).toBe(true);
			expect(typeof response.took_ms).toBe("number");
		});

		it("should match MCPResponse type definition", async () => {
			// Arrange
			const request: MCPRequest = {
				query: "authentication methods",
				limit: 5,
			};

			vi.mocked(searchCode).mockResolvedValue([]);

			// Act
			const response = await executeSearch(request, mockEnv);

			// Assert - TypeScript will validate this at compile time
			const _typeCheck: {
				results: Array<{
					repository: string;
					file_path: string;
					match_snippet: string;
					relevance_score: number;
					metadata: {
						language: string;
						stars: number;
						last_updated: string;
						github_url: string;
					};
				}>;
				took_ms: number;
			} = response;

			expect(response).toBeDefined();
		});
	});
});
