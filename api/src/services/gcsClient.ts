/**
 * Google Cloud Storage Client Service
 * Provides access to gitingest summaries stored in Cloud Storage
 */

import { Storage } from "@google-cloud/storage";

/**
 * GCS Client for fetching gitingest summaries
 */
export class GCSClient {
	private storage: Storage;
	private bucketName: string;

	constructor() {
		// Initialize Cloud Storage client with application default credentials
		this.storage = new Storage();
		this.bucketName = "govreposcrape-summaries";
	}

	/**
	 * Fetch gitingest summary from Cloud Storage
	 * Path pattern: gs://govreposcrape-summaries/{org}/{repo}.md
	 *
	 * @param org GitHub organization name
	 * @param repo GitHub repository name
	 * @returns Promise resolving to gitingest Markdown content, or null if not found
	 */
	async fetchGitingestSummary(org: string, repo: string): Promise<string | null> {
		const startTime = Date.now();

		try {
			// Construct GCS path
			const filePath = `${org}/${repo}.md`;
			const bucket = this.storage.bucket(this.bucketName);
			const file = bucket.file(filePath);

			// Check if file exists
			const [exists] = await file.exists();
			if (!exists) {
				console.log(
					JSON.stringify({
						level: "info",
						message: "Gitingest summary not found in GCS",
						org,
						repo,
						path: filePath,
						bucket: this.bucketName,
						timestamp: new Date().toISOString(),
					}),
				);
				return null;
			}

			// Download file contents with timeout
			const downloadPromise = file.download();
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error("GCS download timeout")), 2000);
			});

			const [contents] = await Promise.race([downloadPromise, timeoutPromise]);
			const summary = contents.toString("utf-8");

			// Log successful fetch
			const duration = Date.now() - startTime;
			console.log(
				JSON.stringify({
					level: "info",
					message: "Gitingest summary fetched from GCS",
					org,
					repo,
					size: summary.length,
					duration,
					timestamp: new Date().toISOString(),
				}),
			);

			return summary;
		} catch (error) {
			const duration = Date.now() - startTime;

			// Log error with details
			console.error(
				JSON.stringify({
					level: "error",
					message: "Failed to fetch gitingest summary from GCS",
					org,
					repo,
					error: error instanceof Error ? error.message : String(error),
					duration,
					timestamp: new Date().toISOString(),
				}),
			);

			// Return null for graceful degradation
			return null;
		}
	}

	/**
	 * Fetch multiple gitingest summaries in parallel
	 * Optimized for full mode with multiple results
	 *
	 * @param repos Array of { org, repo } objects
	 * @returns Promise resolving to array of summaries (null for missing files)
	 */
	async fetchMultipleSummaries(
		repos: Array<{ org: string; repo: string }>,
	): Promise<Array<string | null>> {
		const startTime = Date.now();

		try {
			// Create fetch promises for all repositories
			const fetchPromises = repos.map((r) => this.fetchGitingestSummary(r.org, r.repo));

			// Execute all fetches in parallel
			const summaries = await Promise.all(fetchPromises);

			// Log batch metrics
			const duration = Date.now() - startTime;
			const successCount = summaries.filter((s) => s !== null).length;
			console.log(
				JSON.stringify({
					level: "info",
					message: "Batch gitingest fetch completed",
					total: repos.length,
					successful: successCount,
					failed: repos.length - successCount,
					duration,
					avgDuration: Math.round(duration / repos.length),
					timestamp: new Date().toISOString(),
				}),
			);

			return summaries;
		} catch (error) {
			const duration = Date.now() - startTime;

			console.error(
				JSON.stringify({
					level: "error",
					message: "Batch gitingest fetch failed",
					total: repos.length,
					error: error instanceof Error ? error.message : String(error),
					duration,
					timestamp: new Date().toISOString(),
				}),
			);

			// Return array of nulls for graceful degradation
			return repos.map(() => null);
		}
	}
}
