import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every BigQuery job the service submits so we can assert on the SQL/params.
const { createQueryJob } = vi.hoisted(() => ({ createQueryJob: vi.fn() }));

vi.mock("@google-cloud/bigquery", () => ({
	BigQuery: class {
		createQueryJob = createQueryJob;
	},
}));

import { DepsQueryService, DepsInputError, clearDepsCache } from "../src/services/depsQueryService";

// Each job gets its OWN getQueryResults so chained mockResolvedValueOnce returns
// the right rows per query (agg → top → page).
function jobReturning(rows: any[]) {
	return [{ getQueryResults: vi.fn().mockResolvedValue([rows]) }];
}

describe("DepsQueryService — input validation (security)", () => {
	let svc: DepsQueryService;
	beforeEach(() => {
		vi.clearAllMocks();
		clearDepsCache();
		createQueryJob.mockResolvedValue(jobReturning([]));
		svc = new DepsQueryService();
	});

	it("rejects SQL-injection-shaped package names", async () => {
		await expect(
			svc.searchDependency({ package: "express'; DROP TABLE x;--" }),
		).rejects.toBeInstanceOf(DepsInputError);
		// crucial: no query was even issued
		expect(createQueryJob).not.toHaveBeenCalled();
	});

	it("rejects unknown ecosystem", async () => {
		await expect(
			svc.searchDependency({ package: "express", ecosystem: "evil" }),
		).rejects.toBeInstanceOf(DepsInputError);
	});

	it("rejects version_range without ecosystem (collision-unsafe)", async () => {
		await expect(
			svc.searchDependency({ package: "express", version_range: "<2" }),
		).rejects.toBeInstanceOf(DepsInputError);
	});

	it("rejects malformed repo_full_name", async () => {
		await expect(svc.repoDependencies({ repo_full_name: "not-a-repo" })).rejects.toBeInstanceOf(
			DepsInputError,
		);
		await expect(
			svc.repoDependencies({ repo_full_name: "../../etc/passwd" }),
		).rejects.toBeInstanceOf(DepsInputError);
	});

	it("rejects garbage version_range", async () => {
		await expect(
			svc.searchDependency({ package: "express", ecosystem: "npm", version_range: "banana" }),
		).rejects.toBeInstanceOf(DepsInputError);
	});

	it("rejects invalid licence string", async () => {
		await expect(svc.packagePopularity({ license: "MIT'; DROP" })).rejects.toBeInstanceOf(
			DepsInputError,
		);
	});
});

describe("DepsQueryService — parameterisation & cost cap (security)", () => {
	let svc: DepsQueryService;
	beforeEach(() => {
		vi.clearAllMocks();
		clearDepsCache();
		createQueryJob.mockResolvedValue(jobReturning([]));
		svc = new DepsQueryService();
	});

	it("never concatenates user values into SQL; sets maximumBytesBilled on every job", async () => {
		createQueryJob.mockResolvedValue(
			jobReturning([{ repo_full_name: "alphagov/x", version_raw: "4.18.2" }]),
		);
		await svc.searchDependency({
			package: "express",
			ecosystem: "npm",
			version_range: "<2",
			limit: 50,
		});
		expect(createQueryJob).toHaveBeenCalled();
		for (const call of createQueryJob.mock.calls) {
			const opts = call[0];
			// hard per-query cost cap is mandatory on a public no-auth API
			expect(opts.maximumBytesBilled).toBeTruthy();
			expect(Number(opts.maximumBytesBilled)).toBeGreaterThan(0);
			// the user-supplied package must travel as a *parameter*, not inlined
			expect(opts.query).not.toContain("express");
			expect(JSON.stringify(opts.params)).toContain("express");
			// useLegacySql must be off
			expect(opts.useLegacySql).toBe(false);
		}
	});

	it("only ever inlines integers (LIMIT/row-cap), never user strings", async () => {
		createQueryJob.mockResolvedValue(jobReturning([]));
		await svc.searchDependency({ package: "express", ecosystem: "npm" });
		await svc.repoDependencies({ repo_full_name: "alphagov/whitehall", limit: 100 });
		for (const call of createQueryJob.mock.calls) {
			const inlined = call[0].query.match(/LIMIT (\S+)/);
			if (inlined) expect(/^\d+$/.test(inlined[1])).toBe(true);
		}
	});

	it("clamps limit/offset app-side (page never exceeds 500)", async () => {
		// 600 distinct repos available; limit 999999 must clamp the returned page to 500
		const rows = Array.from({ length: 600 }, (_, i) => ({
			repo_full_name: `org/repo${i}`,
			version_raw: "4.18.2",
		}));
		createQueryJob.mockResolvedValue(jobReturning(rows));
		const r = await svc.searchDependency({
			package: "express",
			ecosystem: "npm",
			limit: 999999,
			offset: -5,
		});
		expect(r.total_repo_count).toBe(600);
		expect(r.repos.length).toBe(500); // clamped
		expect(r.next_offset).toBe(500); // offset clamped to 0, page 500 → next 500
	});
});

