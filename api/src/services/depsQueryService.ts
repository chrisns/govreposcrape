/**
 * depsQueryService — structured dependency queries over the BigQuery dependency
 * index built from the aggregate CycloneDX SBOM (see container/build_deps_index.py).
 *
 * Security / cost posture (public, no-auth API):
 *   • Every query is PARAMETERISED — no user value is concatenated into SQL. The
 *     only inlined values are integers that have passed numeric clamping.
 *   • maximumBytesBilled is set on EVERY job (per-path), so a pathological query
 *     fails rather than billing. BigQuery enforces this against the pre-flight
 *     ESTIMATE, so caps clear the legitimate estimate; actual billed is far less
 *     (clustering prunes a package fetch to ~40 MB).
 *   • All inputs are validated (allowlists, length caps, charset) before use.
 *
 * Design: the hot "who uses X" path fetches only (repo_full_name, version_raw) —
 * the cheapest cluster-pruned columns — and performs ALL version classification,
 * range evaluation, ranking and pagination in JS via versionKeys.ts (the same
 * golden-tested logic used at ingest). This avoids scanning the fat version_sort_key
 * column and removes any BigQuery-side version-comparison dependency.
 */
import { BigQuery, Query } from "@google-cloud/bigquery";
import {
	packageKey,
	parseVersionRange,
	normalizeVersion,
	EXACT_SCHEMES,
	RangeComparator,
	VersionRangeError,
} from "./versionKeys";
import { resolveVulnIds, vulnDetails, OsvQuery, VulnRef } from "./osvService";
import { eolStatus } from "./endoflifeService";
import { mapLimit } from "./concurrency";

const PROJECT = process.env.GOOGLE_PROJECT_ID || "govreposcrape";
const DATASET = process.env.DEPS_DATASET || "govreposcrape_deps";
const LOCATION = process.env.DEPS_LOCATION || "US";
// Caps clear the legitimate pre-flight estimate; actual billed is far lower.
const MAX_BYTES_FACT = process.env.DEPS_MAX_BYTES_FACT || "300000000"; // 300 MB (package/repo scans)
const MAX_BYTES_SUMMARY = process.env.DEPS_MAX_BYTES_SUMMARY || "60000000"; // 60 MB (materialised tables)
const QUERY_TIMEOUT_MS = parseInt(process.env.DEPS_QUERY_TIMEOUT_MS || "8000", 10);
// Safety bound on rows pulled back for app-side processing (max repos ≈ 15.6k).
const FETCH_ROW_CAP = parseInt(process.env.DEPS_FETCH_ROW_CAP || "100000", 10);
// Response/compute cache (data refreshes ~daily, so a few-minute TTL is safe and
// collapses repeated identical queries + amortises the per-package sort).
const CACHE_TTL_MS = parseInt(process.env.DEPS_CACHE_TTL_MS || "300000", 10); // 5 min
const CACHE_MAX_ENTRIES = parseInt(process.env.DEPS_CACHE_MAX_ENTRIES || "500", 10);

const _cache = new Map<string, { value: any; expires: number }>();
function cacheGet(key: string): any {
	const e = _cache.get(key);
	if (e && e.expires > Date.now()) return e.value;
	if (e) _cache.delete(key);
	return undefined;
}
function cacheSet(key: string, value: any): void {
	if (_cache.size >= CACHE_MAX_ENTRIES) {
		const oldest = _cache.keys().next().value; // insertion-order eviction
		if (oldest !== undefined) _cache.delete(oldest);
	}
	_cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}
/** Clear the in-memory response cache (used by tests). */
export function clearDepsCache(): void {
	_cache.clear();
}

export const KNOWN_ECOSYSTEMS = new Set([
	"npm",
	"pypi",
	"gem",
	"maven",
	"nuget",
	"golang",
	"cargo",
	"composer",
	"pub",
	"swift",
	"apk",
	"githubactions",
	"github",
]);

const PACKAGE_RE = /^[A-Za-z0-9._@/+-]{1,214}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/;
const LICENSE_RE = /^[A-Za-z0-9._+-]{1,64}$/;

export class DepsInputError extends Error {}

export interface SearchDependencyArgs {
	package: string;
	ecosystem?: string;
	version_range?: string;
	include_prereleases?: boolean;
	limit?: number;
	offset?: number;
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
	const n = typeof v === "number" ? Math.floor(v) : parseInt(String(v ?? ""), 10);
	if (!Number.isFinite(n)) return def;
	return Math.min(Math.max(n, min), max);
}

function validatePackage(p: unknown): string {
	if (typeof p !== "string") throw new DepsInputError("package must be a string");
	const s = p.trim();
	if (!s) throw new DepsInputError("package is required");
	if (!PACKAGE_RE.test(s)) throw new DepsInputError("package contains invalid characters");
	return s;
}

