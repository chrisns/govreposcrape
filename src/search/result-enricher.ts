/**
 * Result Enrichment Module for AI Search Results
 * Enriches raw AI Search results with GitHub metadata, links, and R2 custom metadata
 *
 * Features:
 * - R2 path parsing to extract org/repo information
 * - GitHub, Codespaces, and Gitpod link generation
 * - R2 metadata fetching (pushedAt, url, processedAt)
 * - Graceful degradation when metadata unavailable
 * - Performance monitoring (<100ms per result target)
 *
 * @example
 * ```typescript
 * import { enrichResult, enrichResults } from './search/result-enricher';
 *
 * const results = await searchCode(env, 'authentication', 5);
 * const enriched = await enrichResults(env, results);
 * console.log(enriched.map(r => r.links.github));
 * ```
 */

import type { AISearchResult, EnrichedSearchResult } from "../types";
import { createLogger } from "../utils/logger";

// Performance threshold for slow enrichment warnings
const SLOW_ENRICHMENT_THRESHOLD = 100; // milliseconds

/**
 * Parsed R2 path result structure
 */
export interface ParsedR2Path {
	org: string;
	repo: string;
	valid: boolean;
	error?: string;
}

/**
 * R2 custom metadata structure
 */
export interface R2Metadata {
	pushedAt?: string;
	url?: string;
	processedAt?: string;
}

/**
 * Parse R2 object path to extract organization and repository names
 *
 * Expected format: gitingest/{org}/{repo}/summary.txt
 * Handles URL encoding in org/repo names
 *
 * @param path R2 object path from AISearchResult.metadata.path
 * @returns Parsed path with org, repo, validation status, and error (if invalid)
 *
 * @example
 * ```typescript
 * const result = parseR2Path('gitingest/alphagov/govuk-frontend/summary.txt');
 * console.log(result); // { org: 'alphagov', repo: 'govuk-frontend', valid: true }
 *
 * const invalid = parseR2Path('invalid/path');
 * console.log(invalid.valid); // false
 * console.log(invalid.error); // 'Invalid R2 path format...'
 * ```
 */
