#!/usr/bin/env node
/**
 * MCP Server for UK Government Code Search
 * Provides tools for searching UK government repositories via Vertex AI Search
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

const API_URL = process.env.MCP_API_URL || 'https://govreposcrape-api-1060386346356.us-central1.run.app/mcp/search';

// Create server instance
const server = new Server(
  {
    name: 'govreposcrape',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_uk_gov_code',
        description: 'Search across ~21,000 UK government repositories for code examples, libraries, and patterns. Returns repository names and GitHub URLs.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (e.g., "authentication middleware", "postcode validation", "NHS API")',
            },
            limit: {
              type: 'number',
              description: 'Number of results to return (1-100, default: 20)',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
          required: ['query'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'search_uk_gov_code') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { query, limit = 20 } = request.params.arguments;

  if (!query || typeof query !== 'string') {
    throw new Error('Query parameter is required and must be a string');
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Format results for Claude
    const formattedResults = data.results
      .map((result, index) => {
        return `${index + 1}. **${result.title}**
   - URL: ${result.url}
   - Organization: ${result.metadata.org}
   - Repository: ${result.metadata.repo}`;
      })
      .join('\n\n');

    const summary = `Found ${data.metadata.resultCount} UK government repositories matching "${query}" (searched in ${data.metadata.duration}ms):\n\n${formattedResults}`;

    return {
      content: [
        {
          type: 'text',
          text: summary,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error searching UK government code: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('UK Government Code Search MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