function validateEcosystem(e: unknown, required = false): string | undefined {
	if (e === undefined || e === null || e === "") {
		if (required) throw new DepsInputError("ecosystem is required");
		return undefined;
	}
	if (typeof e !== "string") throw new DepsInputError("ecosystem must be a string");
	const s = e.trim().toLowerCase();
	if (!KNOWN_ECOSYSTEMS.has(s)) {
		throw new DepsInputError(
			`unknown ecosystem "${s}". Known: ${[...KNOWN_ECOSYSTEMS].join(", ")}`,
		);
	}
	return s;
}

function validateRepo(r: unknown): string {
	if (typeof r !== "string") throw new DepsInputError("repo_full_name must be a string");
	const s = r.trim();
	if (!REPO_RE.test(s)) throw new DepsInputError('repo_full_name must look like "org/repo"');
	return s;
}

const ORG_RE = /^[A-Za-z0-9._-]{1,100}$/;
function validateOrg(o: unknown): string {
	if (typeof o !== "string") throw new DepsInputError("org must be a string");
	const s = o.trim();
	if (!ORG_RE.test(s)) throw new DepsInputError("org has invalid characters");
	return s;
}

/** Clustered-prefix range bounds for one org over dependencies_by_repo (repo_full_name = "org/repo"). */
function orgBounds(org: string): { lo: string; hi: string } {
	return { lo: `${org}/`, hi: `${org}0` }; // '0' (0x30) is the next code point after '/' (0x2F)
}

const COPYLEFT_RE = /^(a?gpl|lgpl|mpl|epl|cddl|eupl|osl|cecill)/i;
function isCopyleft(licenseId: string | null | undefined): boolean {
	return !!licenseId && COPYLEFT_RE.test(licenseId);
}

export const COVERAGE_NOTE =
	"The dependency index covers UK-gov repositories that have a generatable SBOM " +
	"(~15.6k of ~25k in the feed). 'No results' may mean 'no SBOM', not 'no dependency'.";

/** Compare two nullable sort keys for DESC ordering with NULLs last. */
function cmpKeyDesc(a: string | null, b: string | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a < b ? 1 : a > b ? -1 : 0;
}

function satisfiesAll(key: string, comparators: RangeComparator[]): boolean {
	for (const c of comparators) {
		switch (c.op) {
			case ">=":
				if (!(key >= c.key)) return false;
				break;
			case ">":
				if (!(key > c.key)) return false;
				break;
			case "<":
				if (!(key < c.key)) return false;
				break;
			case "<=":
				if (!(key <= c.key)) return false;
				break;
			case "=":
				if (key !== c.key) return false;
				break;
		}
	}
	return true;
}

function toEntry(repoFullName: string, version: string, kind: string): any {
	const slash = repoFullName.indexOf("/");
	const org = slash === -1 ? "" : repoFullName.slice(0, slash);
	const repo = slash === -1 ? repoFullName : repoFullName.slice(slash + 1);
	return {
		repo_full_name: repoFullName,
		org,
		repo,
		repo_url: `https://github.com/${repoFullName}`,
		version,
		version_kind: kind,
	};
}

export class DepsQueryService {
	private bq: BigQuery;
	private current: string;
	private popularity: string;
	private licenseRollup: string;
	private byRepo: string;

	constructor() {
		this.bq = new BigQuery({ projectId: PROJECT });
		this.current = `\`${PROJECT}.${DATASET}.current\``;
		this.popularity = `\`${PROJECT}.${DATASET}.pkg_popularity\``;
		this.licenseRollup = `\`${PROJECT}.${DATASET}.license_rollup\``;
		this.byRepo = `\`${PROJECT}.${DATASET}.dependencies_by_repo\``;
	}

	private async query<T = any>(
		sql: string,
		params: Record<string, unknown>,
		maxBytes: string,
		types?: Record<string, unknown>,
	): Promise<T[]> {
		const options: Query = {
			query: sql,
			params,
			...(types ? { types: types as any } : {}),
			location: LOCATION,
			maximumBytesBilled: maxBytes,
			jobTimeoutMs: QUERY_TIMEOUT_MS,
			useLegacySql: false,
			labels: { feature: "deps_index" },
		};
		const [job] = await this.bq.createQueryJob(options);
		const [rows] = await job.getQueryResults({ timeoutMs: QUERY_TIMEOUT_MS });
		return rows as T[];
	}

	async healthCheck(): Promise<boolean> {
		try {
			await this.query(`SELECT 1 AS ok FROM ${this.popularity} LIMIT 1`, {}, MAX_BYTES_SUMMARY);
			return true;
		} catch {
			return false;
		}
	}

