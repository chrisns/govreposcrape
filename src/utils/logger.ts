/**
 * Structured JSON logger for Cloudflare Workers
 * Outputs JSON-formatted logs compatible with Cloudflare Workers log streaming
 *
 * @example
 * ```typescript
 * const logger = createLogger({ operation: 'fetchRepos' });
 * logger.info('Fetching repositories', { count: 100 });
 * // Output: {"timestamp":"2025-11-12T10:00:00.000Z","level":"info","message":"Fetching repositories","context":{"operation":"fetchRepos","metadata":{"count":100}}}
 * ```
 */

/**
 * Log levels in order of severity
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Log level priority mapping (lower number = higher priority)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Log context attached to every log entry
 */
export interface LogContext {
	/** Optional UUID v4 for request tracing across distributed services */
	requestId?: string;
	/** Required string identifying the function/module/operation */
	operation: string;
	/** Optional key-value pairs for additional context */
	metadata?: Record<string, unknown>;
}

/**
 * Structure of JSON log output
 */
export interface LogEntry {
	/** ISO 8601 timestamp */
	timestamp: string;
	/** Log severity level */
	level: LogLevel;
	/** Human-readable log message */
	message: string;
	/** Context information */
	context: LogContext;
}

/**
 * Logger instance with bound context
 */
export interface Logger {
	/**
	 * Log debug-level message (development only)
	 * @param message - Log message
	 * @param metadata - Optional additional context
	 */
	debug(message: string, metadata?: Record<string, unknown>): void;

	/**
	 * Log info-level message (general information)
	 * @param message - Log message
	 * @param metadata - Optional additional context
	 */
	info(message: string, metadata?: Record<string, unknown>): void;

	/**
	 * Log warning-level message (potential issues)
	 * @param message - Log message
	 * @param metadata - Optional additional context
	 */
	warn(message: string, metadata?: Record<string, unknown>): void;

	/**
	 * Log error-level message (failures)
	 * @param message - Log message
	 * @param metadata - Optional additional context
	 */
	error(message: string, metadata?: Record<string, unknown>): void;
}

/**
 * Create a logger instance with bound base context
 *
 * The logger outputs structured JSON logs to console.log, which are automatically
 * captured by Cloudflare Workers log streaming.
 *
 * @param baseContext - Base context merged with per-call metadata
 * @param minLogLevel - Minimum log level to output (default: "debug"). Logs below this level are filtered.
 * @returns Logger instance with debug, info, warn, error methods
 *
 * @example
 * ```typescript
 * const logger = createLogger({ operation: 'ingestRepo', requestId: 'req-123' }, 'info');
 * logger.debug('Debugging info'); // Filtered out if minLogLevel is 'info'
 * logger.info('Processing repository', { repo: 'alphagov/govuk-frontend' }); // Logged
 * ```
 */
export function createLogger(
	baseContext: Partial<LogContext>,
	minLogLevel: LogLevel = "debug",
): Logger {
	const minPriority = LOG_LEVEL_PRIORITY[minLogLevel];

	/**
	 * Create a log entry and output it as JSON
	 */
	function log(
		level: LogEntry["level"],
		message: string,
		metadata?: Record<string, unknown>,
	): void {
		// Filter logs below the minimum log level
		if (LOG_LEVEL_PRIORITY[level] < minPriority) {
			return;
		}

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			context: {
				operation: baseContext.operation || "unknown",
				...(baseContext.requestId && { requestId: baseContext.requestId }),
				...(metadata && { metadata }),
			},
		};

		// Output as JSON to console.log (Cloudflare Workers compatible)
		console.log(JSON.stringify(entry));
	}

	return {
		debug: (message: string, metadata?: Record<string, unknown>) => log("debug", message, metadata),
		info: (message: string, metadata?: Record<string, unknown>) => log("info", message, metadata),
		warn: (message: string, metadata?: Record<string, unknown>) => log("warn", message, metadata),
		error: (message: string, metadata?: Record<string, unknown>) => log("error", message, metadata),
	};
}
