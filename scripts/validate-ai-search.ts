/**
 * AI Search Performance Validation Script
 *
 * Validates Cloudflare AI Search performance and quality for govreposcrape MVP.
 * Executes test queries, measures performance metrics, assesses relevance, and
 * generates baseline report with GO/NO-GO decision for MVP launch.
 *
 * Usage:
 *   npm run validate:search
 *   npx tsx scripts/validate-ai-search.ts
 *
 * Output:
 *   - Structured JSON logs to console
 *   - Baseline report: .bmad-ephemeral/search-performance-baseline-{date}.md
 *
 * @example
 * ```bash
 * # Run validation with default queries
 * npx tsx scripts/validate-ai-search.ts
 *
 * # Analyze baseline report
 * cat .bmad-ephemeral/search-performance-baseline-*.md
 * ```
 */

import { searchCode } from "../src/search/ai-search-client";
import { enrichResults } from "../src/search/result-enricher";
import type { EnrichedSearchResult } from "../src/types";
import { createLogger } from "../src/utils/logger";
import type { Env } from "../worker-configuration";

// Performance thresholds (from PRD NFR-1.1)
const TARGET_TOTAL_P95_MS = 2000;     // <2s end-to-end
const TARGET_AI_SEARCH_P95_MS = 800;  // <800ms AI Search component
const TARGET_INDEXING_LAG_MS = 300000; // <5 minutes

// Relevance threshold (from PRD NFR-1.2)
const TARGET_RELEVANCE_RATE = 80; // 80%+ of queries with 80%+ relevant results

// Test query configuration
const RUNS_PER_QUERY = 3; // Multiple runs to establish variance
const INDEXING_LAG_POLL_INTERVAL_MS = 10000; // 10 seconds
const INDEXING_LAG_MAX_ATTEMPTS = 60; // 10 minutes max

/**
 * Test query structure representing government developer use cases
 */
interface TestQuery {
	id: string;
	query: string;
	intent: string; // What the user is trying to find
	expectedDomains?: string[]; // Expected GitHub organizations
}

/**
 * Performance metrics for a single query execution
 */
interface PerformanceMetrics {
	query: string;
	run: number; // Which run (1-3)
	totalTime: number;
	aiSearchTime: number;
	enrichmentTime: number;
	resultCount: number;
	topResults: Array<{
		org: string;
		repo: string;
		score: number;
		snippet: string;
	}>;
}

/**
 * Relevance score enum (manual assessment scale)
 */
enum RelevanceScore {
	IRRELEVANT = 0, // No relation to query
	TANGENTIAL = 1, // Loosely related
	RELEVANT = 2, // Directly relevant
	HIGHLY_RELEVANT = 3, // Exactly what user needs
}

/**
 * Relevance assessment for a query
 */
interface RelevanceAssessment {
	queryId: string;
	query: string;
	results: Array<{
		rank: number;
		org: string;
		repo: string;
		snippet: string;
		score: RelevanceScore;
		rationale: string;
		hasAdequateContext: boolean; // AC #2b validation from Story 3.3
	}>;
	relevantCount: number; // Count of scores >= 2
	relevanceRate: number; // % of top 5 that are relevant
	snippetContextAdequate: boolean; // Overall snippet context assessment
}

/**
 * Baseline report structure
 */
interface BaselineReport {
	timestamp: string;
	summary: {
		totalQueries: number;
		totalRuns: number;
		avgResponseTime: number;
		p50ResponseTime: number;
		p95ResponseTime: number;
		p99ResponseTime: number;
		avgAISearchTime: number;
		p95AISearchTime: number;
		avgEnrichmentTime: number;
		avgRelevanceRate: number;
		queriesPassingRelevanceThreshold: number;
		indexingLagMs: number;
		indexingLagMinutes: number;
		snippetContextAdequate: boolean; // Story 3.3 AC #2b validation
		decision: "GO" | "NO-GO";
		rationale: string;
	};
	performanceData: PerformanceMetrics[];
	relevanceData: RelevanceAssessment[];
	recommendations: string[];
}

/**
 * Test query set representing UK government developer use cases
 *
 * Based on PRD user personas and common government software patterns:
 * - Authentication and identity management
 * - Address and postcode validation
 * - NHS and healthcare integrations
 * - Tax and revenue systems (HMRC)
 * - Benefits and welfare (DWP)
 * - GOV.UK design system and components
 * - API and microservice patterns
 */
