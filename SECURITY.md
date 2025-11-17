# Security Policy

**Version:** 1.0
**Last Updated:** 2025-11-15
**Compliance:** NCSC Secure Coding Standards

This document defines the security practices, compliance requirements, and incident response procedures for the govreposcrape project.

## Table of Contents

- [NCSC Secure Coding Standards Compliance](#ncsc-secure-coding-standards-compliance)
- [Security Checklist](#security-checklist)
- [Input Validation Requirements](#input-validation-requirements)
- [Output Encoding Practices](#output-encoding-practices)
- [Secrets Management](#secrets-management)
- [HTTPS-Only Enforcement](#https-only-enforcement)
- [Audit Logging Compliance](#audit-logging-compliance)
- [Read-Only Access Pattern](#read-only-access-pattern)
- [Dependency Security](#dependency-security)
- [Security Incident Response Plan](#security-incident-response-plan)
- [Security Audit Process](#security-audit-process)

---

## NCSC Secure Coding Standards Compliance

This project follows the **UK National Cyber Security Centre (NCSC) Secure Coding Standards** to ensure government-grade security for production deployment.

**Key NCSC Principles Applied:**

1. **Input Validation** - All API endpoints validate and sanitize user inputs
2. **Output Encoding** - JSON-only responses prevent XSS vulnerabilities
3. **No Dynamic Code Execution** - Zero eval(), exec(), or unsafe code patterns
4. **Secrets Management** - API tokens use wrangler secret, never committed to git
5. **HTTPS Enforcement** - TLS 1.3 only, verified in configuration
6. **Audit Logging** - 100% query logging with timestamp, query text, response time
7. **Read-Only Access** - No write operations to external systems
8. **Dependency Security** - Zero high/critical CVEs, weekly scanning

**NCSC Reference:** [NCSC Developers Collection](https://www.ncsc.gov.uk/collection/developers-collection)

---

## Security Checklist

This checklist maps directly to NCSC standards and is validated by `scripts/security-audit.sh`.

### Input Validation (NCSC-SC-001)

- [x] All API endpoints implement input validation via TypeScript type guards
- [x] Query parameters are sanitized (max length, character filtering)
- [x] JSON request bodies are validated against strict schemas
- [x] No user input is passed to system commands or file operations
- [x] Input truncation applied for PII protection (e.g., query.substring(0, 100))

**Evidence:** `src/api/mcp-handler.ts:validateMCPRequest`, `src/api/search-endpoint.ts:40-48`

### Output Encoding (NCSC-SC-002)

- [x] All API responses use JSON format only (no HTML rendering)
- [x] Content-Type headers enforce application/json
- [x] No user-controlled data in HTTP headers
- [x] Error messages do not expose sensitive system information

**Evidence:** `src/api/mcp-handler.ts` returns typed MCPResponse objects

### No Dynamic Code Execution (NCSC-SC-003)

- [x] Zero usage of eval(), exec(), or Function() constructor
- [x] No dynamic require() or import() with user-controlled paths
- [x] Template strings do not execute user-provided code

**Validation:** `scripts/security-audit.sh` greps codebase for dangerous patterns

### Secrets Management (NCSC-SC-004)

- [x] API tokens stored via `wrangler secret put` (never in code/config)
- [x] No secrets in git history (verified via .gitignore patterns)
- [x] Cloudflare Workers environment variables used for sensitive config
- [x] Logs do not contain API keys, tokens, or passwords

**Process:**
```bash
# Set secrets (never commit)
npx wrangler secret put GITHUB_TOKEN --env production
npx wrangler secret put CLOUDFLARE_API_TOKEN --env production
```

**Evidence:** `wrangler.jsonc` contains no plaintext secrets, only service bindings

### HTTPS-Only Enforcement (NCSC-SC-005)

- [x] All external API calls use https:// URLs
- [x] TLS 1.3 enforced by Cloudflare Workers platform
- [x] No http:// URLs in fetch() calls
- [x] Wrangler configuration verified for secure defaults

**Evidence:** `wrangler.jsonc`, all fetch calls in `src/` use https://

### Audit Logging (NCSC-SC-006)

- [x] 100% of API queries logged via structured JSON logger
- [x] Log fields include: timestamp (ISO 8601), query text, response time, requestId
- [x] Logs do not contain PII or sensitive user data
- [x] Cloudflare Workers log streaming enabled for retention

**Compliance:** NFR-2.3 - Audit logging for procurement use cases

**Evidence:** `src/utils/logger.ts:createLogger`, `src/api/search-endpoint.ts:45-48`

**Log Retention:** 7 days (Cloudflare Workers default), export available via `wrangler tail`

### Read-Only Access Pattern (NCSC-SC-007)

- [x] No write operations to GitHub API (only GET requests)
- [x] No git commands executed (git clone, git push)
- [x] R2 write access restricted to ingestion container only
- [x] MCP API endpoints are read-only (search and metadata retrieval)

**Evidence:** Grep codebase for POST/PUT/DELETE to github.com returns zero matches

### Dependency Security (NCSC-SC-008)

- [x] npm audit runs weekly via Dependabot schedule
- [x] Zero high/critical vulnerabilities in production dependencies (NFR-2.5)
- [x] 48-hour patching SLA for critical issues
- [x] Dependabot configured for automated security updates

**Evidence:** `.github/dependabot.yml`, `npm audit --json` output

---

## Input Validation Requirements

**All API endpoints MUST:**

1. Define TypeScript interfaces for request payloads
2. Validate required fields are present and correct type
3. Apply length limits to string inputs (e.g., query max 500 chars)
4. Reject requests with unexpected fields
5. Sanitize inputs before logging (truncate sensitive data)

**Example Pattern (from `src/api/search-endpoint.ts`):**

```typescript
export async function executeSearch(request: MCPRequest, env: Env): Promise<MCPResponse> {
  const logger = createLogger({ operation: "execute_search", requestId: crypto.randomUUID() });

  logger.info("Search request started", {
    query: request.query.substring(0, 100), // Truncate for privacy
    limit: request.limit,
  });

  // Type validation via TypeScript interface ensures query is string, limit is number
  // ...
}
```

**Validation Checklist:**

- Query strings: Max 500 characters, no special shell characters
- JSON bodies: Strict schema validation via TypeScript types
- File paths: Not accepted from user input
- Numeric inputs: Range validation (e.g., limit 1-100)

---

## Output Encoding Practices

**Response Format:** JSON only (application/json)

**Practices:**

1. All API responses use typed MCPResponse or error response objects
2. Content-Type header always set to application/json
3. No HTML rendering or template injection vulnerabilities
4. Error messages are generic (no stack traces in production)
5. User-controlled data is never interpolated into headers

**Example:**

```typescript
return new Response(JSON.stringify({
  results: enrichedResults,
  took_ms: duration
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});
```

---

## Secrets Management

**NEVER commit secrets to git.** Use Cloudflare Workers secrets management.

**Approved Secret Storage:**

1. **Cloudflare Workers Secrets** - For API tokens (GitHub, analytics)
   ```bash
   npx wrangler secret put SECRET_NAME --env production
   ```

2. **Environment Variables** - For non-sensitive configuration
   ```jsonc
   // wrangler.jsonc
   {
     "vars": {
       "ENVIRONMENT": "production"
     }
   }
   ```

**Forbidden Practices:**

- ❌ Hardcoded API keys in source code
- ❌ Secrets in wrangler.jsonc or .env files committed to git
- ❌ API tokens in log output
- ❌ Secrets in error messages

**Detection:** `scripts/security-audit.sh` greps for common secret patterns (API_KEY=, token:, Authorization: Bearer)

---

## HTTPS-Only Enforcement

**Requirements:**

1. All fetch() calls use https:// URLs
2. No http:// URLs in configuration files
3. TLS 1.3 enforced by Cloudflare Workers platform
4. External API integrations verified for HTTPS support

**Verification:**

```bash
# Run security audit to check all URLs
./scripts/security-audit.sh --checklist-only

# Grep codebase for insecure URLs
grep -r "http://" src/ --exclude-dir=node_modules
```

**Expected Result:** Zero http:// URLs (only https://)

---

## Audit Logging Compliance

**NFR-2.3 Requirement:** 100% of queries logged with metadata

**Required Log Fields:**

1. **timestamp** - ISO 8601 format (e.g., "2025-11-15T10:30:00.000Z")
2. **query** - User query text (truncated to 100 chars for privacy)
3. **response_time** - Duration in milliseconds
4. **requestId** - UUID v4 for request tracing
5. **result_count** - Number of search results returned
6. **operation** - Handler name (e.g., "execute_search")

**Example Log Entry:**

```json
{
  "timestamp": "2025-11-15T10:30:00.000Z",
  "level": "info",
  "message": "Search request started",
  "context": {
    "operation": "execute_search",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "metadata": {
      "query": "authentication methods in NHS repos",
      "limit": 10
    }
  }
}
```

**Log Access:**

```bash
# Stream production logs
npx wrangler tail --env production --format pretty

# Export logs for compliance audits
npx wrangler tail --env production --format json > audit-logs.json
```

**Retention Policy:** 7 days (Cloudflare Workers default)

**PII Protection:** Query text truncated to 100 characters, no user IDs or IP addresses logged

---

## Read-Only Access Pattern

**Principle:** govreposcrape has zero write access to external systems.

**Allowed Operations:**

- ✅ GET requests to GitHub repos.json feed
- ✅ Read-only API calls to gitingest service
- ✅ Metadata retrieval from R2 storage
- ✅ Search queries to AI Search service

**Forbidden Operations:**

- ❌ POST/PUT/DELETE requests to GitHub API
- ❌ git clone, git push, or any git commands
- ❌ File system writes on external systems
- ❌ Database mutations on external databases

**Rationale:** Minimizes attack surface and prevents supply chain compromise.

**Validation:** `scripts/security-audit.sh` greps codebase for write operations

---

## Dependency Security

**NFR-2.5 Requirement:** Zero high/critical CVEs in production dependencies

**Process:**

### 1. Weekly Automated Scans

Dependabot runs weekly to detect vulnerabilities:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 5
```

### 2. Manual Audit

```bash
# Check current vulnerability status
npm audit

# Generate JSON report
npm audit --json > audit-report.json

# Check production dependencies only
npm audit --production
```

### 3. CI/CD Integration

Every PR must pass npm audit with zero high/critical vulnerabilities:

```yaml
# .github/workflows/ci.yml (planned)
- name: Security Audit
  run: |
    npm audit --audit-level=high
    # Exit code 0 = no vulnerabilities, non-zero = failures block merge
```

### 4. Patching SLA

- **Critical vulnerabilities**: 48-hour patch and deploy
- **High vulnerabilities**: 7-day patch and deploy
- **Medium/Low vulnerabilities**: 30-day patch (reviewed in sprint planning)

**Dependency Update Process:**

1. Dependabot creates PR with vulnerability fix
2. Review PR changelog and breaking changes
3. Run full test suite (`npm test`)
4. Merge if tests pass
5. Deploy to production within SLA window

---

## Security Incident Response Plan

**Definition:** A security incident is any event that compromises the confidentiality, integrity, or availability of the govreposcrape service.

### Incident Categories

1. **Data Breach** - Unauthorized access to query logs or repository metadata
2. **Service Disruption** - DDoS attack or platform outage
3. **Vulnerability Exploit** - Active exploitation of CVE in dependencies
4. **Secrets Exposure** - API token or secret leaked in logs/code
5. **Unauthorized Access** - Suspicious API usage or credential compromise

### Response Procedure

#### 1. Detection & Reporting (0-1 hour)

**Detection Methods:**

- Cloudflare Workers error rate spike (>5% errors)
- npm audit alerts (Dependabot notifications)
- Manual code review findings
- User reports of suspicious behavior

**Report To:**

- Project maintainer: cns
- Email: [REDACTED - Set during production deployment]
- Incident tracking: GitHub Security Advisories

#### 2. Assessment (1-4 hours)

**Triage Questions:**

- What data was accessed or compromised?
- Is user data affected? (govreposcrape has no PII)
- Is the vulnerability actively exploited?
- What is the blast radius? (Single service or cross-system)

**Risk Levels:**

- **Critical**: Active exploit with data exfiltration → Immediate response
- **High**: Unpatched CVE with known exploit → 48-hour response
- **Medium**: Vulnerability with no active exploit → 7-day response
- **Low**: Theoretical vulnerability → 30-day response

#### 3. Containment (4-12 hours)

**Actions:**

1. **Disable affected service** (if data breach confirmed)
   ```bash
   # Rollback to last known good deployment
   npx wrangler rollback --env production
   ```

2. **Rotate secrets** (if credentials compromised)
   ```bash
   npx wrangler secret put GITHUB_TOKEN --env production
   npx wrangler secret put CLOUDFLARE_API_TOKEN --env production
   ```

3. **Block malicious traffic** (if DDoS or abuse detected)
   - Use Cloudflare WAF rules
   - Rate limit aggressive IPs

4. **Preserve evidence**
   ```bash
   # Export logs for forensic analysis
   npx wrangler tail --env production --format json > incident-logs-$(date +%Y%m%d).json
   ```

#### 4. Remediation (12-48 hours)

**Actions:**

1. **Patch vulnerability**
   - Apply npm security updates
   - Update dependencies to patched versions
   - Run `npm audit` to verify fix

2. **Code fixes**
   - Remove insecure code patterns
   - Add input validation if missing
   - Fix eval/exec usage

3. **Deploy patched version**
   ```bash
   npm test  # Verify tests pass
   npx wrangler deploy --env production
   ```

4. **Verify fix**
   - Run `./scripts/security-audit.sh`
   - Confirm zero high/critical vulnerabilities
   - Monitor error rates for 24 hours

#### 5. Recovery (48-72 hours)

**Actions:**

1. **Re-enable service** (if disabled)
2. **Monitor metrics** (error rate, latency, query volume)
3. **Communicate status**
   - GitHub Security Advisory update
   - User notification (if applicable)

#### 6. Post-Incident Review (1 week)

**Document:**

1. Timeline of events (detection → resolution)
2. Root cause analysis (why did this happen?)
3. Lessons learned (what can we improve?)
4. Action items (preventive measures)

**Publish:** GitHub Security Advisory (public disclosure for transparency)

### Escalation Contacts

**Internal:**

- Project Lead: cns
- Security Champion: [TBD - Assign during Phase 2]

**External:**

- Cloudflare Support: For platform-level incidents
- NCSC Incident Reporting: [UK government security incidents](https://www.ncsc.gov.uk/section/about-ncsc/report-an-incident)

### Communication Template

```markdown
## Security Incident Report - [YYYY-MM-DD]

**Incident ID:** SEC-YYYY-MM-DD-NNN
**Severity:** Critical/High/Medium/Low
**Status:** Detected/Contained/Resolved

**Summary:**
[Brief description of incident]

**Impact:**
- Affected services: [List]
- Data compromised: [None/Query logs/etc.]
- Downtime: [Duration]

**Timeline:**
- Detection: YYYY-MM-DD HH:MM UTC
- Containment: YYYY-MM-DD HH:MM UTC
- Resolution: YYYY-MM-DD HH:MM UTC

**Root Cause:**
[Technical explanation]

**Remediation:**
- [Action 1]
- [Action 2]

**Prevention:**
- [Future safeguard 1]
- [Future safeguard 2]

**Reference:** [Link to GitHub Security Advisory]
```

---

## Security Audit Process

**Frequency:** Weekly (automated) + Pre-deployment (manual)

**Automated Audit:**

```bash
# Run full security audit
./scripts/security-audit.sh

# Check NCSC compliance only
./scripts/security-audit.sh --checklist-only

# Check dependencies only
./scripts/security-audit.sh --dependencies

# Generate JSON report for CI/CD
./scripts/security-audit.sh --format json > security-report.json
```

**Manual Review (Pre-Production):**

1. Review SECURITY.md for completeness
2. Run `npm audit` and verify zero high/critical CVEs
3. Grep codebase for eval/exec patterns
4. Verify no secrets in git history (`git log -p | grep -i "api_key"`)
5. Check all fetch() calls use https://
6. Confirm structured logging on all API endpoints
7. Test malicious input rejection (XSS, SQL injection payloads)

**Audit Report Fields (JSON):**

```typescript
interface SecurityAuditReport {
  audit_date: string;              // ISO 8601
  overall_status: "pass" | "fail";
  checklist: SecurityChecklistItem[];
  dependency_vulnerabilities: {
    high: number;
    medium: number;
    low: number;
  };
  ncsc_compliance: boolean;
}
```

**CI/CD Integration (Planned - Task 4.5):**

```yaml
# .github/workflows/ci.yml
jobs:
  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm audit --audit-level=high
      - run: ./scripts/security-audit.sh --format json
      - name: Block PR on failures
        if: failure()
        run: exit 1
```

---

## Reporting a Vulnerability

**Public Repository Notice:** This is a public GitHub repository. All code and issues are visible.

**How to Report:**

1. **GitHub Security Advisories** (Preferred)
   - Navigate to: Security → Advisories → New draft
   - Provide detailed description and reproduction steps

2. **GitHub Issues** (For low-severity findings)
   - Create issue with label: `security`
   - Include: Affected component, severity, suggested fix

3. **Email** (For critical/urgent issues)
   - Email: [REDACTED - Set during production deployment]
   - PGP Key: [TBD - Generate during Phase 2]

**Response SLA:**

- Critical: 24 hours
- High: 72 hours
- Medium/Low: 7 days

**Recognition:**

Security researchers will be acknowledged in:
- GitHub Security Advisory
- SECURITY.md Hall of Fame (planned for Phase 2)

---

## Compliance References

- [NCSC Secure Coding Standards](https://www.ncsc.gov.uk/collection/developers-collection)
- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [Cloudflare Workers Security Best Practices](https://developers.cloudflare.com/workers/platform/security/)
- [UK Government Security Classifications](https://www.gov.uk/government/publications/government-security-classifications)

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-15 | 1.0 | Initial SECURITY.md created per Story 6.2. NCSC compliance checklist, incident response plan, dependency update process, audit logging documentation complete. |
