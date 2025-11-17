# Epic Technical Specification: Operational Excellence

Date: 2025-11-14
Author: cns
Epic ID: 6
Status: Draft

---

## Overview

Epic 6 establishes production-ready operational practices to ensure the govscraperepo MVP is sustainable, secure, and observable. This epic implements cost monitoring to validate the <£50/month infrastructure hypothesis, security compliance validation against NCSC Secure Coding Standards for government trust, observability dashboards to track adoption and performance metrics, and comprehensive production deployment guides.

**Context from PRD:** The MVP must be cost-effective (<£50/month per NFR-7.1), secure (NCSC compliance per NFR-2.1), and demonstrate measurable value ("hundreds of uses per week" success metric per FR-8). Epic 6 provides the operational foundations to confidently deploy to production and sustain the service.

**Value Delivery:** Enables production deployment with confidence. Cost monitoring prevents budget overruns and validates economic feasibility. Security compliance ensures government trust and adoption. Observability enables data-driven optimization and rapid issue diagnosis. These operational capabilities are critical for MVP credibility and Phase 2 scaling.

## Objectives and Scope

**In Scope:**
- Cost monitoring dashboard with budget alerts (£50/month threshold)
- Security compliance validation against NCSC Secure Coding Standards
- Observability dashboard tracking adoption, performance, and quality metrics
- Production readiness checklist and deployment guide
- Automated dependency security scanning (npm audit, Dependabot)
- Structured logging for audit and debugging
- Deployment verification and rollback procedures

**Out of Scope:**
- Advanced APM tools (Datadog, New Relic) - MVP uses Cloudflare Analytics
- Custom alerting infrastructure beyond Cloudflare notifications
- Multi-region deployment strategies (Phase 2)
- Disaster recovery beyond rollback (MVP risk tolerance)
- Penetration testing (deferred to Phase 2 security audit)
- SBOM integration for dependency analysis (Phase 2 feature)

## System Architecture Alignment

**Alignment with Architecture Document:**
- **Logging Strategy**: Builds on Epic 1.3 structured JSON logging foundation (src/utils/logger.ts)
- **Security Architecture**: Validates NCSC compliance (NFR-2.1), read-only access pattern, no PII in logs
- **Deployment**: Uses wrangler CLI, Cloudflare Workers deployment model
- **Monitoring**: Cloudflare Workers Analytics, custom metrics via structured logging
- **Cost Tracking**: Monitors Workers, R2, AI Search, KV, Vectorize spend

**Components Referenced:**
- `src/utils/logger.ts` - Structured logging foundation (Epic 1.3)
- `scripts/cost-monitoring.ts` - New: Cost dashboard and alerts
- `scripts/security-audit.sh` - New: NCSC compliance validation
- `SECURITY.md` - New: Security documentation
- `DEPLOYMENT.md` - New: Production deployment guide
- `wrangler.toml` - Production environment configuration

**Architectural Constraints:**
- Zero-install monitoring (leverage Cloudflare built-in analytics)
- Minimal custom infrastructure (keep costs low)
- Open-source tools for security scanning (npm audit, GitHub Security Advisories)
- Documentation-driven operational excellence

## Detailed Design

### Services and Modules

| Module | Responsibility | Inputs | Outputs | Owner |
|--------|---------------|--------|---------|-------|
| `scripts/cost-monitoring.ts` | Query Cloudflare Analytics API, calculate cost per service, generate alerts when 80% of £50/month budget reached | Cloudflare Analytics API, historical cost data | Cost dashboard (console output or JSON), budget alert notifications | Platform Engineer |
| `scripts/security-audit.sh` | Run npm audit, validate NCSC checklist, scan dependencies, verify HTTPS enforcement | Codebase, package.json, wrangler.toml | Security compliance report, vulnerability list, pass/fail status | Security Engineer |
| `SECURITY.md` | Document security practices, incident response, compliance checklist | NCSC Secure Coding Standards, architecture docs | Security documentation for auditors and contributors | Security Engineer |
| `DEPLOYMENT.md` | Step-by-step production deployment guide, pre-deployment checklist, rollback procedures | All Epic 1-6 artifacts, wrangler.toml config | Deployment instructions, smoke test definitions | Deployment Engineer |
| Cloudflare Analytics Dashboard | Built-in observability for Workers metrics | Workers runtime telemetry, structured logs | Request volume, latency (p50/p95/p99), error rate, geographic distribution | Platform Operator |
| `src/utils/metrics.ts` (optional) | Custom metrics for adoption tracking (if Analytics insufficient) | Query patterns, user IDs (if available), result quality signals | Adoption metrics, quality metrics (empty result rate, slow queries) | Platform Operator |

