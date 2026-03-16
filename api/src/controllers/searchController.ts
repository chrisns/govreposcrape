import { Request, Response } from "express";
import { VertexSearchService } from "../services/vertexSearchService";
import { MCPSearchRequest, MCPSearchResponse, MCPErrorResponse, ResultMode } from "../types/mcp";
import { formatMinimal } from "../formatters/minimalFormatter";
import { formatSnippet } from "../formatters/snippetFormatter";
import { formatFull } from "../formatters/fullFormatter";
import { GCSClient } from "../services/gcsClient";

// Singleton instance of the search service
let searchService: VertexSearchService | null = null;

// Singleton instance of the GCS client
let gcsClient: GCSClient | null = null;

/**
 * Get or create the search service instance
 */
function getSearchService(): VertexSearchService {
	if (!searchService) {
		searchService = new VertexSearchService();
	}
	return searchService;
}

/**
 * Get or create the GCS client instance
 */
function getGCSClient(): GCSClient {
	if (!gcsClient) {
		gcsClient = new GCSClient();
	}
	return gcsClient;
}

/**
 * POST /mcp/search
 * Semantic search endpoint using Vertex AI Search
 */
export async function search(req: Request, res: Response): Promise<void> {
	const startTime = Date.now();

	try {
		// Extract and validate request body
		// Note: resultMode is validated and defaulted by validateResultMode middleware
		const { query, limit, resultMode }: MCPSearchRequest = req.body;

		// Validation: query is required
		if (!query || typeof query !== "string") {
			const errorResponse: MCPErrorResponse = {
				error: {
					code: "INVALID_REQUEST",
					message: "Missing or invalid required field: query (must be a non-empty string)",
				},
			};
			res.status(400).json(errorResponse);
			return;
		}

		// Validation: limit is optional but must be a number if provided
		const parsedLimit = limit !== undefined ? Number(limit) : 20; // Default to 20 results
		if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
			const errorResponse: MCPErrorResponse = {
				error: {
					code: "INVALID_REQUEST",
					message: "Invalid field: limit (must be a number between 1 and 100)",
				},
			};
			res.status(400).json(errorResponse);
			return;
		}

		// Perform search
		const service = getSearchService();
		let rawResults = await service.search({
			query: query.trim(),
			limit: parsedLimit,
			resultMode: resultMode as ResultMode, // Already validated by middleware
		});

		// Default handling: Use snippets mode if resultMode omitted (backward compatibility)
		const effectiveMode = resultMode || "snippets";

		// Mode routing: Apply formatter based on effectiveMode
		let results: any[];
		let formatterUsed: string;

		if (effectiveMode === "minimal") {
			// Minimal mode: Transform to MinimalResult format
			results = formatMinimal(rawResults);
			formatterUsed = "minimal";
		} else if (effectiveMode === "snippets") {
			// Snippets mode (default): Transform to SnippetResult format
			results = formatSnippet(rawResults);
			formatterUsed = "snippet";
		} else if (effectiveMode === "full") {
			// Full mode: Transform to FullResult format with GCS enrichment (async)
			const gcs = getGCSClient();
			results = await formatFull(rawResults, gcs);
			formatterUsed = "full";
		} else {
			// Fallback: Use raw results
			results = rawResults;
			formatterUsed = "default";
		}

		// Log request metrics (including effectiveMode and formatter for analytics)
		const duration = Date.now() - startTime;
		console.log(
			JSON.stringify({
				level: "info",
				message: "Search request completed",
				query,
				limit: parsedLimit,
				resultMode: resultMode || "default",
				effectiveMode,
				formatter: formatterUsed,
				resultCount: results.length,
				duration,
				timestamp: new Date().toISOString(),
			}),
		);

		// Return results in MCP format with mode echo (use effectiveMode for backward compatibility)
		const response: MCPSearchResponse = {
			results,
			metadata: {
				query,
				limit: parsedLimit,
				resultCount: results.length,
				duration,
			},
			mode: effectiveMode as ResultMode, // Echo the effective mode used (defaults to snippets)
		};
		res.status(200).json(response);
	} catch (error) {
		// Log error
		const duration = Date.now() - startTime;
		console.error(
			JSON.stringify({
				level: "error",
				message: "Search request failed",
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				duration,
				timestamp: new Date().toISOString(),
			}),
		);

		// Check for specific error types
		if (error instanceof Error) {
			// Rate limit errors
			if (error.message.includes("RESOURCE_EXHAUSTED") || error.message.includes("429")) {
				const errorResponse: MCPErrorResponse = {
					error: {
						code: "RATE_LIMIT_EXCEEDED",
						message: "Search API rate limit exceeded. Please try again later.",
					},
				};
				res.status(429).json(errorResponse);
				return;
			}

			// Authentication errors
			if (error.message.includes("UNAUTHENTICATED") || error.message.includes("401")) {
				const errorResponse: MCPErrorResponse = {
					error: {
						code: "AUTHENTICATION_FAILED",
						message: "Failed to authenticate with Vertex AI Search API",
					},
				};
				res.status(401).json(errorResponse);
				return;
			}

			// Permission errors
			if (error.message.includes("PERMISSION_DENIED") || error.message.includes("403")) {
				const errorResponse: MCPErrorResponse = {
					error: {
						code: "PERMISSION_DENIED",
						message: "Insufficient permissions to access Vertex AI Search API",
					},
				};
				res.status(403).json(errorResponse);
				return;
			}
		}

		// Generic internal server error
		const errorResponse: MCPErrorResponse = {
			error: {
				code: "INTERNAL_ERROR",
				message: "An internal error occurred while processing your search request",
				details:
					process.env.NODE_ENV === "development"
						? {
								error: error instanceof Error ? error.message : String(error),
							}
						: undefined,
			},
		};
		res.status(500).json(errorResponse);
	}
}
