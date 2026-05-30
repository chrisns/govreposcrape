/**
 * Canonical, self-contained version normalisation for the SBOM dependency index.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PARITY CONTRACT                                                          ║
 * ║  This module MUST produce byte-identical sort keys and identical          ║
 * ║  classification to container/version_keys.py. Both are validated against  ║
 * ║  the shared golden vectors in testdata/version-key-vectors.json. Never    ║
 * ║  change one side without the other and without extending the vectors.     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * A sort key is an ASCII string whose lexicographic (code-point) ordering equals
 * the semantic ordering of release versions, so range predicates become plain
 * string range scans in BigQuery. See container/version_keys.py for the full
 * design rationale. The two implementations are intentionally hand-rolled (not
 * library-backed) so they can be guaranteed byte-identical.
 */

// --- canonical constants (MUST match version_keys.py) ---
export const ARITY = 6;
export const WIDTH = 10;
export const SEG_MAX = 10 ** WIDTH - 1;
export const PRE_NUM_WIDTH = 12;

export const EXACT_SCHEMES = new Set([
	"npm",
	"pypi",
	"gem",
	"cargo",
	"golang",
	"nuget",
	"composer",
	"pub",
	"swift",
]);
export const NON_PACKAGE_ECOSYSTEMS = new Set(["github", "githubactions"]);

const RANGE_PREFIX = new Set(["^", "~", ">", "<"]);
const GO_PSEUDO_RE = /-\d{12,14}-[0-9a-f]{12}$/;
const SHA_RE = /^[0-9a-fA-F]{7,40}$/;
const LEADING_NUM_RE = /^(\d+(?:\.\d+)*)/;
const PRE_SPLIT_RE = /[.\-_]/;

export interface NormalizedVersion {
	version_kind:
		| "release"
		| "prerelease"
		| "range"
		| "sha"
		| "branch"
		| "wildcard"
		| "empty"
		| "unparseable";
	comparable: boolean;
	exact_scheme: boolean;
	is_prerelease: boolean;
	epoch: number;
	version_sort_key: string | null;
}

/** Lenient percent-decode matching Python urllib.parse.unquote for ASCII %XX. */
export function unquote(s: string): string {
	return s.replace(/%[0-9A-Fa-f]{2}/g, (m) => String.fromCharCode(parseInt(m.slice(1), 16)));
}

const isDigits = (s: string): boolean => /^\d+$/.test(s);

function result(
	kind: NormalizedVersion["version_kind"],
	comparable: boolean,
	exactScheme: boolean,
	opts: { isPrerelease?: boolean; epoch?: number; sortKey?: string | null } = {},
): NormalizedVersion {
	return {
		version_kind: kind,
		comparable,
		exact_scheme: exactScheme,
		is_prerelease: opts.isPrerelease ?? false,
		epoch: opts.epoch ?? 0,
		version_sort_key: opts.sortKey ?? null,
	};
}

function isRangeOrWildcard(v: string): boolean {
	let s = v.trim();
	if (s.startsWith("=")) s = s.slice(1).trim();
	if (!s) return false;
	if (RANGE_PREFIX.has(s[0])) return true;
	if (v.includes("||") || v.includes(",") || v.includes(" - ")) return true;
	if (s.includes("*")) return true;
	for (const seg of s.split(PRE_SPLIT_RE)) {
		if (seg === "x" || seg === "X") return true;
	}
	return false;
}

function isSha(v: string): boolean {
	if (GO_PSEUDO_RE.test(v)) return true;
	if (isDigits(v)) return false;
	return SHA_RE.test(v);
}

function splitPre(s: string): string[] {
	return s
		.split(PRE_SPLIT_RE)
		.filter((t) => t !== "")
		.map((t) => t.toLowerCase());
}

type Parsed = { epoch: number; release: number[]; isPre: boolean; preTags: string[] } | null;

function parseSemverFamily(v: string): Parsed {
	const core = v.split("+", 1)[0];
	const dashIdx = core.indexOf("-");
	const rel = dashIdx === -1 ? core : core.slice(0, dashIdx);
	const pre = dashIdx === -1 ? "" : core.slice(dashIdx + 1);
	const release: number[] = [];
	for (const seg of rel.split(".")) {
		if (!isDigits(seg)) return null;
		release.push(parseInt(seg, 10));
	}
	if (release.length === 0) return null;
	const isPre = dashIdx !== -1 && pre !== "";
	return { epoch: 0, release, isPre, preTags: isPre ? splitPre(pre) : [] };
}

function parsePypi(v: string): Parsed {
	let s = v.toLowerCase().trim();
	let epoch = 0;
	const bang = s.indexOf("!");
	if (bang !== -1) {
		const e = s.slice(0, bang);
		epoch = isDigits(e) ? parseInt(e, 10) : 0;
		s = s.slice(bang + 1);
	}
	s = s.split("+", 1)[0];
	const m = LEADING_NUM_RE.exec(s);
	if (!m) return null;
	const release = m[1].split(".").map((x) => parseInt(x, 10));
	const rest = s.slice(m[0].length);
	let isPre = false;
	let preTags: string[] = [];
	if (rest && /^[._-]?(a|b|c|rc|alpha|beta|pre|preview|dev)/.test(rest)) {
		isPre = true;
		preTags = splitPre(rest);
	}
	return { epoch, release, isPre, preTags };
}