### Data Models and Contracts

**Cost Monitoring Data Model:**
```typescript
interface CostBreakdown {
  date: string;              // ISO 8601 date
  workers_cost: number;      // £ per day
  r2_cost: number;           // £ per day
  ai_search_cost: number;    // £ per day
  kv_cost: number;           // £ per day
  vectorize_cost: number;    // £ per day (if used)
  total_daily: number;       // £ per day
  cumulative_month: number;  // £ month-to-date
  projection_month_end: number; // £ projected for full month
  budget_utilization: number;   // % of £50 budget
}

interface CostAlert {
  triggered_at: string;      // ISO 8601 timestamp
  budget_threshold: number;  // £50
  current_spend: number;     // £ month-to-date
  utilization: number;       // % (e.g., 85%)
  projection: number;        // £ projected end-of-month
  breakdown: CostBreakdown;
  recommendations: string[]; // Cost optimization suggestions
}
```

**Security Compliance Data Model:**
```typescript
interface SecurityChecklistItem {
  id: string;                // e.g., "NCSC-SC-001"
  category: "input_validation" | "output_encoding" | "secrets" | "dependencies" | "https" | "audit_logging";
  description: string;
  status: "pass" | "fail" | "not_applicable";
  evidence: string;          // File path or test result
  remediation?: string;      // If failed
}

interface SecurityAuditReport {
  audit_date: string;        // ISO 8601
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

**Observability Metrics Data Model:**
```typescript
interface ObservabilityMetrics {
  period: "daily" | "weekly" | "monthly";
  query_volume: number;             // Total queries
  unique_users?: number;            // If trackable (optional)
  response_time_p50: number;        // ms
  response_time_p95: number;        // ms
  response_time_p99: number;        // ms
  error_rate: number;               // %
  cache_hit_rate: number;           // %
  empty_result_rate: number;        // % queries with 0 results
  slow_query_rate: number;          // % queries >2s
  mvp_success_metrics: {
    weekly_queries: number;         // Target: hundreds
    adoption_trend: "increasing" | "stable" | "decreasing";
    performance_compliance: boolean; // p95 < 2s
  };
}
```

### APIs and Interfaces

**Cloudflare Analytics API (External Dependency):**
```
GET /accounts/{account_id}/analytics/workers
Response: {
  requests: { total: number, by_status: {200: number, 400: number, 500: number} },
  latency: { p50: number, p95: number, p99: number },
  errors: { rate: number, count: number }
}
```

**Cost Monitoring Script Interface:**
```bash
# Usage
npm run cost-monitor              # Display current month costs
npm run cost-monitor --alert      # Check and send alerts if threshold exceeded
npm run cost-monitor --export json # Export cost data as JSON
```

**Security Audit Script Interface:**
```bash
# Usage
./scripts/security-audit.sh                    # Run full security audit
./scripts/security-audit.sh --checklist-only   # NCSC checklist validation only
./scripts/security-audit.sh --dependencies     # Dependency scan only
./scripts/security-audit.sh --fix              # Auto-fix issues where possible
```

**No New HTTP Endpoints:** Epic 6 is operational tooling, no new API endpoints added.

### Workflows and Sequencing

**Story 6.1: Cost Monitoring Workflow**
1. Platform Engineer sets up Cloudflare Analytics API access
2. Create `scripts/cost-monitoring.ts` script to query Analytics API
3. Calculate daily costs by service (Workers, R2, AI Search, KV, Vectorize)
4. Compute cumulative month-to-date and projection
5. If projection ≥ 80% of £50 budget → trigger alert (console log, email, Slack webhook)
6. Document cost optimization recommendations in README
7. Schedule weekly cost review in team calendar

**Story 6.2: Security Compliance Workflow**
1. Security Engineer creates NCSC compliance checklist in `SECURITY.md`
2. Implement `scripts/security-audit.sh` to validate checklist items
3. Run `npm audit` for dependency vulnerabilities
4. Configure Dependabot for automated security updates
5. Validate input sanitization on all API endpoints (review src/api/)
6. Verify no secrets in logs (grep codebase for API keys, tokens)
7. Confirm HTTPS-only enforcement (check wrangler.toml, fetch calls)
8. Document audit logging compliance (query logs per NFR-2.3)
9. Generate security audit report (pass/fail with evidence)
10. Add security audit to CI/CD pipeline (GitHub Actions)

**Story 6.3: Observability Dashboard Workflow**
1. Platform Operator accesses Cloudflare Analytics dashboard
2. Configure custom metrics in `src/utils/metrics.ts` if needed (cache hit rate, empty results)
3. Export key metrics: query volume, response time (p50/p95/p99), error rate
4. Track MVP success metrics: weekly query volume, adoption trend, p95 < 2s
5. Set up alerts: error rate >1%, p95 >2s, daily queries <10
6. Document dashboard access in README with screenshots
7. Create weekly metrics review process

**Story 6.4: Production Deployment Workflow**
1. Deployment Engineer creates `DEPLOYMENT.md` guide
2. Pre-deployment checklist:
   - All tests passing (`npm test`)
   - Security audit passed
   - Cost monitoring active
   - Documentation complete (README, SECURITY, DEPLOYMENT)
3. Environment validation:
   - Production service bindings configured in `wrangler.toml`
   - Secrets set (`wrangler secret put`)
   - Domain DNS configured
4. Deployment execution:
   - `wrangler deploy --env production`
5. Post-deployment verification:
   - Health check: `curl https://govreposcrape.cloud.cns.me/health`
   - Smoke test: Test query via MCP API
   - Monitoring dashboard check: Verify metrics flowing
