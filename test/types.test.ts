import { describe, it, expect } from "vitest";
import type {
	Repository,
	SearchResult,
	ErrorResponse,
	MCPSearchResponse,
	CacheEntry,
	RepoMetadata,
	MCPRequest,
} from "../src/types";

describe("Type Safety Tests", () => {
	describe("Repository type", () => {
		it("should accept valid repository object matching repos.json schema", () => {
			const repo: Repository = {
				full_name: "alphagov/govuk-frontend",
				html_url: "https://github.com/alphagov/govuk-frontend",
				description: "GOV.UK Frontend contains the code you need to start building",
				language: "JavaScript",
				stargazers_count: 1234,
				forks_count: 456,
				created_at: "2023-01-15T10:00:00Z",
				updated_at: "2023-10-20T14:30:00Z",
				pushed_at: "2023-10-20T14:30:00Z",
				topics: ["govuk", "frontend", "design-system"],
				visibility: "public",
				is_template: false,
			};

			expect(repo.full_name).toBe("alphagov/govuk-frontend");
			expect(repo.stargazers_count).toBeGreaterThan(0);
			expect(repo.topics).toHaveLength(3);
		});

		it("should handle nullable fields correctly", () => {
			const repo: Repository = {
				full_name: "test/repo",
				html_url: "https://github.com/test/repo",
				description: null,
				language: null,
				stargazers_count: 0,
				forks_count: 0,
				created_at: "2023-01-01T00:00:00Z",
				updated_at: "2023-01-01T00:00:00Z",
				pushed_at: "2023-01-01T00:00:00Z",
				topics: [],
				visibility: "public",
				is_template: false,
			};

			expect(repo.description).toBeNull();
			expect(repo.language).toBeNull();
		});
	});

	describe("SearchResult type", () => {
		it("should include all required fields from PRD FR-1.1", () => {
			const result: SearchResult = {
				repository: "alphagov/govuk-frontend",
				file_path: "src/components/button/button.js",
				match_snippet: "function Button() { ... }",
				relevance_score: 0.92,
				metadata: {
					language: "JavaScript",
					stars: 1234,
					last_updated: "2023-10-20T14:30:00Z",
					github_url: "https://github.com/alphagov/govuk-frontend",
				},
			};

			expect(result.repository).toBeTruthy();
			expect(result.file_path).toBeTruthy();
			expect(result.match_snippet).toBeTruthy();
			expect(result.relevance_score).toBeGreaterThanOrEqual(0);
			expect(result.relevance_score).toBeLessThanOrEqual(1);
			expect(result.metadata.language).toBeTruthy();
			expect(result.metadata.github_url).toBeTruthy();
		});

		it("should have relevance_score between 0.0 and 1.0", () => {
			const validScores = [0.0, 0.5, 1.0, 0.85, 0.23];

			validScores.forEach((score) => {
				const result: SearchResult = {
					repository: "test/repo",
					file_path: "test.ts",
					match_snippet: "test",
					relevance_score: score,
					metadata: {
						language: "TypeScript",
						stars: 10,
						last_updated: "2023-01-01T00:00:00Z",
						github_url: "https://github.com/test/repo",
					},
				};

				expect(result.relevance_score).toBeGreaterThanOrEqual(0);
				expect(result.relevance_score).toBeLessThanOrEqual(1);
			});
		});
	});

	describe("ErrorResponse type", () => {
		it("should follow PRD FR-3 error format with code and message", () => {
			const error: ErrorResponse = {
				error: {
					code: "INVALID_QUERY",
					message: "Query must be between 3 and 500 characters",
				},
			};

			expect(error.error.code).toBe("INVALID_QUERY");
			expect(error.error.message).toBeTruthy();
		});

		it("should support optional retry_after field", () => {
			const errorWithRetry: ErrorResponse = {
				error: {
					code: "RATE_LIMIT_EXCEEDED",
					message: "Too many requests",
					retry_after: 60,
				},
			};

			expect(errorWithRetry.error.retry_after).toBe(60);

			const errorWithoutRetry: ErrorResponse = {
				error: {
					code: "SERVICE_UNAVAILABLE",
					message: "Service temporarily unavailable",
				},
			};

			expect(errorWithoutRetry.error.retry_after).toBeUndefined();
		});
	});

	describe("MCPSearchResponse type", () => {
		it("should wrap SearchResult array with query metadata", () => {
			const response: MCPSearchResponse = {
				results: [
					{
						repository: "alphagov/govuk-frontend",
						file_path: "src/components/button/button.js",
						match_snippet: "function Button() { ... }",
						relevance_score: 0.92,
						metadata: {
							language: "JavaScript",
							stars: 1234,
							last_updated: "2023-10-20T14:30:00Z",
							github_url: "https://github.com/alphagov/govuk-frontend",
						},
					},
				],
				total: 1,
				query: "authentication methods",
			};

			expect(response.results).toHaveLength(1);
			expect(response.total).toBe(1);
			expect(response.query).toBe("authentication methods");
		});

		it("should support empty results array", () => {
			const response: MCPSearchResponse = {
				results: [],
				total: 0,
				query: "nonexistent query",
			};

			expect(response.results).toHaveLength(0);
			expect(response.total).toBe(0);
		});
	});

	describe("CacheEntry type", () => {
		it("should track repository processing status", () => {
			const cacheEntry: CacheEntry = {
				pushedAt: "2023-10-20T14:30:00Z",
				processedAt: "2023-11-12T10:00:00Z",
				status: "complete",
			};

			expect(cacheEntry.status).toBe("complete");
			expect(cacheEntry.pushedAt).toBeTruthy();
			expect(cacheEntry.processedAt).toBeTruthy();
		});
	});

	describe("RepoMetadata type", () => {
		it("should extract metadata from repos.json", () => {
			const metadata: RepoMetadata = {
				url: "https://github.com/alphagov/govuk-frontend",
				pushedAt: "2023-10-20T14:30:00Z",
				org: "alphagov",
				name: "govuk-frontend",
			};

			expect(metadata.org).toBe("alphagov");
			expect(metadata.name).toBe("govuk-frontend");
			expect(metadata.url).toContain(metadata.org);
			expect(metadata.url).toContain(metadata.name);
		});
	});

	describe("MCPRequest type", () => {
		it("should accept valid query string", () => {
			const request: MCPRequest = {
				query: "authentication methods",
			};

			expect(request.query).toBeTruthy();
			expect(request.query.length).toBeGreaterThanOrEqual(3);
		});

		it("should support optional limit parameter", () => {
			const requestWithLimit: MCPRequest = {
				query: "authentication methods",
				limit: 10,
			};

			expect(requestWithLimit.limit).toBe(10);

			const requestWithoutLimit: MCPRequest = {
				query: "authentication methods",
			};

			expect(requestWithoutLimit.limit).toBeUndefined();
		});
	});

	describe("Type exports", () => {
		it("should export all types", () => {
			// This test validates that all types are exported and importable
			const typeExports = [
				"Repository",
				"SearchResult",
				"ErrorResponse",
				"MCPSearchResponse",
				"CacheEntry",
				"RepoMetadata",
				"MCPRequest",
			];

			// If imports work, types are properly exported
			expect(typeExports).toHaveLength(7);
		});
	});
});