function parseGem(v: string): Parsed {
	const release: number[] = [];
	const preSegs: string[] = [];
	let isPre = false;
	for (const seg of v.split(".")) {
		if (isDigits(seg) && !isPre) {
			release.push(parseInt(seg, 10));
		} else {
			isPre = true;
			preSegs.push(seg);
		}
	}
	if (release.length === 0) return null;
	return { epoch: 0, release, isPre, preTags: preSegs.length ? splitPre(preSegs.join(".")) : [] };
}

function parseMaven(v: string): Parsed {
	const m = LEADING_NUM_RE.exec(v);
	if (!m) return null;
	const release = m[1].split(".").map((x) => parseInt(x, 10));
	const rest = v.slice(m[0].length).toLowerCase();
	const isPre = /(alpha|beta|rc|m\d|snapshot|cr\d|milestone|preview)/.test(rest);
	return { epoch: 0, release, isPre, preTags: isPre ? splitPre(rest) : [] };
}

function parseVersionByEco(eco: string, v: string): Parsed {
	if (["npm", "cargo", "golang", "nuget", "composer", "pub", "swift"].includes(eco)) {
		return parseSemverFamily(v);
	}
	if (eco === "pypi") return parsePypi(v);
	if (eco === "gem") return parseGem(v);
	if (eco === "maven") return parseMaven(v);
	const parsed = parseSemverFamily(v);
	if (parsed !== null) return parsed;
	return parsePypi(v);
}

export function buildSortKey(
	epoch: number,
	release: number[],
	isPrerelease: boolean,
	preTags: string[],
): string {
	const epochPart = String(Math.min(Math.max(epoch, 0), 9999)).padStart(4, "0");
	const segs: string[] = [];
	for (let i = 0; i < ARITY; i++) {
		let val = i < release.length ? release[i] : 0;
		val = Math.min(Math.max(val, 0), SEG_MAX);
		segs.push(String(val).padStart(WIDTH, "0"));
	}
	const releasePart = segs.join(".");
	let disc: string;
	if (!isPrerelease) {
		disc = "~";
	} else {
		const norm: string[] = [];
		for (const t of preTags) {
			if (isDigits(t)) norm.push("0" + t.padStart(PRE_NUM_WIDTH, "0"));
			else norm.push("1" + t);
		}
		disc = norm.length ? "-" + norm.join(".") : "-";
	}
	return `${epochPart}!${releasePart}.${disc}`;
}

export function normalizeVersion(
	ecosystem: string,
	rawVersion: string | null | undefined,
): NormalizedVersion {
	const eco = (ecosystem || "").toLowerCase();
	const exactScheme = EXACT_SCHEMES.has(eco);
	const v = unquote(rawVersion ?? "").trim();

	if (v === "") return result("empty", false, exactScheme);
	if (eco === "github") return result("branch", false, false);
	if (eco === "githubactions") {
		return result(isRangeOrWildcard(v) ? "wildcard" : "branch", false, false);
	}
	if (isRangeOrWildcard(v)) return result("range", false, exactScheme);

	let vv = v;
	if (vv.length > 1 && (vv[0] === "v" || vv[0] === "V") && /\d/.test(vv[1])) vv = vv.slice(1);
	if (vv.startsWith("=")) vv = vv.slice(1).trim();

	if (isSha(vv)) return result("sha", false, exactScheme);

	const parsed = parseVersionByEco(eco, vv);
	if (parsed === null) return result("unparseable", false, exactScheme);

	const key = buildSortKey(parsed.epoch, parsed.release, parsed.isPre, parsed.preTags);
	return result(parsed.isPre ? "prerelease" : "release", true, exactScheme, {
		isPrerelease: parsed.isPre,
		epoch: parsed.epoch,
		sortKey: key,
	});
}

export function parsePurl(
	purl: string,
): { ecosystem: string; packageName: string; version: string } | null {
	if (!purl || !purl.startsWith("pkg:")) return null;
	let body = purl.slice(4);
	body = body.split("#", 1)[0].split("?", 1)[0];
	const atIdx = body.lastIndexOf("@");
	let namePart: string;
	let version: string;
	if (atIdx !== -1) {
		namePart = body.slice(0, atIdx);
		version = body.slice(atIdx + 1);
	} else {
		namePart = body;
		version = "";
	}
	const slashIdx = namePart.indexOf("/");
	const eco = unquote(slashIdx === -1 ? namePart : namePart.slice(0, slashIdx)).toLowerCase();
	const packageName = unquote(slashIdx === -1 ? "" : namePart.slice(slashIdx + 1));
	return { ecosystem: eco, packageName, version: unquote(version) };
}

