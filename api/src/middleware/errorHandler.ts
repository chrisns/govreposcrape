import { Request, Response, NextFunction } from "express";

/**
 * MCP Error Response Format
 */
interface MCPErrorResponse {
	error: {
		code: string;
		message: string;
		details?: any;
	};
}

/**
 * Global error handling middleware
 * Catches all uncaught errors and returns MCP-formatted error responses
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
	// Log the error
	console.error(
		JSON.stringify({
			level: "error",
			message: "Uncaught exception in request handler",
			error: err.message,
			stack: err.stack,
			method: req.method,
			path: req.path,
			timestamp: new Date().toISOString(),
		}),
	);

	// Return MCP-formatted error response
	const errorResponse: MCPErrorResponse = {
		error: {
			code: "INTERNAL_ERROR",
			message: "An unexpected error occurred",
			details:
				process.env.NODE_ENV === "development"
					? {
							error: err.message,
							stack: err.stack,
						}
					: undefined,
		},
	};

	res.status(500).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
	const errorResponse: MCPErrorResponse = {
		error: {
			code: "NOT_FOUND",
			message: `Endpoint not found: ${req.method} ${req.path}`,
		},
	};

	res.status(404).json(errorResponse);
}
