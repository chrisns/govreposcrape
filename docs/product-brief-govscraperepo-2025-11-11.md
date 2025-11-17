# Product Brief: govscraperepo

**Date:** 2025-11-11
**Author:** cns
**Context:** GDS Strategic Initiative - Blueprint for Modern Digital Government

---

## Executive Summary

**govscraperepo** is foundational infrastructure for the UK government's digital transformation agenda, enabling the £45B savings identified in the State of Digital Government Review through AI-powered code discovery and reuse.

For 8 years, UK government departments have published code to GitHub (alphagov, NHS Digital, HMRC, etc.) in compliance with the Technology Code of Practice. **But publishing ≠ reuse.** Thousands of repositories sit unused because discovery is broken - developers can't find what exists, procurement teams can't check before contracting, and duplicate work wastes £millions annually.

The technology to solve this finally exists: AI coding assistants (Claude, Copilot), semantic search (Cloudflare Vectorize), and MCP protocol integration. govscraperepo makes cross-government code discovery **ambient** - developers find government code naturally through their AI assistants, without leaving their workflow.

**Strategic Impact:**
- Enables Blueprint vision: "not shipping the org chart," services designed around users
- Delivers on £45B savings agenda through duplication reduction + AI efficiency
- Transforms "make things open" from compliance theater to actual reuse

**MVP Timeline:** 1-2 weeks for MCP API, expanding to web interface and procurement intelligence in subsequent phases.

---

## Core Vision

### Problem Statement

UK government has been "coding in the open" for years - thousands of repositories published across dozens of departmental GitHub organizations. The Technology Code of Practice mandates sharing, and departments comply by publishing code.

**But publishing ≠ reuse.**

The code sits unused because discovery is broken:

**For Developers:**
- No centralized search across government orgs
- Manual GitHub searches across alphagov, nhsdigital, hmrc, dwpdigital, moj, etc.
- Don't know what exists or where to look
- Easier to rebuild than search

**For Procurement Teams:**
- No way to check "does this capability already exist in government?"
- £500k authentication contracts awarded when Home Office has MIT-licensed implementation
- No visibility into cross-government code assets

**For Leadership:**
- Can't measure reuse or prove value of "make things open"
- No data on duplicate work or savings opportunities
- Blueprint vision of cross-government collaboration remains aspirational

### Problem Impact

**Financial Waste:**
- £millions in redundant procurement annually
- Duplicate development across departments
- State of Digital Government Review identified £45B/year savings opportunity - reducing duplication is a primary driver

**Opportunity Cost:**
- Developer time spent rebuilding vs innovating
- Delayed service delivery (months to procure vs minutes to discover)
- Lost knowledge sharing across departments

**Cultural:**
- "Make things open" becomes compliance theater
- Perception that "government doesn't reuse" when the truth is we **can't find** what's shared
- Silos persist despite open code policies

### Why Existing Solutions Fall Short

**What exists today:**
- **Manual GitHub searches:** Requires knowing which org to search, limited to keyword matching
- **Word-of-mouth:** "Ask someone who might know" - doesn't scale
- **code.gov (US model):** Manual submission, keyword search only, no AI integration, missing dependency analysis
- **Commercial code search (GitHub, Sourcegraph):** Not government-specific, no org trust signals, no procurement integration

**What's missing:**
- Semantic search across all UK government code
- Natural language queries ("authentication methods", "postcode validation")
- Ambient integration (works where developers already are)
- Procurement intelligence (proactive duplicate detection)
- Trust signals (NCSC/GCHQ repos, organizational reputation)

### Proposed Solution

**govscraperepo** makes UK government code discovery **ambient and intelligent** through AI-powered semantic search integrated directly into developers' workflows.

**Core Innovation:**

**1. Semantic Code Search**
- Not just repo names/descriptions - search **actual code** via gitingest summaries
- Natural language queries: "How do NHS trusts implement authentication?"
- Returns specific functions/implementations with context, not just repo links