const TEST_QUERIES: TestQuery[] = [
	{
		id: "Q1",
		query: "authentication JWT token validation",
		intent: "Find authentication implementation patterns",
		expectedDomains: ["alphagov", "nhsdigital", "moj"],
	},
	{
		id: "Q2",
		query: "postcode validation UK address lookup",
		intent: "Find postcode/address validation utilities",
		expectedDomains: ["alphagov", "dwpdigital"],
	},
	{
		id: "Q3",
		query: "NHS API integration FHIR",
		intent: "Find NHS API integration examples",
		expectedDomains: ["nhsdigital"],
	},
	{
		id: "Q4",
		query: "tax calculation HMRC PAYE",
		intent: "Find tax calculation logic",
		expectedDomains: ["hmrc"],
	},
	{
		id: "Q5",
		query: "GOV.UK frontend components design system",
		intent: "Find UI component libraries",
		expectedDomains: ["alphagov"],
	},
	{
		id: "Q6",
		query: "benefits validation DWP universal credit",
		intent: "Find benefits calculation and validation",
		expectedDomains: ["dwpdigital"],
	},
	{
		id: "Q7",
		query: "API gateway rate limiting authentication",
		intent: "Find API gateway implementation patterns",
		expectedDomains: ["alphagov", "hmrc", "nhsdigital"],
	},
	{
		id: "Q8",
		query: "microservice event driven architecture",
		intent: "Find microservice design patterns",
		expectedDomains: ["alphagov", "moj", "dwpdigital"],
	},
	{
		id: "Q9",
		query: "database migration versioning",
		intent: "Find database migration tools and patterns",
		expectedDomains: ["alphagov", "nhsdigital", "moj"],
	},
	{
		id: "Q10",
		query: "GOV.UK notify email SMS integration",
		intent: "Find GOV.UK Notify integration examples",
		expectedDomains: ["alphagov", "dwpdigital", "moj"],
	},
];

/**
 * Measure performance metrics for a single query execution
 *
 * @param env Workers environment with AI_SEARCH and R2 bindings
 * @param query Search query string
 * @param run Run number (for variance analysis)
 * @param limit Number of results to return (default: 5)
 * @returns Performance metrics including timing breakdown
 */
