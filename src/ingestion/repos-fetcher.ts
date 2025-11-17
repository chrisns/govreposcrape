/**
 * Repository Discovery - Fetch and parse repos.json feed
 * Fetches the authoritative list of UK government repositories from xgov-opensource-repo-scraper
 *
 * Story 2.1: First step in data ingestion pipeline
 * - Fetches repos.json over HTTPS
 * - Retries with exponential backoff on failures (3 attempts: 1s, 2s, 4s)
 * - Validates repository data
 * - Tracks statistics (total, valid, invalid)
 *
 * @example
 * ```typescript
 * const result = await fetchReposJson();
 * console.log(`Fetched ${result.repositories.length} repositories`);
 * console.log(`Valid: ${result.stats.valid}, Invalid: ${result.stats.invalid}`);
 * ```
 */

import { createLogger } from "../utils/logger";
import { withRetry } from "../utils/retry";
import { ServiceError } from "../utils/error-handler";
import type { RepoMetadata } from "../types";

const logger = createLogger({ operation: "fetchRepos" });

/**
 * Feed URL for repos.json from xgov-opensource-repo-scraper
 * Source: https://github.com/uk-x-gov-software-community/xgov-opensource-repo-scraper
 */
const REPOS_FEED_URL =
	"https://raw.githubusercontent.com/uk-x-gov-software-community/xgov-opensource-repo-scraper/main/repos.json";

/**
 * Fetch timeout in milliseconds (30 seconds)
 */
const FETCH_TIMEOUT_MS = 30000;

/**
 * Statistics about the fetch operation
 */
export interface FetchStats {
	/** Total repositories in feed */
	total: number;
	/** Valid repositories (passed validation) */
	valid: number;
	/** Invalid repositories (failed validation) */
	invalid: number;
	/** Parse errors encountered */
	parseErrors: number;
}

/**
 * Result of fetching and parsing repos.json
 */
export interface FetchReposResult {
	/** Array of validated repository metadata */
	repositories: RepoMetadata[];
	/** Statistics about the fetch operation */
	stats: FetchStats;
}

/**
 * Raw repository object from repos.json feed
 * Contains fields from GitHub API response
 */
interface RawRepository {
	html_url?: string;
	pushed_at?: string;
	full_name?: string;
	[key: string]: unknown;
}

/**
 * Validate a repository object has all required fields
 * Checks for presence and type of required fields: url, pushedAt, org, name
 *
 * @param repo - Raw repository object to validate
 * @returns True if repository has all required fields with correct types
 *
 * @example
 * ```typescript
 * const repo = { html_url: "https://github.com/alphagov/govuk-frontend", pushed_at: "2025-10-15T14:30:00Z", full_name: "alphagov/govuk-frontend" };
 * const isValid = validateRepository(repo);
 * // isValid = true
 * ```
 */
export function validateRepository(repo: RawRepository): boolean {
	// Check required fields are present
	if (!repo.html_url || typeof repo.html_url !== "string") {
		return false;
	}
	if (!repo.pushed_at || typeof repo.pushed_at !== "string") {
		return false;
	}
	if (!repo.full_name || typeof repo.full_name !== "string") {
		return false;
	}

	// Check full_name contains org/name format
	const nameParts = repo.full_name.split("/");
	if (nameParts.length !== 2) {
		return false;
	}

	return true;
}

/**
 * Transform raw repository object to RepoMetadata format
 * Extracts required fields and normalizes format
 *
 * @param raw - Raw repository object from feed
 * @returns Transformed RepoMetadata object
 */
function transformRepository(raw: RawRepository): RepoMetadata {
	const [org, name] = (raw.full_name as string).split("/");

	return {
		url: raw.html_url as string,
		pushedAt: raw.pushed_at as string,
		org,
		name,
	};
}

/**
 * Fetch repos.json with timeout and abort signal
 * Implements 30-second timeout for network requests
 *
 * @param url - Feed URL to fetch
 * @returns Promise resolving to Response object
 * @throws Error if fetch times out or network error occurs
 */
