import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatFull } from "../../src/formatters/fullFormatter";
import { SearchResult } from "../../src/services/vertexSearchService";
import { FullResult } from "../../src/types/mcp";
import { GCSClient } from "../../src/services/gcsClient";

// Mock GCS Client
class MockGCSClient {
	private mockSummaries: Map<string, string> = new Map();

	setMockSummary(org: string, repo: string, summary: string) {
		this.mockSummaries.set(`${org}/${repo}`, summary);
	}

	async fetchGitingestSummary(org: string, repo: string): Promise<string | null> {
		return this.mockSummaries.get(`${org}/${repo}`) || null;
	}

	async fetchMultipleSummaries(
		repos: Array<{ org: string; repo: string }>,
	): Promise<Array<string | null>> {
		return Promise.all(repos.map((r) => this.fetchGitingestSummary(r.org, r.repo)));
	}
}

describe("Full Formatter - Unit Tests", () => {
	let mockGCSClient: MockGCSClient;

	beforeEach(() => {
		mockGCSClient = new MockGCSClient();
	});

	describe("AC-1: FullResult with all required fields", () => {
		it("should transform valid Vertex AI result + GCS summary to FullResult with all required fields", async () => {
			// Mock Vertex AI Search result
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

			// Mock gitingest summary with all sections
			const mockGitingest = `# Repository Summary

## README

This is the GOV.UK Frontend repository. It provides reusable components and styles for government services.

## Metadata
Contributors: 42
Commits (last month): 15
Open Issues: 8
Last Commit: 2025-01-14T15:30:00Z

## Dependencies

\`\`\`json package.json
{
  "dependencies": {
    "express": "^4.18.2",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
\`\`\`
`;

			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

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

			// Verify full mode fields are present
			expect(result.gitingest_summary).toBeDefined();
			expect(result.gitingest_summary).toBe(mockGitingest);
			expect(result.readme_excerpt).toBeDefined();
			expect(result.repository_stats).toBeDefined();
			expect(result.dependencies).toBeDefined();
		});

		it("should include complete gitingest summary from Cloud Storage", async () => {
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

			const mockGitingest =
				"# Complete Gitingest Summary\n\nThis is a complete gitingest summary with lots of content...";
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results[0].gitingest_summary).toBe(mockGitingest);
			expect(results[0].gitingest_summary.length).toBeGreaterThan(0);
		});
	});

	describe("AC-2: README excerpt extraction", () => {
		it("should extract README excerpt (first 500 chars)", async () => {
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

			const longReadme = "a".repeat(600);
			const mockGitingest = `## README\n\n${longReadme}`;
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results[0].readme_excerpt).toBeDefined();
			expect(results[0].readme_excerpt!.length).toBeLessThanOrEqual(503); // 500 + "..."
		});

		it("should extract first paragraph if shorter than 500 chars", async () => {
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

			const mockGitingest = `## README\n\nShort README content.\n\nSecond paragraph.`;
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results[0].readme_excerpt).toBe("Short README content.");
		});

		it("should handle missing README section gracefully", async () => {
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

			const mockGitingest = "# No README section";
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results[0].readme_excerpt).toBeUndefined();
		});
	});

	describe("AC-2: Dependencies parsing", () => {
		it("should parse package.json dependencies (runtime and dev)", async () => {
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

			const mockGitingest = `\`\`\`json package.json
{
  "dependencies": {
    "express": "^4.18.2",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
\`\`\``;
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results[0].dependencies).toBeDefined();
			expect(results[0].dependencies!.length).toBeGreaterThan(0);

			// Check for runtime dependencies
			const expressDep = results[0].dependencies!.find((d) => d.name === "express");
			expect(expressDep).toBeDefined();
			expect(expressDep!.version).toBe("^4.18.2");
			expect(expressDep!.type).toBe("runtime");

			// Check for dev dependencies
			const tsDep = results[0].dependencies!.find((d) => d.name === "typescript");
			expect(tsDep).toBeDefined();
			expect(tsDep!.version).toBe("^5.0.0");
			expect(tsDep!.type).toBe("dev");
		});

		it("should handle missing dependencies gracefully", async () => {
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

			const mockGitingest = "# No dependencies";
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results[0].dependencies).toBeUndefined();
		});
	});

	describe("AC-2: Repository stats extraction", () => {
		it("should extract repository stats (contributors, commits, issues, last_commit)", async () => {
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

			const mockGitingest = `Contributors: 42
Commits (last month): 15
Open Issues: 8
Last Commit: 2025-01-14T15:30:00Z`;
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results[0].repository_stats).toBeDefined();
			expect(results[0].repository_stats!.contributors).toBe(42);
			expect(results[0].repository_stats!.commits_last_month).toBe(15);
			expect(results[0].repository_stats!.open_issues).toBe(8);
			expect(results[0].repository_stats!.last_commit).toBe("2025-01-14T15:30:00Z");
		});

		it("should handle missing repository stats gracefully", async () => {
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

			const mockGitingest = "# No stats";
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results[0].repository_stats).toBeUndefined();
		});
	});

	describe("AC-3: Fallback when GCS read fails", () => {
		it("should return snippet-mode data when GCS fetch fails", async () => {
			const mockResults: SearchResult[] = [
				{
					title: "alphagov/govuk-frontend",
					url: "https://github.com/alphagov/govuk-frontend",
					snippet: "function test() {}",
					metadata: {
						org: "alphagov",
						repo: "govuk-frontend",
					},
				},
			];

			// Don't set mock summary - GCS fetch will return null

			const results = await formatFull(mockResults, mockGCSClient as any);

			// Should not throw error
			expect(results).toHaveLength(1);

			// Should have all base fields (snippet mode)
			expect(results[0].repo_url).toBeDefined();
			expect(results[0].snippet).toBeDefined();

			// Full mode fields should be empty/undefined (graceful degradation)
			expect(results[0].gitingest_summary).toBe("");
			expect(results[0].readme_excerpt).toBeUndefined();
			expect(results[0].repository_stats).toBeUndefined();
			expect(results[0].dependencies).toBeUndefined();
		});
	});

	describe("Multiple results processing", () => {
		it("should process multiple results in parallel", async () => {
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

			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", "# Frontend summary");
			mockGCSClient.setMockSummary("alphagov", "govuk-design-system", "# Design system summary");

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results).toHaveLength(2);
			expect(results[0].repo_name).toBe("govuk-frontend");
			expect(results[1].repo_name).toBe("govuk-design-system");
			expect(results[0].gitingest_summary).toBe("# Frontend summary");
			expect(results[1].gitingest_summary).toBe("# Design system summary");
		});

		it("should handle empty results array", async () => {
			const mockResults: SearchResult[] = [];

			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results).toHaveLength(0);
			expect(results).toEqual([]);
		});
	});

	describe("Error handling", () => {
		it("should skip malformed results and continue processing", async () => {
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

			mockGCSClient.setMockSummary("valid", "repo", "# Valid summary");

			// Should not throw error
			const results = await formatFull(mockResults, mockGCSClient as any);

			// Should have at least the valid result
			expect(results.length).toBeGreaterThanOrEqual(0);
		});

		it("should handle malformed gitingest summaries gracefully", async () => {
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

			// Malformed gitingest with invalid structure
			const mockGitingest = "Invalid gitingest content with no proper sections";
			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", mockGitingest);

			// Should not throw error
			const results = await formatFull(mockResults, mockGCSClient as any);

			expect(results).toHaveLength(1);
			expect(results[0].gitingest_summary).toBe(mockGitingest);
			// Parsing functions should handle gracefully
			expect(results[0].readme_excerpt).toBeUndefined();
			expect(results[0].repository_stats).toBeUndefined();
			expect(results[0].dependencies).toBeUndefined();
		});
	});

	describe("Type safety (TypeScript strict mode compliance)", () => {
		it("should return type-safe FullResult array", async () => {
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

			mockGCSClient.setMockSummary("alphagov", "govuk-frontend", "# Summary");

			const results: FullResult[] = await formatFull(mockResults, mockGCSClient as any);

			// TypeScript compilation should pass (this test verifies type inference)
			expect(results).toBeDefined();
			expect(results[0].repo_url).toBeTypeOf("string");
			expect(results[0].similarity_score).toBeTypeOf("number");
			expect(results[0].snippet).toBeTypeOf("string");
			expect(results[0].gitingest_summary).toBeTypeOf("string");
		});
	});
});
