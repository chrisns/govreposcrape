import { Request, Response } from "express";
import { VertexSearchService } from "../services/vertexSearchService";

// Singleton instance of the search service
let searchService: VertexSearchService | null = null;

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
 * MCP Search Request Schema
 */
interface MCPSearchRequest {
	query: string;
	limit?: number;
}

/**
 * MCP Error Response
 */
interface MCPErrorResponse {
	error: {
		code: string;
		message: string;
		details?: any;
	};
}

/**
 * POST /mcp/search
 * Semantic search endpoint using Vertex AI Search
 */
export async function search(req: Request, res: Response): Promise<void> {
	const startTime = Date.now();

	try {
		// Validate request body
		const { query, limit }: MCPSearchRequest = req.body;

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
		const results = await service.search({
			query: query.trim(),
			limit: parsedLimit,
		});

		// Log request metrics
		const duration = Date.now() - startTime;
		console.log(
			JSON.stringify({
				level: "info",
				message: "Search request completed",
				query,
				limit: parsedLimit,
				resultCount: results.length,
				duration,
				timestamp: new Date().toISOString(),
			}),
		);

		// Return results in MCP format
		res.status(200).json({
			results,
			metadata: {
				query,
				limit: parsedLimit,
				resultCount: results.length,
				duration,
			},
		});
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
