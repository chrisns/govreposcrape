import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("govreposcrape Worker", () => {
	it("responds with welcome message (unit style)", async () => {
		const request = new IncomingRequest("http://example.com");
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		const body = await response.json();
		expect(body).toHaveProperty("name", "govreposcrape");
		expect(body).toHaveProperty("version", "1.0.0");
		expect(body).toHaveProperty("status", "running");
		expect(body).toHaveProperty("endpoints");
		expect(response.status).toBe(200);
	});

	it("responds with welcome message (integration style)", async () => {
		const response = await SELF.fetch("https://example.com");
		const body = await response.json();
		expect(body).toHaveProperty("name", "govreposcrape");
		expect(body).toHaveProperty("version", "1.0.0");
		expect(body).toHaveProperty("status", "running");
		expect(response.status).toBe(200);
	});

	it("health check endpoint returns valid response structure", async () => {
		const response = await SELF.fetch("https://example.com/health");
		// Note: May return 503 if AI_SEARCH binding not configured in test environment (Epic 3 Story 3.1)
		// Once AI Search is configured in Cloudflare, this should return 200
		expect([200, 503]).toContain(response.status);
		const body = await response.json();

		if (response.status === 200) {
			expect(body).toHaveProperty("status", "healthy");
			expect(body).toHaveProperty("services");
			expect(body).toHaveProperty("timestamp");
		} else {
			// 503 response includes error details
			expect(body.details).toHaveProperty("status");
			expect(body.details).toHaveProperty("services");
			expect(body.details).toHaveProperty("timestamp");
		}
	});

	it("returns 404 for unknown routes", async () => {
		const response = await SELF.fetch("https://example.com/unknown");
		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error.code).toBe("NOT_FOUND");
	});
});
