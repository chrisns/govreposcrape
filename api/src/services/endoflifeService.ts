/**
 * endoflifeService — end-of-life detection for well-known frameworks via
 * endoflife.date (https://endoflife.date). Used to flag UK-gov repos running
 * EOL/unsupported framework versions (issue #198, capability 3).
 *
 * Only a curated allow-list of (ecosystem, package_key) -> endoflife product is
 * queried (fixed host, product slug from a constant map → no SSRF). Responses are
 * read with a hard byte cap and no redirect following (safeFetch); the cycles array
 * is length-guarded; the cache is bounded; failures degrade gracefully.
 */
import { fetchJsonBounded } from "./safeFetch";
import { BoundedCache } from "./concurrency";

const EOL_TIMEOUT_MS = parseInt(process.env.EOL_TIMEOUT_MS || "6000", 10);
const EOL_TTL_MS = parseInt(process.env.EOL_TTL_MS || "43200000", 10); // 12h
const EOL_MAX_BYTES = parseInt(process.env.EOL_MAX_BYTES || "2097152", 10); // 2 MB
const EOL_MAX_CYCLES = 5000;

// (ecosystem|package_key) -> endoflife.date product slug
const PRODUCT_MAP: Record<string, string> = {
	"pypi|django": "django",
	"pypi|flask": "flask",
	"pypi|fastapi": "fastapi",
	"gem|rails": "rails",
	"npm|@angular/core": "angular",
	"npm|vue": "vue",
	"npm|express": "express",
	"npm|next": "nextjs",
	"maven|org.springframework/spring-core": "spring-framework",
	"maven|org.springframework.boot/spring-boot": "spring-boot",
	"composer|laravel/framework": "laravel",
	"composer|symfony/symfony": "symfony",
};

export function eolProductFor(ecosystem: string, packageKey: string): string | null {
	return PRODUCT_MAP[`${ecosystem}|${packageKey}`] || null;
}

interface Cycle {
	cycle: string;
	eol: string | boolean | null;
	latest?: string;
}
const _cache = new BoundedCache<Cycle[]>(100, EOL_TTL_MS);

export function __resetEolCache(): void {
	_cache.clear();
}

async function cyclesFor(product: string): Promise<Cycle[] | null> {
	const cached = _cache.get(product);
	if (cached) return cached;
	try {
		const data = await fetchJsonBounded(
			`https://endoflife.date/api/${encodeURIComponent(product)}.json`,
			{
				timeoutMs: EOL_TIMEOUT_MS,
				maxBytes: EOL_MAX_BYTES,
			},
		);
		if (!Array.isArray(data) || data.length > EOL_MAX_CYCLES) return null;
		_cache.set(product, data as Cycle[]);
		return data as Cycle[];
	} catch {
		return null;
	}
}

export interface EolStatus {
	product: string;
	cycle: string | null;
	eol: string | boolean | null;
	is_eol: boolean | null; // null = unknown
}

/** Resolve EOL status for a concrete framework version. Returns null if not mappable. */
export async function eolStatus(
	ecosystem: string,
	packageKey: string,
	version: string,
): Promise<EolStatus | null> {
	const product = eolProductFor(ecosystem, packageKey);
	if (!product || !version) return null;
	const cycles = await cyclesFor(product);
	if (!cycles) return { product, cycle: null, eol: null, is_eol: null };

	// Match the most specific cycle that is a dotted prefix of the version (e.g. "5.2"
	// matches 5.2.14). Longest cycle first so "1.11" is preferred over "1.1".
	const sorted = cycles.slice().sort((a, b) => String(b.cycle).length - String(a.cycle).length);
	const match = sorted.find((c) => {
		const cy = String(c.cycle);
		return version === cy || version.startsWith(cy + ".");
	});
	if (!match) return { product, cycle: null, eol: null, is_eol: null };

	let isEol: boolean | null;
	if (match.eol === true) isEol = true;
	else if (match.eol === false || match.eol === null) isEol = false;
	else {
		const d = new Date(match.eol);
		isEol = isNaN(d.getTime()) ? null : d.getTime() < Date.now();
	}
	return { product, cycle: match.cycle, eol: match.eol, is_eol: isEol };
}
