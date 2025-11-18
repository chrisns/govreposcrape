# GitHub Copilot Integration Guide

**⚠️ IMPORTANT: GitHub Copilot MCP Support Status**

> **GitHub Copilot MCP (Model Context Protocol) support is currently in preview and not yet publicly available.**
>
> This guide provides the expected configuration format based on the MCP v2 specification. When GitHub officially releases MCP support for Copilot, you can use this guide to configure govscraperepo integration.
>
> **Check GitHub Copilot release notes** for the latest MCP support status: [GitHub Copilot Updates](https://github.blog/changelog/)

---

## What is MCP for GitHub Copilot?

The Model Context Protocol (MCP) enables AI coding assistants like GitHub Copilot to access external data sources and APIs. Once GitHub releases MCP support, you'll be able to:

- Search UK government code repositories directly from VS Code or JetBrains IDEs
- Get semantic code search results inline with Copilot suggestions
- Discover relevant government code patterns while developing

**Current Status:** Awaiting GitHub's official MCP release for Copilot. This guide will be updated when the feature becomes available.

---

## Expected Prerequisites (When Available)

Before configuring MCP for GitHub Copilot, you'll need:

- **GitHub Copilot subscription** (Individual, Business, or Enterprise)
- **Supported IDE** with Copilot extension:
  - Visual Studio Code with GitHub Copilot extension
  - JetBrains IDEs (IntelliJ IDEA, PyCharm, WebStorm, etc.) with GitHub Copilot plugin
- **MCP support enabled** in your Copilot extension (check extension settings when released)
- **Production API operational** at `https://govreposcrape-api-1060386346356.us-central1.run.app`

---

## Expected Configuration Format

Based on the MCP v2 specification, GitHub Copilot MCP configuration is expected to follow this format:

### VS Code Configuration (Expected)

MCP servers for GitHub Copilot will likely be configured in VS Code settings (`settings.json`):

**File location:** `.vscode/settings.json` (workspace) or User Settings (global)

**Expected configuration:**

```json
{
  "github.copilot.mcpServers": {
    "govscraperepo": {
      "url": "https://govreposcrape-api-1060386346356.us-central1.run.app/mcp",
      "description": "UK Government code discovery - semantic search over 21k government repositories",
      "enabled": true
    }
  }
}
```

**Note:** The exact configuration key (`github.copilot.mcpServers`) and structure may differ when GitHub releases MCP support. Check official GitHub Copilot documentation for the authoritative format.

### JetBrains IDEs Configuration (Expected)

For JetBrains IDEs (IntelliJ IDEA, PyCharm, etc.), MCP configuration will likely be in IDE settings:

**Expected location:** Settings → Tools → GitHub Copilot → MCP Servers

**Expected format:** GUI-based configuration or JSON file similar to VS Code format

---

## Example Usage (When Available)

Once MCP support is enabled, you'll be able to query govscraperepo directly from your IDE:

### Example Query 1: Inline Code Search
```
// In your code editor, use Copilot to search:
// "Show me UK government authentication patterns"
```

**Expected behavior:** Copilot will query govscraperepo MCP API and provide inline code suggestions based on UK government repository patterns.

### Example Query 2: API Integration Patterns
```
// "Find NHS API integration examples"
```

**Expected behavior:** Copilot returns code snippets from NHS Digital repositories demonstrating API client implementations, error handling, and service integration patterns.

### Example Query 3: Specific Implementations
```
// "How do UK government services validate postcodes?"
```

**Expected behavior:** Copilot provides postcode validation implementations from government repositories, including regex patterns, format checkers, and lookup service integrations.

---

## Troubleshooting (When Feature is Available)

### Issue 1: MCP option not visible in Copilot settings

**Solutions:**
- Verify you're using the latest version of the GitHub Copilot extension
- Check GitHub's official documentation for MCP support availability
- Ensure your Copilot subscription tier supports MCP (may be limited to Business/Enterprise initially)
- Update your IDE to the latest version

### Issue 2: govscraperepo server not connecting

**Solutions:**
- Verify API health:
  ```bash
  curl https://govreposcrape-api-1060386346356.us-central1.run.app/mcp/health
  ```
- Check IDE proxy/firewall settings if behind corporate network
- Ensure `govscraperepo.cloud.cns.me` is accessible from your development environment
- Review Copilot extension logs for connection errors

### Issue 3: Search results not appearing in Copilot suggestions

**Solutions:**
- Confirm MCP server is enabled in Copilot settings (check `"enabled": true`)
- Try explicit queries mentioning "UK government" or specific departments (NHS, HMRC, etc.)
- Restart your IDE after configuration changes
- Check Copilot status bar for MCP connection indicator

---

## Comparison: Claude Desktop vs GitHub Copilot

| Feature | Claude Desktop | GitHub Copilot (when available) |
|---------|----------------|--------------------------------|
| **MCP Support Status** | ✅ Available now | ⚠️ Preview/Coming soon |
| **Configuration** | JSON file in user directory | IDE settings (VS Code/JetBrains) |
| **Use Case** | Conversational code discovery | Inline code suggestions during development |
| **Query Method** | Natural language chat | Code comments or Copilot prompts |
| **Result Format** | Structured SearchResult with metadata | Code suggestions with context |
| **Integration Time** | <5 minutes | Expected <5 minutes when available |

**Recommendation:** Use **Claude Desktop** for immediate UK government code discovery. Configure **GitHub Copilot** when MCP support is officially released for IDE-integrated workflows.

---

## Stay Updated

**How to know when GitHub Copilot MCP support is available:**

1. **GitHub Blog**: Monitor [GitHub Changelog](https://github.blog/changelog/) for Copilot feature announcements
2. **GitHub Copilot Extension**: Check for updates in your IDE's extension marketplace
3. **Official Documentation**: Review [GitHub Copilot docs](https://docs.github.com/en/copilot) for MCP configuration instructions
4. **govscraperepo Updates**: Check this repository's README for integration status updates

**When MCP support is released:**
- This guide will be updated with confirmed configuration format
- Disclaimer will be removed
- Step-by-step instructions will be added matching official GitHub documentation

---

## Alternative: Use Claude Desktop Now

While waiting for GitHub Copilot MCP support, you can use **Claude Desktop** for UK government code discovery:

- **Status:** Fully available and tested
- **Configuration time:** Under 5 minutes
- **Guide:** See [Claude Desktop Integration Guide](./claude-desktop.md)

Claude Desktop provides the same semantic search capabilities over UK government repositories, accessible through conversational AI instead of IDE integration.

---

## Additional Resources

- **MCP v2 Protocol Specification**: [https://modelcontextprotocol.io/v2](https://modelcontextprotocol.io/v2)
- **GitHub Copilot Documentation**: [https://docs.github.com/en/copilot](https://docs.github.com/en/copilot)
- **GitHub Copilot Changelog**: [https://github.blog/changelog/](https://github.blog/changelog/)
- **Claude Desktop Guide**: [../integration/claude-desktop.md](./claude-desktop.md) (available now)
- **Production API Endpoint**: `https://govreposcrape-api-1060386346356.us-central1.run.app`

---

## Feedback

**Have information about GitHub Copilot MCP support?**
- Submit a GitHub issue with details
- Include: Source (GitHub blog, official docs, beta access)
- Help us update this guide when MCP becomes available

**Found an issue with this guide?**
- Report via GitHub Issues
- Tag: `documentation`, `github-copilot`

---

**Version:** 1.0 (Preview - awaiting GitHub Copilot MCP release)
**Last Updated:** 2025-11-14
**Status:** Configuration format is provisional, based on MCP v2 spec
**Next Update:** When GitHub officially announces Copilot MCP support
