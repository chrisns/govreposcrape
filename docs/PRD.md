# govscraperepo - Product Requirements Document

**Author:** cns
**Date:** 2025-11-12
**Version:** 1.0

---

## Executive Summary

govscraperepo is foundational infrastructure for the UK government's digital transformation agenda, making cross-government code discovery ambient and intelligent through AI-powered semantic search. For 8 years, UK departments have published code to GitHub in compliance with the Technology Code of Practice, but publishing ≠ reuse. Thousands of repositories sit unused because discovery is broken - developers can't find what exists, procurement teams can't check before contracting, and duplicate work wastes £millions annually.

govscraperepo solves this by integrating semantic search directly into developers' AI assistants (Claude, Copilot) via MCP protocol, making government code discovery natural and effortless. The platform prevents duplicate procurement spending through proactive intelligence while enabling the £45B savings identified in the State of Digital Government Review.

**Strategic Impact:**
- Enables Blueprint vision: cross-government collaboration without organizational boundaries
- Delivers on £45B savings agenda through duplication reduction + AI efficiency
- Transforms "make things open" from compliance theater to actual government transformation

### What Makes This Special

**The magic moment:** A procurement officer preparing a £500k authentication contract gets an alert: "This capability already exists in 3 government departments with MIT licenses." That prevented spend becomes a data point in the public savings dashboard celebrated by the DSIT Secretary.

For developers, the magic is even simpler: Ask Claude "How do NHS trusts implement authentication?" and instantly see actual production code with context - no manual GitHub searches, no guessing which department might have built it.

**Ambient procurement intelligence that prevents duplicate government spending before contracts are signed.**

---

## Project Classification

**Technical Type:** Hybrid - Developer Tool + SaaS B2B Platform
- **Phase 1 (MVP):** Developer tool (MCP API for AI assistants)
- **Phase 2:** SaaS B2B (web interface for civil servants + procurement teams)

**Domain:** GovTech (UK Government)
**Complexity:** High

**Classification Rationale:**

This is a **hybrid architecture serving multiple user types through phased delivery**:

**Developer Tool DNA:**
- MCP v2 API as primary interface
- Integration with AI coding assistants (Claude, GitHub Copilot)
- Ambient discovery in developer workflow
- SDK/API surface area for extensions

**SaaS B2B DNA:**
- Multi-stakeholder platform (developers, civil servants, procurement)
- Government tenant model (departments as logical tenants)
- Web interface for non-technical users (Phase 2)
- Organizational trust scoring and permissions
- Public dashboards and reporting

**Why Hybrid Matters for Requirements:**
- Must satisfy **both** developer tool UX (fast, minimal friction, API-first) **and** enterprise B2B needs (compliance, audit, permissions, reporting)
- Phased delivery: MVP focuses on developer tool, grows into full SaaS platform
- Architecture must support both CLI/API consumption and web UI from day one

### Domain Context

**GovTech - UK Government Software Development**

**Regulatory & Policy Landscape:**
- **Technology Code of Practice:** Mandates "publish your code and use open-source software"
- **GDS Service Standard (Point 12):** "Make all new source code open and reusable"
- **Blueprint for Modern Digital Government:** Cross-government collaboration, breaking silos
- **State of Digital Government Review:** £45B savings opportunity through AI + reducing duplication
- **NCSC Secure Coding Standards:** Security compliance for government software
- **WCAG 2.1 AA:** Accessibility requirements for public sector services
- **Open Government License:** Standard for government code publication

**Procurement Environment:**
- Governed by Public Contracts Regulations 2015
- Value-for-money obligations
- Framework agreements (G-Cloud, Digital Marketplace)
- Transparency requirements
- Due diligence for duplicate spending

**Security & Compliance:**
- All code is public (GitHub public repos) - no PII or classified data
- Read-only access to public repositories
- NCSC secure coding compliance
- Audit logging for procurement use cases
- No sensitive data in vectors or logs

**Organizational Complexity:**
- 100+ government GitHub organizations (alphagov, nhsdigital, hmrc, dwpdigital, moj, etc.)
- Departments operate independently but share code publishing mandate
- GDS/CDDO provides central guidance but limited enforcement
- Cultural: "make things open" widely adopted, reuse culture still developing

**Strategic Alignment:**
- **Blueprint for Modern Digital Government:** "Not shipping the org chart" - services designed around users, not departmental boundaries
- **£45B Savings Agenda:** This platform directly enables duplication reduction through ambient discovery
- **Cross-Government Transformation:** Practical infrastructure for the vision

**Implications for Product:**
- **Compliance is table stakes:** WCAG 2.1 AA, NCSC standards, procurement transparency
- **Trust signals critical:** Users need to know if code is production-ready, maintained, from authoritative source
- **Organizational boundaries matter:** Departmental reputation, sector affinity (health, justice, revenue)
- **Procurement integration is strategic value:** Not just nice-to-have, it's the killer app
- **Public sector cost optimization:** Architecture must minimize running costs (<£50/month MVP realistic target)

---

## Success Criteria

**MVP Success (Weeks 1-4):**

**Adoption Metrics:**
- **Hundreds of uses per week** from UK government developers
- 20+ early adopters successfully integrate MCP API
- Active usage across 3+ departments (GDS, NHS Digital, Home Office, HMRC, etc.)
- Developers report finding code they "wouldn't have found manually"

**Quality Metrics:**
- **Top 5 results relevant for 80%+ of queries** (user feedback)
- <2 second query response time (p95)
- 90%+ cache hit rate on gitingest processing (cost efficiency)
- Zero security incidents (read-only public data, but reputation matters)

**Technical Feasibility:**
- Successfully ingesting and indexing ~1,523 repositories from repos.json
- Smart caching working (only re-ingest on pushedAt timestamp changes)
- <£50/month infrastructure costs validated
- gitingest quality sufficient for semantic search (measurable through relevance)

**Evidence of Value:**
- **10+ documented cases:** "Reused [specific code/library] instead of rebuilding" with time saved
- Developer testimonials on productivity improvement (faster delivery, better quality through reuse)
- Early signal of organic adoption (word-of-mouth, sharing MCP configs)

**Value Mechanism (MVP):**
- **Ambient duplication prevention:** Developers naturally discover and reuse through AI assistant workflow
- **Aggregate savings through lots of small good decisions:** 50 developers each save 1 week = 50 weeks avoided effort
- At £800/day contractor rate: ~£200k quarterly savings from productivity improvement
- Plus: Better quality (reusing tested code) + faster delivery times

**Note:** This is different from Phase 3 procurement intelligence (proactive contract scanning). MVP value comes from **developers making better decisions naturally**, not blocking large procurement contracts.