	/** Exhaustive list of repos depending on a package, optionally version-constrained. */
	async searchDependency(args: SearchDependencyArgs): Promise<any> {
		const pkg = validatePackage(args.package);
		const ecosystem = validateEcosystem(args.ecosystem);
		const includePre = Boolean(args.include_prereleases);
		const limit = clampInt(args.limit, 200, 1, 500);
		const offset = clampInt(args.offset, 0, 0, 100000);

		// No ecosystem → per-ecosystem breakdown (from the small popularity table);
		// version ranges are refused (the same name can mean different schemes).
		if (!ecosystem) {
			if (args.version_range) {
				throw new DepsInputError(
					"version_range requires an ecosystem (the same name can exist in npm, pypi, ... with different version schemes). Re-query with ecosystem set.",
				);
			}
			const bkey = `bd:${pkg.toLowerCase()}`;
			const hit = cacheGet(bkey);
			if (hit) return hit;
			const keys = Array.from(
				new Set([...KNOWN_ECOSYSTEMS].map((e) => packageKey(e, pkg)).concat(pkg.toLowerCase())),
			);
			const rows = await this.query(
				`SELECT ecosystem, package_name, repo_count
				 FROM ${this.popularity}
				 WHERE package_key IN UNNEST(@keys)
				 ORDER BY repo_count DESC`,
				{ keys },
				MAX_BYTES_SUMMARY,
				{ keys: ["STRING"] },
			);
			const result = {
				package: pkg,
				mode: "ecosystem_breakdown",
				ecosystems: rows.map((r: any) => ({
					ecosystem: r.ecosystem,
					package_name: r.package_name,
					repo_count: Number(r.repo_count),
				})),
				note:
					rows.length === 0
						? `No UK-gov repository depends on "${pkg}" in any indexed ecosystem.`
						: "Specify `ecosystem` to list the repositories or apply a `version_range`.",
				coverage_note: COVERAGE_NOTE,
			};
			cacheSet(bkey, result);
			return result;
		}

		const pkey = packageKey(ecosystem, pkg);
		const exactScheme = EXACT_SCHEMES.has(ecosystem);

		// Parse any range predicate up front so invalid input fails fast (before any query).
		let rangeSpec: RangeComparator[] | null = null;
		if (args.version_range) {
			try {
				rangeSpec = parseVersionRange(args.version_range);
			} catch (e) {
				if (e instanceof VersionRangeError) throw new DepsInputError(e.message);
				throw e;
			}
		}

		// The expensive work (fetch + classify + filter + sort) is computed once per
		// (ecosystem, package, range, include_prereleases) and cached; pagination is a
		// cheap slice off the cached, already-sorted entries (fixes D5 + D7).
		const ckey = `sd:${ecosystem}:${pkey}:${args.version_range || ""}:${includePre ? 1 : 0}`;
		let computed = cacheGet(ckey);
		if (!computed) {
			computed = await this.computePackage(ecosystem, pkey, rangeSpec, includePre);
			cacheSet(ckey, computed);
		}

		if (computed.totalRepos === 0) {
			return {
				package: pkg,
				ecosystem,
				total_repo_count: 0,
				repos: [],
				note: `No UK-gov repository depends on ${ecosystem} package "${pkg}".`,
				coverage_note: COVERAGE_NOTE,
			};
		}

		const page = computed.entries.slice(offset, offset + limit);
		const result: any = {
			package: pkg,
			ecosystem,
			total_repo_count: computed.totalRepos,
			top_versions: computed.topVersions,
			excluded: computed.excluded,
			repos: page.map((e: any) => toEntry(e.repo, e.version, e.kind)),
			next_offset: offset + page.length < computed.entries.length ? offset + limit : null,
			coverage_note: COVERAGE_NOTE,
		};
		if (computed.truncated) {
			result.truncated = true;
			result.warning = `Result set capped at ${FETCH_ROW_CAP} rows; counts and top_versions reflect accurate aggregates but the repo list may be incomplete — narrow with a version_range.`;
		}
		if (rangeSpec) {
			result.version_range = args.version_range;
			result.matched_repo_count = computed.matchedCount;
			result.include_prereleases = includePre;
			result.range_exact = exactScheme;
			if (!exactScheme) {
				result.note = `Version ordering for ${ecosystem} uses a best-effort scheme; range results are APPROXIMATE. Existence and exact-version matches are reliable.`;
			}
			if (computed.excluded.declared_range > 0) {
				result.range_note = `${computed.excluded.declared_range} repo(s) declare "${pkg}" as a range (e.g. ^1.2.3); their resolved version is unknown and they are excluded from version-range matching.`;
			}
		}
		return result;
	}

