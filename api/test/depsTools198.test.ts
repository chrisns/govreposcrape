import { describe, it, expect, vi, beforeEach } from "vitest";

const { createQueryJob } = vi.hoisted(() => ({ createQueryJob: vi.fn() }));
vi.mock("@google-cloud/bigquery", () => ({
	BigQuery: class {
		createQueryJob = createQueryJob;
	},
}));

const osv = vi.hoisted(() => ({ resolveVulnIds: vi.fn(), vulnDetails: vi.fn() }));
vi.mock("../src/services/osvService", () => ({
	resolveVulnIds: osv.resolveVulnIds,
	vulnDetails: osv.vulnDetails,
}));
const eol = vi.hoisted(() => ({ eolStatus: vi.fn() }));
vi.mock("../src/services/endoflifeService", () => ({ eolStatus: eol.eolStatus }));

import { DepsQueryService, DepsInputError, clearDepsCache } from "../src/services/depsQueryService";

function job(rows: any[]) {
	return [{ getQueryResults: vi.fn().mockResolvedValue([rows]) }];
}

describe("#198 tools", () => {
	let svc: DepsQueryService;
	beforeEach(() => {
		vi.clearAllMocks();
		clearDepsCache();
		createQueryJob.mockResolvedValue(job([]));
		osv.resolveVulnIds.mockResolvedValue({ perQuery: [], osvAvailable: true, truncated: false });
		osv.vulnDetails.mockResolvedValue({});
		eol.eolStatus.mockResolvedValue(null);
		svc = new DepsQueryService();
	});

	describe("vulnerability_exposure", () => {
		it("requires a scope", async () => {
			await expect(svc.vulnerabilityExposure({})).rejects.toBeInstanceOf(DepsInputError);
		});
		it("requires ecosystem when scoped by package", async () => {
			await expect(svc.vulnerabilityExposure({ package: "express" })).rejects.toBeInstanceOf(
				DepsInputError,
			);
		});
		it("rejects a malformed org", async () => {
			await expect(svc.vulnerabilityExposure({ org: "../etc" })).rejects.toBeInstanceOf(
				DepsInputError,
			);
		});
		it("reports only versions OSV flags as vulnerable", async () => {
			createQueryJob.mockResolvedValue(
				job([
					{
						ecosystem: "npm",
						package_name: "express",
						version_raw: "2.5.11",
						n: 5,
						repos: ["a/b"],
					},
					{
						ecosystem: "npm",
						package_name: "express",
						version_raw: "4.18.2",
						n: 200,
						repos: ["c/d"],
					},
				]),
			);
			osv.resolveVulnIds.mockResolvedValue({
				perQuery: [["GHSA-1"], []],
				osvAvailable: true,
				truncated: false,
			});
			osv.vulnDetails.mockResolvedValue({
				"GHSA-1": { id: "GHSA-1", cve: "CVE-2022-0001", severity: "HIGH", summary: "x", url: "u" },
			});
			const r = await svc.vulnerabilityExposure({ package: "express", ecosystem: "npm" });
			expect(r.vulnerable_versions).toBe(1);
			expect(r.findings[0].version).toBe("2.5.11");
			expect(r.findings[0].vulnerabilities[0].cve).toBe("CVE-2022-0001");
			expect(r.findings[0].affected_repo_count).toBe(5);
		});
		it("surfaces OSV unavailability without throwing", async () => {
			createQueryJob.mockResolvedValue(
				job([
					{ ecosystem: "npm", package_name: "express", version_raw: "4.18.2", n: 1, repos: [] },
				]),
			);
			osv.resolveVulnIds.mockResolvedValue({
				perQuery: [[]],
				osvAvailable: false,
				truncated: false,
			});
			const r = await svc.vulnerabilityExposure({ package: "express", ecosystem: "npm" });
			expect(r.osv_available).toBe(false);
			expect(r.osv_note).toMatch(/unreachable/i);
		});
	});

	describe("dependency_landscape", () => {
		it("assembles ecosystems, top packages, licences and EOL frameworks", async () => {
			createQueryJob
				.mockResolvedValueOnce(
					job([
						{ ecosystem: "npm", repos: 178, deps: 82688 },
						{ ecosystem: "gem", repos: 40, deps: 5000 },
					]),
				)
				.mockResolvedValueOnce(job([{ ecosystem: "npm", package_name: "express", c: 50 }]))
				.mockResolvedValueOnce(
					job([
						{ lic: "MIT", c: 1000 },
						{ lic: "GPL-3.0-only", c: 12 },
						{ lic: "NONE", c: 30 },
					]),
				)
				.mockResolvedValueOnce(
					job([
						{
							ecosystem: "gem",
							package_key: "rails",
							package_name: "rails",
							version_raw: "3.2.17",
							c: 4,
						},
					]),
				)
				.mockResolvedValueOnce(job([{ n: 178 }])); // COUNT(DISTINCT) repo_count
			eol.eolStatus.mockResolvedValue({
				product: "rails",
				cycle: "3.2",
				eol: "2016-06-01",
				is_eol: true,
			});
			const r = await svc.dependencyLandscape({ org: "alphagov" });
			expect(r.repo_count).toBe(178);
			expect(r.ecosystems[0].ecosystem).toBe("npm");
			expect(r.licence_summary.copyleft_occurrences).toBe(12);
			expect(r.licence_summary.unknown_or_missing).toBe(30);
			expect(r.eol_frameworks[0]).toMatchObject({ package: "rails", version: "3.2.17", repos: 4 });
		});
		it("rejects a bad org", async () => {
			await expect(svc.dependencyLandscape({ org: "a b" })).rejects.toBeInstanceOf(DepsInputError);
		});
	});

	describe("dependency_compare", () => {
		it("computes shared / unique / overlap", async () => {
			createQueryJob.mockResolvedValue(
				job([
					{
						repo_full_name: "o/a",
						ecosystem: "npm",
						package_key: "express",
						package_name: "express",
					},
					{
						repo_full_name: "o/a",
						ecosystem: "npm",
						package_key: "lodash",
						package_name: "lodash",
					},
					{
						repo_full_name: "o/b",
						ecosystem: "npm",
						package_key: "express",
						package_name: "express",
					},
					{ repo_full_name: "o/b", ecosystem: "npm", package_key: "axios", package_name: "axios" },
				]),
			);
			const r = await svc.dependencyCompare({ repo_a: "o/a", repo_b: "o/b" });
			expect(r.shared_count).toBe(1); // express
			expect(r.only_in_a).toContain("npm:lodash");
			expect(r.only_in_b).toContain("npm:axios");
			expect(r.overlap_pct).toBe(33.3); // 1 shared / 3 union
		});
	});

	describe("sbom_export", () => {
		it("returns the SBOM source URL and per-ecosystem counts", async () => {
			createQueryJob.mockResolvedValue(
				job([
					{
						ecosystem: "npm",
						package_name: "express",
						version_raw: "4.18.2",
						version_kind: "release",
						license_id: "MIT",
						total: 3,
					},
					{
						ecosystem: "npm",
						package_name: "lodash",
						version_raw: "4.17.21",
						version_kind: "release",
						license_id: "MIT",
						total: 3,
					},
					{
						ecosystem: "gem",
						package_name: "rake",
						version_raw: "13.0",
						version_kind: "release",
						license_id: "MIT",
						total: 3,
					},
				]),
			);
			const r = await svc.sbomExport({ repo_full_name: "alphagov/whitehall" });
			expect(r.sbom_source_url).toContain("/sbom/alphagov/whitehall.json.gz");
			expect(r.dependency_count).toBe(3);
			expect(r.by_ecosystem).toEqual({ npm: 2, gem: 1 });
		});
	});

	describe("dependency_trends", () => {
		it("requires an ecosystem", async () => {
			await expect(svc.dependencyTrends({ package: "express" })).rejects.toBeInstanceOf(
				DepsInputError,
			);
		});
		it("returns snapshots over time", async () => {
			createQueryJob.mockResolvedValue(
				job([
					{ ingested_date: { value: "2026-05-29" }, repos: 1800 },
					{ ingested_date: { value: "2026-05-30" }, repos: 1830 },
				]),
			);
			const r = await svc.dependencyTrends({ package: "express", ecosystem: "npm" });
			expect(r.snapshots).toEqual([
				{ date: "2026-05-29", repo_count: 1800 },
				{ date: "2026-05-30", repo_count: 1830 },
			]);
			expect(r.note).toMatch(/\+30 repos/);
		});
	});
});