**MVP Fails If:**
- Search relevance too poor (developers don't trust results)
- Adoption minimal despite availability (no one uses it)
- gitingest costs/performance makes scaling infeasible
- NCSC security concerns block deployment

**Scale Success (Months 6-12):**

**Impact Metrics:**
- **Thousands of developer hours saved** across government (documented, surveyed)
- **£Millions in prevented duplicate procurement** (tracked through procurement checks)
- govscraperepo cited in procurement due diligence documentation
- Featured in Blueprint transformation case studies

**Strategic Visibility:**
- **Celebrated by DSIT Secretary of State** as Blueprint success story
- Integrated into government digital transformation communications
- **Part of Blueprint/roadmap delivery metrics**
- Contributing to £45B savings measurement framework

**Adoption at Scale:**
- Majority of UK government departments using (50+ organizations)
- Standard tool in GDS/departmental developer onboarding
- Integrated into Digital Marketplace supplier due diligence
- Community contributions (developers improving results, reporting issues)

**Advanced Capabilities:**
- Web interface serving non-technical users (civil servants, policy makers)
- SBOM integration for security/dependency analysis
- Procurement tender scanning operational (proactive alerts)
- Public savings dashboard launched ("£XM prevented this quarter")

### Business Metrics

**Cost Avoidance (Primary Value Driver):**

**Conservative Estimate:**
- 1 prevented duplicate procurement per month: £250k average
- Annual impact: **£3M+ in direct cost avoidance**
- Developer time savings: Thousands of hours (indirect value, harder to quantify)

**ROI:**
- MVP investment: <£50/month infrastructure + 2 weeks development time
- **Payback:** First prevented duplication pays for **years** of operation
- Scale impact: Meaningful contribution to £45B transformation savings target

**Leading Indicators (MVP):**
- Query volume trending up week-over-week
- Repeat usage (developers coming back)
- Organic growth (new departments discovering without outreach)
- Positive feedback in GDS/developer communities

**Lagging Indicators (Scale):**
- Documented prevented procurement (£ value tracked)
- Developer hours saved (survey-based)
- Reuse examples published (case studies)
- Government press releases citing govscraperepo

**Strategic Value (Non-Financial):**
- **Policy compliance evidence:** Demonstrates "make things open" actually enabling reuse
- **Cross-government collaboration proof:** Blueprint vision made tangible
- **International leadership:** UK sets standard for government code discovery (no other country has this)
- **Cultural shift:** From "sharing" to "discovering and reusing" code

---

## Product Scope

### MVP - Minimum Viable Product

**Core Capability: AI-Powered Semantic Search for UK Government Code**

**What Ships in MVP:**

**1. Automated Data Pipeline (Write Path)**
- Fetch repos.json from xgov-opensource-repo-scraper feed (~21,000 repos currently)
- Container-based gitingest processing (Python 3.11, Docker)
- Generate gitingest summaries for each repository using Python library
- **Smart caching:** Only regenerate gitingest when pushedAt timestamp changes (90%+ cache hit rate)
- Store summaries in Cloudflare R2 with metadata (pushedAt, url, processed timestamp)
- R2 object structure: `gitingest/{org}/{repo}/summary.txt` with custom metadata
- **Parallelization (MVP required for initial seeding):**
  - CLI arguments: `--batch-size=N --offset=M`
  - Example: Process every 10th repo starting at offset 0-9
  - Run 10 containers in parallel for 10× speedup
  - Initial seeding: ~21k repos × 10s avg ÷ 10 parallel = ~6 hours
- **Run locally on-demand** for MVP (manual execution when needed)

**2. AI Search Auto-Indexing (Managed Service)**
- **Cloudflare AI Search** (formerly AutoRAG) automatically indexes R2 bucket contents
- **Zero custom embedding code** - AI Search handles embedding generation, vectorization, and indexing
- Continuous updates as new gitingest files added to R2
- Automatic query rewriting and similarity caching for performance
- Managed RAG pipeline (retrieval-augmented generation)

**3. MCP v2 API Server (Read Path - Thin Wrapper)**
- Cloudflare Workers hosting MCP v2 protocol endpoints
- JWT authentication for API access (15-minute tokens, refresh flow)
- Rate limiting: 100 requests/minute per token
- **Thin wrapper around AI Search API:**
  - Receive MCP query → translate to AI Search API call → format response
  - Return top 5 results with context
- Result metadata: repo URL, org name, language, last updated, gitingest snippet
- GitHub links and Codespaces/Gitpod quick-start URLs

**4. Validation & Baseline Measurement**
- **MVP Purpose:** Validate gitingest quality for UK government code search
- Measure relevance: Do developers find what they need?
- Establish baseline for future optimization
- Defer embedding/chunking decisions until we have real usage data

**5. Developer Integration**
- MCP configuration examples for Claude Desktop
- GitHub Copilot integration guide (if MCP support ships)
- <5 minute setup for early adopters
- Clear API documentation with code examples

**6. Monitoring & Ops**
- Structured JSON logging (query patterns, latency, errors)
- Cloudflare Analytics for usage metrics
- Cost tracking dashboard (R2, AI Search, Workers spend)
- Relevance feedback collection (thumbs up/down on results)
- Error alerting for pipeline failures

**MVP Architecture Philosophy:**
- **Validate hypothesis first:** Is gitingest quality sufficient for semantic search?
- **Minimize custom infrastructure:** Use managed AI Search, defer optimization
- **Fast feedback loop:** Ship in 1-2 weeks, measure relevance, decide next steps
- **Defer hard problems:** Embedding models, chunking strategy, custom ranking → Growth phase if needed

**MVP Success Criteria:**
- Early adopters integrate and get relevant results
- Infrastructure costs <£50/month
- <2s query latency (p95)
- gitingest processing feasible at scale (time/cost)

**Explicitly OUT of MVP:**
- Web interface (Phase 2)
- Procurement tender scanning (Phase 3)
- SBOM/dependency analysis (Phase 3)
- Organizational trust scoring (Phase 2)
- Advanced filtering (by sector, language, popularity)
- User accounts/personalization
- GitHub App integration
- IDE plugins

### Growth Features (Post-MVP)

**Phase 2: Web Interface & Search Optimization (Weeks 3-6)**

**Web Chat Interface:**
- 11ty static site with Gov.uk Design System
- Natural language chat for non-technical users
- Markdown-based content management
- Search results with plain English explanations
- Cloudflare Pages hosting (free tier)

**Search Optimization (If Needed Based on MVP Feedback):**
- **Option A:** Continue with AI Search if relevance is good (no changes needed)
- **Option B:** Migrate to custom embeddings if relevance needs improvement:
  - Custom embedding generation: bge-base-en-v1.5 (768-dim) via Workers AI
  - Advanced chunking: AST-based function-level splitting (Tree-sitter)
  - Custom Vectorize index with fine-tuned ranking
  - Hybrid search: Semantic + BM25 syntactic ranking
  - Recency boosting and custom scoring algorithms

**Container Automation:**
- Migrate from local execution to **GitHub Actions**
- Scheduled runs (every 6 hours) for automatic updates
- Workflow: repos.json check → gitingest → R2 upload
- Notifications on failures

**Enhanced Discovery:**
- Recency signals in UI (last updated, activity level)
- Basic trust indicators (star count, fork count, organization reputation)
- Language/framework filtering
- Sector affinity tags (health, justice, revenue, local government)

**Accessibility & Compliance:**
- WCAG 2.1 AA compliant
- Gov.uk branding and design patterns
- Mobile-responsive
- Screen reader tested

**Target Users:**
- Civil servants exploring government code
- Policy makers researching existing capabilities
- Procurement officers doing basic due diligence

**Success Metrics:**
- 100+ web searches per week
- Positive feedback from non-developer users
- Accessibility audit passing
- Search relevance improved (if custom embeddings deployed)

### Vision (Future)

**Phase 3: Procurement Intelligence & Advanced Features (Months 3-4)**

**Proactive Procurement Scanning:**
- Integration with Digital Marketplace/G-Cloud tender feeds
- Automated tender scanning for technical keywords
- Alert system: "Before procuring £500k for [capability], check these 3 government repos"
- Procurement dashboard: "£XM prevented this quarter"
- Integration with Commercial Function processes

**Security & Dependency Intelligence:**
- SBOM integration for dependency analysis
- Security vulnerability scanning (via GitHub Security Advisories)
- License compliance checking
- Dependency graph visualization

**Trust & Quality Signals:**
- Organizational trust scoring (NCSC/GCHQ repos, NHS production code, etc.)
- Code quality indicators (test coverage, documentation, maintenance activity)
- Community signals (contributors, issues, PRs)
- Production usage indicators (number of dependent projects)

**Advanced Search & Analytics:**
- Pattern analysis across repositories (common approaches to problems)
- "Similar repos" recommendations
- Code evolution tracking (how patterns change over time)
- Cross-department collaboration metrics

**Platform Features:**
- User accounts with saved searches
- Notification system (new repos matching interests)
- API keys for programmatic access
- Usage analytics for departments

**Long-Term Vision:**
- IDE plugins (VS Code, JetBrains) for in-editor search
- GitHub App integration (suggestions on new repos/issues)
- Backlog analysis (scan Jira/GitHub issues for existing solutions)
- Cross-government funding model (shared service, cost recovery)
- International expansion (collaborate with other governments)
- Public value dashboard (transparent reporting on savings)

---

## Domain-Specific Requirements (GovTech - UK Government)

**Regulatory & Compliance (Mandatory for Public Sector)**

**Accessibility:**
- **WCAG 2.1 AA compliance** required for any web interface (Phase 2+)
- Screen reader compatibility
- Keyboard navigation
- Color contrast ratios
- Alt text for all images
- **Rationale:** Legal requirement under Equality Act 2010 for public sector digital services

**Security & Standards:**
- **NCSC Secure Coding Standards** compliance
- Read-only access to public GitHub repositories (no write operations)
- No storage of PII or classified data
- Audit logging for all queries (especially procurement-related searches)
- Security incident response plan
- **Rationale:** Government software must meet NCSC baseline security standards

**Open Source Licensing:**
- Platform code published under **Open Government License** (or MIT/Apache 2.0)
- Compliance with "make all new source code open" mandate (Service Standard Point 12)
- Clear attribution for dependencies
- **Rationale:** GDS Service Standard requirement, cultural expectation for government tech

**Data Protection:**
- No personal data collection beyond minimal analytics
- GDPR compliance for any user accounts (Phase 2+)
- Transparent data retention policies
- Right to access/delete for users
- **Rationale:** Public sector must demonstrate privacy-first approach

**Procurement Alignment:**
- System must align with Public Contracts Regulations 2015
- Transparent pricing (public cost reporting)
- Value-for-money demonstration
- Integration potential with Digital Marketplace/G-Cloud frameworks
- **Rationale:** Procurement intelligence feature requires understanding procurement rules

---

**Organizational Trust & Reputation (Critical for Adoption)**

**Department Trust Signals (Phase 2+):**
- **Tier 1 (Highest Trust):** NCSC, GCHQ, Cabinet Office repos
- **Tier 2 (High Trust):** GDS, NHS Digital, HMRC (production code from major departments)
- **Tier 3 (Standard):** Other UK government organizations
- **Tier 4 (Experimental):** Individual developer repos, archived projects

**Rationale:** Developers need to assess "is this production-ready government code or an abandoned experiment?"

**Quality Indicators Needed:**
- Maintenance activity (last commit, active contributors)
- Production usage signals (stars, forks, dependents)
- Documentation quality
- Test coverage (if available via badges)
- License clarity

**Rationale:** "Finding code" isn't enough - developers need to trust it's worth reusing.

**Sector Affinity Filtering (Phase 2+):**
- Health (NHS Digital, NHS England)
- Justice (MoJ, Police Digital)
- Revenue (HMRC)
- Benefits (DWP)
- Local Government (LGA, councils)
- Central/Cross-cutting (GDS, Cabinet Office)

**Rationale:** Health developers care more about NHS code than HMRC code. Sector context matters.

---

**Performance & Cost Constraints (Public Sector Reality)**

**Budget Constraints:**
- **<£50/month infrastructure for MVP** is not arbitrary - it's strategic
- Must demonstrate value for money to Treasury/leadership
- Public reporting of costs expected ("How much does this cost taxpayers?")
- **Rationale:** Public sector scrutiny on spending, must prove cost-effectiveness

**Performance Requirements:**
- <2 second query response (p95) - developer tool UX expectation
- No performance degradation at scale (~21k repos now, 30k+ future)
- Edge deployment preferred (low latency for remote developers)
- **Rationale:** Developer tools must be fast or they won't be used

**Scaling Economics:**
- Linear cost growth unacceptable (£50/month at 21k repos → £150/month at 30k repos is acceptable)
- Architecture must scale sub-linearly (90%+ cache hit rate, edge distribution, managed services)
- **Rationale:** Long-term sustainability requires smart architecture + caching strategy

---

**Cultural & Political Considerations**

**Cross-Government Collaboration Messaging:**
- Product framing must emphasize "enabling collaboration" not "monitoring departments"
- Language: "Discover and reuse" not "audit and compliance"
- Success stories focus on developers helping developers, not enforcement
- **Rationale:** Cultural resistance to "central oversight" - must position as enabler

**Blueprint Alignment (Strategic Positioning):**
- Explicitly connect to Blueprint for Modern Digital Government vision
- Frame as infrastructure for "not shipping the org chart"
- Tie metrics to £45B savings agenda
- Position as GDS/CDDO strategic initiative
- **Rationale:** Strategic alignment ensures leadership support and resourcing

**Transparency & Public Value:**
- Public dashboard showing impact (Phase 3: "£XM prevented this quarter")
- Open roadmap and community engagement
- Clear communication of benefits to taxpayers
- **Rationale:** Public sector must demonstrate value to citizens

**Procurement Intelligence Sensitivity (Phase 3):**
- Proactive procurement alerts must be **supportive, not accusatory**
- Framing: "Here's code that might help" not "You're duplicating"
- Work with Commercial Function as partner, not adversary
- **Rationale:** Procurement teams are users too - must avoid antagonizing stakeholders

---

**Technical Standards & Integration**

**API Standards:**
- **MCP Protocol v2** compliance (emerging standard for AI assistants)
- RESTful API design following GDS API standards
- OpenAPI 3.0 specification
- Semantic versioning
- **Rationale:** Government encourages open standards and interoperability

**Integration Points (Future):**
- GitHub API (already using via repos.json feed)
- Digital Marketplace API (Phase 3: tender scanning)
- Potential: GOV.UK Notify (notifications), GOV.UK PaaS (hosting)
- **Rationale:** Ecosystem integration increases value

---

**Domain Requirements Impact on Product**

These domain requirements directly shape:

1. **MVP Must Include:**
   - NCSC secure coding compliance from day one
   - Audit logging for queries
   - Cost transparency and monitoring
   - Read-only access enforcement

2. **Phase 2 Must Include:**
   - WCAG 2.1 AA accessibility compliance
   - Trust signals and quality indicators
   - Sector affinity filtering
   - Open Government License publication

3. **Phase 3 Must Include:**
   - Procurement integration (supportive framing)
   - Public value dashboard
   - Community engagement features

4. **Architecture Driven By:**
   - Cost constraints → Managed services (AI Search), edge deployment (Workers)
   - Security requirements → Read-only, public data only, audit logging
   - Scale economics → Smart caching, sub-linear cost growth

5. **Messaging Driven By:**
   - Cultural sensitivity → "Enable collaboration" not "monitor departments"
   - Strategic alignment → Blueprint, £45B savings, cross-government transformation
   - Public accountability → Transparent costs, demonstrated value

---

## Innovation & Novel Patterns

**Category-Defining Innovation:** govscraperepo is the **first AI-powered semantic search platform for government code with ambient procurement intelligence**.

**What Makes This Genuinely Novel:**

### 1. First Government Code Discovery with AI Assistant Integration

**The Innovation:**
- **Existing approach (code.gov, etc.):** Manual submission → keyword search → destination website
- **Our approach:** Automated ingestion → semantic search → **ambient discovery through AI assistants**

**Why Novel:**
- MCP v2 protocol is emerging standard (2024-2025) for AI assistant integration
- No government code platform has integrated with Claude, Copilot, or other AI assistants
- Developers discover government code **where they already work**, not through separate portal

**Validation:** Web search confirms code.gov and equivalents are keyword-only catalogs. No semantic search + AI integration exists for government code globally.

**Impact:** Changes user behavior from "I should check if government has this" (rarely happens) to "Claude shows me government code automatically" (ambient).

---

### 2. Proactive Procurement Intelligence (Not Reactive Audit)

**The Innovation:**
- **Existing approach:** Post-facto audits discover duplication after contracts signed and money spent
- **Our approach (Phase 3):** **Proactive alerts during procurement process** before contracts awarded

**Why Novel:**
- Combines code discovery + procurement tender feeds + automated scanning
- Alert system: "Before awarding £500k contract for [capability], check these 3 government repos"
- Prevention vs detection paradigm shift

**Validation:** Web search shows AI procurement tools (Procurement Sciences, Sweetspot AI) focus on RFP analysis and vendor matching, NOT preventing duplicate code development.

**Impact:** Could prevent £millions in duplicate procurement annually. First tool to connect "what exists in government" with "what we're about to buy."

---

### 3. UK Government as International Leader

**The Innovation:**
- **US code.gov:** Manual submission, keyword search, low adoption
- **Other countries:** Data portals, minimal code focus
- **UK govscraperepo:** Automated, semantic, AI-integrated, procurement-aware

**Why Novel:**
- UK would be **first country** to solve government code discovery + reuse at scale
- Sets international standard for public sector open source enablement
- Demonstrates "make things open" **actually working**

**Validation:** No equivalent exists globally. UK has opportunity to lead.

**Impact:** International credibility, potential model for other governments, policy influence.

---

### 4. Metadata-Based Smart Caching (Technical Innovation)

**The Innovation:**
- Using R2 object metadata (pushedAt timestamp) as cache invalidation key
- No separate cache database needed
- 90%+ cache hit rate prevents expensive gitingest regeneration

**Why Novel:**
- Most systems use separate cache DB (Redis, KV store) with complex invalidation logic
- Our approach: Metadata IS the cache, atomic with object storage
- Simpler architecture, lower operational complexity

**Validation:** Standard pattern is external cache. This consolidates cache + storage.

**Impact:** Sub-£50/month infrastructure becomes feasible. Simpler ops.

---

## Validation Approach for Innovation

**MVP Validates:**

1. **gitingest quality for semantic search**
   - Hypothesis: LLM-ready summaries enable good search relevance
   - Validation: 80%+ relevance in early testing, developer feedback
   - Fallback: If insufficient, iterate on chunking/embeddings (Growth phase)

2. **AI Search baseline performance**
   - Hypothesis: Managed service provides "good enough" results for MVP
   - Validation: Developers find code they need, adoption grows
   - Fallback: Migrate to custom embeddings if needed (Growth phase)

3. **Developer adoption of MCP integration**
   - Hypothesis: Developers will configure Claude/Copilot to use MCP API
   - Validation: 20+ early adopters successfully integrate
   - Fallback: If MCP too complex, prioritize web UI (Phase 2)

4. **Value proposition (ambient duplication prevention)**
   - Hypothesis: Developers naturally reuse when discovery is easy
   - Validation: 10+ documented "reused instead of rebuilding" cases
   - Fallback: If adoption low, reconsider go-to-market strategy

**Growth/Vision Validates:**

5. **Procurement intelligence value** (Phase 3)
   - Hypothesis: Proactive alerts prevent duplicate contracts
   - Validation: £millions in documented prevented procurement
   - Fallback: If procurement teams don't engage, focus on developer productivity value

**Risk Mitigation:**

- **Innovation risk:** Building something nobody wants
  - **Mitigation:** Strong product brief validation, GDS/developer engagement, rapid MVP
- **Technical risk:** gitingest/AI Search insufficient quality
  - **Mitigation:** Baseline testing in MVP, fallback to custom embeddings
- **Adoption risk:** Developers won't use MCP integration
  - **Mitigation:** Web UI as alternative entry point (Phase 2)
- **Political risk:** Procurement teams resist proactive monitoring
  - **Mitigation:** Supportive framing, Commercial Function partnership, developer value first

**Innovation Success Criteria:**

**MVP Success = Validation of Core Hypothesis:**
- Developers discover and reuse government code they wouldn't have found manually
- AI assistant integration works (20+ MCP configs deployed)
- gitingest + AI Search provide useful results (80%+ relevance)

**Scale Success = Category Leadership:**
- UK government adopts as standard discovery tool (majority of departments)
- £millions in documented prevented duplication (procurement + productivity)
- International recognition ("UK solved government code reuse")
- DSIT Secretary celebrates as Blueprint success story

---

## Developer Tool + SaaS B2B Platform Requirements

**Hybrid Architecture:** Developer tool (MVP) evolving into SaaS B2B platform (Growth/Vision)

---

### API/Backend Requirements (MVP - MCP v2 Protocol)

**MCP v2 Protocol Compliance:**

**Authentication & Authorization:**
- JWT-based authentication with short-lived tokens (15-minute expiry)
- Token refresh flow for long-running sessions
- API key generation for programmatic access (Phase 2)
- Rate limiting: 100 requests/minute per token (MVP), configurable tiers later
- **Rationale:** MCP standard security model, prevents abuse

**API Endpoints (MVP):**

1. **POST /mcp/search** - Semantic code search
   - Input: `{ "query": "authentication methods", "limit": 5 }`
   - Output: `{ "results": [{repo, snippet, metadata, score}], "took_ms": 1234 }`
   - Translates to AI Search API internally
   - Returns top 5 results with context

2. **GET /mcp/health** - Health check
   - Returns: Service status, AI Search connectivity, R2 availability
   - Used for monitoring and integration testing

3. **GET /mcp/stats** (Phase 2) - Usage statistics
   - Returns: Query volume, cache hit rate, popular queries
   - Admin-only endpoint

**Data Schemas:**

**Search Result Schema:**
```json
{
  "repo_url": "https://github.com/alphagov/govuk-frontend",
  "repo_org": "alphagov",
  "repo_name": "govuk-frontend",
  "snippet": "... authentication implementation code ...",
  "context_lines": 10,
  "last_updated": "2025-10-15T14:30:00Z",
  "language": "TypeScript",
  "file_path": "src/auth/index.ts",
  "similarity_score": 0.87,
  "github_link": "https://github.com/alphagov/govuk-frontend/blob/main/src/auth/index.ts",
  "codespaces_link": "https://github.dev/alphagov/govuk-frontend",
  "metadata": {
    "stars": 1234,
    "forks": 456,
    "license": "MIT"
  }
}
```

**Error Codes & Handling:**

- **200 OK** - Successful query
- **400 Bad Request** - Invalid query format
- **401 Unauthorized** - Invalid/expired JWT
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - AI Search failure, R2 unavailable
- **503 Service Unavailable** - Maintenance mode

**Error Response Format:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Limit: 100/minute.",
    "retry_after": 30
  }
}
```

**Rate Limiting Strategy:**
- Token-based (per JWT)
- Sliding window (100 req/min)
- 429 response with `Retry-After` header
- Exponential backoff recommended for clients

**API Versioning:**
- Semantic versioning (v1, v2, etc.)
- Header-based: `X-API-Version: 1`
- Maintain backward compatibility for 12 months minimum
- Deprecation warnings 6 months before breaking changes

**OpenAPI 3.0 Specification:**
- Full API documentation auto-generated
- Interactive docs (Swagger UI) at `/docs` endpoint
- Machine-readable spec at `/openapi.json`
- Examples for all endpoints

---

### Developer Tool Requirements (MVP)

**Installation & Integration:**

**MCP Configuration for Claude Desktop:**
```json
{
  "mcpServers": {
    "govscraperepo": {
      "url": "https://api.govscraperepo.uk/mcp",
      "apiKey": "YOUR_JWT_TOKEN",
      "description": "UK Government code discovery"
    }
  }
}
```

**Integration Documentation:**
- Step-by-step setup guides (<5 minutes)
- Screenshots/video walkthroughs
- Troubleshooting common issues
- Example queries and expected results

**IDE Integration (Future Vision):**
- VS Code extension (search within editor)
- JetBrains plugin support
- GitHub Copilot integration (if MCP support ships)

**Developer Experience Requirements:**
- **Fast:** <2s query response (p95)
- **Simple:** One config file change to enable
- **Transparent:** Clear error messages, debugging support
- **Non-intrusive:** Doesn't interfere with normal AI assistant usage

**Package Manager / CLI Tool (Phase 2):**
- NPM package: `npx govscraperepo search "authentication"`
- Python package: `pip install govscraperepo-cli`
- Command-line interface for CI/CD integration
- Output formats: JSON, markdown, terminal-pretty

**Code Examples & Samples:**
- Example queries for common use cases
- Integration code snippets (TypeScript, Python)
- Testing examples (mock responses)
- Migration guides (if API changes)

---

### SaaS B2B Platform Requirements (Phase 2+)

**Multi-Tenancy Model:**

**Logical Tenants (Not Technical Isolation):**
- All data is public (GitHub public repos)
- "Tenancy" is organizational context, not data isolation
- Departments can track their team's usage
- Future: Department-specific views, saved searches, alerts

**Tenant Structure:**
```
Government (Root)
├── GDS (Department)
│   ├── Team: GOV.UK
│   ├── Team: Digital Marketplace
│   └── Team: Notify
├── NHS Digital (Department)
│   ├── Team: NHS Login
│   └── Team: Integration
└── HMRC (Department)
    └── Team: Making Tax Digital
