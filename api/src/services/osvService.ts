/**
 * osvService — real-time vulnerability matching against OSV.dev (https://osv.dev).
 *
 * OSV is a free, PURL-aware vulnerability database. We batch-query it at request
 * time for a BOUNDED set of (ecosystem, name, version) tuples (a package, a repo,
 * or one org's dependencies) so CVE data is always current without a heavy daily
 * precompute. Results are cached (bounded, TTL).
 *
 * Hardening: only two fixed OSV endpoints are contacted (user data travels in the
 * JSON body / OSV-supplied ids, never the URL host/path → no SSRF); responses are
 * read with a hard byte cap and no redirect following (see safeFetch); batch size,
 * total query count, and outbound concurrency are all capped; caches are bounded;
 * failures degrade gracefully (the tool reports OSV was unavailable).
 */
import { fetchJsonBounded } from "./safeFetch";
import { BoundedCache, mapLimit } from "./concurrency";

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns/";
const OSV_BATCH_MAX = 1000; // OSV's documented per-batch limit
const OSV_TOTAL_CAP = parseInt(process.env.OSV_TOTAL_CAP || "1500", 10); // max tuples we'll resolve per call
const OSV_TIMEOUT_MS = parseInt(process.env.OSV_TIMEOUT_MS || "8000", 10);
const OSV_DETAIL_CONCURRENCY = parseInt(process.env.OSV_DETAIL_CONCURRENCY || "8", 10);
const OSV_MAX_BYTES_BATCH = parseInt(process.env.OSV_MAX_BYTES_BATCH || "33554432", 10); // 32 MB
const OSV_MAX_BYTES_DETAIL = parseInt(process.env.OSV_MAX_BYTES_DETAIL || "4194304", 10); // 4 MB
const BATCH_TTL_MS = parseInt(process.env.OSV_BATCH_TTL_MS || "3600000", 10); // 1h
const DETAIL_TTL_MS = parseInt(process.env.OSV_DETAIL_TTL_MS || "21600000", 10); // 6h
const MAX_ALIASES = 200;

// our PURL ecosystem -> OSV ecosystem name (only those OSV supports). Others skipped.
const OSV_ECOSYSTEM: Record<string, string> = {
	npm: "npm",
	pypi: "PyPI",
	gem: "RubyGems",
	maven: "Maven",
	nuget: "NuGet",
	golang: "Go",
	cargo: "crates.io",
	composer: "Packagist",
	pub: "Pub",
};

export function osvSupportsEcosystem(ecosystem: string): boolean {
	return ecosystem in OSV_ECOSYSTEM;
}

/** OSV package name: Maven uses group:artifact; we store group/artifact. */
function osvName(ecosystem: string, packageName: string): string {
	if (ecosystem === "maven") return packageName.replace("/", ":");
	return packageName;
}

export interface VulnRef {
	id: string;
	cve: string | null;
	summary: string;
	severity: string;
	url: string;
}

const _batchCache = new BoundedCache<Record<string, string[]>>(200, BATCH_TTL_MS);
const _detailCache = new BoundedCache<VulnRef>(2000, DETAIL_TTL_MS);

export function __resetOsvCache(): void {
	_batchCache.clear();
	_detailCache.clear();
}

export interface OsvQuery {
	ecosystem: string; // our ecosystem
	name: string; // our package_name
	version: string; // concrete version
}

/**
 * Batch-resolve vulnerability IDs for the given tuples. Returns one entry per input
 * tuple (index-aligned). Unsupported ecosystems / non-concrete versions get [].
 */
