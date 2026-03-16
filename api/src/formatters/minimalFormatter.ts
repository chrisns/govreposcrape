/**
 * Minimal Mode Formatter
 * Transforms Vertex AI Search results into lightweight MinimalResult format
 * Optimized for fast browsing and low-bandwidth clients
 */

import { MinimalResult } from "../types/mcp";
import { SearchResult } from "../services/vertexSearchService";

/**
 * Format search results in minimal mode
 * Returns only essential repository metadata without code snippets or summaries
 * Performance optimization: Skips Cloud Storage reads
 *
 * @param results Raw search results from Vertex AI Search
 * @returns Array of minimal result objects
 */
export function formatMinimal(results: SearchResult[]): MinimalResult[] {
	const formatted: MinimalResult[] = [];

	for (const result of results) {
		try {
			// Extract org and repo from result metadata
			const { org, repo } = result.metadata;

			// Build GitHub URL
			const githubLink = `https://github.com/${org}/${repo}`;

			// Extract language from result (use "Unknown" if not available)
			// In current implementation, language might not be in metadata yet
			const language = "Unknown"; // TODO: Extract from Vertex AI metadata when available

			// Extract last_updated from metadata (prefer pushedAt, fallback to processedAt)
			const last_updated =
				result.metadata.pushedAt || result.metadata.processedAt || new Date().toISOString();

			// Map similarity score (for now, use a default since it's not in current SearchResult)
			// In production, this would come from Vertex AI Search relevance score
			const similarity_score = 0.85; // TODO: Extract from Vertex AI Search response

			// Create minimal result object
			const minimalResult: MinimalResult = {
				repo_url: result.url,
				repo_org: org,
				repo_name: repo,
				language,
				last_updated,
				similarity_score,
				github_link: githubLink,
				metadata: {
					// Optional fields - not available in current implementation
					// These would come from GitHub API or cached metadata
					stars: undefined,
					license: undefined,
				},
			};

			formatted.push(minimalResult);

			// Structured logging: Log minimal mode usage
			if (formatted.length === 1) {
				console.log(
					JSON.stringify({
						level: "info",
						message: "Minimal formatter processing results",
						formatter: "minimal",
						resultCount: results.length,
						timestamp: new Date().toISOString(),
					}),
				);
			}
		} catch (error) {
			// Log error but continue processing other results
			console.error(
				JSON.stringify({
					level: "error",
					message: "Error formatting minimal result",
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
