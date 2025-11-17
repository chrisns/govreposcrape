/**
 * Tests for health check endpoint
 * Validates service connectivity checks and response formats
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkHealth, type HealthCheckResponse } from "../../src/api/health";

describe("checkHealth", () => {
	let mockEnv: Env;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Mock console.log to suppress log output during tests
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		// Create mock environment with all service bindings
		mockEnv = {
			KV: {
				get: vi.fn().mockResolvedValue(null),
			},
			R2: {
				list: vi.fn().mockResolvedValue({ objects: [] }),
			},
			VECTORIZE: {} as VectorizeIndex,
			DB: {
				prepare: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ result: 1 }),
				}),
			},
			AI_SEARCH: {
				query: vi.fn().mockResolvedValue({
					results: [
						{
							content: "test content",
							score: 0.95,
							metadata: {
								path: "gitingest/test-org/test-repo/summary.txt",
								contentType: "text/plain",
							},
						},
					],
					took_ms: 50,
				}),
			},
		} as unknown as Env;
	});

	describe("Healthy state (200 OK)", () => {
		it("should return 200 OK when all services are accessible", async () => {
			const response = await checkHealth(mockEnv, "test-request-id");

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/json");
		});

		it("should return healthy status when all services pass", async () => {
			const response = await checkHealth(mockEnv, "test-request-id");
			const body = (await response.json()) as HealthCheckResponse;

			expect(body.status).toBe("healthy");
		});

		it("should include all service statuses in response", async () => {
			const response = await checkHealth(mockEnv, "test-request-id");
			const body = (await response.json()) as HealthCheckResponse;

			expect(body.services).toHaveProperty("kv");
			expect(body.services).toHaveProperty("r2");
			expect(body.services).toHaveProperty("vectorize");
			expect(body.services).toHaveProperty("d1");
			expect(body.services).toHaveProperty("ai_search");
		});

		it("should mark all services as ok when healthy", async () => {
			const response = await checkHealth(mockEnv, "test-request-id");
			const body = (await response.json()) as HealthCheckResponse;

			expect(body.services.kv.status).toBe("ok");
			expect(body.services.r2.status).toBe("ok");
			expect(body.services.vectorize.status).toBe("ok");
			expect(body.services.d1.status).toBe("ok");
			expect(body.services.ai_search.status).toBe("ok");
		});

		it("should include ISO 8601 timestamp in response", async () => {
			const response = await checkHealth(mockEnv, "test-request-id");
			const body = (await response.json()) as HealthCheckResponse;

			const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
			expect(body.timestamp).toMatch(iso8601Regex);
		});

		it("should include service names in status objects", async () => {
			const response = await checkHealth(mockEnv, "test-request-id");
			const body = (await response.json()) as HealthCheckResponse;

			expect(body.services.kv.name).toBe("KV Namespace");
			expect(body.services.r2.name).toBe("R2 Bucket");
			expect(body.services.vectorize.name).toBe("Vectorize Index");
			expect(body.services.d1.name).toBe("D1 Database");
			expect(body.services.ai_search.name).toBe("AI Search");
		});
	});

	describe("Unhealthy state (503 Service Unavailable)", () => {
		it("should return 503 when KV service fails", async () => {
			mockEnv.KV = {
				get: vi.fn().mockRejectedValue(new Error("KV connection failed")),
			} as unknown as KVNamespace;

			const response = await checkHealth(mockEnv, "test-request-id");

			expect(response.status).toBe(503);
		});

		it("should return 503 when R2 service fails", async () => {
			mockEnv.R2 = {
				list: vi.fn().mockRejectedValue(new Error("R2 connection failed")),
			} as unknown as R2Bucket;

			const response = await checkHealth(mockEnv, "test-request-id");

			expect(response.status).toBe(503);
		});

		it("should return 503 when Vectorize service is unavailable", async () => {
			mockEnv.VECTORIZE = undefined as unknown as VectorizeIndex;

			const response = await checkHealth(mockEnv, "test-request-id");

			expect(response.status).toBe(503);
		});

		it("should return 503 when D1 service fails", async () => {
			mockEnv.DB = {
				prepare: vi.fn().mockReturnValue({
					first: vi.fn().mockRejectedValue(new Error("D1 connection failed")),
				}),
			} as unknown as D1Database;

			const response = await checkHealth(mockEnv, "test-request-id");

			expect(response.status).toBe(503);
		});

		it("should return unhealthy status when any service fails", async () => {
			mockEnv.KV = {
				get: vi.fn().mockRejectedValue(new Error("KV connection failed")),
			} as unknown as KVNamespace;

			const response = await checkHealth(mockEnv, "test-request-id");
			const body = await response.json();

			expect(body.details.status).toBe("unhealthy");
		});

		it("should include error message for failed service", async () => {
			mockEnv.KV = {
				get: vi.fn().mockRejectedValue(new Error("KV connection failed")),
			} as unknown as KVNamespace;

			const response = await checkHealth(mockEnv, "test-request-id");
			const body = await response.json();

			expect(body.details.services.kv.status).toBe("failed");
			expect(body.details.services.kv.error).toBe("KV connection failed");
		});

		it("should mark healthy services as ok even when others fail", async () => {
			mockEnv.KV = {
				get: vi.fn().mockRejectedValue(new Error("KV connection failed")),
			} as unknown as KVNamespace;

			const response = await checkHealth(mockEnv, "test-request-id");
			const body = await response.json();

			expect(body.details.services.r2.status).toBe("ok");
			expect(body.details.services.vectorize.status).toBe("ok");
			expect(body.details.services.d1.status).toBe("ok");
		});

		it("should include error response structure when unhealthy", async () => {
			mockEnv.KV = {
				get: vi.fn().mockRejectedValue(new Error("KV connection failed")),
			} as unknown as KVNamespace;

			const response = await checkHealth(mockEnv, "test-request-id");
			const body = await response.json();

			expect(body.error).toBeDefined();
			expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
			expect(body.error.message).toBe("One or more services are unavailable");
			expect(response.status).toBe(503);
		});
	});

	describe("Service validation", () => {
		it("should call KV.get() to validate KV connectivity", async () => {
			await checkHealth(mockEnv, "test-request-id");

			expect(mockEnv.KV.get).toHaveBeenCalledWith("health-check-test");
		});

		it("should call R2.list() to validate R2 connectivity", async () => {
			await checkHealth(mockEnv, "test-request-id");

			expect(mockEnv.R2.list).toHaveBeenCalledWith({ limit: 1 });
		});

		it("should check VECTORIZE binding exists", async () => {
			const response = await checkHealth(mockEnv, "test-request-id");
			const body = (await response.json()) as HealthCheckResponse;

			expect(body.services.vectorize.status).toBe("ok");
		});

		it("should call DB.prepare().first() to validate D1 connectivity", async () => {
			await checkHealth(mockEnv, "test-request-id");

			expect(mockEnv.DB.prepare).toHaveBeenCalledWith("SELECT 1");
		});

		it("should call AI_SEARCH.query() to validate AI Search connectivity", async () => {
			await checkHealth(mockEnv, "test-request-id");

			expect(mockEnv.AI_SEARCH.query).toHaveBeenCalledWith({
				query: "test",
				top_k: 1,
			});
		});
	});

	describe("AI Search integration (Epic 3 Story 3.1)", () => {
		it("should return 503 when AI Search service fails", async () => {
			mockEnv.AI_SEARCH = {
				query: vi.fn().mockRejectedValue(new Error("AI Search unavailable")),
			} as any;

			const response = await checkHealth(mockEnv, "test-request-id");

			expect(response.status).toBe(503);
		});

		it("should include AI Search error in response when it fails", async () => {
			mockEnv.AI_SEARCH = {
				query: vi.fn().mockRejectedValue(new Error("AI Search unavailable")),
			} as any;

			const response = await checkHealth(mockEnv, "test-request-id");
			const body = await response.json();

			expect(body.details.services.ai_search.status).toBe("failed");
			expect(body.details.services.ai_search.error).toBe("AI Search unavailable");
		});

		it("should mark other services as ok when only AI Search fails", async () => {
			mockEnv.AI_SEARCH = {
				query: vi.fn().mockRejectedValue(new Error("AI Search unavailable")),
			} as any;

			const response = await checkHealth(mockEnv, "test-request-id");
			const body = await response.json();

			expect(body.details.services.kv.status).toBe("ok");
			expect(body.details.services.r2.status).toBe("ok");
			expect(body.details.services.d1.status).toBe("ok");
		});
	});

	describe("Request ID handling", () => {
		it("should accept optional request ID parameter", async () => {
			const response = await checkHealth(mockEnv, "test-request-id");

			expect(response.status).toBe(200);
		});

		it("should work without request ID", async () => {
			const response = await checkHealth(mockEnv);

			expect(response.status).toBe(200);
		});
	});
});
