#!/usr/bin/osascript

-- Test the govreposcrape MCP server in Claude Code
-- This script:
-- 1. Quits any existing Claude Code session
-- 2. Launches a new Claude Code session
-- 3. Sends a test query to search UK government code
-- 4. Waits for results

tell application "Terminal"
	activate

	-- Close existing Claude Code sessions
	do script "pkill -f 'claude-code' || true" in window 1
	delay 2

	-- Change to project directory and start new Claude Code session
	set projectPath to "/Users/cns/httpdocs/cddo/govreposcrape"
	do script "cd " & quoted form of projectPath in window 1
	delay 1

	-- Start Claude Code with test query
	set testQuery to "Search UK government code for 'NHS API integration' and show me the first 3 results"
	do script "echo " & quoted form of testQuery & " | claude-code" in window 1

	-- Wait for results
	delay 5

	-- Display success message
	display dialog "MCP Server Test Initiated!" & return & return & "Query: " & testQuery & return & return & "Check Terminal for results." buttons {"OK"} default button "OK"

end tell