export function parseR2Path(path: string): ParsedR2Path {
	// Validate input
	if (!path || typeof path !== "string") {
		return {
			org: "",
			repo: "",
			valid: false,
			error:
				"Invalid path: must be a non-empty string in format gitingest/{org}/{repo}/summary.txt",
		};
	}

	// Expected format: gitingest/{org}/{repo}/summary.txt
	// Use looser pattern to allow validation of empty segments
	const pathPattern = /^gitingest\/([^/]*)\/([^/]*)\/summary\.txt$/;
	const match = path.match(pathPattern);

	if (!match) {
		return {
			org: "",
			repo: "",
			valid: false,
			error: `Invalid R2 path format. Expected: gitingest/{org}/{repo}/summary.txt, got: ${path}`,
		};
	}

	// Extract and decode org/repo (handles URL encoding)
	try {
		const org = decodeURIComponent(match[1]);
		const repo = decodeURIComponent(match[2]);

		// Validate extracted values are not empty after decoding
		if (!org || !repo) {
			return {
				org: "",
				repo: "",
				valid: false,
				error: "Invalid R2 path: org or repo is empty",
			};
		}

		return {
			org,
			repo,
			valid: true,
		};
	} catch (error) {
		return {
			org: "",
			repo: "",
			valid: false,
			error: `Failed to decode org/repo from path: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Build GitHub repository URL
 *
 * @param org GitHub organization name
 * @param repo Repository name
 * @returns Full GitHub URL: https://github.com/{org}/{repo}
 *
 * @example
 * ```typescript
 * const url = buildGitHubURL('alphagov', 'govuk-frontend');
 * console.log(url); // https://github.com/alphagov/govuk-frontend
 * ```
 */
export function buildGitHubURL(org: string, repo: string): string {
	const encodedOrg = encodeURIComponent(org);
	const encodedRepo = encodeURIComponent(repo);
	return `https://github.com/${encodedOrg}/${encodedRepo}`;
}

/**
 * Build GitHub Codespaces URL for instant browser-based development
 *
 * @param org GitHub organization name
 * @param repo Repository name
 * @returns Codespaces URL: https://github.dev/{org}/{repo}
 *
 * @example
 * ```typescript
 * const url = buildCodespacesURL('alphagov', 'govuk-frontend');
 * console.log(url); // https://github.dev/alphagov/govuk-frontend
 * ```
 */
export function buildCodespacesURL(org: string, repo: string): string {
	const encodedOrg = encodeURIComponent(org);
	const encodedRepo = encodeURIComponent(repo);
	return `https://github.dev/${encodedOrg}/${encodedRepo}`;
}

/**
 * Build Gitpod URL for cloud-based development environment
 *
 * @param org GitHub organization name
 * @param repo Repository name
 * @returns Gitpod URL: https://gitpod.io/#https://github.com/{org}/{repo}
 *
 * @example
 * ```typescript
 * const url = buildGitpodURL('alphagov', 'govuk-frontend');
 * console.log(url); // https://gitpod.io/#https://github.com/alphagov/govuk-frontend
 * ```
 */
export function buildGitpodURL(org: string, repo: string): string {
	const encodedOrg = encodeURIComponent(org);
	const encodedRepo = encodeURIComponent(repo);
	const githubURL = `https://github.com/${encodedOrg}/${encodedRepo}`;
	return `https://gitpod.io/#${githubURL}`;
}

/**
 * Fetch R2 object custom metadata using HEAD request
 *
 * Retrieves metadata stored during gitingest processing:
 * - pushedAt: Repository last push timestamp (ISO 8601)
 * - url: Full GitHub repository URL
 * - processedAt: Gitingest processing timestamp (ISO 8601)
 *
 * Implements graceful degradation: returns empty object if metadata unavailable
 *
 * @param env Workers environment with R2 binding
 * @param path R2 object path
 * @param requestId Correlation ID for distributed tracing
 * @returns Promise of R2 metadata (empty object if unavailable)
 *
 * @example
 * ```typescript
 * const metadata = await fetchR2Metadata(env, 'gitingest/alphagov/govuk-frontend/summary.txt', requestId);
 * if (metadata.pushedAt) {
 *   console.log(`Last updated: ${metadata.pushedAt}`);
 * }
 * ```
 */
export async function fetchR2Metadata(
	env: Env,
	path: string,
	requestId: string,
): Promise<R2Metadata> {
	const logger = createLogger({ operation: "fetch_r2_metadata", requestId });
	const startTime = Date.now();

	try {
		const object = await env.R2.head(path);
		const duration = Date.now() - startTime;

		if (!object) {
			logger.warn("R2 object not found", { path, duration });
			return {};
		}

		logger.info("R2 metadata fetched", {
			path,
			duration,
			hasCustomMetadata: !!object.customMetadata,
		});

		// Warn if R2 HEAD request is slow (>100ms target)
		if (duration > SLOW_ENRICHMENT_THRESHOLD) {
			logger.warn("Slow R2 HEAD request", {
				path,
				duration,
				threshold: SLOW_ENRICHMENT_THRESHOLD,
			});
		}

		// Extract custom metadata if available
		return {
			pushedAt: object.customMetadata?.pushedAt,
			url: object.customMetadata?.url,
			processedAt: object.customMetadata?.processedAt,
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error("R2 metadata fetch failed", {
			path,
			duration,
			error: error instanceof Error ? error.message : String(error),
		});
		// Graceful degradation: return empty metadata instead of throwing
		return {};
	}
}

/**
 * Enrich a single AI Search result with repository metadata and actionable links
 *
 * Transforms raw AI Search results into user-friendly results with:
 * - Repository information (org, name, fullName)
 * - Quick-launch links (GitHub, Codespaces, Gitpod)
 * - R2 custom metadata (pushedAt, url, processedAt)
 *
 * Implements graceful degradation:
 * - Invalid R2 path → returns minimal enrichment with 'unknown' values
 * - R2 metadata unavailable → returns enriched result without metadata field
 *
 * Performance target: <100ms per result (measured and logged)
 *
 * @param env Workers environment with R2 binding
 * @param rawResult Raw AI Search result from searchCode()
 * @returns Promise of enriched result with metadata and links
 *
 * @example
 * ```typescript
 * const rawResult: AISearchResult = {
 *   content: 'function authenticate() { ... }',
 *   score: 0.92,
 *   metadata: { path: 'gitingest/alphagov/govuk-frontend/summary.txt', contentType: 'text/plain' }
 * };
 *
 * const enriched = await enrichResult(env, rawResult);
 * console.log(enriched.links.github); // https://github.com/alphagov/govuk-frontend
 * console.log(enriched.repository.fullName); // alphagov/govuk-frontend
 * console.log(enriched.metadata?.pushedAt); // 2025-01-15T10:00:00Z
 * ```
 */
export async function enrichResult(
	env: Env,
	rawResult: AISearchResult,
): Promise<EnrichedSearchResult> {
	const requestId = crypto.randomUUID();
	const logger = createLogger({ operation: "enrich_result", requestId });
	const startTime = Date.now();

	// Parse R2 path to extract org/repo
	const parsed = parseR2Path(rawResult.metadata.path);

	if (!parsed.valid) {
		logger.error("Invalid R2 path", {
			path: rawResult.metadata.path,
			error: parsed.error,
		});

		// Return minimal enrichment for invalid paths (graceful degradation)
		const duration = Date.now() - startTime;
		logger.info("Result enrichment completed (minimal)", { duration });

		return {
			content: rawResult.content,
			score: rawResult.score,
			repository: {
				org: "unknown",
				name: "unknown",
				fullName: "unknown/unknown",
			},
			links: {
				github: "",
				codespaces: "",
				gitpod: "",
			},
			r2Path: rawResult.metadata.path,
		};
	}

	// Generate quick-launch links
	const githubURL = buildGitHubURL(parsed.org, parsed.repo);
	const codespacesURL = buildCodespacesURL(parsed.org, parsed.repo);
	const gitpodURL = buildGitpodURL(parsed.org, parsed.repo);

	// Fetch R2 metadata (with graceful degradation)
	const r2Metadata = await fetchR2Metadata(env, rawResult.metadata.path, requestId);

	const duration = Date.now() - startTime;

	logger.info("Result enriched", {
		duration,
		org: parsed.org,
		repo: parsed.repo,
		hasMetadata: Object.keys(r2Metadata).length > 0,
	});

	// Warn if enrichment is slow (>100ms target)
	if (duration > SLOW_ENRICHMENT_THRESHOLD) {
		logger.warn("Slow result enrichment", {
			duration,
			threshold: SLOW_ENRICHMENT_THRESHOLD,
			org: parsed.org,
			repo: parsed.repo,
		});
	}

	// Build enriched result
	const enrichedResult: EnrichedSearchResult = {
		content: rawResult.content,
		score: rawResult.score,
		repository: {
			org: parsed.org,
			name: parsed.repo,
			fullName: `${parsed.org}/${parsed.repo}`,
		},
		links: {
			github: githubURL,
			codespaces: codespacesURL,
			gitpod: gitpodURL,
		},
		r2Path: rawResult.metadata.path,
	};

	// Only include metadata field if we have data (optional field pattern)
	if (Object.keys(r2Metadata).length > 0) {
		enrichedResult.metadata = r2Metadata;
	}

	return enrichedResult;
}

/**
 * Enrich multiple AI Search results in parallel
 *
 * Processes array of raw results concurrently using Promise.all for performance.
 * Each result is enriched independently with repository metadata and links.
 *
 * Performance target: <100ms average per result
 * Logs: total duration, result count, average duration per result
 *
 * @param env Workers environment with R2 binding
 * @param rawResults Array of raw AI Search results
 * @returns Promise of enriched results array (same order as input)
 *
 * @example
 * ```typescript
 * const results = await searchCode(env, 'authentication', 5);
 * const enriched = await enrichResults(env, results);
 *
 * enriched.forEach(result => {
 *   console.log(`${result.repository.fullName}: ${result.links.github}`);
 * });
 * ```
 */
export async function enrichResults(
	env: Env,
	rawResults: AISearchResult[],
): Promise<EnrichedSearchResult[]> {
	const requestId = crypto.randomUUID();
	const logger = createLogger({ operation: "enrich_results", requestId });
	const startTime = Date.now();

	// Parallel enrichment for performance
	const enrichedResults = await Promise.all(rawResults.map((result) => enrichResult(env, result)));

	const duration = Date.now() - startTime;
	const avgDuration = rawResults.length > 0 ? duration / rawResults.length : 0;

	logger.info("Batch enrichment complete", {
		duration,
		resultCount: rawResults.length,
		avgDuration: Math.round(avgDuration),
	});

	// Warn if average enrichment time exceeds target
	if (avgDuration > SLOW_ENRICHMENT_THRESHOLD) {
		logger.warn("Slow batch enrichment", {
			avgDuration: Math.round(avgDuration),
			threshold: SLOW_ENRICHMENT_THRESHOLD,
			resultCount: rawResults.length,
		});
	}

	return enrichedResults;
}