**2. Ambient Integration via MCP**
- Integrates with Claude, GitHub Copilot, and other AI coding assistants
- Developers discover government code naturally in their IDE/chat workflows
- Zero context switching - search happens where work happens

**3. Intelligent Data Pipeline**
- Consumes repos.json feed from xgov-opensource-repo-scraper
- Generates gitingest summaries of actual code (not just metadata)
- Smart caching: Only regenerate when repos update (pushedAt timestamp)
- Vector embeddings for semantic similarity

**4. Architecture for Scale**
- **Write path:** Container runs gitingest Python library (slow, async)
- **Read path:** Cloudflare Workers edge queries (fast, <2s)
- Separation enables cost control + performance

**5. Future: Procurement Intelligence**
- Scan tenders for technical keywords
- Alert: "Before procuring £500k, this capability exists in 3 departments"
- Public dashboard: "£XM in duplicate procurement prevented"

### Key Differentiators

**vs. US code.gov:**
- ✅ **Automated ingestion** (not manual submission)
- ✅ **Semantic search** (not keyword only)
- ✅ **AI assistant integration** (ambient, not destination site)
- ✅ **Procurement intelligence** (unique strategic value)

**vs. Commercial code search (GitHub, Sourcegraph):**
- ✅ **UK government specificity** (org trust signals, sector filtering)
- ✅ **Procurement integration** (prevents duplicate spending)
- ✅ **MCP-first** (ambient workflow integration)
- ✅ **Public sector optimized** (cost-conscious, edge-native)

**Strategic Positioning:**
- Not a side tool - **infrastructure for the Blueprint transformation agenda**
- Enables the £45B savings through duplication reduction + AI efficiency
- Makes cross-government collaboration natural, not aspirational

---

## Target Users

### Primary Users: Government Developers

**Profile:**
- Building services for UK departments (GDS, NHS Digital, Home Office, HMRC, local government)
- Daily users of AI coding assistants (Claude, Copilot)
- Frustrated by rebuilding what exists elsewhere in government
- Want to reuse, but can't find what's available

**Current Behavior:**
- Search their own department's GitHub org
- Ask colleagues "has anyone built this?"
- Google for government repos (rarely successful)
- Eventually build from scratch or procure externally

**Desired Experience:**
- Query Claude: "Show me government authentication implementations"
- Get instant results with actual code + context
- Click through to GitHub + Codespaces to try it
- Reuse in minutes instead of rebuilding in weeks

**What They Value:**
- **Speed:** Find code in <2 minutes
- **Relevance:** Results match their actual need
- **Context:** Understand what code does, who maintains it
- **Trust:** Know if code is production-ready
- **Integration:** Works in their existing workflow (IDE/AI assistant)

**Technical Comfort:** High - comfortable with MCP configuration, GitHub, command-line tools

### Secondary Users: Civil Servants & Policy Makers

**Profile:**
- Non-technical staff needing technical solutions
- Policy makers evaluating digital capabilities
- Procurement officers checking for existing solutions

**Current Behavior:**
- Rely on technical colleagues to research solutions
- Limited visibility into what government has built
- Can't validate "does this exist?" claims

**Desired Experience (Phase 2 - Web Interface):**
- Natural language query in web chat
- Simple results with plain English explanations
- Links to repos and owner contacts
- No technical knowledge required

**What They Value:**
- **Simplicity:** No technical jargon
- **Trust indicators:** Gov.uk branding, organizational reputation
- **Accessibility:** WCAG 2.1 AA compliant
- **Clarity:** Understand what exists and how to access it

### Tertiary Users: Procurement Teams

**Profile (Phase 3):**
- Awarding contracts for digital/technology services
- Responsible for value for money
- Required to check for duplicate spending

**Current Behavior:**
- Limited ability to check "does this exist in government?"
- Rely on manual queries to other departments
- Often unaware of existing code assets