6. If deployment fails:
   - Rollback: `wrangler rollback --env production`
   - Investigate logs: `wrangler tail --env production`
   - Fix and redeploy

## Non-Functional Requirements

### Performance

**Cost Monitoring Performance:**
- Analytics API query: <5s response time (external dependency)
- Cost calculation script: <10s execution time
- Dashboard refresh: Real-time or near-real-time (Analytics API latency)

**Security Audit Performance:**
- npm audit scan: <30s (depends on dependency count ~50 packages)
- NCSC checklist validation: <1 minute manual review
- Full security audit: <5 minutes end-to-end

**Observability Performance:**
- Dashboard load time: <3s (Cloudflare Analytics)
- Metrics export: <10s for weekly data
- Alerts trigger: <1 minute from threshold breach

### Security

**NCSC Secure Coding Compliance (NFR-2.1):**
- **Input Validation**: All API endpoints validate query parameters, JSON bodies, headers
- **Output Encoding**: JSON-only responses, no HTML/script injection risk
- **Secrets Management**: No secrets in code, logs, or version control. Use `wrangler secret` for API keys.
- **Dependencies**: Zero high/critical vulnerabilities in npm audit
- **HTTPS Enforcement**: TLS 1.3 only, verify in wrangler.toml and fetch calls
- **Audit Logging**: All queries logged with timestamp, query text, response time (NFR-2.3)
- **Read-Only Pattern**: No write operations to GitHub, only reads
- **No PII/Classified Data**: All data is public GitHub repositories

**Dependency Security (NFR-2.5):**
- Automated security scanning: npm audit weekly
- Dependabot configured for automated security update PRs
- Monthly dependency review and updates
- Vulnerable dependency remediation SLA: 7 days for high/critical

**Incident Response:**
- Security incident detection via audit logs
- Escalation path documented in SECURITY.md
- Response time SLA: 24 hours for critical, 7 days for medium/low
- Post-incident review process

### Reliability/Availability