	/** Fetch + classify + filter + sort a package's rows (the cacheable heavy lifting). */
	private async computePackage(
		ecosystem: string,
		pkey: string,
		rangeSpec: RangeComparator[] | null,
		includePre: boolean,
	): Promise<any> {
		// Single cheap fetch: only the cluster-pruned (repo, version_raw) columns.
		const rows = await this.query(
			`SELECT repo_full_name, version_raw
			 FROM ${this.current}
			 WHERE ecosystem=@eco AND package_key=@pkey
			 LIMIT ${FETCH_ROW_CAP}`,
			{ eco: ecosystem, pkey },
			MAX_BYTES_FACT,
		);
		const truncated = rows.length >= FETCH_ROW_CAP;

		if (rows.length === 0) {
			return {
				totalRepos: 0,
				entries: [],
				topVersions: [],
				matchedCount: 0,
				truncated: false,
				excluded: { declared_range: 0, empty_version: 0, other_noncomparable: 0 },
			};
		}

		type Row = {
			version: string;
			key: string | null;
			comparable: boolean;
			isPre: boolean;
			kind: string;
		};
		const byRepo = new Map<string, Row[]>();
		const versionRepos = new Map<string, Set<string>>();
		for (const r of rows as any[]) {
			const repo = r.repo_full_name;
			const version = r.version_raw ?? "";
			const nv = normalizeVersion(ecosystem, version);
			if (!byRepo.has(repo)) byRepo.set(repo, []);
			byRepo.get(repo)!.push({
				version,
				key: nv.version_sort_key,
				comparable: nv.comparable,
				isPre: nv.is_prerelease,
				kind: nv.version_kind,
			});
			if (!versionRepos.has(version)) versionRepos.set(version, new Set());
			versionRepos.get(version)!.add(repo);
		}

		let totalRepos = byRepo.size;

		const repOf = (list: Row[]) => {
			let best: Row | null = null;
			for (const x of list) {
				if (x.comparable && x.key) {
					if (best === null || cmpKeyDesc(x.key, best.key) < 0) best = x;
				}
			}
			return best ?? list[0];
		};

		let declRange = 0;
		let emptyV = 0;
		let otherNC = 0;
		for (const list of byRepo.values()) {
			const rep = repOf(list);
			if (!rep.comparable) {
				if (rep.kind === "range") declRange++;
				else if (rep.kind === "empty") emptyV++;
				else otherNC++;
			}
		}

		const entries: Array<{ repo: string; version: string; key: string | null; kind: string }> = [];
		if (rangeSpec) {
			for (const [repo, list] of byRepo) {
				let bestMatch: Row | null = null;
				for (const x of list) {
					if (!x.comparable || !x.key) continue;
					if (!includePre && x.isPre) continue;
					if (!satisfiesAll(x.key, rangeSpec)) continue;
					if (bestMatch === null || cmpKeyDesc(x.key, bestMatch.key) < 0) bestMatch = x;
				}
				if (bestMatch)
					entries.push({
						repo,
						version: bestMatch.version,
						key: bestMatch.key,
						kind: bestMatch.kind,
					});
			}
		} else {
			for (const [repo, list] of byRepo) {
				const rep = repOf(list);
				entries.push({ repo, version: rep.version, key: rep.key, kind: rep.kind });
			}
		}
		entries.sort((a, b) => cmpKeyDesc(a.key, b.key) || a.repo.localeCompare(b.repo));

		let topVersions = [...versionRepos.entries()]
			.map(([v, set]) => [v, set.size] as [string, number])
			.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
			.slice(0, 10);

		// D2/D3: if the fetch was capped, the app-side total/top_versions reflect only
		// the sampled rows. Replace them with accurate, cluster-pruned SQL aggregates
		// (this branch never triggers on the live dataset, where max ≈ 15.6k rows).
		if (truncated) {
			const [cnt] = await this.query(
				`SELECT COUNT(DISTINCT repo_full_name) AS n FROM ${this.current} WHERE ecosystem=@eco AND package_key=@pkey`,
				{ eco: ecosystem, pkey },
				MAX_BYTES_FACT,
			);
			totalRepos = Number((cnt as any)?.n || totalRepos);
			const tv = await this.query(
				`SELECT version_raw, COUNT(DISTINCT repo_full_name) AS c FROM ${this.current}
				 WHERE ecosystem=@eco AND package_key=@pkey GROUP BY version_raw ORDER BY c DESC, version_raw DESC LIMIT 10`,
				{ eco: ecosystem, pkey },
				MAX_BYTES_FACT,
			);
			topVersions = tv.map((r: any) => [r.version_raw, Number(r.c)] as [string, number]);
		}

		return {
			totalRepos,
			entries,
			topVersions,
			matchedCount: rangeSpec ? entries.length : totalRepos,
			truncated,
			excluded: { declared_range: declRange, empty_version: emptyV, other_noncomparable: otherNC },
		};
	}

