#!/bin/bash

# Test the govreposcrape MCP server
# This script opens a new Terminal window and runs a test Claude Code session

echo "🧪 Testing govreposcrape MCP server..."
echo ""
echo "Opening new Terminal window with Claude Code..."
echo ""

# Create test query
TEST_QUERY="Search UK government code for NHS API integration and show me the first 5 results"

# Open new Terminal window and run Claude Code
osascript <<EOF
tell application "Terminal"
    activate
    set newTab to do script "cd /Users/cns/httpdocs/cddo/govreposcrape && echo '$TEST_QUERY' | claude-code"
end tell
EOF

echo "✅ Test initiated in new Terminal window"
echo ""
echo "Test Query: $TEST_QUERY"