**Cost Monitoring Reliability:**
- Cloudflare Analytics SLA: 99.9% uptime (external dependency)
- Alert delivery: Best-effort (console log always succeeds, email/Slack may fail)
- Graceful degradation: If Analytics API fails, log error and retry in 1 hour

**Security Audit Reliability:**
- npm audit reliability: Depends on npm registry availability (99.9%+)
- Manual checklist validation: No automation risk, human-driven
- CI/CD integration: Fail build if critical vulnerabilities found

**Observability Reliability:**
- Dashboard availability: Cloudflare Analytics uptime (99.9%)
- Metrics accuracy: Best-effort (sampling, aggregation may introduce variance)
- Alert delivery: Multiple channels (dashboard, email, Slack) for redundancy

**Production Deployment Reliability:**
- Rollback capability: <5 minutes to revert to previous version
- Health check validation: Automated smoke tests post-deployment
- Deployment verification: Manual testing of critical paths

### Observability

**Structured Logging (Built on Epic 1.3):**
- All cost monitoring events logged: `{"event": "cost_alert", "budget_utilization": 85, "projection": 42.50}`
- All security audit events logged: `{"event": "security_audit", "status": "pass", "vulnerabilities": 0}`
- All deployment events logged: `{"event": "deployment", "env": "production", "status": "success"}`

**Metrics Collection:**
- Cost metrics: Daily service breakdown, cumulative monthly, projection
- Security metrics: Vulnerability count by severity, NCSC checklist pass rate
- Adoption metrics: Query volume (daily/weekly), unique users (if trackable), repeat usage
- Performance metrics: Response time (p50/p95/p99), error rate, cache hit rate
- Quality metrics: Empty result rate, slow query rate (>2s)

**Alerting:**
- Cost alert: Budget utilization ≥ 80% of £50/month
- Performance alert: p95 response time >2s for 10+ consecutive queries
- Error alert: Error rate >1% for 1+ hour
- Adoption alert: Daily queries <10 for 3+ consecutive days (low usage warning)

**Dashboards:**
- Cloudflare Analytics dashboard: Request volume, latency, errors, geographic distribution
- Custom cost dashboard: Service breakdown, budget utilization, trends
- MVP success dashboard: Weekly queries, adoption trend, performance compliance

## Dependencies and Integrations

**External Dependencies:**
- **Cloudflare Analytics API**: Real-time metrics for Workers (requests, latency, errors)
  - Version: Cloudflare Platform API (stable)
  - SLA: 99.9% uptime
  - Cost: Included in Workers plan
- **npm registry**: Dependency vulnerability data for npm audit
  - Version: Public npm registry
  - SLA: 99.9%+ uptime
  - Cost: Free

**Internal Dependencies:**
- **Epic 1.3 Structured Logging**: `src/utils/logger.ts` for operational event logging
- **Epic 4 MCP API**: Observability metrics from API request logs
- **All Epic 1-5 Artifacts**: Required for production readiness validation

**Development Tools:**
- **npm audit** (v10+): Dependency vulnerability scanning
- **Dependabot**: Automated security update PRs (GitHub native)
- **wrangler CLI** (v4.47.0+): Deployment, secrets management, log streaming
- **TypeScript** (v5.9+): Cost monitoring script implementation
- **bash** (v4+): Security audit script

**Monitoring Integrations:**
- **Cloudflare Workers Analytics**: Built-in, zero-config
- **Slack** (optional): Budget alert webhooks
- **Email** (optional): Alert delivery via Cloudflare Workers email API

## Acceptance Criteria (Authoritative)

### Story 6.1: Cost Monitoring Dashboard and Alerts

**AC-6.1.1: Cost Dashboard Functionality**
- **Given** the platform is operational with all services (Workers, R2, AI Search, KV, Vectorize)
- **When** I run the cost monitoring dashboard
- **Then** I see daily costs broken down by service: Workers, R2, AI Search, KV, Vectorize
- **And** cumulative monthly spend is displayed with projection to month-end
- **And** cost per query (AI Search) and cost per ingestion run are calculated

