import { describe, it, expect, vi, beforeEach } from "vitest";
import { eolProductFor, eolStatus, __resetEolCache } from "../src/services/endoflifeService";

function mockCycles(cycles: any[] | null) {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				({
					status: cycles ? 200 : 404,
					headers: { get: () => null },
					body: null,
					text: async () => JSON.stringify(cycles),
				}) as any,
		),
	);
}

describe("endoflifeService", () => {
	beforeEach(() => {
		__resetEolCache();
		vi.unstubAllGlobals();
	});

	it("maps known frameworks to endoflife products", () => {
		expect(eolProductFor("pypi", "django")).toBe("django");
		expect(eolProductFor("gem", "rails")).toBe("rails");
		expect(eolProductFor("npm", "lodash")).toBeNull();
	});

	it("flags an EOL version (past eol date)", async () => {
		mockCycles([
			{ cycle: "5.2", eol: "2099-01-01" },
			{ cycle: "1.11", eol: "2020-04-01" },
		]);
		const st = await eolStatus("pypi", "django", "1.11.5");
		expect(st?.cycle).toBe("1.11");
		expect(st?.is_eol).toBe(true);
	});

	it("treats a future-eol version as supported", async () => {
		mockCycles([{ cycle: "5.2", eol: "2099-01-01" }]);
		const st = await eolStatus("pypi", "django", "5.2.14");
		expect(st?.is_eol).toBe(false);
	});

	it("handles boolean eol=false as supported", async () => {
		mockCycles([{ cycle: "7.0", eol: false }]);
		const st = await eolStatus("pypi", "django", "7.0.1");
		expect(st?.is_eol).toBe(false);
	});

	it("returns null for unmapped packages", async () => {
		expect(await eolStatus("npm", "lodash", "4.17.21")).toBeNull();
	});

	it("returns unknown (null) when product not on endoflife.date", async () => {
		mockCycles(null);
		const st = await eolStatus("pypi", "django", "1.11.5");
		expect(st?.is_eol).toBeNull();
	});
});
