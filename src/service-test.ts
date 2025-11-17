/**
 * Service Connectivity Test Script
 * Tests connectivity to all Cloudflare service bindings: D1, KV, R2, Vectorize
 */

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const results: Record<string, { status: string; message: string }> = {};

		// Test D1 Database
		try {
			const d1Result = await env.DB.prepare("SELECT 1 as test").first();
			results.d1 = {
				status: d1Result?.test === 1 ? "OK" : "FAILED",
				message:
					d1Result?.test === 1 ? "D1 connection successful" : "D1 query returned unexpected result",
			};
		} catch (error) {
			results.d1 = {
				status: "ERROR",
				message: `D1 error: ${error instanceof Error ? error.message : String(error)}`,
			};
		}

		// Test KV Namespace
		try {
			await env.KV.put("test-key", "test-value");
			const kvValue = await env.KV.get("test-key");
			await env.KV.delete("test-key");

			results.kv = {
				status: kvValue === "test-value" ? "OK" : "FAILED",
				message: kvValue === "test-value" ? "KV read/write successful" : "KV value mismatch",
			};
		} catch (error) {
			results.kv = {
				status: "ERROR",
				message: `KV error: ${error instanceof Error ? error.message : String(error)}`,
			};
		}

		// Test R2 Bucket
		try {
			await env.R2.put("test-object.txt", "test content");
			const r2Object = await env.R2.get("test-object.txt");
			const r2Content = r2Object ? await r2Object.text() : null;
			await env.R2.delete("test-object.txt");

			results.r2 = {
				status: r2Content === "test content" ? "OK" : "FAILED",
				message:
					r2Content === "test content" ? "R2 upload/download successful" : "R2 content mismatch",
			};
		} catch (error) {
			results.r2 = {
				status: "ERROR",
				message: `R2 error: ${error instanceof Error ? error.message : String(error)}`,
			};
		}

		// Test Vectorize Index
		try {
			// Simply verify that the Vectorize binding is accessible
			// Full insert/query testing would require more setup and eventual consistency handling
			const testVector = new Array(768).fill(0.1);

			// Attempt a query to verify the index is accessible (it's OK if no results)
			const queryResult = await env.VECTORIZE.query(testVector, { topK: 1 });

			results.vectorize = {
				status: "OK",
				message: `Vectorize connection successful (index accessible, query returned ${queryResult.matches.length} matches)`,
			};
		} catch (error) {
			results.vectorize = {
				status: "ERROR",
				message: `Vectorize error: ${error instanceof Error ? error.message : String(error)}`,
			};
		}

		// Compile overall status
		const allOk = Object.values(results).every((r) => r.status === "OK");
		const statusCode = allOk ? 200 : 500;

		return new Response(
			JSON.stringify(
				{
					overall: allOk ? "ALL SERVICES OK" : "SOME SERVICES FAILED",
					timestamp: new Date().toISOString(),
					results,
				},
				null,
				2,
			),
			{
				status: statusCode,
				headers: { "Content-Type": "application/json" },
			},
		);
	},
} satisfies ExportedHandler<Env>;
