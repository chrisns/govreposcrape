import { Request, Response, NextFunction } from "express";

/**
 * Lightweight in-process per-IP sliding-window rate limiter.
 *
 * Defence-in-depth for a public, unauthenticated endpoint: it bounds how fast a
 * single client can drive cache-missing BigQuery queries. It is PER INSTANCE, so
 * it is not a substitute for an edge control — the production backstops are
 * Cloud Armor / an API gateway rate limit and a BigQuery daily-bytes quota — but
 * it meaningfully caps abuse from a single source within an instance.
 *
 * Configure via env: RATE_LIMIT_MAX (requests per window; 0 disables),
 * RATE_LIMIT_WINDOW_MS (window length).
 */
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const MAX_REQ = parseInt(process.env.RATE_LIMIT_MAX || "120", 10);

const buckets = new Map<string, number[]>();

function clientIp(req: Request): string {
	const xff = req.headers["x-forwarded-for"];
	if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
	return req.ip || req.socket?.remoteAddress || "unknown";
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
	if (MAX_REQ <= 0) {
		next();
		return;
	}
	const ip = clientIp(req);
	const now = Date.now();
	const cutoff = now - WINDOW_MS;
	const recent = (buckets.get(ip) || []).filter((t) => t > cutoff);

	if (recent.length >= MAX_REQ) {
		res.setHeader("Retry-After", Math.ceil(WINDOW_MS / 1000).toString());
		res.status(429).json({
			error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
		});
		return;
	}

	recent.push(now);
	buckets.set(ip, recent);

	// Opportunistic cleanup so the map cannot grow unbounded.
	if (buckets.size > 10000) {
		for (const [k, v] of buckets) {
			if (v.every((t) => t <= cutoff)) buckets.delete(k);
		}
	}
	next();
}

/** Reset internal state (tests). */
export function __resetRateLimit(): void {
	buckets.clear();
}