	/** Ranked reverse-dependency counts and/or license rollups (materialised tables). */
	async packagePopularity(args: {
		ecosystem?: string;
		license?: string;
		top?: number;
		name_contains?: string;
	}): Promise<any> {
		const ecosystem = validateEcosystem(args.ecosystem);
		const top = clampInt(args.top, 50, 1, 500);
		const ncRaw =
			args.name_contains !== undefined && args.name_contains !== null
				? String(args.name_contains).trim().toLowerCase()
				: "";
		const ck = `pp:${ecosystem || ""}:${(args.license || "").toString().trim()}:${ncRaw}:${top}`;
		const hit = cacheGet(ck);
		if (hit) return hit;

		if (args.license !== undefined && args.license !== null && args.license !== "") {
			if (typeof args.license !== "string" || !LICENSE_RE.test(args.license.trim())) {
				throw new DepsInputError("license has invalid characters");
			}
			const license = args.license.trim();
			const params: Record<string, unknown> = { license };
			let where = "license_id = @license";
			if (ecosystem) {
				where += " AND ecosystem = @eco";
				params.eco = ecosystem;
			}
			const rows = await this.query(
				`SELECT ecosystem, license_id, repo_count, occurrence_count
				 FROM ${this.licenseRollup} WHERE ${where}
				 ORDER BY repo_count DESC LIMIT ${top}`,
				params,
				MAX_BYTES_SUMMARY,
			);
			const licResult = {
				mode: "license",
				license,
				ecosystem: ecosystem || "all",
				rows: rows.map((r: any) => ({
					ecosystem: r.ecosystem,
					license_id: r.license_id,
					repo_count: Number(r.repo_count),
					occurrence_count: Number(r.occurrence_count),
				})),
				coverage_note: COVERAGE_NOTE,
			};
			cacheSet(ck, licResult);
			return licResult;
		}

		const params: Record<string, unknown> = {};
		const wheres: string[] = [];
		if (ecosystem) {
			wheres.push("ecosystem = @eco");
			params.eco = ecosystem;
		}
		if (
			args.name_contains !== undefined &&
			args.name_contains !== null &&
			args.name_contains !== ""
		) {
			const nc = String(args.name_contains).trim().toLowerCase();
			if (!PACKAGE_RE.test(nc)) throw new DepsInputError("name_contains has invalid characters");
			wheres.push("CONTAINS_SUBSTR(package_key, @nc)");
			params.nc = nc;
		}
		const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
		const rows = await this.query(
			`SELECT ecosystem, package_name, package_key, repo_count, version_count
			 FROM ${this.popularity} ${whereSql}
			 ORDER BY repo_count DESC, package_key LIMIT ${top}`,
			params,
			MAX_BYTES_SUMMARY,
		);
		const popResult = {
			mode: "popularity",
			ecosystem: ecosystem || "all",
			top_packages: rows.map((r: any) => ({
				ecosystem: r.ecosystem,
				package_name: r.package_name,
				repo_count: Number(r.repo_count),
				version_count: Number(r.version_count),
			})),
			coverage_note: COVERAGE_NOTE,
		};
		cacheSet(ck, popResult);
		return popResult;
	}

	/** Full (untruncated) dependency listing for one repository. */
	async repoDependencies(args: {
		repo_full_name: string;
		ecosystem?: string;
		limit?: number;
	}): Promise<any> {
		const repo = validateRepo(args.repo_full_name);
		const ecosystem = validateEcosystem(args.ecosystem);
		const limit = clampInt(args.limit, 500, 1, 5000);
		const ck = `rd:${repo}:${ecosystem || ""}:${limit}`;
		const hit = cacheGet(ck);
		if (hit) return hit;
		const params: Record<string, unknown> = { repo };
		let where = "repo_full_name = @repo";
		if (ecosystem) {
			where += " AND ecosystem = @eco";
			params.eco = ecosystem;
		}
		const rows = await this.query(
			`SELECT ecosystem, package_name, version_raw, version_kind, license_id, COUNT(*) OVER() AS total
			 FROM ${this.byRepo} WHERE ${where}
			 ORDER BY ecosystem, package_name
			 LIMIT ${limit}`,
			params,
			MAX_BYTES_FACT,
		);
		const total = rows.length ? Number((rows[0] as any).total) : 0;
		const result = {
			repo_full_name: repo,
			ecosystem: ecosystem || "all",
			dependency_count: total,
			returned: rows.length,
			truncated: rows.length < total,
			dependencies: rows.map((r: any) => ({
				ecosystem: r.ecosystem,
				package_name: r.package_name,
				version: r.version_raw,
				version_kind: r.version_kind,
				license: r.license_id,
			})),
			coverage_note:
				total === 0 ? `No SBOM dependencies found for "${repo}". ${COVERAGE_NOTE}` : COVERAGE_NOTE,
		};
		cacheSet(ck, result);
		return result;
	}

	// ───────────────────────────── #198 capabilities ─────────────────────────────