**Desired Experience:**
- Automated tender scanning
- Alerts when tendering for existing capability
- Evidence for "why we're not duplicating" decisions

**What They Value:**
- **Evidence:** Documented reuse checks
- **Savings:** Quantified cost avoidance
- **Compliance:** Meeting value-for-money obligations

---

## Success Metrics

### MVP Success (2-3 months)

**Adoption:**
- **Hundreds of uses per week** from government developers
- 20+ early adopters successfully integrate MCP
- Active usage across 3+ departments (GDS, NHS, Home Office, etc.)

**Quality:**
- Top 5 results relevant for **80%+ queries**
- User feedback: "Found what I needed" for majority of searches
- <2 second query response time (p95)

**Technical:**
- Successfully ingesting and indexing repos.json repositories
- Smart caching working (only re-ingest on pushedAt changes)
- <£50/month infrastructure costs

**Evidence of Value:**
- Documented examples of code reused that wouldn't have been found manually
- Developer testimonials on time savings
- Early signal of adoption momentum

### Scale Success (6-12 months)

**Impact:**
- **Thousands of hours saved** across government development teams
- **£Millions saved** through documented prevented duplication
- Procurement checks cite govscraperepo as validation tool

**Strategic Visibility:**
- **Celebrated by DSIT Secretary of State** as Blueprint success story
- Featured in government digital transformation communications
- **Integrated into Blueprint/roadmap delivery metrics**
- Part of official £45B savings measurement

**Adoption:**
- Majority of UK government departments using
- Standard tool in GDS/departmental developer onboarding
- Integrated into Digital Marketplace due diligence

**Advanced Features:**
- Web interface serving non-technical users
- SBOM integration for security analysis
- Procurement tender scanning operational
- Public savings dashboard launched

---

## MVP Scope

### Core Features

**1. Automated Data Pipeline**
- Fetch repos.json from xgov-opensource-repo-scraper feed
- Generate gitingest summaries for each repository using Python library
- Smart caching: Only regenerate gitingest when pushedAt timestamp changes
- Store gitingest summaries in Cloudflare R2

**2. Semantic Search Infrastructure**
- Chunk code using AST-based function-level splitting
- Generate embeddings using StarCoder2 (or text-embedding-3-small fallback)
- Store vectors in Cloudflare Vectorize with metadata
- Support natural language queries

**3. MCP API Server**
- Cloudflare Workers hosting MCP v2 endpoints
- JWT authentication for API access
- Rate limiting (100 req/min per token)
- Semantic search endpoint: query → embed → retrieve → rank → return

**4. Result Context & Links**
- Return code snippets with surrounding context
- Direct links to GitHub repositories
- Codespaces/Gitpod links for immediate code exploration
- Metadata: repo org, language, last updated

**5. Query Pipeline**
- Hybrid ranking: semantic (vector similarity) + syntactic (BM25 on names)
- Recency boost (recently updated repos ranked higher)
- Top 5 results optimized for relevance

### Architecture

**Write Path (Ingest Pipeline):**
- **Container** (separate from Workers) runs gitingest Python library
- Scheduled/triggered processing (not real-time)
- Fetches repos.json → generates gitingest → chunks code → generates embeddings
- Writes to Cloudflare storage (R2, Vectorize, KV)
- Smart caching prevents unnecessary gitingest re-runs (expensive operation)

**Read Path (User-Facing):**
- **Cloudflare Workers** provides fast, read-only MCP API
- Queries Vectorize for semantic search
- Reads from R2/KV for code context and metadata
- Edge-native, globally distributed, <2s response
- No gitingest execution in user path (pre-processed data)

**Why Separate:**
- gitingest is slow (can take minutes per large repo)
- Workers have execution time limits
- Async ingest allows cost control through caching
- Read path scales independently for user queries

### Out of Scope for MVP