**AC-6.1.2: Budget Alert Triggering**
- **Given** monthly costs approach the budget threshold
- **When** spending reaches 80% of £50/month budget
- **Then** alert is triggered (console log, email, or Slack notification)
- **And** alert includes: current spend, projection, breakdown by service, recommended actions

**AC-6.1.3: Cost Optimization Insights**
- **And** Cost dashboard is accessible via Cloudflare Analytics or custom visualization
- **And** Historical cost data is tracked for trend analysis (week-over-week, month-over-month)
- **And** Cost optimization recommendations are documented: caching strategies, query patterns, ingestion frequency
- **And** Dashboard shows key efficiency metrics: cache hit rate, queries per £, repos per £

### Story 6.2: Security Compliance Validation - NCSC Standards

**AC-6.2.1: NCSC Compliance Checklist**
- **Given** the platform codebase is complete
- **When** I perform security compliance validation
- **Then** security checklist covers: input validation, output encoding, no eval/exec, dependency scanning
- **And** all API endpoints validate and sanitize inputs (query strings, parameters)
- **And** no secrets or API keys are logged or exposed in error messages
- **And** HTTPS-only enforcement is verified (TLS 1.3)

**AC-6.2.2: Dependency Security Scanning**
- **Given** dependencies are used in the project
- **When** I run dependency security scanning
- **Then** npm audit or equivalent shows zero high/critical vulnerabilities
- **And** Dependabot or equivalent is configured for automated security updates
- **And** dependency scanning runs weekly with alerts on new vulnerabilities

**AC-6.2.3: Security Documentation**
- **And** Security compliance checklist is documented in SECURITY.md
- **And** Audit logging covers all queries (timestamp, query text, response time) per NFR-2.3
- **And** Read-only access pattern is validated (no write operations to GitHub)
- **And** Security incident response plan is documented

### Story 6.3: Observability Dashboard - Key Metrics and KPIs

**AC-6.3.1: Key Metrics Dashboard**
- **Given** the platform is operational and serving queries
- **When** I view the observability dashboard
- **Then** dashboard shows: query volume (per day/week), response time (p50, p95, p99), error rate, cache hit rate
- **And** adoption metrics: unique users (if trackable), queries per user, repeat usage
- **And** quality metrics: empty result rate, slow query rate (>2s), error types breakdown

**AC-6.3.2: MVP Success Tracking**
- **Given** I want to track MVP success criteria
- **When** I review the dashboard
- **Then** MVP metrics are highlighted: weekly query volume (target: hundreds), adoption trend, performance compliance (<2s p95)
- **And** alerts are configured for: error rate >1%, p95 response time >2s, daily queries <10 (low adoption warning)

**AC-6.3.3: Dashboard Accessibility**
- **And** Dashboard is implemented using Cloudflare Analytics or custom tool (Grafana, Datadog)
- **And** Key metrics are exportable for reporting (CSV, JSON)
- **And** Dashboard link and access instructions are documented in README
- **And** Metrics align with PRD success criteria (FR-8, NFR-1, NFR-6)

### Story 6.4: Production Readiness Checklist and Deployment Guide

**AC-6.4.1: Production Readiness Checklist**
- **Given** all Epic 1-6 stories are complete
- **When** I review the production readiness checklist
- **Then** checklist covers: all tests passing, security audit complete, cost monitoring active, documentation complete
- **And** environment configuration verified: production service bindings, secrets, domain setup
- **And** deployment prerequisites validated: Cloudflare account, domain DNS, wrangler CLI

**AC-6.4.2: Deployment Guide**
- **Given** I follow the deployment guide
- **When** I execute deployment steps
- **Then** guide includes: pre-deployment validation, wrangler deploy command, post-deployment verification
- **And** rollback procedure is documented for deployment failures
- **And** smoke tests are defined to validate deployment success

**AC-6.4.3: Deployment Documentation**
- **And** Production readiness checklist is documented in DEPLOYMENT.md or README
- **And** Deployment guide includes environment-specific configurations (staging vs production)
- **And** Post-deployment verification includes: health check, test query, monitoring dashboard check
- **And** Contact information for escalation is documented

## Traceability Mapping

