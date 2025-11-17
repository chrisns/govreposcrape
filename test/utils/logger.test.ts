/**
 * Tests for structured JSON logger utility
 * Validates JSON output, log levels, context propagation, and ISO 8601 timestamps
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, type LogEntry } from "../../src/utils/logger";

describe("createLogger", () => {
	// Mock console.log to capture output
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
	});

	describe("Log output format", () => {
		it("should create valid JSON output", () => {
			const logger = createLogger({ operation: "test" });
			logger.info("Test message");

			expect(consoleLogSpy).toHaveBeenCalledOnce();
			const output = consoleLogSpy.mock.calls[0][0];

			// Should be valid JSON
			expect(() => JSON.parse(output)).not.toThrow();
		});

		it("should include all required fields in log entry", () => {
			const logger = createLogger({ operation: "test" });
			logger.info("Test message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;

			expect(output).toHaveProperty("timestamp");
			expect(output).toHaveProperty("level");
			expect(output).toHaveProperty("message");
			expect(output).toHaveProperty("context");
		});

		it("should have valid ISO 8601 timestamp", () => {
			const logger = createLogger({ operation: "test" });
			logger.info("Test message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;

			// ISO 8601 format validation
			const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
			expect(output.timestamp).toMatch(iso8601Regex);

			// Should be a valid date
			expect(new Date(output.timestamp).toString()).not.toBe("Invalid Date");
		});
	});

	describe("Log levels", () => {
		it("should output debug level correctly", () => {
			const logger = createLogger({ operation: "test" });
			logger.debug("Debug message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.level).toBe("debug");
			expect(output.message).toBe("Debug message");
		});

		it("should output info level correctly", () => {
			const logger = createLogger({ operation: "test" });
			logger.info("Info message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.level).toBe("info");
			expect(output.message).toBe("Info message");
		});

		it("should output warn level correctly", () => {
			const logger = createLogger({ operation: "test" });
			logger.warn("Warning message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.level).toBe("warn");
			expect(output.message).toBe("Warning message");
		});

		it("should output error level correctly", () => {
			const logger = createLogger({ operation: "test" });
			logger.error("Error message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.level).toBe("error");
			expect(output.message).toBe("Error message");
		});
	});

	describe("Context handling", () => {
		it("should include operation in context", () => {
			const logger = createLogger({ operation: "fetchRepos" });
			logger.info("Test message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.context.operation).toBe("fetchRepos");
		});

		it("should include requestId when provided", () => {
			const logger = createLogger({
				operation: "test",
				requestId: "req-123",
			});
			logger.info("Test message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.context.requestId).toBe("req-123");
		});

		it("should merge per-call metadata with base context", () => {
			const logger = createLogger({ operation: "test" });
			logger.info("Test message", { count: 100, status: "success" });

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.context.metadata).toEqual({
				count: 100,
				status: "success",
			});
		});

		it("should handle undefined metadata gracefully", () => {
			const logger = createLogger({ operation: "test" });
			logger.info("Test message", undefined);

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.context.metadata).toBeUndefined();
		});

		it("should handle empty metadata object", () => {
			const logger = createLogger({ operation: "test" });
			logger.info("Test message", {});

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.context.metadata).toEqual({});
		});

		it('should use "unknown" as default operation if not provided', () => {
			const logger = createLogger({});
			logger.info("Test message");

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.context.operation).toBe("unknown");
		});
	});

	describe("JSON parsing", () => {
		it("should produce parseable JSON output", () => {
			const logger = createLogger({
				operation: "test",
				requestId: "req-456",
			});
			logger.info("Complex message", {
				nested: { data: "value" },
				array: [1, 2, 3],
			});

			const output = consoleLogSpy.mock.calls[0][0];
			const parsed = JSON.parse(output) as LogEntry;

			expect(parsed.message).toBe("Complex message");
			expect(parsed.context.metadata).toEqual({
				nested: { data: "value" },
				array: [1, 2, 3],
			});
		});

		it("should handle special characters in messages", () => {
			const logger = createLogger({ operation: "test" });
			logger.info('Message with "quotes" and \\backslashes\\');

			const output = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
			expect(output.message).toBe('Message with "quotes" and \\backslashes\\');
		});
	});
});
