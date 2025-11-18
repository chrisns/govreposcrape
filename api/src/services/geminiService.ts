import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

export interface SearchResult {
	repository: string;
	file_path: string;
	match_snippet: string;
	relevance_score: number;
	metadata: {
		language: string;
		stars: number;
		last_updated: string;
		github_url: string;
	};
}

export interface SummarizedSearchResponse {
	results: SearchResult[];
	summary?: string;
	took_ms: number;
}

export interface ExpandedQuery {
	original: string;
	expanded: string;
	keywords: string[];
}

export interface RepositoryInsights {
	topic: string;
	totalRepositories: number;
	commonPatterns: string[];
	recommendations: string[];
	popularLibraries: string[];
}

/**
 * Gemini 3 Service
 *
 * Integrates Google's latest Gemini 3 model for:
 * - Search result summarization
 * - Query understanding & expansion
 * - Repository insights generation
 *
 * Uses Gemini 3 Pro with 1M token context window
 */
export class GeminiService {
	private genAI?: GoogleGenerativeAI;
	private model?: GenerativeModel;
	private enabled: boolean;

	constructor() {
		const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
		this.enabled = process.env.ENABLE_GEMINI_FEATURES === "true" && !!apiKey;

		if (this.enabled && apiKey) {
			this.genAI = new GoogleGenerativeAI(apiKey);
			// Using Gemini 3 Pro - launched November 18, 2025
			this.model = this.genAI.getGenerativeModel({ model: "gemini-3-pro" });
		}
	}

	/**
	 * Checks if Gemini features are enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Summarize search results using Gemini 3
	 *
	 * @param results - Array of search results from Vertex AI Search
	 * @returns Natural language summary of the results
	 */
	async summarizeResults(results: SearchResult[]): Promise<string> {
		if (!this.enabled || results.length === 0) {
			return "";
		}

		try {
			const prompt = `You are analyzing UK government code search results. Provide a concise summary (2-3 sentences) of what these code repositories demonstrate.

Search Results:
${results
	.slice(0, 5) // Limit to top 5 for cost efficiency
	.map(
		(r, i) =>
			`${i + 1}. ${r.repository} (${r.metadata.language}, ${r.metadata.stars} stars)
   File: ${r.file_path}
   Code: ${r.match_snippet.slice(0, 200)}...
   `,
	)
	.join("\n")}

Provide a helpful summary focusing on:
- What these repos have in common
- Key patterns or approaches used
- Which repos might be most useful

Summary:`;

			if (!this.model) return "";
			const result = await this.model.generateContent(prompt);
			const response = result.response;
			return response.text().trim();
		} catch (error) {
			console.error("Gemini summarization error:", error);
			return "";
		}
	}

	/**
	 * Expand and enhance a user's search query using Gemini 3
	 *
	 * @param query - Original user query
	 * @returns Expanded query with additional technical terms
	 */
	async expandQuery(query: string): Promise<ExpandedQuery> {
		if (!this.enabled) {
			return {
				original: query,
				expanded: query,
				keywords: [],
			};
		}

		try {
			const prompt = `You are a UK government developer search assistant. Expand this code search query with relevant technical terms and synonyms to improve semantic search results.

Original query: "${query}"

Provide:
1. An expanded version with related technical terms
2. Key technical keywords to boost search

Respond in JSON format:
{
  "expanded": "expanded query with technical context",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

JSON:`;

			if (!this.model) return { original: query, expanded: query, keywords: [] };
			const result = await this.model.generateContent(prompt);
			const response = result.response.text().trim();

			// Parse JSON response
			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					original: query,
					expanded: parsed.expanded || query,
					keywords: parsed.keywords || [],
				};
			}

