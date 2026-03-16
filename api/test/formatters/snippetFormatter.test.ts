import { describe, it, expect } from "vitest";
import { formatSnippet } from "../../src/formatters/snippetFormatter";
import { SearchResult } from "../../src/services/vertexSearchService";
import { SnippetResult } from "../../src/types/mcp";

describe("Snippet Formatter - Unit Tests", () => {
	describe("AC-1 & AC-3: SnippetResult with all required fields", () => {
		it("should transform valid Vertex AI result to SnippetResult with all required fields", () => {
			// Mock Vertex AI Search result with snippet
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "function authenticate(user) {\n  return validateUser(user);\n}",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
						pushedAt: "2025-01-15T10:30:00Z",
						processedAt: "2025-01-15T11:00:00Z",
					},
				},
			];

			const results = formatSnippet(mockResults);

			expect(results).toHaveLength(1);
			const result = results[0];

			// Verify all MinimalResult base fields are present
			expect(result.repo_url).toBe("https://github.com/alphagov/govuk-frontend");
			expect(result.repo_org).toBe("alphagov");
			expect(result.repo_name).toBe("govuk-frontend");
			expect(result.language).toBeDefined();
			expect(result.last_updated).toBe("2025-01-15T10:30:00Z");
			expect(result.similarity_score).toBeTypeOf("number");
			expect(result.github_link).toBe("https://github.com/alphagov/govuk-frontend");
			expect(result.metadata).toBeDefined();

			// Verify snippet-specific fields are present
			expect(result.snippet).toBeDefined();
			expect(result.snippet_file_path).toBeDefined();
			expect(result.snippet_line_range).toBeDefined();
			expect(result.context_lines_before).toBe(2);
			expect(result.context_lines_after).toBe(2);
			expect(result.codespaces_link).toBeDefined();
		});

		it("should extract snippet from Vertex AI Search highlights", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "const result = await fetch(url);\nreturn result.json();",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatSnippet(mockResults);

			expect(results[0].snippet).toBe("const result = await fetch(url);\nreturn result.json();");
			expect(results[0].snippet.length).toBeGreaterThan(0);
		});

		it("should truncate snippet if exceeds 200 chars", () => {
			const longSnippet = "a".repeat(250);
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: longSnippet,
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatSnippet(mockResults);

			expect(results[0].snippet.length).toBeLessThanOrEqual(203); // 200 + "..."
			expect(results[0].snippet).toMatch(/\.\.\.$/);
		});

		it("should set context lines to fixed values (2 before, 2 after)", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "test snippet",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatSnippet(mockResults);

			expect(results[0].context_lines_before).toBe(2);
			expect(results[0].context_lines_after).toBe(2);
		});

		it("should format Codespaces URL correctly", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "test snippet",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatSnippet(mockResults);

			expect(results[0].codespaces_link).toBe("https://github.dev/alphagov/govuk-frontend");
			expect(results[0].codespaces_link).toMatch(/^https:\/\/github\.dev\/[\w-]+\/[\w-]+$/);
		});

		it("should format GitHub URL correctly", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "test snippet",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatSnippet(mockResults);

			expect(results[0].github_link).toBe("https://github.com/alphagov/govuk-frontend");
			expect(results[0].github_link).toMatch(/^https:\/\/github\.com\/[\w-]+\/[\w-]+$/);
		});
	});

	describe("AC-1: Fallback when highlights unavailable", () => {
		it("should handle missing snippet gracefully (use empty string)", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "", // No snippet from Vertex AI
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatSnippet(mockResults);

			// Should not throw error
			expect(results).toHaveLength(1);
			expect(results[0].snippet).toBe("");
		});
	});

	describe("AC-3: Handle missing optional fields gracefully", () => {
		it("should handle missing pushedAt gracefully (use processedAt)", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "test",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
						processedAt: "2025-01-15T12:00:00Z",
					},
				},
			];

			const results = formatSnippet(mockResults);

			expect(results[0].last_updated).toBe("2025-01-15T12:00:00Z");
		});

		it("should handle missing both pushedAt and processedAt (use current time)", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "test",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatSnippet(mockResults);

			// Should have a timestamp (ISO 8601 format)
			expect(results[0].last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it("should handle missing optional metadata fields (stars, license)", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "test",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatSnippet(mockResults);

			// Optional fields should be undefined
			expect(results[0].metadata.stars).toBeUndefined();
			expect(results[0].metadata.license).toBeUndefined();
		});
	});

	describe("Multiple results processing", () => {
		it("should process multiple results correctly", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "Snippet 1",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
				{
					title: "alphagov/govuk-design-system",
					url: "https://github.com/alphagov/govuk-design-system",
					snippet: "Snippet 2",
					metadata: {
						org: "alphagov",
						repo: "govuk-design-system",
					},
				},
			];

			const results = formatSnippet(mockResults);

			expect(results).toHaveLength(2);
			expect(results[0].repo_name).toBe("govuk-frontend");
			expect(results[1].repo_name).toBe("govuk-design-system");
			expect(results[0].snippet).toBe("Snippet 1");
			expect(results[1].snippet).toBe("Snippet 2");
		});

		it("should handle empty results array", () => {
			const mockResults: SearchResult[] = [];

			const results = formatSnippet(mockResults);

			expect(results).toHaveLength(0);
			expect(results).toEqual([]);
		});
	});

	describe("Error handling", () => {
		it("should skip malformed results and continue processing", () => {
			const mockResults: SearchResult[] = [
				{
					title: "valid/repo",
					url: "https://github.com/valid/repo",
					snippet: "Valid",
					metadata: {
						org: "valid",
						repo: "repo",
					},
				},
				// Malformed result (missing metadata fields)
				{
					title: "malformed",
					url: "https://github.com/malformed",
					snippet: "Malformed",
					metadata: {} as any,
				},
			];

			// Should not throw error
			expect(() => formatSnippet(mockResults)).not.toThrow();
		});
	});

	describe("Type safety (TypeScript strict mode compliance)", () => {
		it("should return type-safe SnippetResult array", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "Snippet",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results: SnippetResult[] = formatSnippet(mockResults);

			// TypeScript compilation should pass (this test verifies type inference)
			expect(results).toBeDefined();
			expect(results[0].repo_url).toBeTypeOf("string");
			expect(results[0].similarity_score).toBeTypeOf("number");
			expect(results[0].snippet).toBeTypeOf("string");
			expect(results[0].context_lines_before).toBeTypeOf("number");
			expect(results[0].context_lines_after).toBeTypeOf("number");
		});
	});
});