	/** Real-time CVE exposure for a bounded scope (package, repo, or org) via OSV.dev. */
	async vulnerabilityExposure(args: {
		package?: string;
		ecosystem?: string;
		org?: string;
		repo_full_name?: string;
	}): Promise<any> {
		const ecosystem = validateEcosystem(args.ecosystem);
		const hasOrg = args.org !== undefined && args.org !== null && args.org !== "";
		const hasRepo =
			args.repo_full_name !== undefined &&
			args.repo_full_name !== null &&
			args.repo_full_name !== "";
		const hasPkg = args.package !== undefined && args.package !== null && args.package !== "";

		let scopeRows: any[];
		let scopeLabel: string;
		const SAMPLE = "ARRAY_AGG(DISTINCT repo_full_name IGNORE NULLS LIMIT 25) AS repos";
		const concrete = "version_kind IN ('release','prerelease')";

		if (hasPkg) {
			const pkg = validatePackage(args.package);
			if (!ecosystem)
				throw new DepsInputError("vulnerability_exposure by package requires an ecosystem");
			const pkey = packageKey(ecosystem, pkg);
			scopeRows = await this.query(
				`SELECT ecosystem, ANY_VALUE(package_name) AS package_name, version_raw,
				        COUNT(DISTINCT repo_full_name) AS n, ${SAMPLE}
				 FROM ${this.current}
				 WHERE ecosystem=@eco AND package_key=@pkey AND ${concrete}
				 GROUP BY ecosystem, version_raw`,
				{ eco: ecosystem, pkey },
				MAX_BYTES_FACT,
			);
			scopeLabel = `${ecosystem} package "${pkg}"`;
		} else if (hasRepo) {
			const repo = validateRepo(args.repo_full_name);
			scopeRows = await this.query(
				`SELECT ecosystem, ANY_VALUE(package_name) AS package_name, version_raw,
				        1 AS n, [@repo] AS repos
				 FROM ${this.byRepo}
				 WHERE repo_full_name=@repo AND ${concrete}
				 GROUP BY ecosystem, package_key, version_raw`,
				{ repo },
				MAX_BYTES_FACT,
			);
			scopeLabel = `repo ${repo}`;
		} else if (hasOrg) {
			const org = validateOrg(args.org);
			const { lo, hi } = orgBounds(org);
			scopeRows = await this.query(
				`SELECT ecosystem, ANY_VALUE(package_name) AS package_name, version_raw,
				        COUNT(DISTINCT repo_full_name) AS n, ${SAMPLE}
				 FROM ${this.byRepo}
				 WHERE repo_full_name >= @lo AND repo_full_name < @hi AND ${concrete}
				 GROUP BY ecosystem, package_key, version_raw
				 LIMIT 5000`,
				{ lo, hi },
				MAX_BYTES_FACT,
			);
			scopeLabel = `org ${org}`;
		} else {
			throw new DepsInputError(
				"vulnerability_exposure requires a scope: package + ecosystem, repo_full_name, or org",
			);
		}

		const queries: OsvQuery[] = scopeRows.map((r) => ({
			ecosystem: r.ecosystem,
			name: r.package_name,
			version: r.version_raw,
		}));
		const { perQuery, osvAvailable, truncated } = await resolveVulnIds(queries);
		const allIds = new Set<string>();
		perQuery.forEach((ids) => ids.forEach((id) => allIds.add(id)));
		const details = await vulnDetails([...allIds]);

		const findings: any[] = [];
		scopeRows.forEach((r, i) => {
			const ids = perQuery[i];
			if (!ids || ids.length === 0) return;
			const vulns = ids.map((id) => details[id]).filter(Boolean) as VulnRef[];
			findings.push({
				ecosystem: r.ecosystem,
				package: r.package_name,
				version: r.version_raw,
				affected_repo_count: Number(r.n),
				repos_sample: (r.repos || []).slice(0, 25),
				vulnerabilities: vulns.map((v) => ({
					id: v.id,
					cve: v.cve,
					severity: v.severity,
					summary: v.summary,
					url: v.url,
				})),
			});
		});
		findings.sort((a, b) => b.affected_repo_count - a.affected_repo_count);

		return {
			scope: scopeLabel,
			osv_available: osvAvailable,
			vulnerable_versions: findings.length,
			findings: findings.slice(0, 200),
			...(truncated
				? {
						truncated: true,
						note: "Scope exceeded the OSV query cap; results are partial — narrow to a package or repo.",
					}
				: {}),
			...(osvAvailable
				? {}
				: { osv_note: "OSV.dev was unreachable; vulnerability data is incomplete." }),
			coverage_note: COVERAGE_NOTE,
		};
	}