| AC # | Spec Section(s) | Component(s)/API(s) | Test Idea |
|------|----------------|---------------------|-----------|
| AC-6.1.1 | Services: cost-monitoring.ts, Data Models: CostBreakdown | scripts/cost-monitoring.ts, Cloudflare Analytics API | Integration test: Mock Analytics API, verify cost calculation logic, assert daily breakdown correct |
| AC-6.1.2 | Workflows: Cost Monitoring, Data Models: CostAlert | scripts/cost-monitoring.ts alert logic | Unit test: Set spend to 81% of budget, assert alert triggered with correct data |
| AC-6.1.3 | NFR: Observability, Data Models: CostBreakdown efficiency metrics | scripts/cost-monitoring.ts optimization logic | Manual test: Review cost dashboard output, verify recommendations present and accurate |
| AC-6.2.1 | Services: security-audit.sh, NFR: Security NCSC Compliance | scripts/security-audit.sh, SECURITY.md checklist | Integration test: Run audit script, assert all checklist items pass, verify input validation in src/api/ |
| AC-6.2.2 | Dependencies: npm audit, Dependabot config | package.json, .github/dependabot.yml | CI/CD test: Run npm audit in GitHub Actions, assert zero high/critical vulnerabilities |
| AC-6.2.3 | NFR: Security Audit Logging, Data Models: SecurityAuditReport | SECURITY.md, src/utils/logger.ts | Manual test: Review SECURITY.md completeness, verify query logs in Cloudflare Workers logs |
| AC-6.3.1 | Services: Cloudflare Analytics Dashboard, Data Models: ObservabilityMetrics | Cloudflare Analytics, src/utils/metrics.ts (optional) | Integration test: Query Analytics API, verify metrics match expected format (query volume, latency, error rate) |
| AC-6.3.2 | NFR: Observability Alerting, Data Models: mvp_success_metrics | Cloudflare Analytics alerts configuration | Manual test: Configure alerts in Cloudflare dashboard, trigger test alert (set p95 >2s manually) |
| AC-6.3.3 | Detailed Design: APIs Cloudflare Analytics, Services: metrics export | Cloudflare Analytics API, README dashboard link | Manual test: Access dashboard via README link, export metrics as JSON, verify format |
| AC-6.4.1 | Workflows: Production Deployment, Services: DEPLOYMENT.md checklist | DEPLOYMENT.md pre-deployment checklist | Manual test: Follow checklist step-by-step on staging, verify all items pass before production deploy |
| AC-6.4.2 | Workflows: Production Deployment rollback, Services: smoke tests | DEPLOYMENT.md deployment steps, wrangler CLI | Integration test: Deploy to staging, run smoke tests, trigger rollback, verify service restored |
| AC-6.4.3 | Services: DEPLOYMENT.md documentation completeness | DEPLOYMENT.md, README production section | Manual test: Review DEPLOYMENT.md, verify all required sections present (pre-deploy, deploy, verify, rollback, escalation) |

## Risks, Assumptions, Open Questions

**Risks:**
- **RISK-6.1**: Cloudflare Analytics API limitations may not provide granular enough cost breakdown (service-level costs may require manual estimation from billing dashboard)
  - **Mitigation**: Document cost estimation methodology, validate with actual billing data monthly
  - **Severity**: Medium
- **RISK-6.2**: £50/month budget may be exceeded during ingestion of all 1,523 repos if gitingest costs are higher than estimated
  - **Mitigation**: Cost monitoring alerts at 80% threshold provide early warning, ingestion can be paused if needed
  - **Severity**: High
- **RISK-6.3**: NCSC compliance validation is manual (no automated tools for full standard)
  - **Mitigation**: Use npm audit for dependencies, manual checklist for other items, engage security expert for review
  - **Severity**: Low
- **RISK-6.4**: Observability dashboard may not capture all adoption metrics (e.g., unique users) if MCP protocol doesn't provide user IDs
  - **Mitigation**: Track query volume and patterns instead, infer adoption from usage trends
  - **Severity**: Low
- **RISK-6.5**: Production deployment failures could cause service outage
  - **Mitigation**: Rollback procedure documented, health checks automated, deploy during low-traffic window
  - **Severity**: Medium