export async function resolveVulnIds(
	queries: OsvQuery[],
): Promise<{ perQuery: string[][]; osvAvailable: boolean; truncated: boolean }> {
	const perQuery: string[][] = queries.map(() => []);
	// build OSV queries only for supported ecosystems + concrete versions
	const idx: number[] = [];
	const osvQueries: any[] = [];
	for (let i = 0; i < queries.length; i++) {
		const q = queries[i];
		if (!osvSupportsEcosystem(q.ecosystem) || !q.version) continue;
		if (osvQueries.length >= OSV_TOTAL_CAP) break;
		idx.push(i);
		osvQueries.push({
			package: { ecosystem: OSV_ECOSYSTEM[q.ecosystem], name: osvName(q.ecosystem, q.name) },
			version: q.version,
		});
	}
	const truncated = osvQueries.length >= OSV_TOTAL_CAP && queries.length > OSV_TOTAL_CAP;
	if (osvQueries.length === 0) return { perQuery, osvAvailable: true, truncated: false };

	// Per-query package identity, aligned to osvQueries/idx. The cache stores a
	// map of identity -> vuln ids (NOT a positional array), so a cache hit is
	// rebuilt for THIS call's ordering/size — correct regardless of row order.
	const identities = osvQueries.map((q) => `${q.package.ecosystem}|${q.package.name}|${q.version}`);
	const cacheKey = JSON.stringify([...new Set(identities)].sort());

	let identityMap = _batchCache.get(cacheKey);
	if (!identityMap) {
		identityMap = {};
		try {
			for (let start = 0; start < osvQueries.length; start += OSV_BATCH_MAX) {
				const chunk = osvQueries.slice(start, start + OSV_BATCH_MAX);
				const data = await fetchJsonBounded(OSV_BATCH_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ queries: chunk }),
					timeoutMs: OSV_TIMEOUT_MS,
					maxBytes: OSV_MAX_BYTES_BATCH,
				});
				const results = Array.isArray(data?.results) ? data.results : [];
				// OSV returns results index-aligned to the request; only map within bounds.
				const n = Math.min(chunk.length, results.length);
				for (let j = 0; j < n; j++) {
					const v = results[j]?.vulns;
					identityMap[identities[start + j]] = Array.isArray(v)
						? v.map((x: any) => x?.id).filter((s: any) => typeof s === "string")
						: [];
				}
			}
			_batchCache.set(cacheKey, identityMap);
		} catch {
			return { perQuery, osvAvailable: false, truncated };
		}
	}
	// rebuild perQuery for this call's exact ordering from the identity map
	for (let k = 0; k < idx.length; k++) {
		perQuery[idx[k]] = identityMap[identities[k]] || [];
	}
	return { perQuery, osvAvailable: true, truncated };
}

function parseSeverity(detail: any): string {
	const ds = detail?.database_specific?.severity;
	if (typeof ds === "string" && ds) return ds.toUpperCase();
	const sev = detail?.severity;
	if (Array.isArray(sev) && sev.length && typeof sev[0]?.score === "string") return sev[0].score; // CVSS vector
	return "UNKNOWN";
}

/** Fetch (cached, concurrency-capped) details for vuln ids: CVE alias, summary, severity. */
export async function vulnDetails(ids: string[]): Promise<Record<string, VulnRef>> {
	const out: Record<string, VulnRef> = {};
	const toFetch: string[] = [];
	for (const id of ids) {
		const c = _detailCache.get(id);
		if (c) out[id] = c;
		else toFetch.push(id);
	}
	await mapLimit(toFetch, OSV_DETAIL_CONCURRENCY, async (id) => {
		try {
			const d = await fetchJsonBounded(OSV_VULN_URL + encodeURIComponent(id), {
				timeoutMs: OSV_TIMEOUT_MS,
				maxBytes: OSV_MAX_BYTES_DETAIL,
			});
			const aliases = Array.isArray(d?.aliases) ? d.aliases.slice(0, MAX_ALIASES) : [];
			const cve = aliases.find((a: any) => typeof a === "string" && /^CVE-/i.test(a)) || null;
			const ref: VulnRef = {
				id,
				cve,
				summary: String(d?.summary || d?.details || "").slice(0, 200),
				severity: parseSeverity(d),
				url: `https://osv.dev/vulnerability/${id}`,
			};
			out[id] = ref;
			_detailCache.set(id, ref);
		} catch {
			out[id] = {
				id,
				cve: null,
				summary: "",
				severity: "UNKNOWN",
				url: `https://osv.dev/vulnerability/${id}`,
			};
		}
		return null;
	});
	return out;
}
