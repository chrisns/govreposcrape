import { Request, Response, NextFunction } from "express";
import { ResultMode, MCPErrorResponse } from "../types/mcp";

/**
 * Allowed values for resultMode parameter
 */
const ALLOWED_RESULT_MODES: ResultMode[] = ["minimal", "snippets", "full"];

/**
 * Default result mode when parameter is omitted
 */
const DEFAULT_RESULT_MODE: ResultMode = "snippets";

/**
 * Validate and normalize the resultMode parameter
 *
 * - Validates that resultMode is one of: "minimal", "snippets", "full"
 * - Sets default value of "snippets" if omitted
 * - Returns 400 error for invalid values
 * - Attaches validated resultMode to req.body for downstream handlers
 */
export function validateResultMode(req: Request, res: Response, next: NextFunction): void {
	const { resultMode } = req.body;

	// If resultMode is undefined, set default value
	if (resultMode === undefined) {
		req.body.resultMode = DEFAULT_RESULT_MODE;
		next();
		return;
	}

	// Validate that resultMode is a string
	if (typeof resultMode !== "string") {
		const errorResponse: MCPErrorResponse = {
			error: {
				code: "INVALID_RESULT_MODE",
				message: "resultMode must be a string",
				allowed_values: ALLOWED_RESULT_MODES,
			},
		};
		res.status(400).json(errorResponse);
		return;
	}

	// Validate that resultMode is one of the allowed values (case-sensitive)
	if (!ALLOWED_RESULT_MODES.includes(resultMode as ResultMode)) {
		const errorResponse: MCPErrorResponse = {
			error: {
				code: "INVALID_RESULT_MODE",
				message: `resultMode must be one of: ${ALLOWED_RESULT_MODES.join(", ")}`,
				allowed_values: ALLOWED_RESULT_MODES,
			},
		};
		res.status(400).json(errorResponse);
		return;
	}

	// Valid resultMode - continue to next middleware/handler
	next();
}
