import { DocumentServiceClient } from "@google-cloud/discoveryengine";

async function triggerImport() {
	const client = new DocumentServiceClient();

	const parent =
		"projects/1060386346356/locations/global/collections/default_collection/dataStores/govreposcrape-summaries/branches/0";

	const request = {
		parent,
		gcsSource: {
			inputUris: ["gs://govreposcrape-summaries/**/*.jsonl"],
			dataSchema: "custom", // Use custom schema for flexibility
		},
		reconciliationMode: "INCREMENTAL",
	};

	console.log("Triggering Vertex AI Search import...");
	console.log("GCS URI: gs://govreposcrape-summaries/**/*.jsonl");
	console.log("Schema: custom");
	console.log("Reconciliation mode: INCREMENTAL\n");

	try {
		const [operation] = await client.importDocuments(request as any);
		console.log("✓ Import operation triggered successfully");
		console.log(`Operation name: ${operation.name}`);
	} catch (error) {
		console.error("✗ Import failed:", error);
		process.exit(1);
	}
}

triggerImport();