	/** Technology profile for one org/department: ecosystems, top packages, frameworks (+EOL), licences. */
	async dependencyLandscape(args: { org: string }): Promise<any> {
		const org = validateOrg(args.org);
		const ck = `ls:${org}`;
		const hit = cacheGet(ck);
		if (hit) return hit;
		const { lo, hi } = orgBounds(org);
		const p = { lo, hi };

		const ecos = await this.query(
			`SELECT ecosystem, COUNT(DISTINCT repo_full_name) AS repos, COUNT(*) AS deps
			 FROM ${this.byRepo} WHERE repo_full_name >= @lo AND repo_full_name < @hi
			 GROUP BY ecosystem ORDER BY deps DESC`,
			p,
			MAX_BYTES_FACT,
		);
		if (ecos.length === 0) {
			const empty = {
				org,
				repo_count: 0,
				note: `No SBOM-indexed repositories found for org "${org}".`,
				coverage_note: COVERAGE_NOTE,
			};
			cacheSet(ck, empty);
			return empty;
		}
		const top = await this.query(
			`SELECT ecosystem, package_name, COUNT(DISTINCT repo_full_name) AS c
			 FROM ${this.byRepo} WHERE repo_full_name >= @lo AND repo_full_name < @hi
			   AND ecosystem NOT IN ('github','githubactions')
			 GROUP BY ecosystem, package_name ORDER BY c DESC LIMIT 25`,
			p,
			MAX_BYTES_FACT,
		);
		const lic = await this.query(
			`SELECT IFNULL(license_id, 'NONE') AS lic, COUNT(*) AS c
			 FROM ${this.byRepo} WHERE repo_full_name >= @lo AND repo_full_name < @hi
			 GROUP BY lic ORDER BY c DESC`,
			p,
			MAX_BYTES_FACT,
		);
		// frameworks present (mapped to endoflife) + their versions → EOL flags
		const fwKeys = FRAMEWORK_KEYS;
		const fwRows = await this.query(
			`SELECT ecosystem, package_key, ANY_VALUE(package_name) AS package_name, version_raw,
			        COUNT(DISTINCT repo_full_name) AS c
			 FROM ${this.byRepo} WHERE repo_full_name >= @lo AND repo_full_name < @hi
			   AND version_kind='release' AND CONCAT(ecosystem,'|',package_key) IN UNNEST(@fw)
			 GROUP BY ecosystem, package_key, version_raw LIMIT 500`,
			{ ...p, fw: fwKeys },
			MAX_BYTES_FACT,
			{ fw: ["STRING"] },
		);
		// accurate distinct repo count (a repo can span multiple ecosystems → MAX/SUM are wrong)
		const cnt = await this.query(
			`SELECT COUNT(DISTINCT repo_full_name) AS n
			 FROM ${this.byRepo} WHERE repo_full_name >= @lo AND repo_full_name < @hi`,
			p,
			MAX_BYTES_FACT,
		);
		const repoCount = Number((cnt[0] as any)?.n || 0);
		// EOL lookups hit endoflife.date → cap outbound concurrency.
		const eolFindings: any[] = [];
		await mapLimit(fwRows as any[], 8, async (r: any) => {
			const st = await eolStatus(r.ecosystem, r.package_key, r.version_raw);
			if (st && st.is_eol === true) {
				eolFindings.push({
					package: r.package_name,
					version: r.version_raw,
					repos: Number(r.c),
					eol_date: st.eol,
					product: st.product,
				});
			}
			return null;
		});
		eolFindings.sort((a, b) => b.repos - a.repos);

		let copyleft = 0;
		let unknownLic = 0;
		for (const r of lic as any[]) {
			if (r.lic === "NONE" || r.lic === "NOASSERTION") unknownLic += Number(r.c);
			else if (isCopyleft(r.lic)) copyleft += Number(r.c);
		}
		const result = {
			org,
			repo_count: repoCount,
			ecosystems: (ecos as any[]).map((e) => ({
				ecosystem: e.ecosystem,
				repos: Number(e.repos),
				dependencies: Number(e.deps),
			})),
			top_packages: (top as any[]).map((t) => ({
				ecosystem: t.ecosystem,
				package_name: t.package_name,
				repos: Number(t.c),
			})),
			licence_summary: {
				copyleft_occurrences: copyleft,
				unknown_or_missing: unknownLic,
				top_licences: (lic as any[])
					.slice(0, 8)
					.map((l) => ({ licence: l.lic, occurrences: Number(l.c) })),
			},
			eol_frameworks: eolFindings,
			coverage_note: COVERAGE_NOTE,
		};
		cacheSet(ck, result);
		return result;
	}

