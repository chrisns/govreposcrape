import { SearchServiceClient } from "@google-cloud/discoveryengine";

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	metadata: {
		org: string;
		repo: string;
		pushedAt?: string;
		processedAt?: string;
	};
}

export interface SearchOptions {
	query: string;
	limit?: number;
}

export class VertexSearchService {
	private client: SearchServiceClient;
	private searchEngineId: string;

	constructor() {
		// Initialize the Search Service Client
		this.client = new SearchServiceClient();

		// Get search engine ID from environment
		const engineId = process.env.VERTEX_AI_SEARCH_ENGINE_ID;
		if (!engineId) {
			throw new Error("VERTEX_AI_SEARCH_ENGINE_ID environment variable is not set");
		}
		this.searchEngineId = engineId;
	}

	/**
	 * Perform semantic search using Vertex AI Search
	 */
	async search(options: SearchOptions): Promise<SearchResult[]> {
		const { query, limit = 20 } = options;

		try {
			// Construct the search request
			const request = {
				servingConfig: `${this.searchEngineId}/servingConfigs/default_config`,
				query,
				pageSize: Math.min(limit, 100), // Cap at 100 as per MAX_SEARCH_LIMIT
				queryExpansionSpec: {
					condition: "AUTO" as const,
				},
				spellCorrectionSpec: {
					mode: "AUTO" as const,
				},
			};

			// Execute search
			const [response] = await this.client.search(request as any);

			// Transform results to MCP SearchResult format
			const results: SearchResult[] = [];

			// Response is an array, iterate directly
			if (response && Array.isArray(response)) {
				for (const result of response) {
					const document = result.document;
					if (!document) continue;

					// Extract org/repo from GCS URI and snippets from derivedStructData
					const derivedData: any = document.derivedStructData;

					// DEBUG: Log the first result structure to understand response format
					if (results.length === 0) {
						console.log(
							"DEBUG: First result structure:",
							JSON.stringify(
								{
									documentName: document.name,
									documentId: document.id,
									derivedDataKeys: derivedData ? Object.keys(derivedData) : [],
									derivedDataSample: derivedData,
								},
								null,
								2,
							),
						);
					}

					// Try multiple possible paths for GCS URI
					let gcsLink = "";

					// Path 1: derivedStructData.link (direct string)
					if (derivedData?.link) {
						gcsLink = derivedData.link;
					}
					// Path 2: derivedStructData.fields.link.stringValue (protobuf format)
					else if (derivedData?.fields?.link?.stringValue) {
						gcsLink = derivedData.fields.link.stringValue;
					}
					// Path 3: document.name (resource name contains path)
					else if (document.name) {
						gcsLink = document.name;
					}
					// Path 4: document.id (might contain path)
					else if (document.id) {
						gcsLink = document.id;
					}

					// Match both .md and .txt extensions, and strip commit hash if present
					// Pattern: gs://bucket/{org}/{repo}.md OR gs://bucket/{org}/{repo}/{commit}.txt
					const uriMatch = gcsLink.match(/\/([^\/]+)\/([^\/]+?)(?:\/[a-f0-9]+)?\.(?:md|txt)$/);
					const org = uriMatch?.[1] || "unknown";
					const repo = uriMatch?.[2] || "unknown";

					// Extract snippet from derivedStructData
					let snippet = "";
					if (derivedData?.snippets) {
						const snippets = derivedData.snippets as any[];
						if (snippets.length > 0) {
							snippet = snippets[0].snippet || snippets[0].htmlSnippet || "";
						}
					}

					// For plain text files, snippet should come from derivedStructData
					// No fallback needed as Vertex AI Search generates snippets automatically

					results.push({
						title: `${org}/${repo}`,
						url: `https://github.com/${org}/${repo}`,
						snippet,
						metadata: {
							org,
							repo,
						},
					});
				}
			}

			return results;
		} catch (error) {
			// Log error and re-throw
			console.error("Vertex AI Search error:", {
				error: error instanceof Error ? error.message : String(error),
				query,
				limit,
			});
			throw error;
		}
	}

	/**
	 * Health check for the search service
	 */
	async healthCheck(): Promise<boolean> {
		try {
			// Perform a simple search to verify connectivity
			await this.search({ query: "test", limit: 1 });
			return true;
		} catch (error) {
			console.error("Vertex AI Search health check failed:", error);
			return false;
		}
	}
}
