# Claude Desktop Integration Guide

**Integrate govscraperepo with Claude Desktop in under 5 minutes**

This guide walks you through configuring Claude Desktop to use the govscraperepo MCP API for discovering UK government code. No authentication required, no complex setup—just add a simple JSON configuration and start searching.

---

## Prerequisites

Before you begin, ensure you have:

- **Claude Desktop installed** (latest version recommended)
  - Download from: [Anthropic Claude Desktop](https://claude.ai/desktop)
- **Production API operational** at `https://govreposcrape.cloud.cns.me`
  - Verify health: `curl https://govreposcrape.cloud.cns.me/mcp/health`
- **Text editor** for editing JSON configuration files

**Estimated completion time:** Under 5 minutes

---

## Configuration Steps

### Step 1: Locate Your Claude Desktop Configuration File

Claude Desktop stores MCP server configuration in a JSON file. The location depends on your operating system:

| Operating System | Configuration File Path |
|------------------|------------------------|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

**Quick access tips:**

- **macOS/Linux**: Open Terminal and run:
  ```bash
  # Navigate to config directory
  cd ~/Library/Application\ Support/Claude  # macOS
  cd ~/.config/Claude                       # Linux

  # Open config file (creates if doesn't exist)
  nano claude_desktop_config.json
  # OR use your preferred editor: vi, code, etc.
  ```

- **Windows**: Open Command Prompt or PowerShell and run:
  ```cmd
  # Navigate to config directory
  cd %APPDATA%\Claude

  # Open config file with Notepad
  notepad claude_desktop_config.json
  ```

### Step 2: Add govscraperepo MCP Configuration

Add the following JSON configuration to your `claude_desktop_config.json` file. If the file is empty or doesn't exist, paste the entire block. If it already contains MCP servers, add the `govscraperepo` entry to the existing `mcpServers` object.

**Complete configuration (new file):**

```json
{
  "mcpServers": {
    "govscraperepo": {
      "url": "https://govreposcrape.cloud.cns.me/mcp",
      "description": "UK Government code discovery - semantic search over 21k government repositories"
    }
  }
}
```

**Adding to existing configuration:**

If you already have other MCP servers configured, your file might look like this:

```json
{
  "mcpServers": {
    "existing-server": {
      "url": "https://example.com/mcp",
      "description": "Example server"
    },
    "govscraperepo": {
      "url": "https://govreposcrape.cloud.cns.me/mcp",
      "description": "UK Government code discovery - semantic search over 21k government repositories"
    }
  }
}
```

**Important:** Ensure your JSON is valid! Common mistakes:
- Missing commas between entries (add `,` after each `}` except the last)
- Extra trailing commas (remove `,` after the last entry)
- Mismatched brackets `{}` or quotes `""`

### Step 3: Restart Claude Desktop

Close Claude Desktop completely and reopen it to load the new configuration.

- **macOS**: Quit Claude (`Cmd+Q`) and reopen from Applications
- **Windows**: Right-click taskbar icon → Exit, then relaunch from Start Menu
- **Linux**: Close all Claude windows and restart the application

### Step 4: Verify Integration

Test the integration with example queries to ensure govscraperepo is working correctly.

---

## Example Queries

Try these queries in Claude Desktop to discover relevant UK government code:

### Query 1: General Technical Search
```
search UK government authentication code
```

**What to expect:** 5 results showing authentication implementations from UK government repositories (e.g., GOV.UK, NHS Digital, HMRC). Each result includes:
- Repository name and organization
- Code snippet showing authentication patterns
- GitHub link for full context
- Similarity score (0.8+ indicates strong relevance)

### Query 2: NHS-Specific Search
```
find NHS API integration examples
```

**What to expect:** 5 results from NHS Digital and related health sector repositories demonstrating API integration patterns, client libraries, and service interfaces.

### Query 3: Postcode Validation
```
show me postcode validation implementations
```

**What to expect:** 5 results showing UK postcode validation logic from government services. Common patterns: regex validation, format checking, lookup services.

---

## Understanding Search Results

Each search result includes the following fields:

| Field | Description | Example |
|-------|-------------|---------|
| **repo_url** | Full GitHub repository URL | `https://github.com/alphagov/govuk-frontend` |
| **repo_org** | GitHub organization name | `alphagov` |
| **repo_name** | Repository name | `govuk-frontend` |
| **snippet** | Code excerpt matching your query | `function authenticate(user, password) { ... }` |
| **last_updated** | When repository was last updated (ISO8601) | `2025-10-15T14:30:00Z` |
| **language** | Detected programming language (if available) | `TypeScript`, `Python`, `Ruby` |
| **similarity_score** | Relevance score (0.0-1.0, higher = more relevant) | `0.92` |
| **github_link** | Direct link to repository | Same as repo_url |
| **codespaces_link** | Open repository in GitHub Codespaces | `https://github.dev/alphagov/govuk-frontend` |

**Interpreting results:**

- **Similarity score 0.8+**: Strong match, highly relevant to your query
- **Similarity score 0.6-0.8**: Moderate match, may be useful
- **Similarity score <0.6**: Weak match, consider refining your query

**Verifying relevance:**
1. Check the `repo_org` field: `alphagov`, `nhsdigital`, `hmrc` indicate official government repositories
2. Review the `snippet` to see if it matches your intent
3. Check `last_updated` to prioritize actively maintained code
4. Click `github_link` to explore the full repository context

---

## Troubleshooting

### Issue 1: "Configuration file not found" or "Permission denied"

**Symptoms:** Can't locate or edit the configuration file

**Solutions:**
- **macOS/Linux**: Ensure the directory exists:
  ```bash
  mkdir -p ~/Library/Application\ Support/Claude  # macOS
  mkdir -p ~/.config/Claude                       # Linux
  ```
- **Windows**: Navigate to `%APPDATA%` in File Explorer and create `Claude` folder if missing
- **Permissions**: Ensure you have write access to the configuration directory
  ```bash
  ls -la ~/Library/Application\ Support/Claude  # macOS/Linux - check permissions
  ```

### Issue 2: "Invalid JSON" or Claude Desktop won't start

**Symptoms:** Claude Desktop crashes or shows JSON parse error after config change

**Solutions:**
- **Validate JSON syntax**: Copy your config and paste into [JSONLint](https://jsonlint.com/) to find errors
- **Common fixes**:
  - Add missing commas between entries: `},"govscraperepo": {`
  - Remove trailing comma after last entry: `"description": "..."` (no comma before closing `}`)
  - Ensure all brackets match: count `{` and `}` - should be equal
  - Check quote marks: use double quotes `"`, not single `'`
- **Backup and restore**: If Claude won't start, rename the config file temporarily:
  ```bash
  mv claude_desktop_config.json claude_desktop_config.json.backup
  ```
  Restart Claude, then fix the JSON syntax and restore

### Issue 3: No search results returned

**Symptoms:** Query completes but returns 0 results or irrelevant results

**Solutions:**
- **Verify API health**:
  ```bash
  curl https://govreposcrape.cloud.cns.me/mcp/health
  # Should return: {"status":"healthy", ...}
  ```
- **Refine your query**:
  - Use natural language phrases instead of single keywords
  - Be specific: "NHS API patient records" vs "NHS"
  - Include context: "How do departments authenticate users?" vs "auth"
- **Try broader searches** if too specific returns nothing:
  - Instead of "HMRC tax calculation microservice", try "HMRC tax calculation"
- **Check for typos** in technical terms

### Issue 4: Network errors or timeouts

**Symptoms:** "Connection refused", "Timeout", or "Network error"

**Solutions:**
- **Check internet connectivity**: Ensure you can reach external sites
- **Verify endpoint**: Test API directly:
  ```bash
  curl -X POST https://govreposcrape.cloud.cns.me/mcp/search \
    -H "Content-Type: application/json" \
    -d '{"query": "authentication", "limit": 5}'
  ```
  Should return JSON with `results` array
- **Firewall/proxy**: If behind corporate firewall, ensure `govreposcrape.cloud.cns.me` is allowed
- **DNS resolution**: Verify domain resolves:
  ```bash
  nslookup govreposcrape.cloud.cns.me
  # Should return IP address
  ```

### Issue 5: Results don't match expectations

**Symptoms:** Search returns code but not from UK government repositories

**Solutions:**
- **Verify repository source**: Check `repo_org` field in results
  - Official UK gov orgs: `alphagov`, `nhsdigital`, `hmrc`, `dwp`, `cabinetoffice`
  - If seeing non-gov results, API may be indexing broader set (report as feedback)
- **Filter by organization**: Mention org in query - "alphagov authentication code"
- **Check last_updated**: Prioritize recently updated repositories for current best practices

---

## Configuration Verification Checklist

Before using govscraperepo in production workflows, verify:

- [ ] Configuration file exists at correct OS-specific path
- [ ] JSON syntax is valid (validated with JSONLint or similar tool)
- [ ] `govscraperepo` entry present in `mcpServers` object
- [ ] URL is exactly `https://govreposcrape.cloud.cns.me/mcp` (HTTPS, no trailing slash on `/mcp`)
- [ ] Claude Desktop restarted after configuration change
- [ ] Example queries return 5 results each
- [ ] Results include UK government repositories (check `repo_org` field)
- [ ] Similarity scores are reasonable (0.6-1.0 range for relevant queries)

---

## Additional Resources

- **MCP v2 Protocol**: [https://modelcontextprotocol.io/v2](https://modelcontextprotocol.io/v2)
- **Claude Desktop Documentation**: Official Anthropic documentation for Claude Desktop and MCP configuration
- **Production API Endpoint**: `https://govreposcrape.cloud.cns.me`
- **API Health Check**: `GET https://govreposcrape.cloud.cns.me/mcp/health`
- **GitHub Repository**: Report issues or contribute to govscraperepo documentation

---

## Feedback and Support

**Found an issue with this guide?**
- Report documentation bugs via GitHub Issues
- Include: OS platform, Claude Desktop version, error message (if applicable)

**Need help?**
- Check troubleshooting section above
- Verify API health with `curl` command
- Ensure configuration JSON is valid

---

**Version:** 1.0
**Last Updated:** 2025-11-14
**Tested with:** Claude Desktop (latest version, November 2025)
**Operating Systems:** macOS 14+, Windows 11, Ubuntu 22.04+
