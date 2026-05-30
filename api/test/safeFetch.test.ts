import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchJsonBounded } from "../src/services/safeFetch";

const enc = (s: string) => new TextEncoder().encode(s);

function fakeResp(opts: {
	status?: number;
	contentLength?: string | null;
	chunks?: Uint8Array[] | null;
	text?: string;
}) {
	const { status = 200, contentLength = null, chunks = null, text = "" } = opts;
	return {
		status,
		headers: { get: (h: string) => (h.toLowerCase() === "content-length" ? contentLength : null) },
		body: chunks
			? {
					getReader: () => {
						let i = 0;
						return {
							read: async () =>
								i < chunks.length
									? { done: false, value: chunks[i++] }
									: { done: true, value: undefined },
							cancel: async () => {},
						};
					},
				}
			: null,
		text: async () => text,
	} as any;
}

describe("fetchJsonBounded", () => {
	beforeEach(() => vi.unstubAllGlobals());

	it("parses a valid JSON body under the cap (streaming)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => fakeResp({ chunks: [enc('{"a":'), enc("1}")] })),
		);
		const r = await fetchJsonBounded("https://api.osv.dev/x", { timeoutMs: 1000, maxBytes: 1000 });
		expect(r).toEqual({ a: 1 });
	});

	it("rejects when Content-Length exceeds the cap", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => fakeResp({ contentLength: "999999", chunks: [enc("{}")] })),
		);
		await expect(
			fetchJsonBounded("https://api.osv.dev/x", { timeoutMs: 1000, maxBytes: 1000 }),
		).rejects.toThrow();
	});

	it("rejects when the streamed body exceeds the cap (no Content-Length)", async () => {
		const big = enc("x".repeat(2000));
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => fakeResp({ chunks: [big] })),
		);
		await expect(
			fetchJsonBounded("https://api.osv.dev/x", { timeoutMs: 1000, maxBytes: 1000 }),
		).rejects.toThrow();
	});

	it("rejects a redirect / non-2xx status (no following)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => fakeResp({ status: 302, chunks: [enc("{}")] })),
		);
		await expect(
			fetchJsonBounded("https://api.osv.dev/x", { timeoutMs: 1000, maxBytes: 1000 }),
		).rejects.toThrow();
	});

	it("passes redirect:'manual' to fetch", async () => {
		const spy = vi.fn(async () => fakeResp({ chunks: [enc("{}")] }));
		vi.stubGlobal("fetch", spy);
		await fetchJsonBounded("https://api.osv.dev/x", { timeoutMs: 1000, maxBytes: 1000 });
		expect(spy.mock.calls[0][1].redirect).toBe("manual");
	});
});
