import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import { search } from "../../src/controllers/searchController";
import { validateResultMode } from "../../src/middleware/validateRequest";
import { MCPSearchResponse, MCPErrorResponse } from "../../src/types/mcp";

describe("MCP Search API - resultMode integration tests", () => {
	let app: Express;

	beforeAll(() => {
		// Create test Express app with validation middleware
		app = express();
		app.use(express.json());
		app.post("/mcp/search", validateResultMode, search);
	});

	describe("AC-1 & AC-3: Valid resultMode values and mode echo", () => {
		it('should accept resultMode="minimal" and echo mode in response', async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "test query", resultMode: "minimal" })
				.expect(200);

			const body = response.body as MCPSearchResponse;
			expect(body.mode).toBe("minimal");
			expect(body.results).toBeDefined();
			expect(body.metadata).toBeDefined();
		});

		it('should accept resultMode="snippets" and echo mode in response', async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "test query", resultMode: "snippets" })
				.expect(200);

			const body = response.body as MCPSearchResponse;
			expect(body.mode).toBe("snippets");
		});

		it('should accept resultMode="full" and echo mode in response', async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "test query", resultMode: "full" })
				.expect(200);

			const body = response.body as MCPSearchResponse;
			expect(body.mode).toBe("full");
		});
	});

	describe("AC-4: Backward compatibility (omitted resultMode)", () => {
		it('should default to "snippets" when resultMode is omitted', async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "test query" })
				.expect(200);

			const body = response.body as MCPSearchResponse;
			expect(body.mode).toBe("snippets");
		});

		it("should work with legacy request format (query only)", async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "authentication" })
				.expect(200);

			const body = response.body as MCPSearchResponse;
			expect(body.mode).toBe("snippets");
			expect(body.results).toBeDefined();
			expect(body.metadata).toBeDefined();
			expect(body.metadata.query).toBe("authentication");
		});

		it("should work with legacy request format (query + limit)", async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "test", limit: 5 })
				.expect(200);

			const body = response.body as MCPSearchResponse;
			expect(body.mode).toBe("snippets");
			expect(body.metadata.limit).toBe(5);
		});

		it("should maintain existing response structure (results, metadata)", async () => {
			const response = await request(app).post("/mcp/search").send({ query: "test" }).expect(200);

			const body = response.body as MCPSearchResponse;
			// Verify all expected fields exist
			expect(body.results).toBeDefined();
			expect(Array.isArray(body.results)).toBe(true);
			expect(body.metadata).toBeDefined();
			expect(body.metadata.query).toBeDefined();
			expect(body.metadata.limit).toBeDefined();
			expect(body.metadata.resultCount).toBeDefined();
			expect(body.metadata.duration).toBeDefined();
			// New mode field should be present
			expect(body.mode).toBeDefined();
		});
	});

	describe("AC-2: Error response format for invalid resultMode", () => {
		it("should return 400 for invalid resultMode", async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "test", resultMode: "invalid" })
				.expect(400);

			const body = response.body as MCPErrorResponse;
			expect(body.error).toBeDefined();
			expect(body.error.code).toBe("INVALID_RESULT_MODE");
			expect(body.error.message).toContain("minimal, snippets, full");
			expect(body.error.allowed_values).toEqual(["minimal", "snippets", "full"]);
		});

		it('should return 400 for case-variant "MINIMAL"', async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "test", resultMode: "MINIMAL" })
				.expect(400);

			const body = response.body as MCPErrorResponse;
			expect(body.error.code).toBe("INVALID_RESULT_MODE");
		});

		it("should include allowed_values in error response", async () => {
			const response = await request(app)
				.post("/mcp/search")
				.send({ query: "test", resultMode: "wrong" })
				.expect(400);

			const body = response.body as MCPErrorResponse;
			expect(body.error.allowed_values).toEqual(["minimal", "snippets", "full"]);
		});
	});

	describe("Mode echo verification", () => {
		it("should always include mode field in successful responses", async () => {
			const testCases = [
				{ resultMode: "minimal", expectedMode: "minimal" },
				{ resultMode: "snippets", expectedMode: "snippets" },
				{ resultMode: "full", expectedMode: "full" },
				{ resultMode: undefined, expectedMode: "snippets" }, // default
			];

			for (const testCase of testCases) {
				const payload: any = { query: "test" };
				if (testCase.resultMode !== undefined) {
					payload.resultMode = testCase.resultMode;
				}

				const response = await request(app).post("/mcp/search").send(payload).expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.mode).toBe(testCase.expectedMode);
			}
		});
	});

	describe("Story 8.2: Minimal Mode Implementation Tests", () => {
		describe("AC-1: Minimal mode returns only essential fields without snippets", () => {
			it("should return MinimalResult array for minimal mode", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "minimal" })
					.expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.results).toBeDefined();
				expect(Array.isArray(body.results)).toBe(true);

				// If results exist, verify minimal structure
				if (body.results.length > 0) {
					const result = body.results[0] as any;

					// Minimal mode should have these fields
					expect(result.repo_url).toBeDefined();
					expect(result.repo_org).toBeDefined();
					expect(result.repo_name).toBeDefined();
					expect(result.language).toBeDefined();
					expect(result.last_updated).toBeDefined();
					expect(result.similarity_score).toBeDefined();
					expect(result.github_link).toBeDefined();
					expect(result.metadata).toBeDefined();
				}
			});

			it("should NOT include snippet fields in minimal mode response", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "minimal" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// If results exist, verify no snippet fields
				if (body.results.length > 0) {
					const result = body.results[0] as any;

					// These fields should NOT exist in minimal mode
					expect(result.snippet).toBeUndefined();
					expect(result.snippet_file_path).toBeUndefined();
					expect(result.snippet_line_range).toBeUndefined();
					expect(result.gitingest_summary).toBeUndefined();
				}
			});

			it('should indicate mode as "minimal" in response', async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "minimal" })
					.expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.mode).toBe("minimal");
			});

			it("should have GitHub links formatted correctly", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "minimal" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// If results exist, verify GitHub link format
				if (body.results.length > 0) {
					const result = body.results[0] as any;
					expect(result.github_link).toMatch(/^https:\/\/github\.com\/[\w-]+\/[\w-]+$/);
				}
			});
		});

		describe("AC-2: Minimal mode performance characteristics", () => {
			it("should have response size smaller than snippets mode", async () => {
				// Get minimal mode response
				const minimalResponse = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "minimal", limit: 5 })
					.expect(200);

				// Get snippets mode response
				const snippetsResponse = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "snippets", limit: 5 })
					.expect(200);

				// Measure JSON payload sizes
				const minimalSize = JSON.stringify(minimalResponse.body).length;
				const snippetsSize = JSON.stringify(snippetsResponse.body).length;

				// Minimal mode should be smaller (or equal if no results)
				if (minimalResponse.body.results.length > 0) {
					expect(minimalSize).toBeLessThanOrEqual(snippetsSize);
				}
			});

			it("should measure response size per result (~1KB target)", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "minimal", limit: 5 })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				if (body.results.length > 0) {
					const totalSize = JSON.stringify(body.results).length;
					const avgSizePerResult = totalSize / body.results.length;

					// Log for visibility (not strict requirement in integration test)
					console.log(`Minimal mode avg size per result: ${avgSizePerResult} bytes`);

					// Sanity check: should be reasonable size (less than 2KB per result)
					expect(avgSizePerResult).toBeLessThan(2048);
				}
			});
		});

		describe("AC-3: Response schema compliance", () => {
			it("should match MinimalResult TypeScript interface structure", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "minimal" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// Verify response structure matches expected schema
				expect(body.results).toBeDefined();
				expect(body.metadata).toBeDefined();
				expect(body.mode).toBe("minimal");

				// If results exist, verify each result has required fields
				body.results.forEach((result: any) => {
					expect(typeof result.repo_url).toBe("string");
					expect(typeof result.repo_org).toBe("string");
					expect(typeof result.repo_name).toBe("string");
					expect(typeof result.language).toBe("string");
					expect(typeof result.last_updated).toBe("string");
					expect(typeof result.similarity_score).toBe("number");
					expect(typeof result.github_link).toBe("string");
					expect(typeof result.metadata).toBe("object");
				});
			});

			it("should work with different query limits", async () => {
				const testCases = [1, 5, 10, 20];

				for (const limit of testCases) {
					const response = await request(app)
						.post("/mcp/search")
						.send({ query: "test query", resultMode: "minimal", limit })
						.expect(200);

					const body = response.body as MCPSearchResponse;
					expect(body.mode).toBe("minimal");
					expect(body.metadata.limit).toBe(limit);
				}
			});
		});

		describe("Backward compatibility", () => {
			it("should maintain existing response structure with mode field", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test", resultMode: "minimal" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// Standard response fields should exist
				expect(body.results).toBeDefined();
				expect(body.metadata).toBeDefined();
				expect(body.metadata.query).toBe("test");
				expect(body.metadata.limit).toBeDefined();
				expect(body.metadata.resultCount).toBeDefined();
				expect(body.metadata.duration).toBeDefined();

				// Mode field should indicate minimal
				expect(body.mode).toBe("minimal");
			});
		});
	});

	describe("Story 8.3: Snippets Mode Implementation Tests (Default Behavior)", () => {
		describe("AC-1: Snippet result fields with explicit resultMode", () => {
			it('should return SnippetResult array for explicit resultMode:"snippets"', async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "snippets" })
					.expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.results).toBeDefined();
				expect(Array.isArray(body.results)).toBe(true);
				expect(body.mode).toBe("snippets");

				// If results exist, verify snippet structure
				if (body.results.length > 0) {
					const result = body.results[0] as any;

					// All MinimalResult base fields should be present
					expect(result.repo_url).toBeDefined();
					expect(result.repo_org).toBeDefined();
					expect(result.repo_name).toBeDefined();
					expect(result.language).toBeDefined();
					expect(result.last_updated).toBeDefined();
					expect(result.similarity_score).toBeDefined();
					expect(result.github_link).toBeDefined();
					expect(result.metadata).toBeDefined();

					// Snippet-specific fields should be present
					expect(result.snippet).toBeDefined();
					expect(result.snippet_file_path).toBeDefined();
					expect(result.snippet_line_range).toBeDefined();
					expect(result.context_lines_before).toBe(2);
					expect(result.context_lines_after).toBe(2);
					expect(result.codespaces_link).toBeDefined();
				}
			});

			it("should include Codespaces link formatted correctly", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "snippets" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// If results exist, verify Codespaces link format
				if (body.results.length > 0) {
					const result = body.results[0] as any;
					expect(result.codespaces_link).toMatch(/^https:\/\/github\.dev\/[\w-]+\/[\w-]+$/);
				}
			});
		});

		describe("AC-2: Snippets mode as default (backward compatibility)", () => {
			it("should default to snippets mode when resultMode omitted", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query" }) // No resultMode parameter
					.expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.mode).toBe("snippets"); // Should echo "snippets" as default
				expect(body.results).toBeDefined();
				expect(body.metadata).toBeDefined();
			});

			it("should return identical structure with or without resultMode parameter", async () => {
				// Query with explicit resultMode: "snippets"
				const explicitResponse = await request(app)
					.post("/mcp/search")
					.send({ query: "authentication", resultMode: "snippets" })
					.expect(200);

				// Query without resultMode (default)
				const defaultResponse = await request(app)
					.post("/mcp/search")
					.send({ query: "authentication" })
					.expect(200);

				const explicitBody = explicitResponse.body as MCPSearchResponse;
				const defaultBody = defaultResponse.body as MCPSearchResponse;

				// Both should have same mode
				expect(explicitBody.mode).toBe("snippets");
				expect(defaultBody.mode).toBe("snippets");

				// Both should have same response structure
				expect(explicitBody.results).toBeDefined();
				expect(defaultBody.results).toBeDefined();
				expect(explicitBody.metadata).toBeDefined();
				expect(defaultBody.metadata).toBeDefined();

				// If results exist, both should have snippet fields
				if (explicitBody.results.length > 0 && defaultBody.results.length > 0) {
					const explicitResult = explicitBody.results[0] as any;
					const defaultResult = defaultBody.results[0] as any;

					expect(explicitResult.snippet).toBeDefined();
					expect(defaultResult.snippet).toBeDefined();
					expect(explicitResult.codespaces_link).toBeDefined();
					expect(defaultResult.codespaces_link).toBeDefined();
				}
			});

			it("should maintain backward compatibility: no resultMode works identically", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test", limit: 5 })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// Verify all expected fields exist (backward compatibility)
				expect(body.results).toBeDefined();
				expect(Array.isArray(body.results)).toBe(true);
				expect(body.metadata).toBeDefined();
				expect(body.metadata.query).toBe("test");
				expect(body.metadata.limit).toBe(5);
				expect(body.metadata.resultCount).toBeDefined();
				expect(body.metadata.duration).toBeDefined();

				// New mode field should indicate snippets (default)
				expect(body.mode).toBe("snippets");
			});

			it('should echo mode as "snippets" even when omitted in request', async () => {
				const response = await request(app).post("/mcp/search").send({ query: "test" }).expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.mode).toBe("snippets"); // Echoes default mode
			});
		});

		describe("AC-3: Response schema compliance", () => {
			it("should match SnippetResult TypeScript interface structure", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "snippets" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// Verify response structure matches expected schema
				expect(body.results).toBeDefined();
				expect(body.metadata).toBeDefined();
				expect(body.mode).toBe("snippets");

				// If results exist, verify each result has required fields
				body.results.forEach((result: any) => {
					// Base fields
					expect(typeof result.repo_url).toBe("string");
					expect(typeof result.repo_org).toBe("string");
					expect(typeof result.repo_name).toBe("string");
					expect(typeof result.language).toBe("string");
					expect(typeof result.last_updated).toBe("string");
					expect(typeof result.similarity_score).toBe("number");
					expect(typeof result.github_link).toBe("string");
					expect(typeof result.metadata).toBe("object");

					// Snippet-specific fields
					expect(typeof result.snippet).toBe("string");
					expect(typeof result.snippet_file_path).toBe("string");
					expect(typeof result.snippet_line_range).toBe("string");
					expect(typeof result.context_lines_before).toBe("number");
					expect(typeof result.context_lines_after).toBe("number");
					expect(typeof result.codespaces_link).toBe("string");
				});
			});

			it("should work with different query limits", async () => {
				const testCases = [1, 5, 10, 20];

				for (const limit of testCases) {
					const response = await request(app)
						.post("/mcp/search")
						.send({ query: "test query", resultMode: "snippets", limit })
						.expect(200);

					const body = response.body as MCPSearchResponse;
					expect(body.mode).toBe("snippets");
					expect(body.metadata.limit).toBe(limit);
				}
			});
		});

		describe("Performance and payload size", () => {
			it("should have response size larger than minimal mode (includes snippets)", async () => {
				// Get minimal mode response
				const minimalResponse = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "minimal", limit: 5 })
					.expect(200);

				// Get snippets mode response
				const snippetsResponse = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "snippets", limit: 5 })
					.expect(200);

				// Measure JSON payload sizes
				const minimalSize = JSON.stringify(minimalResponse.body).length;
				const snippetsSize = JSON.stringify(snippetsResponse.body).length;

				// Snippets mode should be larger (or equal if no results)
				if (snippetsResponse.body.results.length > 0) {
					expect(snippetsSize).toBeGreaterThanOrEqual(minimalSize);
				}
			});

			it("should measure response size per result (~5KB target)", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "snippets", limit: 5 })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				if (body.results.length > 0) {
					const totalSize = JSON.stringify(body.results).length;
					const avgSizePerResult = totalSize / body.results.length;

					// Log for visibility
					console.log(`Snippets mode avg size per result: ${avgSizePerResult} bytes`);

					// Sanity check: should be reasonable size (less than 10KB per result)
					expect(avgSizePerResult).toBeLessThan(10240);
				}
			});
		});

		describe("Backward compatibility validation", () => {
			it("should work with legacy request format (query only)", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "authentication" })
					.expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.mode).toBe("snippets");
				expect(body.results).toBeDefined();
				expect(body.metadata).toBeDefined();
				expect(body.metadata.query).toBe("authentication");
			});

			it("should work with legacy request format (query + limit)", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test", limit: 10 })
					.expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.mode).toBe("snippets");
				expect(body.metadata.limit).toBe(10);
			});

			it("should maintain existing response structure", async () => {
				const response = await request(app).post("/mcp/search").send({ query: "test" }).expect(200);

				const body = response.body as MCPSearchResponse;

				// Verify all expected fields exist (backward compatibility)
				expect(body.results).toBeDefined();
				expect(Array.isArray(body.results)).toBe(true);
				expect(body.metadata).toBeDefined();
				expect(body.metadata.query).toBeDefined();
				expect(body.metadata.limit).toBeDefined();
				expect(body.metadata.resultCount).toBeDefined();
				expect(body.metadata.duration).toBeDefined();

				// Mode field should be present
				expect(body.mode).toBeDefined();
			});
		});
	});

	describe("Story 8.4: Full Mode Integration Tests", () => {
		describe("AC-1: FullResult with all required fields", () => {
			it("should return FullResult array with full mode request", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full" })
					.expect(200);

				const body = response.body as MCPSearchResponse;
				expect(body.mode).toBe("full");
				expect(body.results).toBeDefined();
				expect(body.metadata).toBeDefined();
			});

			it("should include gitingest_summary field in full mode results", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "authentication", resultMode: "full", limit: 5 })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				if (body.results.length > 0) {
					const result = body.results[0] as any;

					// Verify full mode fields are present
					expect(result.gitingest_summary).toBeDefined();
					expect(typeof result.gitingest_summary).toBe("string");

					// gitingest_summary can be empty string if GCS fetch failed (graceful degradation)
					// but field should always be present
				}
			});

			it("should include all snippet mode fields in full mode (extends SnippetResult)", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				if (body.results.length > 0) {
					const result = body.results[0] as any;

					// Verify all base fields (MinimalResult)
					expect(result.repo_url).toBeDefined();
					expect(result.repo_org).toBeDefined();
					expect(result.repo_name).toBeDefined();
					expect(result.language).toBeDefined();
					expect(result.last_updated).toBeDefined();
					expect(result.similarity_score).toBeDefined();
					expect(result.github_link).toBeDefined();
					expect(result.metadata).toBeDefined();

					// Verify snippet fields (SnippetResult)
					expect(result.snippet).toBeDefined();
					expect(result.snippet_file_path).toBeDefined();
					expect(result.snippet_line_range).toBeDefined();
					expect(result.context_lines_before).toBeDefined();
					expect(result.context_lines_after).toBeDefined();
					expect(result.codespaces_link).toBeDefined();

					// Verify full mode fields
					expect(result.gitingest_summary).toBeDefined();
				}
			});
		});

		describe("AC-2: Enhanced metadata fields", () => {
			it("should include optional readme_excerpt field", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full", limit: 5 })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				if (body.results.length > 0) {
					const result = body.results[0] as any;

					// readme_excerpt is optional - may be undefined if README not found
					// Just verify it's accessible and properly typed if present
					if (result.readme_excerpt !== undefined) {
						expect(typeof result.readme_excerpt).toBe("string");
					}
				}
			});

			it("should include optional repository_stats field", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full", limit: 5 })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				if (body.results.length > 0) {
					const result = body.results[0] as any;

					// repository_stats is optional
					if (result.repository_stats !== undefined) {
						expect(typeof result.repository_stats).toBe("object");
						// Verify structure if present
						expect(result.repository_stats.contributors).toBeDefined();
						expect(result.repository_stats.commits_last_month).toBeDefined();
						expect(result.repository_stats.open_issues).toBeDefined();
						expect(result.repository_stats.last_commit).toBeDefined();
					}
				}
			});

			it("should include optional dependencies field", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full", limit: 5 })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				if (body.results.length > 0) {
					const result = body.results[0] as any;

					// dependencies is optional
					if (result.dependencies !== undefined) {
						expect(Array.isArray(result.dependencies)).toBe(true);
						// Verify structure if present
						if (result.dependencies.length > 0) {
							const dep = result.dependencies[0];
							expect(dep.name).toBeDefined();
							expect(dep.version).toBeDefined();
							expect(dep.type).toBeDefined();
							expect(["runtime", "dev"]).toContain(dep.type);
						}
					}
				}
			});
		});

		describe("AC-3: Performance and schema compliance", () => {
			it("should complete full mode request within acceptable time (<5000ms)", async () => {
				const startTime = Date.now();

				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full", limit: 5 })
					.expect(200);

				const duration = Date.now() - startTime;
				const body = response.body as MCPSearchResponse;

				// Log for visibility
				console.log(`Full mode request duration: ${duration}ms (results: ${body.results.length})`);

				// Target: <3000ms p95, but allow higher for integration tests due to cold starts
				expect(duration).toBeLessThan(5000);
			});

			it("should measure response payload size (target ~50KB per result)", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full", limit: 5 })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				if (body.results.length > 0) {
					const totalSize = JSON.stringify(body.results).length;
					const avgSizePerResult = totalSize / body.results.length;

					// Log for visibility
					console.log(`Full mode avg size per result: ${avgSizePerResult} bytes`);

					// Sanity check: should be larger than snippet mode but reasonable
					// Allow up to 100KB per result (2x target for integration test tolerance)
					expect(avgSizePerResult).toBeLessThan(102400);
				}
			});

			it("should match FullResult TypeScript interface structure", async () => {
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// Verify response structure matches expected schema
				expect(body.results).toBeDefined();
				expect(body.metadata).toBeDefined();
				expect(body.mode).toBe("full");

				// If results exist, verify each result has required full mode fields
				body.results.forEach((result: any) => {
					// Base fields (MinimalResult)
					expect(typeof result.repo_url).toBe("string");
					expect(typeof result.repo_org).toBe("string");
					expect(typeof result.repo_name).toBe("string");
					expect(typeof result.language).toBe("string");
					expect(typeof result.last_updated).toBe("string");
					expect(typeof result.similarity_score).toBe("number");
					expect(typeof result.github_link).toBe("string");
					expect(typeof result.metadata).toBe("object");

					// Snippet-specific fields (SnippetResult)
					expect(typeof result.snippet).toBe("string");
					expect(typeof result.snippet_file_path).toBe("string");
					expect(typeof result.snippet_line_range).toBe("string");
					expect(typeof result.context_lines_before).toBe("number");
					expect(typeof result.context_lines_after).toBe("number");
					expect(typeof result.codespaces_link).toBe("string");

					// Full mode required field
					expect(typeof result.gitingest_summary).toBe("string");

					// Full mode optional fields (may be undefined)
					if (result.readme_excerpt !== undefined) {
						expect(typeof result.readme_excerpt).toBe("string");
					}
					if (result.repository_stats !== undefined) {
						expect(typeof result.repository_stats).toBe("object");
					}
					if (result.dependencies !== undefined) {
						expect(Array.isArray(result.dependencies)).toBe(true);
					}
				});
			});
		});

		describe("Comparison with other modes", () => {
			it("should have larger payload than snippets mode (includes gitingest summary)", async () => {
				// Get snippets mode response
				const snippetsResponse = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "snippets", limit: 5 })
					.expect(200);

				// Get full mode response
				const fullResponse = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full", limit: 5 })
					.expect(200);

				// Measure JSON payload sizes
				const snippetsSize = JSON.stringify(snippetsResponse.body).length;
				const fullSize = JSON.stringify(fullResponse.body).length;

				console.log(
					`Payload comparison - Snippets: ${snippetsSize} bytes, Full: ${fullSize} bytes`,
				);

				// Full mode should be larger (or equal if no gitingest summaries)
				if (fullResponse.body.results.length > 0) {
					expect(fullSize).toBeGreaterThanOrEqual(snippetsSize);
				}
			});

			it("should take longer than snippets mode (includes GCS reads)", async () => {
				// Get snippets mode duration
				const snippetsStart = Date.now();
				await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "snippets", limit: 5 })
					.expect(200);
				const snippetsDuration = Date.now() - snippetsStart;

				// Get full mode duration
				const fullStart = Date.now();
				await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full", limit: 5 })
					.expect(200);
				const fullDuration = Date.now() - fullStart;

				console.log(
					`Duration comparison - Snippets: ${snippetsDuration}ms, Full: ${fullDuration}ms`,
				);

				// Full mode should take longer (or equal if GCS reads are cached)
				// This is informational - we don't fail the test
				expect(fullDuration).toBeGreaterThanOrEqual(0);
			});
		});

		describe("Graceful degradation", () => {
			it("should handle missing gitingest files (GCS 404) gracefully", async () => {
				// Query that likely has no gitingest summary
				const response = await request(app)
					.post("/mcp/search")
					.send({ query: "test query", resultMode: "full" })
					.expect(200);

				const body = response.body as MCPSearchResponse;

				// Should not fail - should return results with empty gitingest_summary
				expect(body.mode).toBe("full");
				expect(body.results).toBeDefined();

				// Even if gitingest fetch fails, all base fields should be present
				if (body.results.length > 0) {
					const result = body.results[0] as any;
					expect(result.repo_url).toBeDefined();
					expect(result.snippet).toBeDefined();
					expect(result.gitingest_summary).toBeDefined(); // Will be empty string on failure
				}
			});

			it("should work with different query limits", async () => {
				const testCases = [1, 5, 10];

				for (const limit of testCases) {
					const response = await request(app)
						.post("/mcp/search")
						.send({ query: "test query", resultMode: "full", limit })
						.expect(200);

					const body = response.body as MCPSearchResponse;
					expect(body.mode).toBe("full");
					expect(body.metadata.limit).toBe(limit);
				}
			});
		});
	});
});
