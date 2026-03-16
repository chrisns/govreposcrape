/**
 * Snippet Mode Formatter
 * Transforms Vertex AI Search results into SnippetResult format
 * Default balanced mode providing focused code excerpts with context
 */

import { SnippetResult } from "../types/mcp";
import { SearchResult } from "../services/vertexSearchService";

/**
 * Format search results in snippets mode (default)
 * Returns base metadata PLUS focused code snippets (3-5 lines) with context
 * Uses Vertex AI Search highlights as primary source, falls back to first 200 chars
 *
 * @param results Raw search results from Vertex AI Search
 * @returns Array of snippet result objects
 */
export function formatSnippet(results: SearchResult[]): SnippetResult[] {
	const formatted: SnippetResult[] = [];

	for (const result of results) {
		try {
			// Extract org and repo from result metadata
			const { org, repo } = result.metadata;

			// Build GitHub URLs
			const githubLink = `https://github.com/${org}/${repo}`;
			const codespacesLink = `https://github.dev/${org}/${repo}`;

			// Extract language from result (use "Unknown" if not available)
			const language = "Unknown"; // TODO: Extract from Vertex AI metadata when available

			// Extract last_updated from metadata (prefer pushedAt, fallback to processedAt)
			const last_updated =
				result.metadata.pushedAt || result.metadata.processedAt || new Date().toISOString();

			// Map similarity score (placeholder for now)
			const similarity_score = 0.85; // TODO: Extract from Vertex AI Search response

			// Extract snippet from Vertex AI Search result
			// Primary source: result.snippet (populated from highlights in vertexSearchService)
			// Fallback: First 200 characters from snippet if highlights unavailable
			let snippet = result.snippet || "";

			// Truncate snippet if too long (aim for 3-5 lines, ~200 chars)
			if (snippet.length > 200) {
				snippet = snippet.substring(0, 200) + "...";
			}

			// Extract file path and line range from snippet metadata
			// TODO: Parse from Vertex AI Search derivedData when available
			// For now, use placeholders
			const snippet_file_path = "src/example.ts"; // TODO: Extract from metadata
			const snippet_line_range = "1-5"; // TODO: Extract from highlights metadata

			// Context lines are fixed at 2 before and 2 after
			const context_lines_before = 2;
			const context_lines_after = 2;

			// Create snippet result object
			const snippetResult: SnippetResult = {
				// Base fields from MinimalResult
				repo_url: result.url,
				repo_org: org,
				repo_name: repo,
				language,
				last_updated,
				similarity_score,
				github_link: githubLink,
				metadata: {
					stars: undefined,
					license: undefined,
				},
				// Snippet-specific fields
				snippet,
				snippet_file_path,
				snippet_line_range,
				context_lines_before,
				context_lines_after,
				codespaces_link: codespacesLink,
			};

			formatted.push(snippetResult);

			// Structured logging: Log snippets mode usage (first result only)
			if (formatted.length === 1) {
				console.log(
					JSON.stringify({
						level: "info",
						message: "Snippet formatter processing results",
						formatter: "snippet",
						resultCount: results.length,
						snippetSource: result.snippet ? "highlights" : "fallback",
						timestamp: new Date().toISOString(),
					}),
				);
			}
		} catch (error) {
			// Log error but continue processing other results
			console.error(
				JSON.stringify({
					level: "error",
					message: "Error formatting snippet result",
					error: error instanceof Error ? error.message : String(error),
					resultUrl: result.url,
					timestamp: new Date().toISOString(),
				}),
			);
			// Skip this result and continue
			continue;
		}
	}

	return formatted;
}
