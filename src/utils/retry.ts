/**
 * Retry utility with exponential backoff
 * Implements architecture.md retry pattern: 3 attempts with delays [1s, 2s, 4s]
 *
 * Use cases:
 * - repos.json fetch failures
 * - gitingest container processing errors
 * - R2 upload failures
 * - AI Search query timeouts
 *
 * @example
 * ```typescript
 * const data = await withRetry(
 *   () => fetch('https://example.com/repos.json').then(r => r.json()),
 *   3,
 *   [1000, 2000, 4000]
 * );
 * ```
 */

import { createLogger } from "./logger";

const logger = createLogger({ operation: "retry" });

/**
 * Execute a function with retry logic and exponential backoff
 *
 * Retries the provided function up to maxRetries times, waiting progressively
 * longer between attempts. Throws the last error if all retries are exhausted.
 *
 * @template T - Return type of the function
 * @param fn - Async function to execute with retry logic
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param delays - Array of delay durations in milliseconds for each retry (default: [1000, 2000, 4000])
 * @returns Promise resolving to the function's return value
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * // Retry fetch with default settings (3 attempts, 1s/2s/4s delays)
 * const response = await withRetry(() => fetch('/api/data'));
 *
 * // Custom retry configuration
 * const result = await withRetry(
 *   () => processRepository(repo),
 *   5,  // 5 attempts
 *   [500, 1000, 2000, 4000, 8000]  // custom delays
 * );
 * ```
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries = 3,
	delays = [1000, 2000, 4000],
): Promise<T> {
	let lastError: Error | unknown;
	let attempt = 0;

	while (attempt < maxRetries) {
		try {
			// Attempt to execute the function
			const result = await fn();

			// Log successful retry if this wasn't the first attempt
			if (attempt > 0) {
				logger.info("Retry succeeded", {
					attempt: attempt + 1,
					totalAttempts: maxRetries,
				});
			}

			return result;
		} catch (error) {
			lastError = error;
			attempt++;

			// If we've exhausted all retries, throw the last error
			if (attempt >= maxRetries) {
				logger.error("All retry attempts exhausted", {
					attempts: maxRetries,
					error: error instanceof Error ? error.message : String(error),
				});
				throw lastError;
			}

			// Calculate delay for this retry attempt (use array index, fallback to last delay)
			const delay = delays[attempt - 1] ?? delays[delays.length - 1];

			// Log retry attempt
			logger.warn("Retry attempt failed, will retry", {
				attempt: attempt,
				maxRetries,
				nextDelayMs: delay,
				error: error instanceof Error ? error.message : String(error),
			});

			// Wait before next attempt
			await sleep(delay);
		}
	}

	// This should never be reached, but TypeScript requires it
	throw lastError;
}

/**
 * Sleep for specified milliseconds
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