async function fetchWithTimeout(url: string): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				"User-Agent": "govreposcrape/1.0",
			},
		});
		clearTimeout(timeoutId);
		return response;
	} catch (error) {
		clearTimeout(timeoutId);
		throw error;
	}
}

/**
 * Fetch and parse the repos.json feed from xgov-opensource-repo-scraper
 * Implements retry logic with exponential backoff (3 attempts: 1s, 2s, 4s delays)
 *
 * Process:
 * 1. Fetch repos.json over HTTPS with 30s timeout
 * 2. Parse JSON with error handling for malformed data
 * 3. Validate each repository has required fields
 * 4. Track statistics (total, valid, invalid)
 * 5. Log detailed progress and results
 *
 * @param feedUrl - Optional custom feed URL (default: xgov-opensource-repo-scraper repos.json)
 * @returns Promise resolving to FetchReposResult with validated repositories and statistics
 * @throws ServiceError if fetch fails after all retry attempts
 *
 * @example
 * ```typescript
 * try {
 *   const result = await fetchReposJson();
 *   console.log(`Successfully fetched ${result.repositories.length} repositories`);
 *   console.log(`Statistics: ${result.stats.valid} valid, ${result.stats.invalid} invalid`);
 * } catch (error) {
 *   console.error('Failed to fetch repos.json:', error.message);
 * }
 * ```
 */
export async function fetchReposJson(feedUrl: string = REPOS_FEED_URL): Promise<FetchReposResult> {
	logger.info("Fetching repos.json", { url: feedUrl });

	// Initialize statistics
	const stats: FetchStats = {
		total: 0,
		valid: 0,
		invalid: 0,
		parseErrors: 0,
	};

	try {
		// Fetch with retry logic (3 attempts with exponential backoff)
		const response = await withRetry(
			async () => {
				const res = await fetchWithTimeout(feedUrl);

				if (!res.ok) {
					throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
				}

				return res;
			},
			3,
			[1000, 2000, 4000],
		);

		// Parse JSON with error handling
		let rawRepos: RawRepository[];
		try {
			const text = await response.text();
			rawRepos = JSON.parse(text) as RawRepository[];

			if (!Array.isArray(rawRepos)) {
				stats.parseErrors = 1;
				throw new Error("Feed is not an array");
			}
		} catch (parseError) {
			logger.error("Failed to parse repos.json", {
				error: parseError instanceof Error ? parseError.message : String(parseError),
			});
			stats.parseErrors = 1;
			throw new ServiceError("Malformed JSON in repos.json feed", 503, "PARSE_ERROR");
		}

		stats.total = rawRepos.length;
		logger.info("Fetched repos.json", { count: stats.total });

		// Check for empty array
		if (stats.total === 0) {
			logger.warn("repos.json feed is empty", { count: 0 });
		}

		// Validate and transform repositories
		const repositories: RepoMetadata[] = [];

		for (const raw of rawRepos) {
			if (validateRepository(raw)) {
				repositories.push(transformRepository(raw));
				stats.valid++;
			} else {
				stats.invalid++;
				logger.debug("Invalid repository", {
					repo: raw.full_name || "unknown",
					reason: "Missing required fields",
				});
			}
		}

		// Log final statistics
		logger.info("Repository validation complete", {
			total: stats.total,
			valid: stats.valid,
			invalid: stats.invalid,
		});

		return {
			repositories,
			stats,
		};
	} catch (error) {
		// Catch network errors and timeouts
		const errorMessage = error instanceof Error ? error.message : String(error);

		logger.error("Failed to fetch repos.json after retries", {
			error: errorMessage,
			url: feedUrl,
		});

		// Re-throw ServiceError as-is, wrap other errors
		if (error instanceof ServiceError) {
			throw error;
		}

		throw new ServiceError(
			`Failed to fetch repos.json after 3 attempts: ${errorMessage}`,
			503,
			"FETCH_FAILED",
		);
	}
}