```

**Permission Model (Phase 2):**

**Roles:**
- **Public User:** Anonymous search via web interface (read-only, rate-limited)
- **Developer:** Authenticated user, MCP API access, saved searches
- **Department Admin:** Manage team members, view usage analytics
- **Platform Admin:** System configuration, cost monitoring, user management

**RBAC Matrix:**
| Permission | Public | Developer | Dept Admin | Platform Admin |
|---|---|---|---|---|
| Search code | ✅ (limited) | ✅ | ✅ | ✅ |
| MCP API access | ❌ | ✅ | ✅ | ✅ |
| Save searches | ❌ | ✅ | ✅ | ✅ |
| View dept analytics | ❌ | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ✅ | ✅ |
| System config | ❌ | ❌ | ❌ | ✅ |

**Subscription Tiers (Future - If Needed):**

**Free Tier (Government Default):**
- Unlimited web search
- Basic MCP API access (100 req/min)
- Standard result quality
- Community support

**Premium Tier (Future Consideration):**
- Higher rate limits (1000 req/min)
- Priority support
- Advanced analytics
- Custom integrations

**Note:** Pricing for government platform is sensitive. Free tier for all government users is strategic. Premium tier only if commercial users (vendors, consultants) want access.

**Integration Requirements:**

**Digital Marketplace Integration (Phase 3):**
- API connection to tender feeds
- Automated scanning of new tenders
- Alert generation for duplicate capabilities
- Dashboard for procurement officers

**GOV.UK Integration (Potential):**
- Single Sign-On (SSO) via GOV.UK accounts
- Consistent branding and navigation
- Integration with GOV.UK design system

**GitHub Integration:**
- OAuth login via GitHub (convenient for developers)
- Direct repository links
- Codespaces/Gitpod quick launch
- Future: GitHub App for in-repo suggestions

**Compliance & Audit Requirements:**

**Audit Logging:**
- All queries logged with timestamp, user, query text
- Procurement-related searches flagged for compliance
- 12-month retention for audit purposes
- Export capability for transparency reporting

**GDPR Compliance (User Accounts):**
- Right to access: Users can download their query history
- Right to erasure: Users can delete their account and data
- Data minimization: Only collect essential data
- Transparent privacy policy

**Accessibility Compliance:**
- WCAG 2.1 AA for all web interfaces
- Regular accessibility audits
- Screen reader testing
- Keyboard navigation support

---

### API Design Principles

**RESTful Standards:**
- Resource-oriented URLs
- HTTP methods correctly used (GET, POST, PUT, DELETE)
- Stateless requests (JWT carries all context)
- HATEOAS links in responses (future enhancement)

**Performance Optimization:**
- Cloudflare edge caching for popular queries
- AI Search handles similarity caching
- Compression (gzip/brotli) for responses
- Pagination for large result sets (if needed)

**Developer-Friendly:**
- Clear, consistent naming conventions
- Comprehensive error messages with suggestions
- Example requests/responses in docs
- SDKs for common languages (TypeScript, Python)

**Security-First:**
- HTTPS only (TLS 1.3)
- No secrets in logs or error messages
- Input validation and sanitization
- Rate limiting to prevent abuse
- CORS configuration for web UI

---

## User Experience Principles (Phase 2 Web Interface)

**Note:** MVP is API-only (MCP). These principles guide Phase 2 web interface design.

**Visual Personality: Gov.uk Professional + Developer-Friendly**

**The Feel:**
- **Professional, not corporate:** Government credibility with developer accessibility
- **Minimal, not sparse:** Clean interface that doesn't hide useful information
- **Helpful, not patronizing:** Clear guidance without talking down to users

**Design Inspiration:**
- GOV.UK Design System (consistency with government services)
- GitHub search (familiar to developers)
- Perplexity.ai (clean AI-powered search experience)

**Key Design Principles:**

### 1. Trust Through Transparency

**Principle:** Users must trust the results to reuse code.

**Implementation:**
- Always show: Organization, last updated, license, stars/forks
- Make metadata prominent, not buried in hover states
- Visual trust indicators (NCSC/GCHQ badge, production usage signals)
- Clear "Why this result?" explanations

**Example:**
```
[NCSC Badge] alphagov/govuk-frontend
★ 1.2k  🔀 450  📝 MIT  ⏰ Updated 2 days ago
Production: Used by 100+ government services
```

### 2. Speed Feels Like Intelligence

**Principle:** Fast responses make the search feel smarter.

**Implementation:**
- <2s query response (p95) - feels instant
- Streaming results as they arrive (progressive rendering)
- Skeleton loaders during search (no blank screens)
- Optimistic UI updates (immediate feedback)
- Edge caching for popular queries

**User Perception:** "Wow, it knew exactly what I meant" = fast + relevant

### 3. Progressive Disclosure (Don't Overwhelm)

**Principle:** Show essential information first, details on demand.

**Initial View:**
- Top 5 results with snippet + key metadata
- "Show more" expands to full gitingest summary
- "Related repos" hidden until clicked
- Advanced filters collapsed by default

**Developer Power Users:**
- Keyboard shortcuts (/ for search, esc to close)
- JSON export for CI/CD integration
- Permalink to exact search results
- API access clearly advertised

### 4. Accessible to All Government Users

**Principle:** Civil servants without coding experience should succeed.

**Implementation:**
- Natural language queries: "How does NHS do authentication?"
- Plain English result summaries (alongside code snippets)
- "What is this?" help text for technical terms
- WCAG 2.1 AA compliance (not just checkbox, actually usable)

**Example Query Flow:**
```
User: "postcode validation"
System: "Found 5 government implementations of postcode validation..."
Result: [Code snippet] + "This validates UK postcodes according to Royal Mail format"
```

### 5. Government Branding = Credibility

**Principle:** Look and feel like official government infrastructure.

**Visual Identity:**
- GOV.UK crown and typography
- Government blue (#1d70b8) for primary actions
- White backgrounds, high contrast text
- No frivolous animations or "startup" aesthetics

**Messaging Tone:**
- Factual, not marketing-speak
- "Discover government code" not "Find awesome repos!"
- User value clear: "Reuse instead of rebuild"

---

### Key Interactions (Phase 2 Web Interface)

**Search Experience:**

**1. Query Input**
- Large, prominent search box (center of page)
- Placeholder: "Search UK government code..."
- Auto-suggestions as you type (based on popular queries)
- Clear button to reset

**2. Results Display**
- Card-based layout (familiar from GitHub, Google)
- Each card shows: Org + repo name, snippet (3-5 lines), metadata row
- Click card → expand inline (don't navigate away)
- Expanded view: Full gitingest summary, GitHub link, Codespaces button

**3. Filtering & Refinement**
- Left sidebar (collapsible on mobile)
- Filters: Language, Organization, Sector (health/justice/revenue)
- Sort: Relevance (default), Recent, Popular
- Active filters shown as removable chips

**4. Empty States & Errors**
- No results: "No matches found. Try: [suggested queries]"
- Error: "Search temporarily unavailable. Try again in a moment."
- First visit: Example queries to get started

**Navigation Flow:**

```
Homepage
├── Search Box (center)
├── Popular Searches (below)
└── How It Works (footer)

