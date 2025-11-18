import { Request, Response } from "express";
import { VertexSearchService, SearchResult } from "../services/vertexSearchService";
import { geminiService } from "../services/geminiService";

// Singleton instance of the search service
let searchService: VertexSearchService | null = null;

function getSearchService(): VertexSearchService {
	if (!searchService) {
		searchService = new VertexSearchService();
	}
	return searchService;
}

interface MCPRequest {
	jsonrpc: "2.0";
	id: string | number;
	method: string;
	params?: any;
}

interface MCPResponse {
	jsonrpc: "2.0";
	id: string | number;
	result?: any;
	error?: {
		code: number;
		message: string;
	};
}

/**
 * MCP HTTP endpoint handler using Server-Sent Events (SSE)
 * Implements the MCP protocol over HTTP as per the spec
 */
export async function handleMCP(req: Request, res: Response): Promise<void> {
	// Set SSE headers
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

	const mcpRequest = req.body as MCPRequest;

	try {
		let response: MCPResponse;

		switch (mcpRequest.method) {
			case "initialize":
				response = {
					jsonrpc: "2.0",
					id: mcpRequest.id,
					result: {
						protocolVersion: "2024-11-05",
						capabilities: {
							tools: {},
						},
						serverInfo: {
							name: "govreposcrape",
							version: "1.0.0",
						},
					},
				};
				break;

			case "tools/list":
				response = {
					jsonrpc: "2.0",
					id: mcpRequest.id,
					result: {
						tools: [
							{
								name: "search_uk_gov_code",
								description:
									"Search across ~21,000 UK government repositories for code examples, libraries, and patterns. Returns repository names and GitHub URLs.",
								inputSchema: {
									type: "object",
									properties: {
										query: {
											type: "string",
											description:
												'Search query (e.g., "authentication middleware", "postcode validation", "NHS API")',
										},
										limit: {
											type: "number",
											description: "Number of results to return (1-100, default: 20)",
											minimum: 1,
											maximum: 100,
											default: 20,
										},
									},
									required: ["query"],
								},
							},
						],
					},
				};
				break;

			case "tools/call":
				if (mcpRequest.params?.name !== "search_uk_gov_code") {
					response = {
						jsonrpc: "2.0",
						id: mcpRequest.id,
						error: {
							code: -32601,
							message: `Unknown tool: ${mcpRequest.params?.name}`,
						},
					};
					break;
				}

				const { query, limit = 20 } = mcpRequest.params.arguments || {};

				if (!query) {
					response = {
						jsonrpc: "2.0",
						id: mcpRequest.id,
						error: {
							code: -32602,
							message: "Missing required parameter: query",
						},
					};
					break;
				}

				// Perform the search
				const startTime = Date.now();
				const service = getSearchService();

				// Optional: Expand query with Gemini 3 if enabled
				let actualQuery = query.trim();
				if (geminiService.isEnabled()) {
					const expandedQuery = await geminiService.expandQuery(actualQuery);
					if (expandedQuery.expanded !== actualQuery) {
						actualQuery = expandedQuery.expanded;
						console.log(`Gemini 3 query expansion: "${query}" -> "${actualQuery}"`);
					}
				}

				const searchResults = await service.search({
					query: actualQuery,
					limit,
				});
				const searchTime = Date.now() - startTime;

				// Generate Gemini 3 summary if enabled
				let summary = "";
				if (geminiService.isEnabled() && searchResults.length > 0) {
					const geminiStart = Date.now();
					summary = await geminiService.summarizeResults(searchResults as any);
					const geminiTime = Date.now() - geminiStart;
					console.log(`Gemini 3 summarization completed in ${geminiTime}ms`);
				}

				const formattedResults = searchResults
					.map((result: SearchResult, index: number) => {
						return `${index + 1}. **${result.title}**
   - URL: ${result.url}
   - Organization: ${result.metadata.org}
   - Repository: ${result.metadata.repo}`;
					})
					.join("\n\n");

				let responseText = `Found ${searchResults.length} UK government repositories matching "${query}" (searched in ${searchTime}ms):\n\n`;

				if (summary) {
					responseText += `🤖 **AI Summary (Gemini 3):**\n${summary}\n\n---\n\n`;
				}

				responseText += formattedResults;

				response = {
					jsonrpc: "2.0",
					id: mcpRequest.id,
					result: {
						content: [
							{
								type: "text",
								text: responseText,
							},
						],
					},
				};
				break;

			default:
				response = {
					jsonrpc: "2.0",
					id: mcpRequest.id,
					error: {
						code: -32601,
						message: `Method not found: ${mcpRequest.method}`,
					},
				};
		}

		// Send SSE message
		res.write(`data: ${JSON.stringify(response)}\n\n`);
		res.end();
	} catch (error: any) {
		const errorResponse: MCPResponse = {
			jsonrpc: "2.0",
			id: mcpRequest.id,
			error: {
				code: -32603,
				message: error.message || "Internal server error",
			},
		};

		res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
		res.end();
	}
}
