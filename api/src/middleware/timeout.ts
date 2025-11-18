import { Request, Response, NextFunction } from "express";

/**
 * Request timeout middleware
 * Terminates requests that exceed the specified timeout
 */
export function timeoutMiddleware(timeoutMs: number = 10000) {
	return (req: Request, res: Response, next: NextFunction): void => {
		// Set timeout
		const timeout = setTimeout(() => {
			if (!res.headersSent) {
				console.error(
					JSON.stringify({
						level: "error",
						message: "Request timeout",
						method: req.method,
						path: req.path,
						timeout: timeoutMs,
						timestamp: new Date().toISOString(),
					}),
				);

				res.status(408).json({
					error: {
						code: "TIMEOUT",
						message: `Request exceeded ${timeoutMs}ms timeout`,
					},
				});
			}
		}, timeoutMs);

		// Clear timeout on response finish
		res.on("finish", () => {
			clearTimeout(timeout);
		});

		next();
	};
}