			// Fallback if JSON parsing fails
			return {
				original: query,
				expanded: query,
				keywords: [],
			};
		} catch (error) {
			console.error("Gemini query expansion error:", error);
			return {
				original: query,
				expanded: query,
				keywords: [],
			};
		}
	}

	/**
	 * Generate insights about repository patterns using Gemini 3
	 *
	 * @param topic - Topic to analyze (e.g., "authentication", "NHS APIs")
	 * @param results - Search results for the topic
	 * @returns Insights about common patterns and recommendations
	 */
	async generateInsights(topic: string, results: SearchResult[]): Promise<RepositoryInsights> {
		if (!this.enabled || results.length === 0) {
			return {
				topic,
				totalRepositories: results.length,
				commonPatterns: [],
				recommendations: [],
				popularLibraries: [],
			};
		}

		try {
			const prompt = `Analyze these UK government code repositories related to "${topic}".

Repositories analyzed (${results.length}):
${results
	.slice(0, 10)
	.map(
		(r, i) =>
			`${i + 1}. ${r.repository} (${r.metadata.language})
   ${r.match_snippet.slice(0, 150)}...
   `,
	)
	.join("\n")}

Provide insights in JSON format:
{
  "commonPatterns": ["pattern 1", "pattern 2", "pattern 3"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "popularLibraries": ["library1", "library2", "library3"]
}

Focus on:
- Common architectural patterns across repos
- Best practices being used
- Popular libraries/frameworks
- Recommendations for government developers

JSON:`;

			if (!this.model) {
				return {
					topic,
					totalRepositories: results.length,
					commonPatterns: [],
					recommendations: [],
					popularLibraries: [],
				};
			}

			const result = await this.model.generateContent(prompt);
			const response = result.response.text().trim();

			// Parse JSON response
			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					topic,
					totalRepositories: results.length,
					commonPatterns: parsed.commonPatterns || [],
					recommendations: parsed.recommendations || [],
					popularLibraries: parsed.popularLibraries || [],
				};
			}

			// Fallback
			return {
				topic,
				totalRepositories: results.length,
				commonPatterns: [],
				recommendations: [],
				popularLibraries: [],
			};
		} catch (error) {
			console.error("Gemini insights generation error:", error);
			return {
				topic,
				totalRepositories: results.length,
				commonPatterns: [],
				recommendations: [],
				popularLibraries: [],
			};
		}
	}

	/**
	 * Analyze code quality from repository summaries
	 *
	 * @param repoName - Repository name
	 * @param summary - gitingest summary of the repository
	 * @returns Quality analysis and metrics
	 */
	async analyzeCodeQuality(
		repoName: string,
		summary: string,
	): Promise<{
		score: number;
		strengths: string[];
		improvements: string[];
		testCoverage: string;
		documentation: string;
	}> {
		if (!this.enabled) {
			return {
				score: 0,
				strengths: [],
				improvements: [],
				testCoverage: "unknown",
				documentation: "unknown",
			};
		}

		try {
			const prompt = `Analyze the code quality of this UK government repository.

Repository: ${repoName}
Summary: ${summary.slice(0, 2000)}

Provide quality analysis in JSON format:
{
  "score": 75,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "testCoverage": "good|moderate|poor",
  "documentation": "excellent|good|moderate|poor"
}

JSON:`;

			if (!this.model) {
				return {
					score: 0,
					strengths: [],
					improvements: [],
					testCoverage: "unknown",
					documentation: "unknown",
				};
			}

			const result = await this.model.generateContent(prompt);
			const response = result.response.text().trim();

			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					score: parsed.score || 0,
					strengths: parsed.strengths || [],
					improvements: parsed.improvements || [],
					testCoverage: parsed.testCoverage || "unknown",
					documentation: parsed.documentation || "unknown",
				};
			}

			return {
				score: 0,
				strengths: [],
				improvements: [],
				testCoverage: "unknown",
				documentation: "unknown",
			};
		} catch (error) {
			console.error("Gemini code quality analysis error:", error);
			return {
				score: 0,
				strengths: [],
				improvements: [],
				testCoverage: "unknown",
				documentation: "unknown",
			};
		}
	}
}

// Export singleton instance
export const geminiService = new GeminiService();