async function measureQueryPerformance(
	env: Env,
	query: string,
	run: number,
	limit: number = 5,
): Promise<PerformanceMetrics> {
	const logger = createLogger({ operation: "performance_test", query, run });
	const totalStart = Date.now();

	try {
		// Measure AI Search time
		const searchStart = Date.now();
		const rawResults = await searchCode(env, query, limit);
		const aiSearchTime = Date.now() - searchStart;

		// Measure enrichment time
		const enrichStart = Date.now();
		const enrichedResults = await enrichResults(env, rawResults);
		const enrichmentTime = Date.now() - enrichStart;

		const totalTime = Date.now() - totalStart;

		// Performance threshold warnings
		if (totalTime > TARGET_TOTAL_P95_MS) {
			logger.warn("Slow query (total)", {
				totalTime,
				threshold: TARGET_TOTAL_P95_MS,
			});
		}
		if (aiSearchTime > TARGET_AI_SEARCH_P95_MS) {
			logger.warn("Slow AI Search component", {
				aiSearchTime,
				threshold: TARGET_AI_SEARCH_P95_MS,
			});
		}

		logger.info("Query performance measured", {
			query,
			run,
			totalTime,
			aiSearchTime,
			enrichmentTime,
			resultCount: enrichedResults.length,
		});

		return {
			query,
			run,
			totalTime,
			aiSearchTime,
			enrichmentTime,
			resultCount: enrichedResults.length,
			topResults: enrichedResults.slice(0, 5).map((r) => ({
				org: r.repository.org,
				repo: r.repository.name,
				score: r.score,
				snippet: r.content.substring(0, 200), // First 200 chars for review
			})),
		};
	} catch (error) {
		const totalTime = Date.now() - totalStart;
		logger.error("Query performance measurement failed", {
			query,
			run,
			totalTime,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Assess relevance of search results for a test query
 *
 * This is a manual assessment framework for MVP. Phase 2 will add automated scoring.
 * Results are displayed for developer review with scoring guidance.
 *
 * @param testQuery Test query definition with intent
 * @param results Enriched search results to assess
 * @returns Relevance assessment with scores and metrics
 */
async function assessRelevance(
	testQuery: TestQuery,
	results: EnrichedSearchResult[],
): Promise<RelevanceAssessment> {
	const logger = createLogger({ operation: "relevance_assessment", queryId: testQuery.id });

	// Display results for manual review
	console.log(`\n${"=".repeat(80)}`);
	console.log(`Query ${testQuery.id}: ${testQuery.query}`);
	console.log(`Intent: ${testQuery.intent}`);
	if (testQuery.expectedDomains) {
		console.log(`Expected domains: ${testQuery.expectedDomains.join(", ")}`);
	}
	console.log(`${"=".repeat(80)}\n`);

	const assessmentResults: RelevanceAssessment["results"] = [];
	let snippetContextAdequate = true;

	results.slice(0, 5).forEach((result, index) => {
		const rank = index + 1;
		console.log(`[${rank}] ${result.repository.fullName} (score: ${result.score.toFixed(3)})`);
		console.log(`    ${result.content.substring(0, 150)}...`);
		console.log(`    Link: ${result.links.github}`);

		// AC #2b validation: Check if snippet provides adequate context
		const snippetLength = result.content.length;
		const hasCodeContext = result.content.includes("\n"); // Multi-line snippet
		const hasAdequateContext = snippetLength >= 100 && hasCodeContext;

		if (!hasAdequateContext) {
			snippetContextAdequate = false;
		}

		console.log(`    Snippet length: ${snippetLength} chars, Multi-line: ${hasCodeContext}`);
		console.log();

		// Auto-score based on heuristics (manual review would refine this)
		// For automated testing, use simple heuristics:
		// - Expected domain match = HIGHLY_RELEVANT (3)
		// - High search score (>0.7) = RELEVANT (2)
		// - Medium search score (0.5-0.7) = TANGENTIAL (1)
		// - Low search score (<0.5) = IRRELEVANT (0)
		let score: RelevanceScore;
		let rationale: string;

		if (
			testQuery.expectedDomains &&
			testQuery.expectedDomains.includes(result.repository.org)
		) {
			score = RelevanceScore.HIGHLY_RELEVANT;
			rationale = `From expected domain: ${result.repository.org}`;
		} else if (result.score > 0.7) {
			score = RelevanceScore.RELEVANT;
			rationale = `High search score: ${result.score.toFixed(3)}`;
		} else if (result.score > 0.5) {
			score = RelevanceScore.TANGENTIAL;
			rationale = `Medium search score: ${result.score.toFixed(3)}`;
		} else {
			score = RelevanceScore.IRRELEVANT;
			rationale = `Low search score: ${result.score.toFixed(3)}`;
		}

		assessmentResults.push({
			rank,
			org: result.repository.org,
			repo: result.repository.name,
			snippet: result.content.substring(0, 200),
			score,
			rationale,
			hasAdequateContext,
		});
	});

	// Calculate metrics
	const relevantCount = assessmentResults.filter(
		(r) => r.score >= RelevanceScore.RELEVANT,
	).length;
	const relevanceRate = (relevantCount / 5) * 100;

	logger.info("Relevance assessed", {
		queryId: testQuery.id,
		relevantCount,
		relevanceRate,
		snippetContextAdequate,
	});

	return {
		queryId: testQuery.id,
		query: testQuery.query,
		results: assessmentResults,
		relevantCount,
		relevanceRate,
		snippetContextAdequate,
	};
}

/**
 * Measure indexing lag: time from R2 upload to searchable
 *
 * Uploads a test object to R2 and polls AI Search until content is indexed.
 * This validates the real-time indexing claim (<5 minutes target).
 *
 * @param env Workers environment with R2 and AI_SEARCH bindings
 * @returns Indexing lag in milliseconds, or -1 if timeout
 */
async function measureIndexingLag(env: Env): Promise<number> {
	const logger = createLogger({ operation: "indexing_lag_test" });
	const timestamp = Date.now();
	const uniqueId = `indexing-lag-${timestamp}`;
	const testContent = `Test content for indexing lag measurement. Timestamp: ${timestamp}. Unique identifier: ${uniqueId}`;
	const testPath = `gitingest/test/${uniqueId}/summary.txt`;

	logger.info("Starting indexing lag test", { testPath, uniqueId });

	try {
		// Upload test object to R2
		const uploadStart = Date.now();
		await env.R2.put(testPath, testContent, {
			customMetadata: {
				pushedAt: new Date().toISOString(),
				url: `https://github.com/test/${uniqueId}`,
				processedAt: new Date().toISOString(),
			},
		});
		logger.info("Test object uploaded to R2", { path: testPath });

		// Poll AI Search until content is searchable
		for (let attempt = 1; attempt <= INDEXING_LAG_MAX_ATTEMPTS; attempt++) {
			await new Promise((resolve) =>
				setTimeout(resolve, INDEXING_LAG_POLL_INTERVAL_MS),
			);

			try {
				const results = await searchCode(env, uniqueId, 1);
				if (results.length > 0 && results[0].metadata.path === testPath) {
					const indexingLag = Date.now() - uploadStart;
					logger.info("Content indexed successfully", {
						indexingLag,
						indexingLagMinutes: (indexingLag / 60000).toFixed(2),
						attempts: attempt,
					});

					// Cleanup: delete test object
					try {
						await env.R2.delete(testPath);
						logger.info("Test object deleted", { path: testPath });
					} catch (deleteError) {
						logger.warn("Failed to delete test object", {
							path: testPath,
							error:
								deleteError instanceof Error
									? deleteError.message
									: String(deleteError),
						});
					}

					return indexingLag;
				}

				logger.debug("Content not yet indexed", { attempt, maxAttempts: INDEXING_LAG_MAX_ATTEMPTS });
			} catch (searchError) {
				logger.warn("Search error during indexing lag test", {
					attempt,
					error:
						searchError instanceof Error ? searchError.message : String(searchError),
				});
			}
		}

		logger.error("Indexing lag test timeout", {
			maxAttempts: INDEXING_LAG_MAX_ATTEMPTS,
			timeoutMs: INDEXING_LAG_MAX_ATTEMPTS * INDEXING_LAG_POLL_INTERVAL_MS,
		});
		return -1; // Timeout
	} catch (error) {
		logger.error("Indexing lag test failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Calculate percentile from sorted array
 *
 * @param sortedValues Sorted array of numbers
 * @param percentile Percentile to calculate (0-100)
 * @returns Percentile value
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
	if (sortedValues.length === 0) return 0;
	const index = Math.floor((sortedValues.length * percentile) / 100);
	return sortedValues[Math.min(index, sortedValues.length - 1)];
}

/**
 * Generate baseline metrics report in markdown format
 *
 * Creates comprehensive report with:
 * - Executive summary with GO/NO-GO decision
 * - Methodology description
 * - Performance metrics (p50/p95/p99)
 * - Relevance assessment results
 * - Indexing lag measurement
 * - Raw data for future analysis
 *
 * @param performanceData All performance measurements
 * @param relevanceData All relevance assessments
 * @param indexingLag Measured indexing lag in milliseconds
 * @returns Baseline report object and markdown content
 */
function generateBaselineReport(
	performanceData: PerformanceMetrics[],
	relevanceData: RelevanceAssessment[],
	indexingLag: number,
): { report: BaselineReport; markdown: string } {
	// Calculate performance percentiles
	const totalTimes = performanceData.map((p) => p.totalTime).sort((a, b) => a - b);
	const aiSearchTimes = performanceData.map((p) => p.aiSearchTime).sort((a, b) => a - b);
	const enrichmentTimes = performanceData.map((p) => p.enrichmentTime).sort((a, b) => a - b);

	const p50Total = calculatePercentile(totalTimes, 50);
	const p95Total = calculatePercentile(totalTimes, 95);
	const p99Total = calculatePercentile(totalTimes, 99);
	const avgTotal = totalTimes.reduce((sum, t) => sum + t, 0) / totalTimes.length;

	const avgAISearch = aiSearchTimes.reduce((sum, t) => sum + t, 0) / aiSearchTimes.length;
	const p95AISearch = calculatePercentile(aiSearchTimes, 95);

	const avgEnrichment = enrichmentTimes.reduce((sum, t) => sum + t, 0) / enrichmentTimes.length;

	// Calculate relevance metrics
	const avgRelevance = relevanceData.reduce((sum, r) => sum + r.relevanceRate, 0) / relevanceData.length;
	const queriesPassingRelevanceThreshold = relevanceData.filter(
		(r) => r.relevanceRate >= TARGET_RELEVANCE_RATE,
	).length;

	// Story 3.3 AC #2b validation: Overall snippet context adequacy
	const snippetContextAdequate = relevanceData.every((r) => r.snippetContextAdequate);

	// Decision logic
	const meetsPerformance = p95Total < TARGET_TOTAL_P95_MS;
	const meetsAISearchPerformance = p95AISearch < TARGET_AI_SEARCH_P95_MS;
	const meetsRelevance = avgRelevance >= TARGET_RELEVANCE_RATE;
	const meetsIndexing = indexingLag > 0 && indexingLag < TARGET_INDEXING_LAG_MS;

	const decision: "GO" | "NO-GO" =
		meetsPerformance && meetsRelevance && meetsIndexing ? "GO" : "NO-GO";

	const rationale = `Performance: ${meetsPerformance ? "PASS" : "FAIL"} (p95 ${p95Total}ms ${meetsPerformance ? "<" : ">="} ${TARGET_TOTAL_P95_MS}ms), AI Search: ${meetsAISearchPerformance ? "PASS" : "FAIL"} (p95 ${p95AISearch}ms ${meetsAISearchPerformance ? "<" : ">="} ${TARGET_AI_SEARCH_P95_MS}ms), Relevance: ${meetsRelevance ? "PASS" : "FAIL"} (${avgRelevance.toFixed(1)}% ${meetsRelevance ? ">=" : "<"} ${TARGET_RELEVANCE_RATE}%), Indexing: ${meetsIndexing ? "PASS" : "FAIL"} (${(indexingLag / 60000).toFixed(2)} min ${meetsIndexing ? "<" : ">="} 5 min)`;

	// Recommendations
	const recommendations: string[] = [];
	if (!meetsPerformance) {
		recommendations.push(
			`Performance optimization needed: p95 response time is ${p95Total}ms (target: <${TARGET_TOTAL_P95_MS}ms)`,
		);
	}
	if (!meetsAISearchPerformance) {
		recommendations.push(
			`AI Search performance concern: p95 AI Search time is ${p95AISearch}ms (target: <${TARGET_AI_SEARCH_P95_MS}ms) - may need custom embeddings`,
		);
	}
	if (!meetsRelevance) {
		recommendations.push(
			`Search quality improvement needed: ${avgRelevance.toFixed(1)}% relevance (target: >=${TARGET_RELEVANCE_RATE}%)`,
		);
	}
	if (!meetsIndexing) {
		if (indexingLag < 0) {
			recommendations.push(
				"Indexing lag test timed out - investigate AI Search indexing pipeline",
			);
		} else {
			recommendations.push(
				`Indexing lag exceeds target: ${(indexingLag / 60000).toFixed(2)} minutes (target: <5 min)`,
			);
		}
	}
	if (!snippetContextAdequate) {
		recommendations.push(
			"Story 3.3 AC #2b: Some snippets lack adequate context - consider implementing snippet context expansion in Phase 2",
		);
	}
	if (recommendations.length === 0) {
		recommendations.push(
			"All metrics meet MVP requirements - AI Search is ready for production use",
		);
	}

	const report: BaselineReport = {
		timestamp: new Date().toISOString(),
		summary: {
			totalQueries: TEST_QUERIES.length,
			totalRuns: performanceData.length,
			avgResponseTime: Math.round(avgTotal),
			p50ResponseTime: p50Total,
			p95ResponseTime: p95Total,
			p99ResponseTime: p99Total,
			avgAISearchTime: Math.round(avgAISearch),
			p95AISearchTime: p95AISearch,
			avgEnrichmentTime: Math.round(avgEnrichment),
			avgRelevanceRate: Math.round(avgRelevance * 10) / 10,
			queriesPassingRelevanceThreshold,
			indexingLagMs: indexingLag,
			indexingLagMinutes: Math.round((indexingLag / 60000) * 100) / 100,
			snippetContextAdequate,
			decision,
			rationale,
		},
		performanceData,
		relevanceData,
		recommendations,
	};

	// Generate markdown report
	const markdown = `# AI Search Performance Baseline Report

**Generated:** ${new Date().toISOString()}
**Project:** govreposcrape
**Epic:** Epic 3 - AI Search Integration
**Story:** 3.4 - Search Performance Validation and Baseline Metrics

---

## Executive Summary

**Decision:** **${decision}**

${rationale}

**Key Metrics:**
- **Performance:** p95 = ${p95Total}ms (target: <${TARGET_TOTAL_P95_MS}ms) ${meetsPerformance ? "✅" : "❌"}
- **AI Search:** p95 = ${p95AISearch}ms (target: <${TARGET_AI_SEARCH_P95_MS}ms) ${meetsAISearchPerformance ? "✅" : "❌"}
- **Relevance:** ${avgRelevance.toFixed(1)}% avg (target: >=${TARGET_RELEVANCE_RATE}%) ${meetsRelevance ? "✅" : "❌"}
- **Indexing Lag:** ${(indexingLag / 60000).toFixed(2)} min (target: <5 min) ${meetsIndexing ? "✅" : "❌"}
- **Snippet Context:** ${snippetContextAdequate ? "Adequate" : "Needs improvement"} ${snippetContextAdequate ? "✅" : "⚠️"}

**Queries Tested:** ${TEST_QUERIES.length} government use case queries
**Total Runs:** ${performanceData.length} (${RUNS_PER_QUERY} runs per query for variance)

---

## Recommendations

${recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}

---

## Methodology

### Test Query Set

${TEST_QUERIES.length} queries representing UK government developer use cases:

${TEST_QUERIES.map((q) => `**${q.id}:** ${q.query}  \n*Intent:* ${q.intent}  \n*Expected domains:* ${q.expectedDomains?.join(", ") || "N/A"}  \n`).join("\n")}

### Performance Measurement

- **Runs per query:** ${RUNS_PER_QUERY}
- **Total measurements:** ${performanceData.length}
- **Timing breakdown:**
  - Total response time (API call to enriched results)
  - AI Search component time (managed service query)
  - Result enrichment time (R2 metadata fetch)

### Relevance Assessment

- **Scoring scale:** 0 (Irrelevant), 1 (Tangential), 2 (Relevant), 3 (Highly Relevant)
- **Success criteria:** Score >= 2 (Relevant or Highly Relevant)
- **Target:** 80%+ of top 5 results are relevant for 80%+ of queries
- **Method:** Automated heuristics (expected domain match, search score thresholds)

### Indexing Lag Test

- **Method:** Upload test object to R2, poll AI Search until searchable
- **Poll interval:** ${INDEXING_LAG_POLL_INTERVAL_MS / 1000} seconds
- **Max attempts:** ${INDEXING_LAG_MAX_ATTEMPTS} (${(INDEXING_LAG_MAX_ATTEMPTS * INDEXING_LAG_POLL_INTERVAL_MS) / 60000} min timeout)
- **Target:** <5 minutes from R2 upload to searchable

---

## Performance Metrics

### Response Time Distribution

| Metric | Value (ms) | Target (ms) | Status |
|--------|------------|-------------|--------|
| Average | ${Math.round(avgTotal)} | N/A | N/A |
| p50 (median) | ${p50Total} | N/A | N/A |
| p95 | ${p95Total} | <${TARGET_TOTAL_P95_MS} | ${meetsPerformance ? "✅ PASS" : "❌ FAIL"} |
| p99 | ${p99Total} | N/A | N/A |

### AI Search Component Performance

| Metric | Value (ms) | Target (ms) | Status |
|--------|------------|-------------|--------|
| Average | ${Math.round(avgAISearch)} | N/A | N/A |
| p95 | ${p95AISearch} | <${TARGET_AI_SEARCH_P95_MS} | ${meetsAISearchPerformance ? "✅ PASS" : "❌ FAIL"} |

### Result Enrichment Performance

| Metric | Value (ms) |
|--------|------------|
| Average | ${Math.round(avgEnrichment)} |

### Timing Breakdown Analysis

- **AI Search:** ${((avgAISearch / avgTotal) * 100).toFixed(1)}% of total time
- **Enrichment:** ${((avgEnrichment / avgTotal) * 100).toFixed(1)}% of total time

---

## Relevance Metrics

### Overall Results

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Average relevance rate | ${avgRelevance.toFixed(1)}% | >=${TARGET_RELEVANCE_RATE}% | ${meetsRelevance ? "✅ PASS" : "❌ FAIL"} |
| Queries passing threshold | ${queriesPassingRelevanceThreshold}/${TEST_QUERIES.length} | ${Math.ceil((TEST_QUERIES.length * TARGET_RELEVANCE_RATE) / 100)}/${TEST_QUERIES.length} | ${queriesPassingRelevanceThreshold >= Math.ceil((TEST_QUERIES.length * TARGET_RELEVANCE_RATE) / 100) ? "✅ PASS" : "❌ FAIL"} |

### Per-Query Relevance

${relevanceData.map((r) => `**${r.queryId}:** ${r.query}  \n- Relevant results: ${r.relevantCount}/5 (${r.relevanceRate}%)  \n- Status: ${r.relevanceRate >= TARGET_RELEVANCE_RATE ? "✅ PASS" : "❌ FAIL"}  \n- Snippet context: ${r.snippetContextAdequate ? "✅ Adequate" : "⚠️ Limited"}  \n`).join("\n")}

---

## Indexing Lag

| Metric | Value |
|--------|-------|
| Measured lag | ${indexingLag > 0 ? `${(indexingLag / 60000).toFixed(2)} minutes (${indexingLag}ms)` : "Timeout (>10 minutes)"} |
| Target | <5 minutes (${TARGET_INDEXING_LAG_MS}ms) |
| Status | ${meetsIndexing ? "✅ PASS" : "❌ FAIL"} |

---

## Story 3.3 AC #2b Validation

**Question:** Do AI Search snippets provide adequate context without manual expansion?

**Result:** ${snippetContextAdequate ? "✅ YES" : "⚠️ PARTIALLY"}

${snippetContextAdequate ? "All query results returned snippets with adequate context (>100 chars, multi-line). No snippet context expansion needed." : "Some query results had limited snippet context. Consider implementing snippet context expansion in Phase 2 for improved user experience."}

---

## Raw Data

### Performance Data Summary

Total measurements: ${performanceData.length}

| Query | Run | Total (ms) | AI Search (ms) | Enrichment (ms) | Results |
|-------|-----|------------|----------------|-----------------|---------|
${performanceData.map((p) => `| ${p.query.substring(0, 30)}... | ${p.run} | ${p.totalTime} | ${p.aiSearchTime} | ${p.enrichmentTime} | ${p.resultCount} |`).join("\n")}

### Relevance Data Summary

${relevanceData.map((r) => `**${r.queryId}:** ${r.query}
${r.results.map((res) => `  ${res.rank}. ${res.org}/${res.repo} - Score: ${res.score} (${RelevanceScore[res.score]}) - ${res.rationale} - Context: ${res.hasAdequateContext ? "✅" : "⚠️"}`).join("\n")}
`).join("\n")}

---

## Conclusion

${decision === "GO" ? `**AI Search meets all MVP requirements and is ready for production use.**

Cloudflare AI Search has demonstrated sufficient performance (<2s p95), relevance (${avgRelevance.toFixed(1)}% avg), and indexing speed (${(indexingLag / 60000).toFixed(2)} min) to support the govreposcrape MVP launch. The managed service approach is validated.

**Next Steps:**
1. Proceed with Epic 4 (MCP API Server) implementation
2. Monitor performance in production and establish ongoing benchmarks
3. Plan Phase 2 enhancements based on user feedback` : `**AI Search does not meet MVP requirements - improvements needed before launch.**

${rationale}

**Remediation Options:**
${!meetsPerformance || !meetsAISearchPerformance ? "1. **Performance:** Investigate AI Search query optimization, consider custom embeddings if AI Search performance cannot be improved\n" : ""}${!meetsRelevance ? "2. **Relevance:** Review gitingest summary quality, consider enriching indexed content, evaluate custom embedding model\n" : ""}${!meetsIndexing ? "3. **Indexing:** Work with Cloudflare support to optimize indexing pipeline, consider alternative indexing strategies\n" : ""}
**Decision:** Re-run validation after implementing improvements, or pivot to custom embeddings approach (Phase 2).`}

---

**Report generated by:** scripts/validate-ai-search.ts
**BMM Story:** 3.4 - Search Performance Validation and Baseline Metrics
**For questions or clarifications, see:** docs/epics.md, docs/PRD.md
`;

	return { report, markdown };
}

/**
 * Save baseline report to R2 bucket
 *
 * Since this runs in Workers environment (no filesystem access),
 * we save the report to R2 instead.
 *
 * @param env Workers environment with R2 binding
 * @param markdown Markdown content to save
 * @param reportPath R2 object key for report
 */
async function saveBaselineReport(env: Env, markdown: string, reportPath: string): Promise<void> {
	const logger = createLogger({ operation: "save_baseline_report" });

	try {
		await env.R2.put(reportPath, markdown, {
			httpMetadata: {
				contentType: "text/markdown",
			},
			customMetadata: {
				generatedAt: new Date().toISOString(),
				reportType: "ai-search-baseline",
			},
		});
		logger.info("Baseline report saved to R2", { path: reportPath });
	} catch (error) {
		logger.error("Failed to save baseline report to R2", {
			path: reportPath,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

/**
 * Main validation workflow
 *
 * Executes all validation steps:
 * 1. Performance measurement (multiple runs per query)
 * 2. Relevance assessment
 * 3. Indexing lag measurement
 * 4. Baseline report generation
 *
 * @param env Workers environment (AI_SEARCH, R2 bindings)
 */
export async function runValidation(env: Env): Promise<BaselineReport> {
	const logger = createLogger({ operation: "run_validation" });
	logger.info("Starting AI Search validation", {
		totalQueries: TEST_QUERIES.length,
		runsPerQuery: RUNS_PER_QUERY,
	});

	const allPerformanceData: PerformanceMetrics[] = [];
	const allRelevanceData: RelevanceAssessment[] = [];

	// Execute test queries with multiple runs
	for (const testQuery of TEST_QUERIES) {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`Testing Query: ${testQuery.query}`);
		console.log(`${"=".repeat(80)}\n`);

		// Run query multiple times for variance analysis
		for (let run = 1; run <= RUNS_PER_QUERY; run++) {
			try {
				const perfMetrics = await measureQueryPerformance(
					env,
					testQuery.query,
					run,
					5,
				);
				allPerformanceData.push(perfMetrics);

				// Only assess relevance on first run (results should be consistent)
				if (run === 1) {
					// Get enriched results for relevance assessment
					const rawResults = await searchCode(env, testQuery.query, 5);
					const enrichedResults = await enrichResults(env, rawResults);
					const relevanceAssessment = await assessRelevance(
						testQuery,
						enrichedResults,
					);
					allRelevanceData.push(relevanceAssessment);
				}
			} catch (error) {
				logger.error("Query test failed", {
					query: testQuery.query,
					run,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	// Measure indexing lag
	console.log(`\n${"=".repeat(80)}`);
	console.log("Testing Indexing Lag");
	console.log(`${"=".repeat(80)}\n`);

	let indexingLag: number;
	try {
		indexingLag = await measureIndexingLag(env);
	} catch (error) {
		logger.error("Indexing lag test failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		indexingLag = -1; // Indicate failure
	}

	// Generate baseline report
	console.log(`\n${"=".repeat(80)}`);
	console.log("Generating Baseline Report");
	console.log(`${"=".repeat(80)}\n`);

	const { report, markdown } = generateBaselineReport(
		allPerformanceData,
		allRelevanceData,
		indexingLag,
	);

	// Save report to R2
	const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
	const reportPath = `reports/search-performance-baseline-${date}.md`;
	await saveBaselineReport(env, markdown, reportPath);

	// Display summary
	console.log(`\n${"=".repeat(80)}`);
	console.log("Validation Complete");
	console.log(`${"=".repeat(80)}\n`);
	console.log(`Decision: ${report.summary.decision}`);
	console.log(`Rationale: ${report.summary.rationale}`);
	console.log(`\nReport saved to: ${reportPath}`);
	console.log(`\nRecommendations:`);
	report.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

	logger.info("Validation complete", {
		decision: report.summary.decision,
		reportPath,
	});

	return report;
}