**Phase 2 (Weeks 3-6):**
- 11ty static website with gov.uk design system
- Web chat interface for non-technical users
- Markdown-based content management for community contributions
- Recency signals and basic trust indicators in UI

**Phase 3 (Months 2-3):**
- SBOM integration for dependency analysis
- Organizational trust scoring (NCSC/GCHQ, NHS, etc.)
- Sector affinity filtering (local gov, central gov, health)
- Pattern analysis across repositories
- Proactive notifications for project descriptions
- Procurement tender scanning and alerts

**Future Vision:**
- IDE plugins (VS Code, JetBrains)
- GitHub App integration
- Backlog analysis (scan Jira/GitHub issues for existing solutions)
- Cross-department funding model (GovTech Foundation concept)
- Public value dashboard ("£XM saved this year")

### MVP Success Criteria

**MVP is successful if:**

1. **It works:** Early adopters integrate MCP and get relevant results
2. **It's useful:** Developers find code they wouldn't have found manually
3. **It's fast:** <2s queries, hundreds of uses per week
4. **It's feasible:** <£50/month costs, sustainable to scale
5. **It's validated:** Positive feedback from GDS developers, signal for Phase 2 investment

**MVP fails if:**
- Search relevance is too poor (developers don't trust results)
- Adoption is minimal (no one uses it despite availability)
- gitingest costs/performance makes it infeasible to scale
- NCSC security concerns block deployment

**Decision Point:** After 4-6 weeks of MVP usage, evaluate whether to proceed to Phase 2 based on adoption, relevance metrics, and user feedback.

---

## Market Context

### UK Government Open Source Landscape

**Policy Environment:**
- **Technology Code of Practice** mandates "publish your code and use open-source software"
- **GDS Service Standard Section 12:** "Make all new source code open and reusable"
- Strong policy support but **inconsistent compliance and minimal reuse**

**Current State:**
- Thousands of repositories across government GitHub orgs
- **OpenUK 2025 report:** UK leads Europe in public sector open source publication
- **Gap:** Publication strong, discovery and reuse weak

**Existing GitHub Organizations:**
- alphagov (GDS core services)
- nhsdigital, nhsengland (health)
- hmrc (tax and revenue)
- moj-analytical-services (justice)
- dwpdigitaltech (benefits and pensions)
- Plus dozens of local government orgs

**Problem:** Decentralized publication, no unified discovery, manual cross-org search

### Strategic Alignment

**Blueprint for Modern Digital Government (2025):**
- **"Not shipping the org chart"** - services designed around users, not departmental boundaries
- Cross-government collaboration and shared capabilities
- Breaking down silos through common platforms

**State of Digital Government Review (2025):**
- **£45B/year savings identified**
- AI + reducing duplication as primary drivers
- Modernizing how public services work

**govscraperepo's Role:**
- **Enabler of cross-government collaboration** - makes other departments' work visible
- **Duplication reduction** - prevents rebuilding what exists
- **AI efficiency** - leverages AI assistants for discovery at scale
- **Blueprint delivery** - practical infrastructure for the vision

### Competitive Landscape

**International Comparisons:**
- **US code.gov:** Centralized but manual submission, keyword search only, low reuse
- **France/Australia:** Data-centric portals, minimal code focus
- **No country has solved the discovery + reuse problem at scale**

**UK Opportunity:**
- First to integrate AI assistants + semantic search + government code
- Leapfrog manual catalog approaches with ambient discovery
- Set international standard for government code reuse

**Commercial Tools:**
- GitHub Code Search: No government-specific features
- Sourcegraph: Expensive, not tailored to public sector
- **Gap:** No tool optimized for cross-government discovery with procurement intelligence

---

## Financial Considerations

### Development Investment (MVP)

**Time Investment:**
- 1-2 weeks for MCP API and search infrastructure
- Small team (1-2 developers)
- Leverages existing repos.json feed (8 years of data)

**Infrastructure Costs (MVP):**
- **Cloudflare Workers:** ~£5/month (likely within free tier initially)
- **Cloudflare Vectorize:** ~£0.31/month (10K repos @ 768 dims, 30K queries)
- **Cloudflare R2:** ~£5/month (gitingest storage)
- **Cloudflare KV:** ~£1/month (metadata cache)
- **Container hosting:** ~£20/month (gitingest processing)
- **Total:** <£50/month for MVP

### Value Proposition

**Cost Avoidance (Documented Examples):**
- Authentication system: £500k contract vs free MIT-licensed code
- Postcode validation: £50k rebuild vs existing library
- Gov.uk design components: £200k duplication vs reuse

**Conservative Estimate:**
- **1 prevented duplication per month:** £250k average savings
- **Annual impact:** £3M+ in direct cost avoidance
- **Plus:** Thousands of developer hours saved (indirect value)

**ROI:**
- MVP investment: <£50/month + 2 weeks development time
- Payback: **First prevented duplication pays for years of operation**
- Scale impact: Contribution to £45B transformation savings

### Scaling Costs

**Phase 2 (Web Interface):**
- Additional £50-100/month for increased query volume
- Static site hosting (Cloudflare Pages) - free tier sufficient

**Phase 3 (Full Feature Set):**
- £200-500/month at scale (10K daily users)
- Still 100x cheaper than commercial alternatives
- Cost per prevented duplication: negligible

**Funding Model:**
- MVP: GDS digital transformation budget
- Scale: Demonstrated ROI justifies central funding
- Long-term: Cross-government shared service model

---

## Technical Preferences

### Technology Stack (Validated via Research)

**Vector Database: Cloudflare Vectorize**
- Edge-native, lowest TCO (10x cheaper than Pinecone)
- Seamless Workers integration
- Auto-scaling, zero ops overhead
- **Decision rationale:** Cost, performance, simplicity

**Compute: Cloudflare Workers**
- Edge deployment, global low latency (<100ms)
- Serverless, pay-per-use
- Native Vectorize integration
- **Decision rationale:** Performance, cost, developer experience

**Storage:**
- **R2:** gitingest summaries, large objects
- **KV:** Metadata cache, pushedAt timestamps
- **Vectorize:** Code embeddings for search

**Embedding Model: StarCoder2**
- Code-specific, trained on 600+ languages
- Free via Workers AI (no API costs)
- Fallback: text-embedding-3-small (OpenAI) if quality insufficient

**Data Pipeline:**
- **Container:** Python runtime for gitingest library
- **Scheduled processing:** Cron-triggered or event-driven
- **Smart caching:** Only re-run gitingest on repo changes

### Integration Patterns

**MCP Protocol v2:**
- JWT authentication with short-lived tokens (15 min)
- RESTful endpoints for semantic search
- WebSocket support for future proactive features (Phase 3)
- Standard integration for Claude, Copilot, other AI assistants

**API Design:**
- Simple, well-documented endpoints
- <5 minute integration for early adopters
- Example configs for popular AI tools

### Platform Constraints

**Cloudflare Workers Limits:**
- 30 second CPU time limit (sufficient for queries)
- gitingest runs in separate container (not Workers) to avoid limits

**Security:**
- All code public (no sensitive data)
- Read-only access to GitHub public repos
- NCSC secure coding standards compliance
- No PII or sensitive data in vectors/logs

---

## Organizational Context

### GDS Strategic Initiative

**Ownership:**
- **GDS** (CDDO now integrated) owns and delivers
- Aligns with Blueprint transformation agenda
- Part of digital modernization portfolio

**Stakeholder Engagement:**

**Internal Champions:**
- GDS leadership (digital transformation strategy)
- Development teams (daily users, early adopters)
- Technical architecture (validates approach)

**Cross-Government:**
- Department CIOs/CTOs (want their teams to reuse)
- Treasury (£45B savings agenda)
- Procurement teams (prevent duplicate contracts)

**External:**
- DSIT Secretary of State (transformation visibility)
- OpenUK/open source community (policy influence)

### Change Management

**Developer Adoption:**
- Start with GDS developers (controlled rollout)
- Document integration (clear MCP setup guides)
- Gather feedback, iterate on relevance
- Expand to friendly departments (NHS Digital, Home Office)
- Organic growth through demonstrated value

**Procurement Integration (Phase 3):**
- Partner with Commercial Function on tender process
- Pilot with specific frameworks (G-Cloud, etc.)
- Prove value through documented savings
- Scale to mandatory checks

**Cultural Shift:**
- From "sharing code" to "discovering and reusing code"
- Make reuse the default, not the exception
- Celebrate reuse wins (case studies, testimonials)
- Measure and communicate impact

---

## Risks and Assumptions

### Key Assumptions

**Technical:**
- gitingest Python library performs adequately for UK gov repos
- Semantic search quality sufficient for code discovery
- Cloudflare Vectorize suitable for production at scale
- MCP protocol gains adoption in AI coding assistants

**Organizational:**
- GDS supports as strategic initiative
- Developers will adopt MCP integration
- Departments open to sharing code discovery data
- No security/compliance blockers from NCSC

**Data:**
- repos.json feed continues to be maintained
- GitHub API access remains stable
- Repo metadata quality sufficient for discovery

### Potential Risks

**Risk 1: Search Relevance Insufficient**
- **Likelihood:** Medium
- **Impact:** High (low adoption if results not useful)
- **Mitigation:**
  - Iterate on chunking strategy (function vs file level)
  - A/B test embedding models (StarCoder2 vs OpenAI)
  - Implement hybrid search (semantic + BM25 keyword)
  - Gather user feedback early and continuously
  - POC validates within 2 weeks

**Risk 2: gitingest Performance/Cost**
- **Likelihood:** Medium
- **Impact:** Medium (scaling constraints)
- **Mitigation:**
  - Aggressive caching (only re-run on pushedAt changes)
  - Prioritize high-value repos (most starred/forked)
  - Async processing decoupled from user queries
  - Monitor costs, adjust strategy if needed

**Risk 3: Low Developer Adoption**
- **Likelihood:** Low-Medium
- **Impact:** High (no usage = no value)
- **Mitigation:**
  - Start with GDS developers (friendly audience)
  - Clear, simple MCP integration docs
  - Active user research and feedback loops
  - Address relevance issues quickly
  - Promote success stories

**Risk 4: NCSC Security Concerns**
- **Likelihood:** Low
- **Impact:** High (could block deployment)
- **Mitigation:**
  - All data is public GitHub repos (no sensitive data)
  - Follow NCSC secure coding guidance
  - Security review before public launch
  - Audit logging for compliance
  - No PII or sensitive data in vectors

**Risk 5: Cloudflare Vectorize Immaturity**
- **Likelihood:** Low-Medium
- **Impact:** Medium (might need to migrate)
- **Mitigation:**
  - MCP API abstracts vector DB (can swap)
  - Pinecone as backup plan
  - Monitor performance and limitations
  - POC validates quickly (1-2 weeks)

### Critical Dependencies

**External:**
- repos.json feed availability and quality
- GitHub public API access
- Cloudflare infrastructure reliability
- gitingest Python library maintenance

**Internal:**
- GDS development resources (1-2 developers)
- Strategic support and stakeholder engagement
- Budget for infrastructure costs (minimal)

**Success Factors:**
- Early adopter feedback loop
- Rapid iteration on search relevance
- Clear communication of value proposition
- Integration into GDS/Blueprint narrative

---

## Timeline

### MVP Phase (Weeks 1-2)

**Week 1:**
- Set up Cloudflare Workers project
- Implement repos.json ingestion pipeline
- Configure container for gitingest processing
- Generate gitingest summaries with smart caching
- Chunk code using AST-based strategy (Tree-sitter)

**Week 2:**
- Generate embeddings (StarCoder2 via Workers AI)
- Load vectors into Vectorize with metadata
- Implement MCP v2 API endpoints
- Add JWT authentication and rate limiting
- Build query pipeline (embed → search → rank)
- Test with Claude Desktop integration
- Write integration documentation
- Deploy to production with monitoring

**Deliverable:** Functional MCP API that early adopters can integrate

### Phase 2: Web Interface (Weeks 3-6)

**Week 3-4:**
- Set up 11ty with gov.uk design system
- Build web chat interface on MCP API
- Implement markdown content system
- Add recency signals and trust indicators

**Week 5-6:**
- User testing with civil servants
- Iterate on UX based on feedback
- Deploy to Cloudflare Pages
- Broader rollout announcement

**Deliverable:** Public web interface for non-technical users

### Phase 3: Advanced Features (Months 3-4)

**Month 3:**
- SBOM integration for security analysis
- Organizational trust scoring
- Sector affinity filtering
- Pattern analysis (cross-repo insights)

**Month 4:**
- Procurement tender scanning POC
- Proactive notifications
- Public savings dashboard
- Evaluation for strategic scaling

**Deliverable:** Full-featured platform with procurement intelligence

### Milestone Dependencies

**Before MVP Launch:**
- Security review by NCSC/GDS security team
- GDS leadership approval
- Early adopter cohort identified
- Monitoring and logging configured

**Before Phase 2:**
- MVP adoption metrics validated
- User feedback incorporated
- Gov.uk design system integration approved
- Accessibility compliance verified

**Before Phase 3:**
- Demonstrated ROI from MVP/Phase 2
- Treasury/procurement team engagement
- Commercial Function partnership established

---

## Supporting Materials

### Incorporated from Previous Work

**Brainstorming Session (2025-11-11):**
- 40+ UX ideas across Role Playing, Question Storming, What If Scenarios, Mind Mapping
- Key insight: **Procurement intelligence is the killer app** - preventing £millions in duplicate spending
- User personas: Civil servants, developers, procurement teams
- Strategic positioning: Treasury/GDS strategic asset, not just developer tool
- Technical priorities: MCP-first, then web interface, then trust/safety features

**Technical Research (2025-11-11):**
- **Cloudflare Vectorize** validated as optimal choice (94/100 weighted score)
- 10x cheaper than alternatives, edge-native, zero ops overhead
- **MCP v2 protocol** specifications and implementation patterns
- **RAG architecture** patterns: AST-based chunking + hybrid semantic/syntactic ranking
- **StarCoder2** embedding model recommendation
- **UK government policy landscape:** Strong "make things open" mandate, but discovery gap
- **Competitive analysis:** No existing solution solves discovery + reuse at scale
- **Strategic gap:** UK has no centralized government code search (unlike US code.gov)

### Key Sources

**Strategic Documents:**
- Blueprint for Modern Digital Government (GDS, 2025)
- State of Digital Government Review (2025) - £45B savings opportunity
- Technology Code of Practice (open source mandates)
- OpenUK State of Digital Government (2025)

**Technical Resources:**
- Cloudflare Vectorize documentation and pricing
- MCP protocol specifications (2025)
- gitingest Python library
- xgov-opensource-repo-scraper data feed (8 years operational)

**Policy & Compliance:**
- NCSC secure coding guidance
- DWP Open-Source Code Publishing Policy
- WCAG 2.1 AA accessibility standards
- Open Government License

---

_This Product Brief captures the strategic vision for govscraperepo as foundational infrastructure for the UK government's digital transformation agenda._

_It reflects 8 years of observing the "publishing without reuse" problem and the 2025 technology unlock (AI assistants, semantic search, MCP protocol) that makes the solution viable._

_Next: The PRD workflow will transform this strategic brief into detailed product requirements, user stories, and implementation specifications._

**govscraperepo is how we turn "make things open" from compliance into actual government transformation.**
