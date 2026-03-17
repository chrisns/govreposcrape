/**
 * Full Mode Formatter
 * Transforms Vertex AI Search results into FullResult format
 * Comprehensive mode including complete gitingest summaries and enhanced metadata
 */

import { FullResult, Dependency, RepositoryStats } from "../types/mcp";
import { SearchResult } from "../services/vertexSearchService";
import { GCSClient } from "../services/gcsClient";

/**
 * Format search results in full mode (comprehensive)
 * Returns all snippet mode fields PLUS complete gitingest summaries,
 * enhanced metadata, dependencies, and repository stats
 *
 * This is the first ASYNC formatter - fetches gitingest summaries from Cloud Storage
 * Uses parallel fetching with Promise.all for optimal performance
 *
 * @param results Raw search results from Vertex AI Search
 * @param gcsClient GCS client instance for fetching summaries
 * @returns Promise resolving to array of full result objects
 */
export async function formatFull(
	results: SearchResult[],
	gcsClient: GCSClient,
): Promise<FullResult[]> {
	const formatted: FullResult[] = [];
	const startTime = Date.now();

	// Optimize: Fetch all gitingest summaries in parallel
	const repos = results.map((r) => ({ org: r.metadata.org, repo: r.metadata.repo }));
	const summaries = await gcsClient.fetchMultipleSummaries(repos);

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		const gitingestSummary = summaries[i];

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
			let snippet = result.snippet || "";

			// Truncate snippet if too long (aim for 3-5 lines, ~200 chars)
			if (snippet.length > 200) {
				snippet = snippet.substring(0, 200) + "...";
			}

			// Extract file path and line range from snippet metadata
			// TODO: Parse from Vertex AI Search derivedData when available
			const snippet_file_path = "src/example.ts"; // TODO: Extract from metadata
			const snippet_line_range = "1-5"; // TODO: Extract from highlights metadata

			// Context lines are fixed at 2 before and 2 after
			const context_lines_before = 2;
			const context_lines_after = 2;

			// Fallback handling: If GCS fetch failed, use empty string for gitingest_summary
			// This ensures graceful degradation - request succeeds with snippet-mode data
			const gitingest_summary = gitingestSummary || "";

			// Extract enhanced metadata from gitingest summary (if available)
			let readme_excerpt: string | undefined;
			let repository_stats: RepositoryStats | undefined;
			let dependencies: Dependency[] | undefined;

			if (gitingestSummary) {
				// Parse README excerpt (first 500 chars or first paragraph)
				readme_excerpt = extractReadmeExcerpt(gitingestSummary);

				// Parse repository stats from gitingest metadata
				repository_stats = extractRepositoryStats(gitingestSummary);

				// Parse dependencies from gitingest summary
				dependencies = extractDependencies(gitingestSummary);
			}

			// Build SBOM URL from xgov-opensource-repo-scraper published data
			const sbomUrl = `https://uk-x-gov-software-community.github.io/xgov-opensource-repo-scraper/sbom/${org}/${repo}.json.gz`;

			// Create full result object (extends SnippetResult)
			const fullResult: FullResult = {
				// Base fields from MinimalResult
				repo_url: result.url,
				repo_org: org,
				repo_name: repo,
				language,
				last_updated,
				similarity_score,
				github_link: githubLink,
				sbom_url: sbomUrl,
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
				// Full mode fields
				gitingest_summary,
				readme_excerpt,
				repository_stats,
				dependencies,
			};

			formatted.push(fullResult);

			// Structured logging: Log full mode usage (first result only)
			if (formatted.length === 1) {
				const duration = Date.now() - startTime;
				console.log(
					JSON.stringify({
						level: "info",
						message: "Full formatter processing results",
						formatter: "full",
						resultCount: results.length,
						gcsSuccessRate: `${summaries.filter((s) => s !== null).length}/${summaries.length}`,
						avgSummarySize: Math.round(
							summaries.filter((s) => s !== null).reduce((sum, s) => sum + (s?.length || 0), 0) /
								summaries.filter((s) => s !== null).length,
						),
						duration,
						timestamp: new Date().toISOString(),
					}),
				);
			}
		} catch (error) {
			// Log error but continue processing other results
			console.error(
				JSON.stringify({
					level: "error",
					message: "Error formatting full result",
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

/**
 * Extract README excerpt from gitingest summary
 * Returns first 500 characters or first paragraph
 *
 * @param gitingest Complete gitingest Markdown
 * @returns README excerpt or undefined if not found
 */
function extractReadmeExcerpt(gitingest: string): string | undefined {
	try {
		// Look for README section in gitingest
		// Try multiple patterns to match different gitingest formats
		let readmeMatch = gitingest.match(
			/^#{1,3}\s+README[^\n]*\n+([\s\S]+?)(?=\n#{1,3}\s+|\n---|\z)/im,
		);

		// Alternative pattern without explicit section ending
		if (!readmeMatch) {
			readmeMatch = gitingest.match(/#{1,3}\s+README[^\n]*\n+([\s\S]+)/i);
		}

		if (!readmeMatch || !readmeMatch[1]) {
			return undefined;
		}

		const readmeContent = readmeMatch[1].trim();

		// Extract first paragraph or 500 characters
		const firstParagraph = readmeContent.split("\n\n")[0].trim();
		const excerpt =
			firstParagraph.length > 500 ? firstParagraph.substring(0, 500) + "..." : firstParagraph;

		return excerpt;
	} catch (error) {
		console.error(
			JSON.stringify({
				level: "error",
				message: "Error extracting README excerpt",
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
			}),
		);
		return undefined;
	}
}

/**
 * Extract repository statistics from gitingest metadata
 *
 * @param gitingest Complete gitingest Markdown
 * @returns Repository stats or undefined if not found
 */
function extractRepositoryStats(gitingest: string): RepositoryStats | undefined {
	try {
		// Look for metadata section in gitingest
		// Gitingest typically includes repo metadata at the top
		// Format: "Contributors: 42", "Commits (last month): 15", etc.

		const stats: RepositoryStats = {
			contributors: 0,
			commits_last_month: 0,
			open_issues: 0,
			last_commit: new Date().toISOString(),
		};

		// Extract contributors count
		const contributorsMatch = gitingest.match(/Contributors?:\s*(\d+)/i);
		if (contributorsMatch) {
			stats.contributors = parseInt(contributorsMatch[1], 10);
		}

		// Extract commits last month
		const commitsMatch = gitingest.match(/Commits?\s*\(last month\):\s*(\d+)/i);
		if (commitsMatch) {
			stats.commits_last_month = parseInt(commitsMatch[1], 10);
		}

		// Extract open issues
		const issuesMatch = gitingest.match(/Open Issues?:\s*(\d+)/i);
		if (issuesMatch) {
			stats.open_issues = parseInt(issuesMatch[1], 10);
		}

		// Extract last commit date
		const lastCommitMatch = gitingest.match(/Last Commit:\s*([^\n]+)/i);
		if (lastCommitMatch) {
			stats.last_commit = lastCommitMatch[1].trim();
		}

		// Return undefined if no stats found
		if (
			stats.contributors === 0 &&
			stats.commits_last_month === 0 &&
			stats.open_issues === 0 &&
			stats.last_commit === new Date().toISOString()
		) {
			return undefined;
		}

		return stats;
	} catch (error) {
		console.error(
			JSON.stringify({
				level: "error",
				message: "Error extracting repository stats",
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
			}),
		);
		return undefined;
	}
}

/**
 * Extract dependencies from gitingest summary
 * Parses package.json, requirements.txt, go.mod sections
 *
 * @param gitingest Complete gitingest Markdown
 * @returns Array of dependencies or undefined if not found
 */
function extractDependencies(gitingest: string): Dependency[] | undefined {
	try {
		const dependencies: Dependency[] = [];

		// Extract package.json dependencies (JavaScript/TypeScript)
		const packageJsonMatch = gitingest.match(
			/```json[^\n]*package\.json[\s\S]*?"dependencies":\s*\{([^}]+)\}/i,
		);
		if (packageJsonMatch) {
			const depsContent = packageJsonMatch[1];
			const depMatches = depsContent.matchAll(/"([^"]+)":\s*"([^"]+)"/g);
			for (const match of depMatches) {
				dependencies.push({
					name: match[1],
					version: match[2],
					type: "runtime",
				});
			}
		}

		// Extract devDependencies
		const devDepsMatch = gitingest.match(
			/```json[^\n]*package\.json[\s\S]*?"devDependencies":\s*\{([^}]+)\}/i,
		);
		if (devDepsMatch) {
			const depsContent = devDepsMatch[1];
			const depMatches = depsContent.matchAll(/"([^"]+)":\s*"([^"]+)"/g);
			for (const match of depMatches) {
				dependencies.push({
					name: match[1],
					version: match[2],
					type: "dev",
				});
			}
		}

		// Extract requirements.txt dependencies (Python)
		const requirementsMatch = gitingest.match(/```[^\n]*requirements\.txt[\s\S]*?```/i);
		if (requirementsMatch) {
			const requirementsContent = requirementsMatch[0];
			const lines = requirementsContent.split("\n");
			for (const line of lines) {
				const depMatch = line.match(/^([a-zA-Z0-9_-]+)\s*([=<>!]+\s*[\d.]+)?/);
				if (depMatch) {
					dependencies.push({
						name: depMatch[1],
						version: depMatch[2]?.trim() || "*",
						type: "runtime",
					});
				}
			}
		}

		// Extract go.mod dependencies (Go)
		const goModMatch = gitingest.match(/```[^\n]*go\.mod[\s\S]*?```/i);
		if (goModMatch) {
			const goModContent = goModMatch[0];
			const lines = goModContent.split("\n");
			for (const line of lines) {
				const depMatch = line.match(/^\s*([a-zA-Z0-9_.\-/]+)\s+v?([\d.]+)/);
				if (depMatch) {
					dependencies.push({
						name: depMatch[1],
						version: depMatch[2],
						type: "runtime",
					});
				}
			}
		}

		return dependencies.length > 0 ? dependencies : undefined;
	} catch (error) {
		console.error(
			JSON.stringify({
				level: "error",
				message: "Error extracting dependencies",
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
			}),
		);
		return undefined;
	}
}
