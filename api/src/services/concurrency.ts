/** Run `fn` over `items` with at most `limit` promises in flight at once. */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	async function worker(): Promise<void> {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	}
	const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, worker);
	await Promise.all(workers);
	return results;
}

/** Bounded, insertion-order-evicting TTL cache (prevents unbounded Map growth). */
export class BoundedCache<V> {
	private map = new Map<string, { value: V; expires: number }>();
	constructor(
		private maxEntries: number,
		private ttlMs: number,
	) {}
	get(key: string): V | undefined {
		const e = this.map.get(key);
		if (e && e.expires > Date.now()) return e.value;
		if (e) this.map.delete(key);
		return undefined;
	}
	set(key: string, value: V): void {
		if (this.map.size >= this.maxEntries) {
			const oldest = this.map.keys().next().value;
			if (oldest !== undefined) this.map.delete(oldest);
		}
		this.map.set(key, { value, expires: Date.now() + this.ttlMs });
	}
	clear(): void {
		this.map.clear();
	}
}
