import { describe, it, expect, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import { validateResultMode } from "../src/middleware/validateRequest";
import { MCPErrorResponse } from "../src/types/mcp";

describe("validateResultMode middleware", () => {
	// Helper to create mock Express objects
	function createMocks() {
		const req = {
			body: {},
		} as Request;

		const res = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
		} as unknown as Response;

		const next = vi.fn() as NextFunction;

		return { req, res, next };
	}

	describe("AC-1: Valid resultMode values", () => {
		it('should accept "minimal" as valid', () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = "minimal";

			validateResultMode(req, res, next);

			expect(next).toHaveBeenCalledOnce();
			expect(res.status).not.toHaveBeenCalled();
		});

		it('should accept "snippets" as valid', () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = "snippets";

			validateResultMode(req, res, next);

			expect(next).toHaveBeenCalledOnce();
			expect(res.status).not.toHaveBeenCalled();
		});

		it('should accept "full" as valid', () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = "full";

			validateResultMode(req, res, next);

			expect(next).toHaveBeenCalledOnce();
			expect(res.status).not.toHaveBeenCalled();
		});

		it('should default to "snippets" when resultMode is undefined', () => {
			const { req, res, next } = createMocks();
			// resultMode not set

			validateResultMode(req, res, next);

			expect(req.body.resultMode).toBe("snippets");
			expect(next).toHaveBeenCalledOnce();
			expect(res.status).not.toHaveBeenCalled();
		});
	});

	describe("AC-2: Invalid resultMode values and error format", () => {
		it("should reject invalid string value", () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = "invalid";

			validateResultMode(req, res, next);

			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledOnce();

			const errorResponse = (res.json as any).mock.calls[0][0] as MCPErrorResponse;
			expect(errorResponse.error.code).toBe("INVALID_RESULT_MODE");
			expect(errorResponse.error.message).toContain("minimal, snippets, full");
			expect(errorResponse.error.allowed_values).toEqual(["minimal", "snippets", "full"]);
		});

		it('should reject case-variant "MINIMAL" (case sensitivity test)', () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = "MINIMAL";

			validateResultMode(req, res, next);

			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(400);

			const errorResponse = (res.json as any).mock.calls[0][0] as MCPErrorResponse;
			expect(errorResponse.error.code).toBe("INVALID_RESULT_MODE");
			expect(errorResponse.error.allowed_values).toEqual(["minimal", "snippets", "full"]);
		});

		it("should reject null value", () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = null;

			validateResultMode(req, res, next);

			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(400);

			const errorResponse = (res.json as any).mock.calls[0][0] as MCPErrorResponse;
			expect(errorResponse.error.code).toBe("INVALID_RESULT_MODE");
			expect(errorResponse.error.message).toContain("must be a string");
		});

		it("should reject number value", () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = 123;

			validateResultMode(req, res, next);

			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(400);

			const errorResponse = (res.json as any).mock.calls[0][0] as MCPErrorResponse;
			expect(errorResponse.error.code).toBe("INVALID_RESULT_MODE");
			expect(errorResponse.error.message).toContain("must be a string");
		});

		it("should reject object value", () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = { mode: "minimal" };

			validateResultMode(req, res, next);

			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(400);
		});

		it("should reject array value", () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = ["minimal"];

			validateResultMode(req, res, next);

			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(400);
		});

		it("should return error with allowed_values array", () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = "bad-value";

			validateResultMode(req, res, next);

			const errorResponse = (res.json as any).mock.calls[0][0] as MCPErrorResponse;
			expect(errorResponse.error.allowed_values).toEqual(["minimal", "snippets", "full"]);
		});

		it("should return clear and actionable error message", () => {
			const { req, res, next } = createMocks();
			req.body.resultMode = "wrong";

			validateResultMode(req, res, next);

			const errorResponse = (res.json as any).mock.calls[0][0] as MCPErrorResponse;
			expect(errorResponse.error.message).toMatch(/resultMode must be one of/);
			expect(errorResponse.error.message).toContain("minimal");
			expect(errorResponse.error.message).toContain("snippets");
			expect(errorResponse.error.message).toContain("full");
		});
	});
});
