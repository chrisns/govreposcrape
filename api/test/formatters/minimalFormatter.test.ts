import { describe, it, expect } from "vitest";
import { formatMinimal } from "../../src/formatters/minimalFormatter";
import { SearchResult } from "../../src/services/vertexSearchService";
import { MinimalResult } from "../../src/types/mcp";

describe("Minimal Formatter - Unit Tests", () => {
	describe("AC-1 & AC-3: MinimalResult with all required fields", () => {
		it("should transform valid Vertex AI result to MinimalResult with all required fields", () => {
			// Mock Vertex AI Search result
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "Some code snippet...",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
						pushedAt: "2025-01-15T10:30:00Z",
						processedAt: "2025-01-15T11:00:00Z",
					},
				},
			];

			const results = formatMinimal(mockResults);

			expect(results).toHaveLength(1);
			const result = results[0];

			// Verify all required fields are present
			expect(result.repo_url).toBe("https://github.com/alphagov/govuk-frontend");
			expect(result.repo_org).toBe("alphagov");
			expect(result.repo_name).toBe("govuk-frontend");
			expect(result.language).toBeDefined();
			expect(result.last_updated).toBe("2025-01-15T10:30:00Z");
			expect(result.similarity_score).toBeTypeOf("number");
			expect(result.github_link).toBe("https://github.com/alphagov/govuk-frontend");
			expect(result.metadata).toBeDefined();
		});

		it("should extract org and repo correctly from metadata", () => {
			const mockResults: SearchResult[] = [
				{
					title: "test-org/test-repo",
					url: "https://github.com/test-org/test-repo",
					snippet: "Test snippet",
					metadata: {
						org: "test-org",
						repo: "test-repo",
					},
				},
			];

			const results = formatMinimal(mockResults);

			expect(results[0].repo_org).toBe("test-org");
			expect(results[0].repo_name).toBe("test-repo");
		});

		it("should format GitHub URL correctly", () => {
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

			const results = formatMinimal(mockResults);

			expect(results[0].github_link).toBe("https://github.com/alphagov/govuk-frontend");
			expect(results[0].github_link).toMatch(/^https:\/\/github\.com\/[\w-]+\/[\w-]+$/);
		});

		it("should NOT include snippet fields in minimal result", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "This snippet should NOT appear in minimal result",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			const results = formatMinimal(mockResults);
			const result = results[0] as any;

			// Verify no snippet-related fields
			expect(result.snippet).toBeUndefined();
			expect(result.snippet_file_path).toBeUndefined();
			expect(result.snippet_line_range).toBeUndefined();
			expect(result.gitingest_summary).toBeUndefined();
		});

		it("should have metadata object with optional stars and license fields", () => {
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

			const results = formatMinimal(mockResults);

			expect(results[0].metadata).toBeDefined();
			expect(results[0].metadata).toHaveProperty("stars");
			expect(results[0].metadata).toHaveProperty("license");
		});
	});

	describe("AC-3: Handle missing optional fields gracefully", () => {
		it("should handle missing pushedAt gracefully (use processedAt)", () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "Snippet",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
						processedAt: "2025-01-15T12:00:00Z",
					},
				},
			];

			const results = formatMinimal(mockResults);

			expect(results[0].last_updated).toBe("2025-01-15T12:00:00Z");
		});

		it("should handle missing both pushedAt and processedAt (use current time)", () => {
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

			const results = formatMinimal(mockResults);

			// Should have a timestamp (ISO 8601 format)
			expect(results[0].last_updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it("should handle missing optional metadata fields (stars, license)", () => {
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

			const results = formatMinimal(mockResults);

			// Optional fields should be undefined but present in structure
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

			const results = formatMinimal(mockResults);

			expect(results).toHaveLength(2);
			expect(results[0].repo_name).toBe("govuk-frontend");
			expect(results[1].repo_name).toBe("govuk-design-system");
		});

		it("should handle empty results array", () => {
			const mockResults: SearchResult[] = [];

			const results = formatMinimal(mockResults);

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
			expect(() => formatMinimal(mockResults)).not.toThrow();
		});
	});

	describe("Type safety (TypeScript strict mode compliance)", () => {
		it("should return type-safe MinimalResult array", () => {
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

			const results: MinimalResult[] = formatMinimal(mockResults);

			// TypeScript compilation should pass (this test verifies type inference)
			expect(results).toBeDefined();
			expect(results[0].repo_url).toBeTypeOf("string");
			expect(results[0].similarity_score).toBeTypeOf("number");
		});
	});
});
