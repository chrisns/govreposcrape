import { describe, it, expect, beforeEach, vi } from "vitest";
import { rateLimit, __resetRateLimit } from "../src/middleware/rateLimit";

function mockReqRes(ip: string) {
	const req: any = { headers: { "x-forwarded-for": ip }, socket: {} };
	const res: any = {
		statusCode: 200,
		headers: {} as Record<string, string>,
		body: undefined,
		setHeader(k: string, v: string) {
			this.headers[k] = v;
		},
		status(c: number) {
			this.statusCode = c;
			return this;
		},
		json(b: any) {
			this.body = b;
			return this;
		},
	};
	return { req, res };
}

describe("rateLimit middleware", () => {
	beforeEach(() => __resetRateLimit());

	it("allows requests under the limit and blocks over it", () => {
		// default RATE_LIMIT_MAX=120/min
		const ip = "203.0.113.7";
		let allowed = 0;
		let blocked = 0;
		for (let i = 0; i < 130; i++) {
			const { req, res } = mockReqRes(ip);
			const next = vi.fn();
			rateLimit(req, res, next);
			if (next.mock.calls.length) allowed++;
			else if (res.statusCode === 429) blocked++;
		}
		expect(allowed).toBe(120);
		expect(blocked).toBe(10);
	});

	it("isolates buckets per client IP", () => {
		const { req: r1, res: s1 } = mockReqRes("198.51.100.1");
		const { req: r2, res: s2 } = mockReqRes("198.51.100.2");
		const n1 = vi.fn();
		const n2 = vi.fn();
		// exhaust IP1
		for (let i = 0; i < 121; i++) {
			const { req, res } = mockReqRes("198.51.100.1");
			rateLimit(req, res, vi.fn());
		}
		rateLimit(r1, s1, n1);
		rateLimit(r2, s2, n2);
		expect(s1.statusCode).toBe(429); // IP1 still blocked
		expect(n2).toHaveBeenCalled(); // IP2 unaffected
	});

	it("sets Retry-After header when blocked", () => {
		for (let i = 0; i < 120; i++)
			rateLimit(mockReqRes("192.0.2.9").req, mockReqRes("192.0.2.9").res, vi.fn());
		// The above creates fresh res each call; do a clean exhaust on one res chain:
		__resetRateLimit();
		let lastRes: any;
		for (let i = 0; i < 121; i++) {
			const { req, res } = mockReqRes("192.0.2.10");
			rateLimit(req, res, vi.fn());
			lastRes = res;
		}
		expect(lastRes.statusCode).toBe(429);
		expect(lastRes.headers["Retry-After"]).toBeDefined();
	});
});
