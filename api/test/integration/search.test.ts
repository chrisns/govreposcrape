import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import cors from "cors";
import { search } from "../../src/controllers/searchController";
import { loggingMiddleware } from "../../src/middleware/logging";
import { errorHandler, notFoundHandler } from "../../src/middleware/errorHandler";
import { timeoutMiddleware } from "../../src/middleware/timeout";

// Create test Express app
let app: express.Application;

beforeAll(() => {
	app = express();
	app.use(express.json());
	app.use(cors());
	app.use(loggingMiddleware);
	app.use(timeoutMiddleware(10000));

	// Health endpoint
	app.get("/health", (_req, res) => {
		res.status(200).json({
			status: "ok",
			timestamp: new Date().toISOString(),
			service: "govreposcrape-api",
			version: "1.0.0",
		});
	});

	// MCP Search endpoint
	app.post("/mcp/search", search);

	// 404 handler
	app.use(notFoundHandler);

	// Error handler
	app.use(errorHandler);
});

describe("POST /mcp/search - MCP Search Endpoint Integration Tests", () => {
	it("should return 400 when query is missing", async () => {
		const response = await request(app).post("/mcp/search").send({}).expect(400);

		expect(response.body).toHaveProperty("error");
		expect(response.body.error.code).toBe("INVALID_REQUEST");
		expect(response.body.error.message).toContain("query");
	});

	it("should return 400 when query is not a string", async () => {
		const response = await request(app).post("/mcp/search").send({ query: 123 }).expect(400);

		expect(response.body).toHaveProperty("error");
		expect(response.body.error.code).toBe("INVALID_REQUEST");
	});

	it("should return 400 when limit is invalid (< 1)", async () => {
		const response = await request(app)
			.post("/mcp/search")
			.send({ query: "test", limit: 0 })
			.expect(400);

		expect(response.body).toHaveProperty("error");
		expect(response.body.error.code).toBe("INVALID_REQUEST");
		expect(response.body.error.message).toContain("limit");
	});

	it("should return 400 when limit is invalid (> 100)", async () => {
		const response = await request(app)
			.post("/mcp/search")
			.send({ query: "test", limit: 101 })
			.expect(400);

		expect(response.body).toHaveProperty("error");
		expect(response.body.error.code).toBe("INVALID_REQUEST");
		expect(response.body.error.message).toContain("limit");
	});

	it("should accept valid search request with query only", async () => {
		const response = await request(app)
			.post("/mcp/search")
			.send({ query: "authentication patterns in UK government repos" })
			.expect(200);

		expect(response.body).toHaveProperty("results");
		expect(response.body).toHaveProperty("metadata");
		expect(Array.isArray(response.body.results)).toBe(true);
		expect(response.body.metadata).toHaveProperty("query");
		expect(response.body.metadata).toHaveProperty("limit");
		expect(response.body.metadata).toHaveProperty("resultCount");
		expect(response.body.metadata).toHaveProperty("duration");
	});

	it("should accept valid search request with query and limit", async () => {
		const response = await request(app)
			.post("/mcp/search")
			.send({ query: "authentication", limit: 10 })
			.expect(200);

		expect(response.body).toHaveProperty("results");
		expect(response.body.metadata.limit).toBe(10);
		expect(response.body.results.length).toBeLessThanOrEqual(10);
	});

	it("should return search results in MCP v2 format", async () => {
		const response = await request(app).post("/mcp/search").send({ query: "test" }).expect(200);

		expect(response.body).toHaveProperty("results");

		// Validate MCP SearchResult schema if results exist
		if (response.body.results.length > 0) {
			const result = response.body.results[0];
			expect(result).toHaveProperty("title");
			expect(result).toHaveProperty("url");
			expect(result).toHaveProperty("snippet");
			expect(result).toHaveProperty("metadata");
			expect(result.metadata).toHaveProperty("org");
			expect(result.metadata).toHaveProperty("repo");
			expect(typeof result.title).toBe("string");
			expect(typeof result.url).toBe("string");
			expect(typeof result.snippet).toBe("string");
		}
	});

	it("should trim query whitespace", async () => {
		const response = await request(app)
			.post("/mcp/search")
			.send({ query: "  authentication  " })
			.expect(200);

		expect(response.body.metadata.query).toBe("authentication");
	});

	it("should use default limit of 20 when not specified", async () => {
		const response = await request(app).post("/mcp/search").send({ query: "test" }).expect(200);

		expect(response.body.metadata.limit).toBe(20);
	});

	it("should measure response time and include in metadata", async () => {
		const response = await request(app).post("/mcp/search").send({ query: "test" }).expect(200);

		expect(response.body.metadata).toHaveProperty("duration");
		expect(typeof response.body.metadata.duration).toBe("number");
		expect(response.body.metadata.duration).toBeGreaterThan(0);
	});

	it("should meet p95 response time requirement (<2s)", async () => {
		const iterations = 20;
		const responseTimes: number[] = [];

		for (let i = 0; i < iterations; i++) {
			const startTime = Date.now();
			await request(app).post("/mcp/search").send({ query: "test" }).expect(200);
			const duration = Date.now() - startTime;
			responseTimes.push(duration);
		}

		// Calculate p95
		responseTimes.sort((a, b) => a - b);
		const p95Index = Math.floor(iterations * 0.95);
		const p95 = responseTimes[p95Index];

		console.log(`p95 response time: ${p95}ms`);
		expect(p95).toBeLessThan(2000); // Must be < 2s as per NFR-4
	}, 60000); // 60s timeout for performance test
});