	/** Compare two repositories' dependency profiles (shared / unique / overlap). */
	async dependencyCompare(args: { repo_a: string; repo_b: string }): Promise<any> {
		const a = validateRepo(args.repo_a);
		const b = validateRepo(args.repo_b);
		const rows = await this.query(
			`SELECT repo_full_name, ecosystem, package_key, ANY_VALUE(package_name) AS package_name
			 FROM ${this.byRepo} WHERE repo_full_name IN (@a, @b)
			 GROUP BY repo_full_name, ecosystem, package_key`,
			{ a, b },
			MAX_BYTES_FACT,
		);
		const setA = new Map<string, string>();
		const setB = new Map<string, string>();
		for (const r of rows as any[]) {
			const key = `${r.ecosystem}|${r.package_key}`;
			const label = `${r.ecosystem}:${r.package_name}`;
			if (r.repo_full_name === a) setA.set(key, label);
			if (r.repo_full_name === b) setB.set(key, label);
		}
		const shared: string[] = [];
		const onlyA: string[] = [];
		const onlyB: string[] = [];
		for (const [k, label] of setA) (setB.has(k) ? shared : onlyA).push(label);
		for (const [k, label] of setB) if (!setA.has(k)) onlyB.push(label);
		const union = setA.size + onlyB.length;
		return {
			repo_a: a,
			repo_b: b,
			deps_a: setA.size,
			deps_b: setB.size,
			shared_count: shared.length,
			overlap_pct: union ? Math.round((shared.length / union) * 1000) / 10 : 0,
			shared: shared.sort().slice(0, 100),
			only_in_a: onlyA.sort().slice(0, 100),
			only_in_b: onlyB.sort().slice(0, 100),
			coverage_note: COVERAGE_NOTE,
		};
	}

	/** Export the full dependency set for one repo, with the canonical SBOM source URL. */
	async sbomExport(args: { repo_full_name: string; limit?: number }): Promise<any> {
		const repo = validateRepo(args.repo_full_name);
		const limit = clampInt(args.limit, 5000, 1, 20000);
		const rows = await this.query(
			`SELECT ecosystem, package_name, version_raw, version_kind, license_id, COUNT(*) OVER() AS total
			 FROM ${this.byRepo} WHERE repo_full_name=@repo
			 ORDER BY ecosystem, package_name LIMIT ${limit}`,
			{ repo },
			MAX_BYTES_FACT,
		);
		const total = rows.length ? Number((rows[0] as any).total) : 0;
		const byEco: Record<string, number> = {};
		for (const r of rows as any[]) byEco[r.ecosystem] = (byEco[r.ecosystem] || 0) + 1;
		const [org, name] = repo.split("/");
		return {
			repo_full_name: repo,
			sbom_source_url: `https://uk-x-gov-software-community.github.io/xgov-opensource-repo-scraper/sbom/${org}/${name}.json.gz`,
			dependency_count: total,
			returned: rows.length,
			truncated: rows.length < total,
			by_ecosystem: byEco,
			dependencies: rows.map((r: any) => ({
				ecosystem: r.ecosystem,
				package_name: r.package_name,
				version: r.version_raw,
				version_kind: r.version_kind,
				license: r.license_id,
			})),
			coverage_note:
				total === 0
					? `No SBOM dependencies indexed for "${repo}". ${COVERAGE_NOTE}`
					: COVERAGE_NOTE,
		};
	}

	/** Usage trend of a package across the retained daily snapshots. */
	async dependencyTrends(args: { package: string; ecosystem?: string }): Promise<any> {
		const pkg = validatePackage(args.package);
		const ecosystem = validateEcosystem(args.ecosystem, true)!;
		const pkey = packageKey(ecosystem, pkg);
		const rows = await this.query(
			`SELECT ingested_date, COUNT(DISTINCT repo_full_name) AS repos
			 FROM \`${PROJECT}.${DATASET}.dependencies\`
			 WHERE ecosystem=@eco AND package_key=@pkey
			 GROUP BY ingested_date ORDER BY ingested_date`,
			{ eco: ecosystem, pkey },
			MAX_BYTES_FACT,
		);
		const snaps = (rows as any[]).map((r) => ({
			date:
				r.ingested_date?.value ??
				(r.ingested_date instanceof Date
					? r.ingested_date.toISOString().slice(0, 10)
					: String(r.ingested_date)),
			repo_count: Number(r.repos),
		}));
		return {
			package: pkg,
			ecosystem,
			snapshots: snaps,
			note:
				snaps.length < 2
					? "Only one snapshot retained so far; trend builds up daily (≤90-day retention)."
					: `${snaps[snaps.length - 1].repo_count - snaps[0].repo_count >= 0 ? "+" : ""}${snaps[snaps.length - 1].repo_count - snaps[0].repo_count} repos over ${snaps.length} snapshots.`,
			coverage_note: COVERAGE_NOTE,
		};
	}
}

// (ecosystem|package_key) pairs we can resolve EOL status for (mirrors endoflifeService map).
const FRAMEWORK_KEYS = [
	"pypi|django",
	"pypi|flask",
	"pypi|fastapi",
	"gem|rails",
	"npm|@angular/core",
	"npm|vue",
	"npm|express",
	"npm|next",
	"maven|org.springframework/spring-core",
	"maven|org.springframework.boot/spring-boot",
	"composer|laravel/framework",
	"composer|symfony/symfony",
];

let singleton: DepsQueryService | null = null;
export function getDepsQueryService(): DepsQueryService {
	if (!singleton) singleton = new DepsQueryService();
	return singleton;
}