export function packageKey(ecosystem: string, packageName: string): string {
	const eco = (ecosystem || "").toLowerCase();
	const name = packageName || "";
	if (eco === "pypi") return name.replace(/[-_.]+/g, "-").toLowerCase();
	return name.toLowerCase();
}

// ───────────────────────── range predicate parser (query side) ─────────────────────────

export type RangeComparator = { op: ">=" | ">" | "<" | "<=" | "="; key: string };

/** Parse up to 3 numeric segments from a token, treating x/X/* as absent. */
function partsOf(token: string): number[] {
	const out: number[] = [];
	for (const seg of token.split(".")) {
		if (seg === "x" || seg === "X" || seg === "*" || seg === "") break;
		if (!isDigits(seg)) break;
		out.push(parseInt(seg, 10));
	}
	return out;
}

const keyOf = (parts: number[]): string => buildSortKey(0, parts, false, []);

/** Expand a caret/tilde/bare token into [lo, hiExclusive] release tuples. */
function expandRange(prefix: string, token: string): [number[], number[]] | null {
	const p = partsOf(token);
	if (p.length === 0) return null;
	const [maj = 0, min = 0, pat = 0] = p;
	const lo = [maj, min, pat];
	let hi: number[];
	if (prefix === "^") {
		if (maj > 0 || p.length === 1) hi = [maj + 1, 0, 0];
		else if (min > 0 || p.length === 2) hi = [maj, min + 1, 0];
		else hi = [maj, min, pat + 1];
	} else if (prefix === "~") {
		if (p.length >= 2) hi = [maj, min + 1, 0];
		else hi = [maj + 1, 0, 0];
	} else {
		// bare partial: "1" -> >=1.0.0 <2.0.0 ; "1.2" -> >=1.2.0 <1.3.0
		if (p.length === 1) hi = [maj + 1, 0, 0];
		else if (p.length === 2) hi = [maj, min + 1, 0];
		else return null; // full 3-part bare is exact, handled by caller
	}
	return [lo, hi];
}

export class VersionRangeError extends Error {}

/**
 * Parse an npm-style version range predicate into a flat list of comparators
 * over the sort key (ANDed). Supported grammar:
 *   <2  <=2.1  >1.0  >=1.2.3  =1.0.0  1.0.0  1  1.2  1.x  ^1.2.3  ~1.2
 * Multiple space/comma separated comparators are ANDed. '||' is unsupported.
 */
export function parseVersionRange(input: string): RangeComparator[] {
	const raw = (input || "").trim();
	if (!raw) throw new VersionRangeError("empty version_range");
	// D1: bound the work an unauthenticated caller can trigger. Without these caps a
	// huge version_range builds an enormous comparator array evaluated against every
	// fetched row. A realistic range is well under these limits.
	if (raw.length > 1000) throw new VersionRangeError("version_range too long (max 1000 chars)");
	if (raw.includes("||")) {
		throw new VersionRangeError("OR ranges ('||') are not supported");
	}
	const tokens = raw.split(/[\s,]+/).filter(Boolean);
	if (tokens.length > 20) throw new VersionRangeError("too many version constraints (max 20)");
	const comparators: RangeComparator[] = [];
	for (const tok of tokens) {
		let m: RegExpExecArray | null;
		if ((m = /^(>=|<=|>|<|=)(.+)$/.exec(tok))) {
			const op = m[1] as RangeComparator["op"];
			const parts = partsOf(m[2].trim());
			if (parts.length === 0) throw new VersionRangeError(`invalid version in "${tok}"`);
			comparators.push({ op, key: keyOf(parts) });
			continue;
		}
		if (tok[0] === "^" || tok[0] === "~") {
			const expanded = expandRange(tok[0], tok.slice(1));
			if (!expanded) throw new VersionRangeError(`invalid range "${tok}"`);
			comparators.push({ op: ">=", key: keyOf(expanded[0]) });
			comparators.push({ op: "<", key: keyOf(expanded[1]) });
			continue;
		}
		// bare token
		const parts = partsOf(tok);
		if (parts.length === 0) throw new VersionRangeError(`invalid version "${tok}"`);
		const hasWildcard = /[xX*]/.test(tok);
		if (parts.length >= 3 && !hasWildcard) {
			// D6: a fully-specified bare token (3+ numeric parts, e.g. nuget "1.0.0.0")
			// is an exact match, consistent with "=1.0.0.0" and normalizeVersion.
			comparators.push({ op: "=", key: keyOf(parts) });
		} else {
			const expanded = expandRange("", tok);
			if (!expanded) throw new VersionRangeError(`invalid range "${tok}"`);
			comparators.push({ op: ">=", key: keyOf(expanded[0]) });
			comparators.push({ op: "<", key: keyOf(expanded[1]) });
		}
	}
	if (comparators.length === 0) throw new VersionRangeError("no comparators parsed");
	return comparators;
}
