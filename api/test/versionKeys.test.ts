import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
	normalizeVersion,
	parsePurl,
	packageKey,
	parseVersionRange,
	VersionRangeError,
	RangeComparator,
} from "../src/services/versionKeys";

const vectors = JSON.parse(
	readFileSync(new URL("../../testdata/version-key-vectors.json", import.meta.url), "utf8"),
);

describe("versionKeys: Python↔TS parity (golden vectors)", () => {
	for (const v of vectors.keys) {
		it(`${v.ecosystem} "${v.version}" → ${v.version_kind}`, () => {
			const nv = normalizeVersion(v.ecosystem, v.version);
			// byte-identical key is the critical cross-language invariant
			expect(nv.version_sort_key).toBe(v.version_sort_key);
			expect(nv.version_kind).toBe(v.version_kind);
			expect(nv.comparable).toBe(v.comparable);
			expect(nv.exact_scheme).toBe(v.exact_scheme);
			expect(nv.is_prerelease).toBe(v.is_prerelease);
			expect(nv.epoch).toBe(v.epoch);
		});
	}
});

describe("versionKeys: semantic ordering of generated keys", () => {
	for (const group of vectors.ordering) {
		it(`${group.ecosystem}: ${group.ascending.join(" < ")}`, () => {
			const keys = group.ascending.map(
				(ver: string) => normalizeVersion(group.ecosystem, ver).version_sort_key,
			);
			for (let i = 0; i < keys.length - 1; i++) {
				expect(keys[i]).not.toBeNull();
				expect(keys[i + 1]).not.toBeNull();
				expect(keys[i]! < keys[i + 1]!).toBe(true);
			}
		});
	}
});

function satisfies(key: string, c: RangeComparator): boolean {
	switch (c.op) {
		case ">=":
			return key >= c.key;
		case ">":
			return key > c.key;
		case "<":
			return key < c.key;
		case "<=":
			return key <= c.key;
		case "=":
			return key === c.key;
	}
}

describe("versionKeys: range predicate evaluation (golden cases)", () => {
	for (const rc of vectors.ranges) {
		it(`${rc.ecosystem} "${rc.predicate}"`, () => {
			const comparators = parseVersionRange(rc.predicate);
			const matched = rc.candidates.filter((cand: string) => {
				const key = normalizeVersion(rc.ecosystem, cand).version_sort_key;
				if (key === null) return false;
				return comparators.every((c) => satisfies(key, c));
			});
			expect(matched.sort()).toEqual([...rc.matches].sort());
		});
	}
});

describe("versionKeys: parsePurl", () => {
	it("plain npm", () => {
		expect(parsePurl("pkg:npm/express@4.18.2")).toEqual({
			ecosystem: "npm",
			packageName: "express",
			version: "4.18.2",
		});
	});
	it("percent-encoded scoped npm (%40 → @)", () => {
		expect(parsePurl("pkg:npm/%40babel/code-frame@7.23.4")).toEqual({
			ecosystem: "npm",
			packageName: "@babel/code-frame",
			version: "7.23.4",
		});
	});
	it("percent-encoded caret version (%5E → ^)", () => {
		expect(parsePurl("pkg:npm/express@%5E4.14.0")?.version).toBe("^4.14.0");
	});
	it("maven group/artifact", () => {
		expect(parsePurl("pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1")).toEqual({
			ecosystem: "maven",
			packageName: "org.apache.logging.log4j/log4j-core",
			version: "2.14.1",
		});
	});
	it("no version", () => {
		expect(parsePurl("pkg:gem/rake")).toEqual({
			ecosystem: "gem",
			packageName: "rake",
			version: "",
		});
	});
	it("rejects non-purl", () => {
		expect(parsePurl("not-a-purl")).toBeNull();
	});
});

describe("versionKeys: packageKey normalisation", () => {
	it("npm lowercases, keeps scope", () => {
		expect(packageKey("npm", "@Babel/Core")).toBe("@babel/core");
	});
	it("pypi PEP 503 fold (._- → -)", () => {
		expect(packageKey("pypi", "Flask_SQLAlchemy")).toBe("flask-sqlalchemy");
		expect(packageKey("pypi", "zope.interface")).toBe("zope-interface");
	});
});

describe("versionKeys: parseVersionRange error handling", () => {
	it("rejects empty", () => {
		expect(() => parseVersionRange("")).toThrow(VersionRangeError);
	});
	it("rejects OR ranges", () => {
		expect(() => parseVersionRange("1.x || 2.x")).toThrow(VersionRangeError);
	});
	it("rejects garbage", () => {
		expect(() => parseVersionRange("banana")).toThrow(VersionRangeError);
	});
	it("parses conjunction", () => {
		const cs = parseVersionRange(">=1.2 <2");
		expect(cs.length).toBe(2);
		expect(cs[0].op).toBe(">=");
		expect(cs[1].op).toBe("<");
	});
	it("D1: rejects over-long input (DoS cap)", () => {
		expect(() => parseVersionRange("1".repeat(1001))).toThrow(VersionRangeError);
	});
	it("D1: rejects too many comparators (DoS cap)", () => {
		const many = Array.from({ length: 21 }, () => ">=1.0.0").join(" ");
		expect(() => parseVersionRange(many)).toThrow(VersionRangeError);
	});
	it("D6: bare 4-part token is an exact match (nuget 1.0.0.0)", () => {
		const cs = parseVersionRange("1.0.0.0");
		expect(cs.length).toBe(1);
		expect(cs[0].op).toBe("=");
		// must equal the key normalizeVersion produces for the same 4-part version
		expect(cs[0].key).toBe(normalizeVersion("nuget", "1.0.0.0").version_sort_key);
	});
});
