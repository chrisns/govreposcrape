/**
 * Full Mode Example - TypeScript/JavaScript
 *
 * Use case: Deep research, CLI tools, comprehensive code review
 * Performance: <3000ms p95, ~50KB per result
 * Returns: All snippet fields + complete gitingest summaries + repository stats + dependencies
 */

const API_URL = process.env.API_URL || "https://govreposcrape-api-xxxxx-uc.a.run.app";

interface Dependency {
	name: string;
	version: string;
	type: "runtime" | "dev";
}

interface RepositoryStats {
	contributors: number;
	commits_last_month: number;
	open_issues: number;
	last_commit: string;
}

interface FullResult {
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
	// Snippet fields
	snippet: string;
	snippet_file_path: string;
	snippet_line_range: string;
	context_lines_before: number;
	context_lines_after: number;
	codespaces_link: string;
	// Full mode fields
	gitingest_summary: string;
	full_file_context?: string;
	readme_excerpt?: string;
	repository_stats?: RepositoryStats;
	dependencies?: Dependency[];
}

interface SearchResponse {
	results: FullResult[];
	metadata: {
		query: string;
		limit: number;
		resultCount: number;
		duration: number;
	};
	mode: "minimal" | "snippets" | "full";
}

async function searchFull(query: string, limit: number = 2): Promise<SearchResponse> {
	try {
		const response = await fetch(`${API_URL}/mcp/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				limit,
				resultMode: "full",
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
		const results = await searchFull("microservices architecture patterns", 2);

		console.log(
			`Found ${results.metadata.resultCount} repositories (took ${results.metadata.duration}ms)`,
		);
		console.log(`Mode: ${results.mode}\n`);

		results.results.forEach((repo, index) => {
			console.log(`${"=".repeat(80)}`);
			console.log(`${index + 1}. ${repo.repo_org}/${repo.repo_name} (${repo.language})`);
			console.log(`${"=".repeat(80)}`);
			console.log(`Score: ${repo.similarity_score.toFixed(2)}`);
			console.log(`Last Updated: ${repo.last_updated}`);
			console.log(`License: ${repo.metadata.license || "Unknown"}`);
			console.log(`Stars: ${repo.metadata.stars || "N/A"}`);

			if (repo.repository_stats) {
				console.log(`\nRepository Stats:`);
				console.log(`  Contributors: ${repo.repository_stats.contributors}`);
				console.log(`  Recent Commits: ${repo.repository_stats.commits_last_month}`);
				console.log(`  Open Issues: ${repo.repository_stats.open_issues}`);
				console.log(`  Last Commit: ${repo.repository_stats.last_commit}`);
			}

			console.log(`\nCode Snippet (${repo.snippet_file_path}, lines ${repo.snippet_line_range}):`);
			console.log(
				repo.snippet
					.split("\n")
					.map((line) => `  ${line}`)
					.join("\n"),
			);

			if (repo.readme_excerpt) {
				console.log(`\nREADME Excerpt:`);
				console.log(repo.readme_excerpt.substring(0, 200) + "...");
			}

			if (repo.dependencies && repo.dependencies.length > 0) {
				console.log(`\nKey Dependencies (${repo.dependencies.length} total):`);
				repo.dependencies.slice(0, 5).forEach((dep) => {
					console.log(`  - ${dep.name} ${dep.version} (${dep.type})`);
				});
				if (repo.dependencies.length > 5) {
					console.log(`  ... and ${repo.dependencies.length - 5} more`);
				}
			}

			console.log(`\nGitingest Summary (${repo.gitingest_summary.length} chars):`);
			console.log(repo.gitingest_summary.substring(0, 300) + "...\n");

			console.log(`Links:`);
			console.log(`  GitHub: ${repo.github_link}`);
			console.log(`  Codespaces: ${repo.codespaces_link}`);
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

export { searchFull, FullResult, SearchResponse, Dependency, RepositoryStats };
