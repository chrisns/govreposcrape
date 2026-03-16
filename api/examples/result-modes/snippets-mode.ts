/**
 * Snippets Mode Example - TypeScript/JavaScript
 *
 * Use case: AI assistants, web UI, standard search (DEFAULT mode)
 * Performance: <1500ms p95, ~5KB per result
 * Returns: Metadata + focused code snippets (3-5 lines with context)
 */

const API_URL = process.env.API_URL || "https://govreposcrape-api-xxxxx-uc.a.run.app";

interface SnippetResult {
	repo_url: string;
	repo_org: string;
	repo_name: string;
	language: string;
	last_updated: string;
	similarity_score: number;
	github_link: string;
	metadata: {
		stars?: number;
		license?: string;
	};
	// Snippet-specific fields
	snippet: string;
	snippet_file_path: string;
	snippet_line_range: string;
	context_lines_before: number;
	context_lines_after: number;
	codespaces_link: string;
}

interface SearchResponse {
	results: SnippetResult[];
	metadata: {
		query: string;
		limit: number;
		resultCount: number;
		duration: number;
	};
	mode: "minimal" | "snippets" | "full";
}

async function searchSnippets(query: string, limit: number = 5): Promise<SearchResponse> {
	try {
		const response = await fetch(`${API_URL}/mcp/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				limit,
				resultMode: "snippets", // Can also be omitted for default behavior
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`API Error: ${error.error.message}`);
		}

		return await response.json();
	} catch (error) {
		console.error("Search failed:", error);
		throw error;
	}
}

// Example: Using default mode (omit resultMode parameter)
async function searchDefault(query: string, limit: number = 5): Promise<SearchResponse> {
	const response = await fetch(`${API_URL}/mcp/search`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query,
			limit,
			// resultMode omitted - defaults to 'snippets'
		}),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(`API Error: ${error.error.message}`);
	}

	return await response.json();
}

// Example usage
async function main() {
	try {
		const results = await searchSnippets("OAuth2 implementation patterns", 3);

		console.log(
			`Found ${results.metadata.resultCount} repositories (took ${results.metadata.duration}ms)`,
		);
		console.log(`Mode: ${results.mode}\n`);

		results.results.forEach((repo, index) => {
			console.log(`${index + 1}. ${repo.repo_org}/${repo.repo_name} (${repo.language})`);
			console.log(`   Score: ${repo.similarity_score.toFixed(2)}`);
			console.log(`   File: ${repo.snippet_file_path} (lines ${repo.snippet_line_range})`);
			console.log(
				`   Snippet:\n${repo.snippet
					.split("\n")
					.map((line) => `     ${line}`)
					.join("\n")}`,
			);
			console.log(`   GitHub: ${repo.github_link}`);
			console.log(`   Codespaces: ${repo.codespaces_link}`);
			console.log("");
		});
	} catch (error) {
		console.error("Error:", error);
		process.exit(1);
	}
}

// Run if executed directly
if (require.main === module) {
	main();
}

export { searchSnippets, searchDefault, SnippetResult, SearchResponse };
