# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in this project, please report it privately:

1. **Do NOT** open a public issue
2. Contact the maintainers via email or GitHub Security Advisories
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fixes (if any)

**Expected Response Time:** Within 48 hours

---

## Public vs. Private Information

This repository intentionally contains certain public metadata that **does not** compromise security:

### ✅ Public Metadata (Intentionally Included)

#### Google Cloud Project Number: `1060386346356`
- **Appears in:** Cloud Run URLs, API endpoints, documentation
- **Risk Level:** None - this is public metadata
- **Rationale:** Google Cloud project numbers are public identifiers (similar to GitHub usernames) that appear in all public Cloud Run endpoints by design
- **Cannot access resources** without proper IAM authentication
- **Standard practice** in open-source GCP projects

#### Service Account Emails
- Example: `govreposcrape-api@govreposcrape.iam.gserviceaccount.com`
- **Risk Level:** None - these are identifiers, not credentials
- **Cannot authenticate** without the corresponding private keys (which are never committed)

#### Public API Endpoints
- Cloud Run URL: `https://govreposcrape-api-1060386346356.us-central1.run.app`
- **Risk Level:** None - designed for public access
- **Protected by:** Application-level authentication and authorization

### ❌ Private Information (Never Committed)

The following are **never** included in this repository:

- ❌ API keys or authentication tokens
- ❌ Service account private keys (`.json` credential files)
- ❌ Environment variables with secrets (`.env` files)
- ❌ Database passwords or connection strings with credentials
- ❌ OAuth client secrets
- ❌ Private keys (`.key`, `.pem` files)
- ❌ Cloud provider access keys (AWS, GCP, Azure)

---

## Security Measures in Place

### 1. Git History Sanitization
- All credentials have been removed from git history using `git-filter-repo`
- Previous Cloudflare credentials (KV IDs, R2 keys, account IDs) fully removed
- Git history backup created before sanitization

### 2. Environment Variable Protection
- All sensitive credentials loaded from environment variables at runtime
- `.env` files are gitignored and never committed
- Example files (`.env.example`) use only placeholder values

### 3. Comprehensive .gitignore
- Protects environment files, credential files, private keys
- Prevents accidental commit of sensitive data
- Covers multiple file patterns for credentials

### 4. Cloud-Native Security
- Uses Google Cloud Run service accounts (no keys in code)
- IAM-based authentication for all resources
- Least-privilege access controls

### 5. Regular Security Audits
- Automated pattern scanning for credentials
- Manual security reviews before releases
- Documentation of all security decisions

---

## Security Best Practices for Contributors

If you're contributing to this project:

### Before Committing:

1. **Never commit credentials** - Use environment variables
2. **Check `.env.example`** - Only use placeholder values
3. **Review your diff** - `git diff --staged` before committing
4. **Use .gitignore** - Ensure sensitive files are excluded

### Environment Variables:

\`\`\`bash
# ✅ Good: Use environment variables
const apiKey = process.env.GOOGLE_API_KEY;

# ❌ Bad: Hardcoded credentials
const apiKey = "AIzaSyAbc123...";
\`\`\`

### Configuration Files:

\`\`\`bash
# ✅ Good: .env file (gitignored)
GOOGLE_PROJECT_ID=my-project

# ❌ Bad: Hardcoded in code
const projectId = "my-project-12345";
\`\`\`

---

## What to Do If Credentials Are Exposed

If you accidentally commit credentials:

1. **Immediately rotate** the exposed credentials
2. **Contact maintainers** to sanitize git history
3. **Never** use \`git commit --amend\` or \`git rebase\` alone (secrets remain in reflog)
4. **Use** \`git-filter-repo\` or BFG Repo-Cleaner to rewrite history
5. **Force push** after sanitization (coordinate with team)

---

## Security Checklist for Releases

Before making the repository public or releasing:

- [ ] Run comprehensive security scan
- [ ] Verify no credentials in git history
- [ ] Check all \`.env.example\` files use placeholders
- [ ] Verify \`.gitignore\` is comprehensive
- [ ] Review documentation for sensitive information
- [ ] Test that application works with environment variables only
- [ ] Update this SECURITY.md if needed

---

## Additional Resources

- [Google Cloud Security Best Practices](https://cloud.google.com/security/best-practices)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [git-filter-repo Documentation](https://github.com/newren/git-filter-repo)

---

## Security Audit History

| Date | Type | Summary |
|------|------|---------|
| 2025-11-18 | Comprehensive Pre-Publication Audit | Git history sanitized, all Cloudflare credentials removed, personal information redacted |

---

**Last Updated:** 2025-11-18
**Maintained By:** Project Maintainers

For questions about this security policy, please open a discussion or contact the maintainers.
