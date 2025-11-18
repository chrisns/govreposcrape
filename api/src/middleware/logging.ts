import { Request, Response, NextFunction } from "express";

/**
 * Structured JSON logging middleware
 * Logs all incoming requests with structured metadata
 */
export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
	const startTime = Date.now();

	// Log request start
	console.log(
		JSON.stringify({
			level: "info",
			message: "Request started",
			method: req.method,
			path: req.path,
			query: req.query,
			ip: req.ip,
			userAgent: req.get("user-agent"),
			timestamp: new Date().toISOString(),
		}),
	);

	// Capture the original end function
	const originalEnd = res.end;

	// Override res.end to log response
	res.end = function (this: Response, chunk?: any, encoding?: any, callback?: any): Response {
		const duration = Date.now() - startTime;

		// Log request completion
		console.log(
			JSON.stringify({
				level: "info",
				message: "Request completed",
				method: req.method,
				path: req.path,
				statusCode: res.statusCode,
				duration,
				timestamp: new Date().toISOString(),
			}),
		);

		// Call original end function
		return originalEnd.call(this, chunk, encoding, callback);
	} as any;

	next();
}
