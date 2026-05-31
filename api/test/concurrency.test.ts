import { describe, it, expect } from "vitest";
import { mapLimit, BoundedCache } from "../src/services/concurrency";

describe("mapLimit", () => {
	it("runs all items, preserves order, never exceeds the concurrency limit", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const fn = async (x: number) => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((r) => setTimeout(r, 2));
			inFlight--;
			return x * 2;
		};
		const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, fn);
		expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
		expect(maxInFlight).toBeLessThanOrEqual(3);
	});

	it("handles an empty list", async () => {
		expect(await mapLimit([], 5, async (x) => x)).toEqual([]);
	});
});

describe("BoundedCache", () => {
	it("stores and retrieves within TTL", () => {
		const c = new BoundedCache<number>(10, 60000);
		c.set("a", 1);
		expect(c.get("a")).toBe(1);
		expect(c.get("missing")).toBeUndefined();
	});

	it("evicts the oldest entry past maxEntries (no unbounded growth)", () => {
		const c = new BoundedCache<number>(2, 60000);
		c.set("a", 1);
		c.set("b", 2);
		c.set("c", 3); // evicts "a"
		expect(c.get("a")).toBeUndefined();
		expect(c.get("b")).toBe(2);
		expect(c.get("c")).toBe(3);
	});

	it("expires entries past TTL", () => {
		const c = new BoundedCache<number>(10, -1); // already-expired TTL
		c.set("a", 1);
		expect(c.get("a")).toBeUndefined();
	});
});