describe("DepsQueryService — result shaping", () => {
	let svc: DepsQueryService;
	beforeEach(() => {
		vi.clearAllMocks();
		clearDepsCache();
		svc = new DepsQueryService();
	});

	it("ecosystem breakdown when ecosystem omitted", async () => {
		createQueryJob.mockResolvedValue(
			jobReturning([
				{ ecosystem: "npm", package_name: "express", repo_count: 1830 },
				{ ecosystem: "gem", package_name: "express", repo_count: 2 },
			]),
		);
		const r = await svc.searchDependency({ package: "express" });
		expect(r.mode).toBe("ecosystem_breakdown");
		expect(r.ecosystems[0]).toEqual({
			ecosystem: "npm",
			package_name: "express",
			repo_count: 1830,
		});
		expect(r.coverage_note).toContain("SBOM");
	});

	it("express < 2 returns 0 matches app-side (real-world: lowest express is 2.x)", async () => {
		// fetched rows: v4/v5 releases + one declared-range row (^4.14.0)
		createQueryJob.mockResolvedValue(
			jobReturning([
				{ repo_full_name: "a/one", version_raw: "4.18.2" },
				{ repo_full_name: "a/two", version_raw: "5.2.1" },
				{ repo_full_name: "a/three", version_raw: "4.17.1" },
				{ repo_full_name: "a/four", version_raw: "^4.14.0" }, // declared range, non-comparable
			]),
		);
		const r = await svc.searchDependency({
			package: "express",
			ecosystem: "npm",
			version_range: "<2",
		});
		expect(r.total_repo_count).toBe(4);
		expect(r.matched_repo_count).toBe(0); // none below v2
		expect(r.range_exact).toBe(true); // npm is an exact scheme
		expect(r.excluded.declared_range).toBe(1); // the ^4.14.0 repo
	});

	it("a repo matches a range if ANY of its versions satisfies (multi-version repo)", async () => {
		createQueryJob.mockResolvedValue(
			jobReturning([
				{ repo_full_name: "mono/repo", version_raw: "1.5.0" }, // matches <2
				{ repo_full_name: "mono/repo", version_raw: "4.18.2" }, // does not
				{ repo_full_name: "other/repo", version_raw: "4.18.2" },
			]),
		);
		const r = await svc.searchDependency({
			package: "express",
			ecosystem: "npm",
			version_range: "<2",
		});
		expect(r.total_repo_count).toBe(2);
		expect(r.matched_repo_count).toBe(1); // only mono/repo has a <2 version
		expect(r.repos[0].repo_full_name).toBe("mono/repo");
		expect(r.repos[0].version).toBe("1.5.0");
	});

	it("derives org/repo/url from repo_full_name", async () => {
		createQueryJob.mockResolvedValue(
			jobReturning([{ repo_full_name: "alphagov/whitehall", version_raw: "4.18.2" }]),
		);
		const r = await svc.searchDependency({ package: "express", ecosystem: "npm" });
		expect(r.repos[0]).toMatchObject({
			repo_full_name: "alphagov/whitehall",
			org: "alphagov",
			repo: "whitehall",
			repo_url: "https://github.com/alphagov/whitehall",
		});
	});
});
