/**
 * Minimal Mode Example - TypeScript/JavaScript
 *
 * Use case: Fast repository discovery, low-bandwidth clients, metadata-only exploration
 * Performance: <500ms p95, ~1KB per result
 * Returns: Repository metadata only (no code snippets, no summaries)
 */

const API_URL = process.env.API_URL || "https://govreposcrape-api-xxxxx-uc.a.run.app";

interface MinimalResult {
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
}

interface SearchResponse {
	results: MinimalResult[];
	metadata: {
		query: string;
		limit: number;
		resultCount: number;
		duration: number;
	};
	mode: "minimal" | "snippets" | "full";
}

async function searchMinimal(query: string, limit: number = 5): Promise<SearchResponse> {
	try {
		const response = await fetch(`${API_URL}/mcp/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				limit,
				resultMode: "minimal",
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

// Example usage
async function main() {
	try {
		const results = await searchMinimal("authentication methods in UK government services", 5);

		console.log(
			`Found ${results.metadata.resultCount} repositories (took ${results.metadata.duration}ms)`,
		);
		console.log(`Mode: ${results.mode}\n`);

		results.results.forEach((repo, index) => {
			console.log(`${index + 1}. ${repo.repo_org}/${repo.repo_name}`);
			console.log(`   Language: ${repo.language}`);
			console.log(`   Score: ${repo.similarity_score.toFixed(2)}`);
			console.log(`   URL: ${repo.github_link}`);
			if (repo.metadata.stars) {
				console.log(`   Stars: ${repo.metadata.stars}`);
			}
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

export { searchMinimal, MinimalResult, SearchResponse };
