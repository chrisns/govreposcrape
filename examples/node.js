#!/usr/bin/env node
/**
 * govscraperepo MCP API - Node.js/JavaScript Example
 * Demonstrates how to search UK government code repositories using fetch API
 *
 * Prerequisites: Node.js 18+ (for built-in fetch support)
 * Usage: node examples/node.js
 *
 * This example shows:
 * - Basic search query for API integration patterns
 * - Type-safe response handling (TypeScript-compatible)
 * - Comprehensive error handling with specific error codes
 * - Result display and metadata extraction
 */

// API Configuration
const API_BASE = process.env.MCP_API_URL || 'https://govreposcrape-api-1060386346356.us-central1.run.app';
const API_URL = `${API_BASE}/mcp/search`;
const HEALTH_URL = `${API_BASE}/mcp/health`;

// ANSI color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

/**
 * Make a search request to the MCP API
 *
 * @param {string} query - Search query (3-500 characters)
 * @param {number} limit - Number of results (1-20, default 5)
 * @returns {Promise<{results: Array, took_ms: number}>} Search response
 * @throws {Error} On network errors or API failures
 */
async function searchCode(query, limit = 5) {
  try {
    // Make POST request with required headers
    // - Content-Type: application/json is REQUIRED
    // - X-MCP-Version: 2 is optional but recommended
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MCP-Version': '2',
      },
      body: JSON.stringify({
        query,
        limit,
      }),
    });

    // Parse JSON response
    const data = await response.json();

    // Check for HTTP errors
    if (!response.ok) {
      // API returned an error response
      const error = new Error(data.error?.message || 'API request failed');
      error.code = data.error?.code || 'UNKNOWN_ERROR';
      error.status = response.status;
      error.details = data.error;
      throw error;
    }

    return data;
  } catch (error) {
    // Network errors or fetch failures
    if (error.code) {
      // Rethrow API errors as-is
      throw error;
    }

    // Wrap network/fetch errors
    const wrappedError = new Error(`Network error: ${error.message}`);
    wrappedError.code = 'NETWORK_ERROR';
    wrappedError.originalError = error;
    throw wrappedError;
  }
}

/**
 * Check API health status
 *
 * @returns {Promise<{status: string, services: object, timestamp: string}>}
 */
async function checkHealth() {
  const response = await fetch(HEALTH_URL);
  return await response.json();
}

/**
 * Display search results in a user-friendly format
 *
 * @param {{results: Array, took_ms: number}} response - Search response
 */
function displayResults(response) {
  const { results, took_ms } = response;

  console.log(`\n${colors.blue}📊 Results: ${results.length} repositories found in ${took_ms}ms${colors.reset}\n`);

  if (results.length === 0) {
    console.log(`${colors.yellow}No results found. Try a different query.${colors.reset}`);
    return;
  }

  // Display each result
  results.forEach((result, index) => {
    console.log(`${colors.green}[${index + 1}] ${result.repository}${colors.reset}`);
    console.log(`    Score: ${result.relevance_score.toFixed(3)}`);
    console.log(`    Language: ${result.metadata.language}`);
    console.log(`    GitHub: ${result.metadata.github_url}`);

    // Display snippet (truncated if too long)
    const snippet = result.match_snippet.substring(0, 200);
    const truncated = result.match_snippet.length > 200 ? '...' : '';
    console.log(`    Snippet: ${snippet}${truncated}`);
    console.log('');
  });
}

/**
 * Display error in a user-friendly format
 *
 * @param {Error} error - Error object with code and details
 */
function displayError(error) {
  console.error(`\n${colors.red}❌ Error: ${error.message}${colors.reset}`);

  if (error.code) {
    console.error(`   Code: ${error.code}`);
  }

  if (error.status) {
    console.error(`   HTTP Status: ${error.status}`);
  }

  if (error.details) {
    console.error(`   Details: ${JSON.stringify(error.details, null, 2)}`);
  }

  console.error('');
}

/**
 * Main execution function
 */
async function main() {
  console.log('🔍 govscraperepo MCP API - Node.js Example');
  console.log('==========================================\n');

  // Example 1: Successful search query
  console.log('📝 Example 1: Search for Express.js API endpoint patterns');
  console.log("Query: 'Express.js API endpoint handler middleware route'\n");

  try {
    const results = await searchCode('Express.js API endpoint handler middleware route', 5);
    console.log(`${colors.green}✅ Success!${colors.reset}`);
    displayResults(results);
  } catch (error) {
    displayError(error);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Example 2: Error handling - Query too short
  console.log('📝 Example 2: Error handling - Query too short (< 3 chars)');
  console.log("Query: 'ab' (only 2 characters)\n");

  try {
    await searchCode('ab', 5);
  } catch (error) {
    console.log(`${colors.green}✅ Error handling works correctly${colors.reset}`);
    displayError(error);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Example 3: Error handling - Limit out of range
  console.log('📝 Example 3: Error handling - Limit out of range (> 20)');
  console.log('Limit: 100 (maximum is 20)\n');

  try {
    await searchCode('authentication middleware', 100);
  } catch (error) {
    console.log(`${colors.green}✅ Validation works correctly${colors.reset}`);
    displayError(error);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Example 4: Health check
  console.log('📝 Example 4: API Health Check');
  console.log(`Endpoint: GET ${HEALTH_URL}\n`);

  try {
    const health = await checkHealth();

    if (health.status === 'healthy') {
      console.log(`${colors.green}✅ API is healthy${colors.reset}`);
      console.log(`   Status: ${health.status}`);
      console.log(`   Services: ${Object.keys(health.services).length} checked`);
      console.log(`   Timestamp: ${health.timestamp}\n`);
    } else {
      console.log(`${colors.yellow}⚠️ API has issues${colors.reset}`);
      console.log(JSON.stringify(health, null, 2));
    }
  } catch (error) {
    console.error(`${colors.red}❌ Health check failed${colors.reset}`);
    displayError(error);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🎉 Examples complete!\n');
  console.log('💡 Next steps:');
  console.log('   - Try your own queries by modifying the query string');
  console.log('   - Adjust limit (1-20) to get more or fewer results');
  console.log('   - See README.md for cURL and Python examples');
  console.log('   - Run ./scripts/test-mcp.sh to validate your integration\n');
  console.log('📚 API Documentation:');
  console.log(`   - OpenAPI Spec: ${API_BASE}/openapi.json`);
  console.log('   - Integration Guide: docs/integration/claude-desktop.md\n');
}

// Run main function and handle errors
main().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