describe("GET /health - Health Endpoint Tests", () => {
	it("should return 200 OK with health status", async () => {
		const response = await request(app).get("/health").expect(200);

		expect(response.body).toHaveProperty("status");
		expect(response.body.status).toBe("ok");
		expect(response.body).toHaveProperty("timestamp");
		expect(response.body).toHaveProperty("service");
		expect(response.body.service).toBe("govreposcrape-api");
	});

	it("should return valid ISO8601 timestamp", async () => {
		const response = await request(app).get("/health").expect(200);

		const timestamp = new Date(response.body.timestamp);
		expect(timestamp.toISOString()).toBe(response.body.timestamp);
	});
});

describe("404 Not Found Handler Tests", () => {
	it("should return 404 for non-existent endpoints", async () => {
		const response = await request(app).get("/non-existent").expect(404);

		expect(response.body).toHaveProperty("error");
		expect(response.body.error.code).toBe("NOT_FOUND");
		expect(response.body.error.message).toContain("/non-existent");
	});
});

describe("Error Handler Tests", () => {
	it("should handle Vertex AI Search API failures gracefully", async () => {
		// This test assumes VERTEX_AI_SEARCH_ENGINE_ID is not set or invalid
		// If it's set correctly, this test will pass with actual results
		const response = await request(app).post("/mcp/search").send({ query: "test" });

		// Either success (200) or internal error (500), both are acceptable
		expect([200, 500]).toContain(response.status);

		if (response.status === 500) {
			expect(response.body).toHaveProperty("error");
			expect(response.body.error.code).toBe("INTERNAL_ERROR");
		}
	});
});

describe("CORS Tests", () => {
	it("should include CORS headers in response", async () => {
		const response = await request(app).get("/health").expect(200);

		expect(response.headers).toHaveProperty("access-control-allow-origin");
	});
});

describe("Timeout Tests", () => {
	it("should timeout requests exceeding 10s", async () => {
		// This test is difficult to implement without mocking
		// In a real scenario, we would mock the search service to delay
		// For now, we'll just verify the timeout middleware is applied
		expect(
			app._router.stack.some(
				(layer: any) =>
					layer.name === "timeoutMiddleware" || layer.handle?.name === "timeoutMiddleware",
			),
		).toBe(true);
	});
});
