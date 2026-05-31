import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	osvSupportsEcosystem,
	resolveVulnIds,
	vulnDetails,
	__resetOsvCache,
} from "../src/services/osvService";

function mockFetch(handler: (url: string, init?: any) => any) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: any) => {
			const body = handler(url, init);
			// shape expected by fetchJsonBounded (status + headers.get + body/text)
			return {
				status: body === null ? 500 : 200,
				headers: { get: () => null },
				body: null,
				text: async () => JSON.stringify(body),
			} as any;
		}),
	);
}

describe("osvService", () => {
	beforeEach(() => {
		__resetOsvCache();
		vi.unstubAllGlobals();
	});

	it("knows which ecosystems OSV supports", () => {
		expect(osvSupportsEcosystem("npm")).toBe(true);
		expect(osvSupportsEcosystem("maven")).toBe(true);
		expect(osvSupportsEcosystem("apk")).toBe(false);
		expect(osvSupportsEcosystem("github")).toBe(false);
	});

	it("resolves vuln ids index-aligned and skips unsupported ecosystems", async () => {
		mockFetch((url, init) => {
			const q = JSON.parse(init.body).queries;
			// echo a vuln only for lodash
			return {
				results: q.map((x: any) => ({
					vulns: x.package.name === "lodash" ? [{ id: "GHSA-x" }] : [],
				})),
			};
		});
		const r = await resolveVulnIds([
			{ ecosystem: "npm", name: "lodash", version: "4.17.15" },
			{ ecosystem: "npm", name: "express", version: "4.18.2" },
			{ ecosystem: "apk", name: "musl", version: "1.0" }, // unsupported → skipped, stays []
		]);
		expect(r.osvAvailable).toBe(true);
		expect(r.perQuery[0]).toEqual(["GHSA-x"]);
		expect(r.perQuery[1]).toEqual([]);
		expect(r.perQuery[2]).toEqual([]); // unsupported ecosystem never queried
	});

	it("cache hit rebuilds results for the new call's ordering (no positional mis-attribution)", async () => {
		const fetchSpy = vi.fn(async (_url: string, init: any) => {
			const q = JSON.parse(init.body).queries;
			return {
				status: 200,
				headers: { get: () => null },
				body: null,
				text: async () =>
					JSON.stringify({
						results: q.map((x: any) => ({
							vulns: x.package.name === "lodash" ? [{ id: "GHSA-x" }] : [],
						})),
					}),
			} as any;
		});
		vi.stubGlobal("fetch", fetchSpy);
		const r1 = await resolveVulnIds([
			{ ecosystem: "npm", name: "lodash", version: "4.17.15" },
			{ ecosystem: "npm", name: "express", version: "4.18.2" },
		]);
		expect(r1.perQuery).toEqual([["GHSA-x"], []]);
		// reversed order, same set → cache hit, but result must follow the NEW order
		const r2 = await resolveVulnIds([
			{ ecosystem: "npm", name: "express", version: "4.18.2" },
			{ ecosystem: "npm", name: "lodash", version: "4.17.15" },
		]);
		expect(r2.perQuery).toEqual([[], ["GHSA-x"]]); // lodash now in position 1
		expect(fetchSpy).toHaveBeenCalledTimes(1); // 2nd call served from cache
	});

	it("converts maven group/artifact to group:artifact for OSV", async () => {
		let sentName = "";
		mockFetch((_url, init) => {
			sentName = JSON.parse(init.body).queries[0].package.name;
			return { results: [{ vulns: [] }] };
		});
		await resolveVulnIds([
			{ ecosystem: "maven", name: "org.apache.logging.log4j/log4j-core", version: "2.14.1" },
		]);
		expect(sentName).toBe("org.apache.logging.log4j:log4j-core");
	});

	it("degrades gracefully when OSV is unreachable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("network");
			}),
		);
		const r = await resolveVulnIds([{ ecosystem: "npm", name: "lodash", version: "4.17.15" }]);
		expect(r.osvAvailable).toBe(false);
		expect(r.perQuery[0]).toEqual([]);
	});

	it("fetches vuln details with CVE alias + severity", async () => {
		mockFetch(() => ({
			id: "GHSA-x",
			aliases: ["CVE-2020-28500"],
			summary: "ReDoS in lodash",
			database_specific: { severity: "moderate" },
		}));
		const d = await vulnDetails(["GHSA-x"]);
		expect(d["GHSA-x"].cve).toBe("CVE-2020-28500");
		expect(d["GHSA-x"].severity).toBe("MODERATE");
		expect(d["GHSA-x"].url).toContain("osv.dev");
	});
});
