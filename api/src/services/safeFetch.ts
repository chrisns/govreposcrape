/**
 * fetchJsonBounded — hardened JSON fetch for outbound calls to external services
 * (OSV.dev, endoflife.date) from a public, memory-constrained (512Mi) Cloud Run API.
 *
 * Guards (defence-in-depth even though endpoints are fixed/trusted):
 *  - request timeout via AbortController
 *  - redirect: "manual" + reject any non-2xx (no following attacker/CDN redirects,
 *    DNS-rebinding, metadata-server pivots)
 *  - reject on Content-Length over the cap AND stream-read with a hard byte cap so a
 *    missing/lying Content-Length or a huge body cannot exhaust memory before parse.
 */
export interface SafeFetchOpts {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	timeoutMs: number;
	maxBytes: number;
}

export async function fetchJsonBounded(url: string, opts: SafeFetchOpts): Promise<any> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
	try {
		const resp = await fetch(url, {
			method: opts.method,
			headers: opts.headers,
			body: opts.body,
			signal: ctrl.signal,
			redirect: "manual", // never follow redirects to unexpected hosts
		});
		if (resp.status < 200 || resp.status >= 300) {
			throw new Error(`HTTP ${resp.status} from ${new URL(url).host}`);
		}
		const cl = resp.headers.get("content-length");
		if (cl && Number(cl) > opts.maxBytes) {
			throw new Error("response exceeds size limit (content-length)");
		}
		if (!resp.body) {
			const txt = await resp.text();
			if (txt.length > opts.maxBytes) throw new Error("response exceeds size limit");
			return JSON.parse(txt);
		}
		const reader = resp.body.getReader();
		const chunks: Uint8Array[] = [];
		let received = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				received += value.length;
				if (received > opts.maxBytes) {
					await reader.cancel();
					throw new Error("response exceeds size limit (stream)");
				}
				chunks.push(value);
			}
		}
		const buf = new Uint8Array(received);
		let off = 0;
		for (const c of chunks) {
			buf.set(c, off);
			off += c.length;
		}
		return JSON.parse(new TextDecoder().decode(buf));
	} finally {
		clearTimeout(timer);
	}
}
