import { SearchServiceClient } from "@google-cloud/discoveryengine";

async function testSearch() {
	const client = new SearchServiceClient();

	const searchEngineId =
		"projects/1060386346356/locations/global/collections/default_collection/engines/govreposcrape-search";

	const request = {
		servingConfig: `${searchEngineId}/servingConfigs/default_config`,
		query: "authentication",
		pageSize: 5,
		queryExpansionSpec: {
			condition: "AUTO" as const,
		},
		spellCorrectionSpec: {
			mode: "AUTO" as const,
		},
	};

	console.log("Executing search...\n");

	const [response] = await client.search(request as any);

	console.log("Raw response structure:");
	console.log("Response is array:", Array.isArray(response));
	console.log("Response length:", response?.length || 0);

	if (response && Array.isArray(response) && response.length > 0) {
		const firstResult = response[0];
		console.log("\nFirst result structure:");
		console.log(JSON.stringify(firstResult, null, 2));

		if (firstResult.document) {
			console.log("\nDocument structure:");
			console.log("- name:", firstResult.document.name);
			console.log("- structData:", JSON.stringify(firstResult.document.structData, null, 2));
			console.log(
				"- derivedStructData:",
				JSON.stringify(firstResult.document.derivedStructData, null, 2),
			);
		}
	}
}

testSearch().catch(console.error);