Search Results
├── Query + Filters (top/left)
├── Result Cards (main)
└── Related Searches (bottom)

Expanded Result
├── Full Summary (top)
├── Metadata Table (middle)
├── Quick Actions (GitHub, Codespaces)
└── Related Repos (bottom)
```

**Mobile Considerations:**

- Search-first mobile interface (search box at top)
- Stack cards vertically
- Filters in modal (not sidebar)
- Tap to expand, swipe to dismiss
- Share button for results

**Keyboard Navigation:**

- `/` - Focus search box
- `↑` `↓` - Navigate results
- `Enter` - Expand selected result
- `Esc` - Close expanded result
- `Tab` - Standard focus flow

---

### Accessibility Features (WCAG 2.1 AA Compliance)

**Screen Reader Support:**
- Semantic HTML5 (nav, main, article, aside)
- ARIA labels for all interactive elements
- Skip links to main content
- Result count announced ("Found 5 results for...")

**Keyboard Navigation:**
- All functionality accessible via keyboard
- Focus indicators clearly visible
- Logical tab order
- No keyboard traps

**Visual Accessibility:**
- 4.5:1 contrast ratio for text (AA standard)
- Resizable text (up to 200% without layout breaking)
- No reliance on color alone (icons + text)
- Motion reduced for users with vestibular disorders

**Cognitive Accessibility:**
- Clear, simple language (avoid jargon)
- Consistent navigation and layout
- Error messages with actionable guidance
- Undo actions where possible

---

### Design System & Components

**GOV.UK Design System Components:**
- Typography (GDS Transport font)
- Color palette (government blues, greens, reds for status)
- Form inputs (text boxes, buttons, checkboxes)
- Notification banners (success, warning, error)
- Footer (standard GOV.UK footer with links)

**Custom Components (Built on GDS Foundation):**
- **Search Results Card:** Repo card with snippet and metadata
- **Code Snippet Display:** Syntax-highlighted code with copy button
- **Trust Badge:** Visual indicator for high-trust organizations
- **Quick Action Buttons:** GitHub, Codespaces, Copy link
- **Filter Panel:** Collapsible sidebar with checkboxes

**Responsive Breakpoints:**
- Mobile: <640px
- Tablet: 640px - 1024px
- Desktop: >1024px

---

### UX Metrics for Phase 2

**Success Indicators:**
- Average time to relevant result: <30 seconds
- Search refinement rate: <20% (users find what they need on first try)
- Expanded result views: >50% (users engage with details)
- GitHub click-through rate: >30% (users actually use the results)
- Accessibility audit score: AAA target (AA minimum)

**User Feedback Mechanisms:**
- Thumbs up/down on each result (Was this helpful?)
- "Report issue" button for incorrect results
- NPS survey after 5 searches
- User testing with civil servants (non-developers)

---

## Functional Requirements

**Requirements organized by capability area, not technical implementation.**

**✨ = Delivers the "magic moment" (ambient procurement intelligence)**

---

### FR-1: Data Ingestion & Processing

**FR-1.1: Repository Data Collection (MVP)**
- **Requirement:** Fetch and parse repos.json feed from xgov-opensource-repo-scraper
- **Acceptance Criteria:**
  - Successfully fetch repos.json over HTTPS
  - Parse JSON with error handling for malformed data
  - Extract required fields: url, pushedAt, org, repo name
  - Handle feed unavailability gracefully (retry with exponential backoff)
- **User Value:** Foundation for all search - ensures we have latest government repos
- **Domain Constraint:** Read-only access to public feed, no authentication

**FR-1.2: gitingest Summary Generation (MVP)**
- **Requirement:** Generate LLM-ready code summaries for each repository
- **Acceptance Criteria:**
  - Execute gitingest Python library on repository URL
  - Generate comprehensive summary (code structure, key files, dependencies)
  - Handle repositories of varying sizes (10KB to 100MB+)
  - Timeout handling for extremely large repos (>5 minutes)
  - Error logging for failed gitingest operations
- **User Value:** Enables semantic search by creating searchable summaries
- **Domain Constraint:** Public GitHub repos only, respects rate limits

**FR-1.3: Smart Caching via R2 Metadata (MVP) ✨**
- **Requirement:** Cache gitingest summaries to avoid expensive regeneration
- **Acceptance Criteria:**
  - Store summaries in R2: `gitingest/{org}/{repo}/summary.txt`
  - Attach custom metadata: `pushedAt`, `url`, `processed` timestamp
  - Check object metadata before processing (HEAD request)
  - Only regenerate if pushedAt differs from cached value
  - Achieve 90%+ cache hit rate on subsequent runs
- **User Value:** Keeps costs <£50/month, enables sustainable scaling
- **Innovation:** Metadata IS the cache - no separate cache DB needed
- **Domain Constraint:** Cost-consciousness critical for public sector

**FR-1.4: Parallel Container Execution (MVP)**
- **Requirement:** Run ingestion pipeline with parallelization support for ~21k repos
- **Acceptance Criteria:**
  - Docker container with Python 3.11, gitingest, boto3
  - CLI arguments: `--batch-size=N --offset=M` for parallel execution
  - Process every Nth repo starting at offset M (e.g., `--batch-size=10 --offset=0` processes repos 0, 10, 20...)
  - Run multiple containers in parallel (e.g., 10 containers = 10× speedup)
  - Environment variable configuration (.env file)
  - Processing statistics logged (total, cached, processed, errors)
  - Graceful shutdown and error reporting
  - **Initial seeding:** ~21k repos × 10s avg ÷ 10 parallel = ~6 hours
- **User Value:** Makes initial seeding feasible within 6-hour window
- **Rationale:** Sequential processing would take 58+ hours (unacceptable for MVP)
- **Phase 2:** Migrate to GitHub Actions matrix for automation

---

### FR-2: AI-Powered Search (MVP)

**FR-2.1: Cloudflare AI Search Integration (MVP) ✨**
- **Requirement:** Automatically index R2 content with AI Search
- **Acceptance Criteria:**
  - Configure AI Search to monitor R2 bucket
  - Automatic indexing of new/updated gitingest files
  - Continuous updates without manual reindexing
  - Query API accessible from Workers
- **User Value:** Zero-code embedding generation, managed RAG pipeline
- **Innovation:** Validates gitingest quality without custom infrastructure
- **Domain Constraint:** Must prove value with managed service before custom build

**FR-2.2: Semantic Search API (MVP) ✨**
- **Requirement:** Natural language search over government code
- **Acceptance Criteria:**
  - POST /mcp/search endpoint accepts text query
  - Returns top 5 results with snippets and metadata
  - Response time <2 seconds (p95)
  - Similarity scoring included in results
  - Handles queries from 3 words to full sentences
- **User Value:** Find code by concept, not just keywords ("authentication methods" finds relevant implementations)
- **Magic Moment:** Developers discover code they wouldn't find with keyword search
- **Domain Constraint:** Public repos only, no sensitive data in queries/results

**FR-2.3: Result Metadata & Context (MVP)**
- **Requirement:** Provide rich context to help users evaluate results
- **Acceptance Criteria:**
  - Each result includes: repo URL, org, name, snippet, last updated, language
  - GitHub direct link and Codespaces/Gitpod quick-launch URLs
  - License information if available
  - Similarity score for transparency
  - Context lines around matched snippet
- **User Value:** Users can quickly assess if code is worth exploring
- **Domain Constraint:** Trust signals critical for government context

---

### FR-3: MCP API Integration (MVP)

**FR-3.1: MCP v2 Protocol Compliance (MVP)**
- **Requirement:** Standards-compliant MCP API for AI assistant integration
- **Acceptance Criteria:**
  - MCP v2 protocol endpoints on Cloudflare Workers
  - JSON request/response format as specified
  - Protocol version negotiation
  - Standard error codes and formats
- **User Value:** Works with Claude, GitHub Copilot, other MCP-compatible assistants
- **Innovation:** First government code platform with AI assistant integration
- **Domain Constraint:** Open standards preferred in government

**FR-3.2: JWT Authentication (MVP)**
- **Requirement:** Secure API access with token-based auth
- **Acceptance Criteria:**
  - JWT generation with 15-minute expiry
  - Token refresh flow for long sessions
  - Signature verification on every request
  - Invalid token returns 401 with clear error
- **User Value:** Secure access without complex OAuth flows
- **Domain Constraint:** NCSC secure coding standards compliance

**FR-3.3: Rate Limiting (MVP)**
- **Requirement:** Prevent abuse while allowing legitimate use
- **Acceptance Criteria:**
  - 100 requests/minute per token (sliding window)
  - 429 response when exceeded with Retry-After header
  - Rate limit headers in all responses
  - Configurable limits for future tiers
- **User Value:** Fair access for all users, system stability
- **Domain Constraint:** Public service must prevent monopolization

**FR-3.4: Health & Monitoring Endpoints (MVP)**
- **Requirement:** Observability for operations and debugging
- **Acceptance Criteria:**
  - GET /mcp/health returns service status
  - Checks: AI Search connectivity, R2 availability, Workers health
  - Structured JSON logging for all requests
  - Error alerting for failures
- **User Value:** Reliable service, quick issue diagnosis
- **Domain Constraint:** Transparency and accountability

---

### FR-4: Developer Integration (MVP)

**FR-4.1: MCP Configuration Documentation (MVP)**
- **Requirement:** Clear setup instructions for AI assistants
- **Acceptance Criteria:**
  - Step-by-step guide (<5 minutes to complete)
  - Example config for Claude Desktop
  - Troubleshooting for common issues
  - Example queries with expected results
- **User Value:** Developers can integrate without support
- **Success Metric:** 20+ early adopters self-configure

**FR-4.2: OpenAPI 3.0 Specification (MVP)**
- **Requirement:** Machine-readable API documentation
- **Acceptance Criteria:**
  - Complete OpenAPI spec at /openapi.json
  - Interactive Swagger UI at /docs
  - Examples for all endpoints
  - Error schemas documented
- **User Value:** Easy integration, clear expectations
- **Domain Constraint:** Government API standards compliance

---

### FR-5: Web Interface (Phase 2)

**FR-5.1: Search Interface (Phase 2)**
- **Requirement:** Web-based search for non-developers
- **Acceptance Criteria:**
  - GOV.UK Design System compliant
  - Large search box, auto-suggestions
  - Results as cards with inline expansion
  - Filter sidebar (language, org, sector)
  - Mobile-responsive design
- **User Value:** Civil servants and procurement officers can search without MCP
- **Domain Constraint:** WCAG 2.1 AA accessibility mandatory

**FR-5.2: User Accounts (Phase 2)**
- **Requirement:** Authentication for saved searches and analytics
- **Acceptance Criteria:**
  - GitHub OAuth login
  - GDPR-compliant data handling
  - Right to access/delete data
  - Minimal data collection
- **User Value:** Personalization, usage tracking
- **Domain Constraint:** Privacy-first approach required

**FR-5.3: Department Analytics (Phase 2)**
- **Requirement:** Usage insights for department admins
- **Acceptance Criteria:**
  - Query volume by team/department
  - Popular searches within department
  - Reuse impact metrics (if tracked)
  - Export to CSV for reporting
- **User Value:** Demonstrate value to department leadership
- **Domain Constraint:** No cross-department data leakage

---

### FR-6: Procurement Intelligence (Phase 3) ✨✨

**FR-6.1: Tender Feed Integration (Phase 3) ✨✨**
- **Requirement:** Monitor Digital Marketplace for new tenders
- **Acceptance Criteria:**
  - API connection to tender feeds
  - Automated scanning of tender descriptions
  - Keyword extraction for technical capabilities
  - Daily check for new tenders
- **User Value:** Foundation for proactive duplicate prevention
- **Magic Moment:** Connect "what exists" with "what we're buying"
- **Domain Constraint:** Public Contracts Regulations compliance

**FR-6.2: Duplicate Detection Alerts (Phase 3) ✨✨**
- **Requirement:** Alert procurement teams about existing code before contracts
- **Acceptance Criteria:**
  - Match tender keywords against code repository summaries
  - Generate alerts: "Found 3 repos that may fulfill this requirement"
  - Supportive framing (not accusatory)
  - Alert includes: repo links, relevance score, contact info
  - Procurement officer dashboard
- **User Value:** Prevent £millions in duplicate procurement
- **Magic Moment:** "Before awarding £500k, these 3 departments already built this"
- **Innovation:** Proactive prevention vs reactive audit
- **Domain Constraint:** Work with Commercial Function as partner

**FR-6.3: Public Savings Dashboard (Phase 3) ✨**
- **Requirement:** Transparent reporting of prevented duplication
- **Acceptance Criteria:**
  - Public webpage showing impact metrics
  - "£XM prevented this quarter" with methodology
  - Documented case studies (anonymized if needed)
  - Quarterly reporting
- **User Value:** Public accountability, demonstrates taxpayer value
- **Strategic Value:** Evidence for Treasury, DSIT Secretary celebration
- **Domain Constraint:** Transparency expected of public sector tools

---

### FR-7: Advanced Search Features (Phase 2/3)

**FR-7.1: Trust Signals (Phase 2)**
- **Requirement:** Help users assess code quality and production-readiness
- **Acceptance Criteria:**
  - Organization tier badges (NCSC, GDS, NHS, etc.)
  - Last updated timestamp
  - Stars/forks from GitHub
  - "Production usage" indicator if detectable
  - License clarity
- **User Value:** Trust results enough to reuse code
- **Domain Constraint:** Government context makes trust critical

**FR-7.2: Sector Affinity Filtering (Phase 2)**
- **Requirement:** Filter results by government sector
- **Acceptance Criteria:**
  - Sector tags: Health, Justice, Revenue, Benefits, Local Gov, Central
  - Filter UI in sidebar
  - Auto-tagging based on organization
  - Multi-select filtering
- **User Value:** Health developers find NHS code more relevant
- **Domain Constraint:** Organizational boundaries matter in government

**FR-7.3: Custom Embeddings (Phase 2 - If Needed)**
- **Requirement:** Migrate to custom embeddings if AI Search insufficient
- **Acceptance Criteria:**
  - bge-base-en-v1.5 (768-dim) via Workers AI
  - Batch embedding generation for all repos
  - Cloudflare Vectorize index management
  - Hybrid search (semantic + BM25)
  - Recency boosting
- **User Value:** Improved search relevance if baseline insufficient
- **Decision Point:** Only if MVP testing shows AI Search quality issues

---

### FR-8: Operational Excellence

**FR-8.1: Cost Monitoring (MVP)**
- **Requirement:** Track infrastructure spend for transparency
- **Acceptance Criteria:**
  - Daily cost breakdown (R2, AI Search, Workers)
  - Alert if approaching £50/month MVP budget
  - Projected monthly costs visible
  - Public cost reporting (transparency)
- **User Value:** Sustainable operations, public accountability
- **Domain Constraint:** Cost transparency expected

**FR-8.2: Audit Logging (MVP)**
- **Requirement:** Log all queries for compliance and debugging
- **Acceptance Criteria:**
  - Structured JSON logs (timestamp, query, user, results)
  - 12-month retention
  - Export capability for audit
  - Procurement-related queries flagged
- **User Value:** Accountability, debugging, compliance
- **Domain Constraint:** Government audit requirements

**FR-8.3: Security Compliance (MVP)**
- **Requirement:** NCSC secure coding standards
- **Acceptance Criteria:**
  - HTTPS only (TLS 1.3)
  - Input validation and sanitization
  - No secrets in logs or errors
  - Read-only access to public data
  - Security incident response plan
- **User Value:** Trustworthy government service
- **Domain Constraint:** Mandatory for government software

**FR-8.4: Automated GitHub Actions (Phase 2)**
- **Requirement:** Scheduled ingestion without manual execution
- **Acceptance Criteria:**
  - GitHub Actions workflow runs every 6 hours
  - Fetches repos.json, runs gitingest, uploads to R2
  - Notifications on failures
  - Manual trigger option
- **User Value:** Always up-to-date without human intervention
- **Phase Timing:** After MVP validates approach

---

### Requirements Summary by Phase

**MVP (Weeks 1-2):**
- FR-1: Data ingestion with smart caching ✓
- FR-2: AI Search semantic search ✓
- FR-3: MCP API ✓
- FR-4: Developer integration docs ✓
- FR-8.1, 8.2, 8.3: Ops & compliance ✓

**Phase 2 (Weeks 3-6):**
- FR-5: Web interface ✓
- FR-7.1, 7.2: Trust signals, sector filtering ✓
- FR-7.3: Custom embeddings (if needed) ✓
- FR-8.4: GitHub Actions automation ✓

**Phase 3 (Months 3-4):**
- FR-6: Procurement intelligence ✨✨ ✓
- Advanced analytics and reporting ✓

**Total Requirements:** 25 functional requirements across 8 capability areas

---

## Non-Functional Requirements

<!-- template-output:nfr-performance -->

### NFR-1: Performance Requirements

**Why Performance Matters for THIS Product:**
- Developer experience: Slow search = abandonment (competitors: GitHub search, Google)
- Ambient integration: AI assistants timeout after 5s
- Procurement urgency: Officers need instant answers during budget windows
- Edge deployment: Sub-200ms cold start on Cloudflare Workers

**Performance Criteria:**

**NFR-1.1: Query Response Time**
- **Metric:** < 2 seconds (p95) end-to-end query response
- **Breakdown:**
  - AI Search retrieval: < 800ms (p95)
  - Workers processing + formatting: < 200ms
  - Network overhead: < 1000ms
- **Measurement:** Workers Analytics, real-user monitoring
- **Rationale:** GitHub search ~1-2s; we must match to be competitive

**NFR-1.2: Cold Start Latency**
- **Metric:** < 200ms Workers cold start time
- **Rationale:** Edge deployment, minimal dependencies
- **Validation:** Cloudflare Workers dashboard metrics

**NFR-1.3: AI Search Indexing Throughput**
- **Metric:** ~21,000 repos processed in < 6 hours (initial seeding)
- **Sequential:** 21k × 10s avg = 58 hours (unacceptable)
- **Parallel (10 containers):** 58 hours ÷ 10 = 5.8 hours ✓
- **Breakdown:** ~35 repos/minute aggregate with 10 parallel containers
- **Rationale:** Initial seeding must be feasible for MVP validation
- **Validation:** Container execution logs, R2 object count, wall-clock time

**NFR-1.4: Cache Hit Rate**
- **Metric:** 90%+ cache hit rate on subsequent ingestion runs
- **Rationale:** Only 10-15% of repos update daily; avoid wasteful regeneration
- **Measurement:** R2 HEAD requests vs full ingestions ratio

---

<!-- template-output:nfr-security -->

### NFR-2: Security Requirements

**Why Security Matters for THIS Product:**
- Government trust: NCSC standards compliance mandatory for adoption
- Public data only: No authentication, but must prevent abuse
- Audit requirements: Track who searches for what (especially procurement queries)
- Supply chain: Dependencies must be vetted and minimal

**Security Criteria:**

**NFR-2.1: NCSC Secure Coding Standards Compliance**
- **Standards:**
  - Input validation on all API endpoints
  - Output encoding to prevent XSS (Phase 2 web UI)
  - No eval(), exec(), or dynamic code execution
  - Dependencies scanned weekly (npm audit, Dependabot)
- **Validation:** Security checklist review, automated scanning
- **Rationale:** Mandatory for government software

**NFR-2.2: Read-Only Access Pattern**
- **Requirement:** Zero write operations to GitHub repositories
- **Implementation:**
  - Read-only GitHub tokens (if used)
  - No git clone, only metadata + gitingest API calls
  - R2 write access restricted to container IAM role
- **Rationale:** Prevents supply chain compromise, aligns with least privilege

**NFR-2.3: Audit Logging**
- **Metric:** 100% of queries logged with metadata
- **Log Fields:**
  - Timestamp, query text, user context (if available), results returned, response time
  - Flag procurement-related queries (keywords: "contract", "tender", "spend")
- **Retention:** 90 days minimum (GDPR compliance for lawful basis)
- **Rationale:** Transparency, abuse detection, procurement intelligence metrics

**NFR-2.4: Rate Limiting**
- **Metric:** 60 queries/minute per IP (MVP), 600/min per API key (Phase 2)
- **Implementation:** Cloudflare Workers rate limiting primitive
- **Rationale:** Prevent abuse, cost control (AI Search queries charged per request)

**NFR-2.5: Dependency Security**
- **Requirement:** Zero high/critical CVEs in production dependencies
- **Process:** Weekly scans, 48-hour patching SLA for critical issues
- **Tools:** npm audit, Dependabot, Cloudflare Workers security scanner
- **Rationale:** Government trust, supply chain integrity

---

<!-- template-output:nfr-scale -->

### NFR-3: Scalability Requirements

**Why Scale Matters for THIS Product:**
- Current scope: ~21,000 repos already exceeds typical dev tools
- Growth trajectory: 21k → 30k+ as local councils, arms-length bodies added
- Cross-department expansion: 24 departments → 400+ local authorities
- Query volume: Hundreds/week (MVP) → thousands/day (scale)
- Data growth: 21k repos requires parallelization even for MVP

**Scalability Criteria:**

**NFR-3.1: Repository Capacity**
- **Current:** ~21,000 repositories (uk-x-gov-software-community feed)
- **Target (12 months):** 30,000+ repositories (local councils, arms-length bodies)
- **Architecture:** Horizontal scaling via container parallelization (MVP: 10 parallel, Phase 2: 20+ via GitHub Actions)
- **Validation:** MVP proves 21k feasible, extrapolate to 30k+

**NFR-3.2: Query Throughput**
- **MVP:** 100 queries/day sustained
- **Scale (12 months):** 10,000 queries/day sustained
- **Architecture:** Cloudflare Workers auto-scaling (millions RPS capable)
- **Bottleneck:** AI Search query limits (unknown, monitor early)

**NFR-3.3: Storage Capacity**
- **Current Estimate:** ~21,000 repos × 50KB avg gitingest = ~1GB
- **Target (30,000 repos):** ~1.5GB gitingest summaries
- **R2 Limits:** 10GB free tier, well within capacity
- **Vector Storage:** AI Search managed, no explicit limits published
- **Cost Impact:** R2 storage effectively free at this scale

**NFR-3.4: Ingestion Parallelization (MVP)**
- **Requirement:** Support concurrent container execution via CLI arguments
- **MVP Target:** 10 parallel containers manually launched (10× speedup)
- **Phase 2 Target:** 20+ parallel jobs via GitHub Actions matrix automation
- **Rationale:** 21k repos requires parallelization even for initial MVP seeding

---

<!-- template-output:nfr-accessibility -->

### NFR-4: Accessibility Requirements

**Why Accessibility Matters for THIS Product:**
- Legal requirement: Equality Act 2010 for public sector digital services
- User diversity: Civil servants with disabilities must access procurement intelligence
- Reputation: GDS service assessment includes accessibility check
- Phase 2 Web UI: WCAG 2.1 AA compliance is non-negotiable

**Accessibility Criteria:**

**NFR-4.1: WCAG 2.1 AA Compliance (Phase 2 Web UI)**
- **Standards:**
  - Perceivable: Text alternatives, captions, adaptable layouts
  - Operable: Keyboard navigation, sufficient time, seizure-safe
  - Understandable: Readable text (F-E 8-9), predictable navigation
  - Robust: Compatible with assistive technologies (screen readers)
- **Validation:** Axe DevTools automated scan + manual NVDA/JAWS testing
- **Rationale:** Legal requirement, GDS service standard point

**NFR-4.2: API Accessibility (MVP MCP)**
- **Requirement:** Clear error messages, semantic JSON structure
- **Rationale:** AI assistants adapt for accessibility; API quality matters

**NFR-4.3: GOV.UK Design System Compliance (Phase 2)**
- **Requirement:** Use GOV.UK Frontend components (buttons, forms, typography)
- **Rationale:** Built-in accessibility, user familiarity, government branding

---

<!-- template-output:nfr-integration -->

### NFR-5: Integration Requirements

**Why Integration Matters for THIS Product:**
- MCP v2: Core product differentiator (ambient discovery through AI assistants)
- GitHub API: Primary data source, must handle rate limits gracefully
- AI Search: Managed service dependency, must monitor for outages
- Digital Marketplace: Phase 2 G-Cloud listing requires SSO integration

**Integration Criteria:**

**NFR-5.1: MCP v2 Protocol Compliance**
- **Specification:** Model Context Protocol v2 (https://modelcontextprotocol.io/v2)
- **Validation:** Test with Claude Desktop, Cursor, Continue.dev
- **Error Handling:** Graceful degradation if AI Search unavailable
- **Rationale:** Core product requirement, ecosystem compatibility

**NFR-5.2: GitHub API Rate Limit Handling**
- **Limits:** 5,000 req/hour (authenticated), 60 req/hour (unauthenticated)
- **Strategy:**
  - Use authenticated token (container only)
  - Exponential backoff on 429 responses
  - Cache repos.json feed (6-hour TTL)
- **Monitoring:** Alert if < 500 requests remaining
- **Rationale:** Prevent ingestion failures during peak usage

**NFR-5.3: AI Search Dependency Resilience**
- **Requirement:** Graceful degradation if AI Search unavailable
- **Fallback:** Return cached results with staleness warning
- **Monitoring:** Health check endpoint, PagerDuty alerts
- **Rationale:** Cloudflare AI Search is Preview (not GA), expect occasional issues

**NFR-5.4: Digital Marketplace Integration Readiness (Phase 3)**
- **Requirement:** Support G-Cloud listing technical requirements
- **Standards:**
  - OAuth 2.0 / SAML SSO for civil service login
  - API key management for procurement teams
  - Billing integration (usage-based pricing)
- **Rationale:** Revenue model, enterprise adoption

---

<!-- template-output:nfr-reliability -->

### NFR-6: Reliability Requirements

**Why Reliability Matters for THIS Product:**
- Government infrastructure expectations: "Always available"
- Procurement urgency: Officers need answers during budget windows (time-sensitive)
- Developer trust: Broken search = switch to GitHub/Google
- Cloudflare SLA: 99.99% Workers uptime, 99.9% R2 availability

**Reliability Criteria:**

**NFR-6.1: API Uptime**
- **Target:** 99.9% uptime (MVP), 99.95% (Phase 2)
- **Downtime Budget:** ~43 minutes/month (MVP), ~22 minutes/month (Phase 2)
- **Measurement:** Cloudflare Workers Analytics, uptime monitoring (e.g., Pingdom)
- **Rationale:** Government infrastructure expectations

**NFR-6.2: Data Freshness**
- **Requirement:** Index updated every 6 hours (4× daily)
- **Staleness Alert:** Flag if last update > 8 hours ago
- **Rationale:** Users trust requires current data (not week-old results)

**NFR-6.3: Error Rate**
- **Target:** < 0.1% API error rate (5xx responses)
- **Monitoring:** Cloudflare Workers exception tracking, Sentry integration
- **Alerting:** PagerDuty for error rate > 1%
- **Rationale:** High error rate = broken user experience

**NFR-6.4: Disaster Recovery**
- **Requirement:** Full data recovery from R2 within 24 hours
- **Backup Strategy:**
  - R2 object versioning enabled (30-day retention)
  - repos.json feed externally hosted (GitHub)
  - AI Search index can be rebuilt from R2 contents
- **RTO (Recovery Time Objective):** 24 hours for full rebuild
- **RPO (Recovery Point Objective):** 6 hours (last successful ingestion)
- **Rationale:** Government data integrity requirements

---

<!-- template-output:nfr-cost -->

### NFR-7: Cost Requirements

**Why Cost Matters for THIS Product:**
- Strategic constraint: £50/month proves viability before asking for budget
- Public sector scrutiny: Must demonstrate value for money
- Scale path: Cost model must scale sub-linearly with usage
- Innovation: Challenge assumption that AI infrastructure = expensive

**Cost Criteria:**

**NFR-7.1: MVP Infrastructure Cost**
- **Target:** < £50/month for ~21,000 repos, 100 queries/day
- **Breakdown (estimated):**
  - Cloudflare Workers: £0 (free tier: 100k req/day)
  - Cloudflare R2: £0 (free tier: 10GB storage, 1M reads/month, ~1GB actual usage)
  - Cloudflare AI Search: £TBD (Preview pricing unknown, likely < £30/month for 21k docs)
  - Local container hosting: £0 (manual parallel execution on-demand)
  - Domain: £10/year (govscraperepo.uk)
- **Risk:** AI Search pricing unclear in Preview; may need to optimize or switch to custom embeddings if costs exceed budget
- **Validation:** Cloudflare billing dashboard, weekly cost review
- **Rationale:** Strategic constraint, prove concept before scaling

**NFR-7.2: Scale Economics (Phase 2+)**
- **Target:** < £150/month for 30,000 repos, 10,000 queries/day
- **Cost Model:** Sub-linear scaling (50% more repos = <3× cost due to 90%+ cache hit rate)
- **Optimization Levers:**
  - Smart caching (90%+ hit rate) reduces ingestion cost
  - Edge caching (Cloudflare Cache API) reduces AI Search queries
  - Batch processing (container parallelization) reduces wall-clock time
- **Rationale:** Must remain cost-effective at scale for public sector adoption

**NFR-7.3: Cost Monitoring & Alerts**
- **Requirement:** Daily cost tracking, alert if > £2/day (MVP), > £20/day (Scale)
- **Tools:** Cloudflare billing API, custom dashboard
- **Rationale:** Early warning prevents budget overrun

---

<!-- template-output:nfr-compliance -->

### NFR-8: Compliance Requirements

**Why Compliance Matters for THIS Product:**
- Public sector mandate: Technology Code of Practice, GDS standards
- Data protection: GDPR applies (query logs = personal data if identified)
- Open source licensing: OGL compatibility required for government code
- Procurement: Must meet G-Cloud listing requirements (Phase 3)

**Compliance Criteria:**

**NFR-8.1: GDPR Compliance**
- **Requirements:**
  - Privacy notice explaining query logging and retention
  - Lawful basis: Legitimate interest (improving government services)
  - Data minimization: Only log necessary fields (no PII unless authenticated)
  - Retention: 90 days query logs, then anonymize or delete
  - Right to erasure: API for users to request deletion (Phase 2+)
- **Validation:** Data Protection Impact Assessment (DPIA)
- **Rationale:** Legal requirement for processing personal data

**NFR-8.2: Open Government Licence (OGL) Compliance**
- **Requirement:** All indexed code must be OGL, MIT, Apache, or compatible
- **Validation:** License detection from GitHub API metadata
- **Display:** Show license badge in search results
- **Rationale:** Civil servants can only reuse openly licensed code

**NFR-8.3: Technology Code of Practice Alignment**
- **Standards:**
  - Point 5: Make source code open (govscraperepo itself will be MIT licensed)
  - Point 8: Make all new source code open (promote via discovery)
  - Point 12: Make new source code open and reusable (core mission)
- **Rationale:** Alignment with government digital strategy

**NFR-8.4: GDS Service Standard Compliance (Phase 2 Web UI)**
- **Standards:**
  - Point 12: Make new source code open (met)
  - Point 5: Make sure everyone can use the service (accessibility met)
  - Point 10: Define what success looks like (metrics documented)
- **Validation:** GDS service assessment (if required for G-Cloud listing)
- **Rationale:** Best practice for government digital services

**NFR-8.5: Accessibility Regulations 2018**
- **Legal Requirement:** Public sector websites must meet WCAG 2.1 AA
- **Scope:** Phase 2 web interface
- **Enforcement:** Equality and Human Rights Commission can fine non-compliance
- **Compliance Date:** All new public sector websites (we qualify)
- **Rationale:** Legal requirement, not optional

---

### Non-Functional Requirements Summary

**Critical Path NFRs (MVP Blockers):**
- NFR-1.1: < 2s query response time (p95)
- NFR-1.3: 21k repos processed in < 6 hours (parallel execution required)
- NFR-2.1: NCSC secure coding compliance
- NFR-2.3: Audit logging for all queries
- NFR-3.4: Parallelization support via CLI arguments (--batch-size, --offset)
- NFR-5.1: MCP v2 protocol compliance
- NFR-7.1: < £50/month infrastructure cost

**Phase 2 NFRs (Web UI Mandatory):**
- NFR-4.1: WCAG 2.1 AA compliance
- NFR-4.3: GOV.UK Design System usage
- NFR-8.4: GDS Service Standard alignment
- NFR-8.5: Accessibility Regulations 2018 compliance

**Phase 3 NFRs (Enterprise Scale):**
- NFR-5.4: Digital Marketplace integration (SSO, billing)
- NFR-6.1: 99.95% uptime SLA (upgrade from 99.9%)
- NFR-7.2: Further cost optimization at 30k+ repos

**Total NFRs:** 24 non-functional requirements across 8 categories (Performance, Security, Scalability, Accessibility, Integration, Reliability, Cost, Compliance)

---
