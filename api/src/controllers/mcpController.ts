import { Request, Response } from "express";
import { VertexSearchService, SearchResult } from "../services/vertexSearchService";
import { geminiService } from "../services/geminiService";
import { getDepsQueryService, DepsInputError } from "../services/depsQueryService";

// Singleton instance of the search service
let searchService: VertexSearchService | null = null;

function getSearchService(): VertexSearchService {
	if (!searchService) {
		searchService = new VertexSearchService();
	}
	return searchService;
}

/** Raised for invalid MCP tool arguments → mapped to JSON-RPC -32602. */
class McpInputError extends Error {}

// Advertised queryable package ecosystems (matches the validated set in
// depsQueryService; the non-package ecosystems github/githubactions are accepted
// for filtering but intentionally not advertised as "who uses X" targets).
const DEPS_ECOSYSTEMS = [
	"npm",
	"pypi",
	"gem",
	"maven",
	"nuget",
	"golang",
	"cargo",
	"composer",
	"pub",
	"swift",
	"apk",
];

// ───────────────────────── tool definitions (tools/list) ─────────────────────────

const TOOL_DEFINITIONS = [
	{
		name: "search_uk_gov_code",
		description:
			"Search across 24,500+ UK government repositories for code examples, libraries, and patterns. Returns repository names and GitHub URLs.",
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
	{
		name: "search_dependency",
		description:
			"Find which UK government repositories depend on a software package, optionally filtered by an ecosystem-aware version range. Answers 'who uses expressjs' or 'who runs express < 2' with an exhaustive, de-duplicated list (not a fuzzy semantic match). Backed by a structured index of the aggregate SBOM.",
		inputSchema: {
			type: "object",
			properties: {
				package: {
					type: "string",
					description: "Package name, e.g. 'express', '@babel/core', 'log4j-core', 'django'.",
				},
				ecosystem: {
					type: "string",
					description:
						"PURL ecosystem. Omit to get a per-ecosystem breakdown of who uses the name (recommended first step for ambiguous names).",
					enum: DEPS_ECOSYSTEMS,
				},
				version_range: {
					type: "string",
					maxLength: 1000,
					description:
						"Optional npm-style range over the resolved version: '<2', '>=1.2 <2', '4.x', '^1.2.3', '=1.0.0'. Requires `ecosystem`.",
				},
				include_prereleases: {
					type: "boolean",
					description: "Include prerelease versions in range matches (default false).",
					default: false,
				},
				limit: { type: "number", minimum: 1, maximum: 500, default: 200 },
				offset: { type: "number", minimum: 0, default: 0 },
			},
			required: ["package"],
		},
	},
	{
		name: "package_popularity",
		description:
			"Rank the most-depended-on packages across UK government repositories, or roll up usage by software licence. Answers 'most used npm packages' or 'how many repos use GPL-licensed dependencies'.",
		inputSchema: {
			type: "object",
			properties: {
				ecosystem: {
					type: "string",
					description: "Restrict to one PURL ecosystem.",
					enum: DEPS_ECOSYSTEMS,
				},
				license: {
					type: "string",
					description:
						"SPDX licence id (e.g. 'MIT', 'GPL-3.0-only'). When set, returns a licence rollup instead of a package ranking.",
				},
				name_contains: {
					type: "string",
					description: "Only packages whose normalised key contains this substring.",
				},
				top: { type: "number", minimum: 1, maximum: 500, default: 50 },
			},
		},
	},
	{
		name: "repo_dependencies",
		description:
			"List the full (untruncated) set of dependencies for a single UK government repository, from its SBOM.",
		inputSchema: {
			type: "object",
			properties: {
				repo_full_name: {
					type: "string",
					description: "Repository as 'org/repo', e.g. 'alphagov/whitehall'.",
				},
				ecosystem: {
					type: "string",
					description: "Restrict to one ecosystem.",
					enum: DEPS_ECOSYSTEMS,
				},
				limit: { type: "number", minimum: 1, maximum: 5000, default: 500 },
			},
			required: ["repo_full_name"],
		},
	},
	{
		name: "vulnerability_exposure",
		description:
			"CVE blast-radius: find which UK government repositories run dependency versions with known vulnerabilities, cross-referenced live against OSV.dev. Scope to a package (+ecosystem), a single repo, or an org/department. Answers 'who is exposed to Log4Shell' or 'what CVEs is alphagov running'.",
		inputSchema: {
			type: "object",
			properties: {
				package: { type: "string", description: "Package name (requires `ecosystem`)." },
				ecosystem: {
					type: "string",
					description: "PURL ecosystem for the package.",
					enum: DEPS_ECOSYSTEMS,
				},
				org: {
					type: "string",
					description:
						"GitHub org/department, e.g. 'alphagov' — scans all its repos' dependencies.",
				},
				repo_full_name: { type: "string", description: "Single repo as 'org/repo'." },
			},
		},
	},
	{
		name: "dependency_landscape",
		description:
			"Technology profile for a UK government org/department: ecosystem breakdown, most-used packages, detected frameworks with end-of-life flags (via endoflife.date), and a copyleft/unknown licence summary.",
		inputSchema: {
			type: "object",
			properties: {
				org: {
					type: "string",
					description: "GitHub org/department, e.g. 'alphagov', 'hmrc', 'nhsdigital'.",
				},
			},
			required: ["org"],
		},
	},
	{
		name: "dependency_compare",
		description:
			"Compare two repositories' dependency profiles — shared dependencies, those unique to each, and an overlap percentage. Useful for spotting duplicated effort across departments.",
		inputSchema: {
			type: "object",
			properties: {
				repo_a: { type: "string", description: "First repo as 'org/repo'." },
				repo_b: { type: "string", description: "Second repo as 'org/repo'." },
			},
			required: ["repo_a", "repo_b"],
		},
	},
	{
		name: "sbom_export",
		description:
			"Export the full (untruncated) dependency set for one repository, with per-ecosystem counts and the canonical SBOM source URL.",
		inputSchema: {
			type: "object",
			properties: {
				repo_full_name: { type: "string", description: "Repository as 'org/repo'." },
				limit: { type: "number", minimum: 1, maximum: 20000, default: 5000 },
			},
			required: ["repo_full_name"],
		},
	},
	{
		name: "dependency_trends",
		description:
			"Track how many UK government repositories depend on a package over time, across the retained daily snapshots (drift/adoption monitoring).",
		inputSchema: {
			type: "object",
			properties: {
				package: { type: "string", description: "Package name." },
				ecosystem: { type: "string", description: "PURL ecosystem.", enum: DEPS_ECOSYSTEMS },
			},
			required: ["package", "ecosystem"],
		},
	},
];

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

/** Render a structured tool result as pretty JSON for the MCP text content block. */
function formatJsonResult(obj: unknown): string {
	return JSON.stringify(obj, null, 2);
}

/** Semantic code search (the original tool), refactored to return formatted text. */
async function handleSearchUkGovCode(args: any): Promise<string> {
	const query = args?.query;
	const limit = args?.limit ?? 20;
	if (!query || typeof query !== "string") {
		throw new McpInputError("Missing required parameter: query");
	}

	const startTime = Date.now();
	const service = getSearchService();

	// Optional: Expand query with Gemini if enabled
	let actualQuery = query.trim();
	if (geminiService.isEnabled()) {
		const expandedQuery = await geminiService.expandQuery(actualQuery);
		if (expandedQuery.expanded !== actualQuery) {
			actualQuery = expandedQuery.expanded;
			console.log(`Gemini query expansion: "${query}" -> "${actualQuery}"`);
		}
	}

	const searchResults = await service.search({ query: actualQuery, limit });
	const searchTime = Date.now() - startTime;

	let summary = "";
	if (geminiService.isEnabled() && searchResults.length > 0) {
		summary = await geminiService.summarizeResults(searchResults as any);
	}

	const formattedResults = searchResults
		.map((result: SearchResult, index: number) => {
			const sbomUrl = `https://uk-x-gov-software-community.github.io/xgov-opensource-repo-scraper/sbom/${result.metadata.org}/${result.metadata.repo}.json.gz`;
			return `${index + 1}. **${result.title}**
   - URL: ${result.url}
   - Organization: ${result.metadata.org}
   - Repository: ${result.metadata.repo}
   - SBOM: ${sbomUrl}`;
		})
		.join("\n\n");

	let responseText = `Found ${searchResults.length} UK government repositories matching "${query}" (searched in ${searchTime}ms):\n\n`;
	if (summary) {
		responseText += `🤖 **AI Summary (Gemini):**\n${summary}\n\n---\n\n`;
	}
	responseText += formattedResults;
	return responseText;
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

	// D8: validate the JSON-RPC envelope before dispatch. express.json() accepts an
	// empty/garbage body, which would otherwise produce responses with id: undefined
	// (invalid JSON-RPC 2.0).
	const validId =
		mcpRequest && (typeof mcpRequest.id === "string" || typeof mcpRequest.id === "number");
	if (!mcpRequest || typeof mcpRequest.method !== "string" || !validId) {
		res.write(
			`data: ${JSON.stringify({
				jsonrpc: "2.0",
				id: validId ? mcpRequest.id : null,
				error: { code: -32600, message: "Invalid Request" },
			})}\n\n`,
		);
		res.end();
		return;
	}

	try {
		// Assigned on every reachable path of the switch below (asserted: the
		// only unassigned path rethrows to the outer catch, which never reads it).
		let response!: MCPResponse;

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
					result: { tools: TOOL_DEFINITIONS },
				};
				break;

			case "tools/call": {
				const toolName = mcpRequest.params?.name;
				const toolArgs = mcpRequest.params?.arguments || {};
				try {
					let text: string | null = null;
					switch (toolName) {
						case "search_uk_gov_code":
							text = await handleSearchUkGovCode(toolArgs);
							break;
						case "search_dependency":
							text = formatJsonResult(await getDepsQueryService().searchDependency(toolArgs));
							break;
						case "package_popularity":
							text = formatJsonResult(await getDepsQueryService().packagePopularity(toolArgs));
							break;
						case "repo_dependencies":
							text = formatJsonResult(await getDepsQueryService().repoDependencies(toolArgs));
							break;
						case "vulnerability_exposure":
							text = formatJsonResult(await getDepsQueryService().vulnerabilityExposure(toolArgs));
							break;
						case "dependency_landscape":
							text = formatJsonResult(await getDepsQueryService().dependencyLandscape(toolArgs));
							break;
						case "dependency_compare":
							text = formatJsonResult(await getDepsQueryService().dependencyCompare(toolArgs));
							break;
						case "sbom_export":
							text = formatJsonResult(await getDepsQueryService().sbomExport(toolArgs));
							break;
						case "dependency_trends":
							text = formatJsonResult(await getDepsQueryService().dependencyTrends(toolArgs));
							break;
						default:
							response = {
								jsonrpc: "2.0",
								id: mcpRequest.id,
								error: { code: -32601, message: `Unknown tool: ${toolName}` },
							};
					}
					if (text !== null) {
						response = {
							jsonrpc: "2.0",
							id: mcpRequest.id,
							result: { content: [{ type: "text", text }] },
						};
					}
				} catch (toolErr: any) {
					if (toolErr instanceof DepsInputError || toolErr instanceof McpInputError) {
						response = {
							jsonrpc: "2.0",
							id: mcpRequest.id,
							error: { code: -32602, message: toolErr.message },
						};
					} else {
						throw toolErr;
					}
				}
				break;
			}

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
		// D4: never leak internal detail (BigQuery errors expose project/dataset/table
		// names) to an unauthenticated client. Log server-side; return a generic message.
		console.error(
			JSON.stringify({
				level: "error",
				message: "Unhandled MCP tools/call error",
				method: mcpRequest?.method,
				error: error?.message,
				stack: error?.stack,
			}),
		);
		const errorResponse: MCPResponse = {
			jsonrpc: "2.0",
			id: mcpRequest?.id ?? null,
			error: {
				code: -32603,
				message: "Internal server error",
			},
		};

		res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
		res.end();
	}
}