**Assumptions:**
- **ASSUMPTION-6.1**: Cloudflare Analytics provides sufficient metrics for MVP observability (request volume, latency, errors)
- **ASSUMPTION-6.2**: npm audit and Dependabot are sufficient for dependency security (no need for commercial tools like Snyk in MVP)
- **ASSUMPTION-6.3**: Manual NCSC checklist validation is acceptable for MVP (automated compliance scanning deferred to Phase 2)
- **ASSUMPTION-6.4**: wrangler CLI rollback functionality works reliably for production deployments
- **ASSUMPTION-6.5**: Cost monitoring script can run locally or in CI/CD (no need for dedicated monitoring infrastructure)

**Open Questions:**
- **QUESTION-6.1**: Should cost alerts integrate with PagerDuty or similar on-call system, or is email/Slack sufficient for MVP?
  - **Answer**: Email/Slack sufficient for MVP (no on-call required), PagerDuty for Phase 2 if 24/7 support needed
- **QUESTION-6.2**: What is the acceptable downtime SLA for MVP production deployment? (e.g., 99%, 99.9%, best-effort)
  - **Answer**: Best-effort for MVP (no formal SLA), aim for 99% uptime, rollback within 5 minutes if issues detected
- **QUESTION-6.3**: Should security audit run in CI/CD and block PRs on vulnerabilities, or just warn?
  - **Answer**: Block PRs on high/critical vulnerabilities (npm audit), warn on medium/low
- **QUESTION-6.4**: How often should production deployments occur? (e.g., weekly, on-demand, continuous)
  - **Answer**: On-demand for MVP (manual approval), weekly cadence for Phase 2 after automation mature
- **QUESTION-6.5**: Should observability dashboard be public or internal-only?
  - **Answer**: Internal-only for MVP (Cloudflare Analytics requires auth), public metrics dashboard for Phase 2

## Test Strategy Summary

**Cost Monitoring Tests:**
- **Unit Tests**: Cost calculation logic (service breakdown, projections, budget utilization %)
- **Integration Tests**: Mock Cloudflare Analytics API responses, verify end-to-end cost dashboard generation
- **Manual Tests**: Run cost-monitoring script against production Analytics API, validate actual costs vs dashboard
- **Alert Tests**: Simulate 80% budget threshold, verify alert triggered with correct data

**Security Compliance Tests:**
- **Unit Tests**: Input validation functions (sanitize query strings, validate JSON schemas)
- **Integration Tests**: Full security audit script execution, verify all checklist items pass
- **CI/CD Tests**: npm audit in GitHub Actions, assert zero high/critical vulnerabilities on every PR
- **Manual Tests**: Security expert review of NCSC checklist, penetration testing (deferred to Phase 2)

**Observability Tests:**
- **Integration Tests**: Query Cloudflare Analytics API, verify metrics format and accuracy
- **Manual Tests**: Access dashboard via README link, verify all key metrics displayed correctly
- **Load Tests**: Simulate high query volume, verify metrics accurate under load
- **Alert Tests**: Configure alerts in Cloudflare, trigger test conditions (p95 >2s, error rate >1%), verify notifications

**Production Deployment Tests:**
- **Pre-Deployment Tests**: Run full test suite (`npm test`), verify all pass before deploy
- **Smoke Tests**: Post-deployment health check, test query via MCP API, verify expected response
- **Rollback Tests**: Deploy to staging, trigger rollback, verify service restored to previous version
- **Manual Tests**: Follow DEPLOYMENT.md step-by-step, document any gaps or errors in guide

**Test Coverage Goals:**
- Unit tests: 80%+ coverage on cost-monitoring.ts logic
- Integration tests: All 4 stories have at least 1 integration test
- Manual tests: All AC validation requires manual verification checklist
- CI/CD tests: npm audit runs on every PR, blocks merge on high/critical vulnerabilities

**Test Frameworks:**
- **Unit/Integration**: Vitest (existing project standard from Epic 1)
- **Security Scanning**: npm audit, Dependabot
- **Manual Testing**: Checklists in story files, documented test cases
- **CI/CD**: GitHub Actions (existing pipeline)
