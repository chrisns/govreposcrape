# govscraperepo Documentation

**Project:** govscraperepo - AI-powered UK Government Code Discovery
**Status:** Planning & Early Implementation
**Last Updated:** 2025-11-12

---

## Document Index

### Strategic Planning

| Document | Purpose | Date | Status |
|----------|---------|------|--------|
| [Product Brief](product-brief-govscraperepo-2025-11-11.md) | Strategic vision, user needs, MVP scope | 2025-11-11 | ✅ Complete |
| [Brainstorming Session](bmm-brainstorming-session-2025-11-11.md) | UX ideation, procurement intelligence insights | 2025-11-11 | ✅ Complete |
| [Technical Research](bmm-research-technical-2025-11-11.md) | Vector DB evaluation, MCP protocol, competitive analysis | 2025-11-11 | ✅ Complete |

### Technical Documentation

| Document | Purpose | Date | Status |
|----------|---------|------|--------|
| [Technical Decisions](technical-decisions.md) | Architecture decisions and rationale | 2025-11-12 | 🔄 Living Doc |

### Implementation Tracking

| Document | Purpose | Status |
|----------|---------|--------|
| [Workflow Status](bmm-workflow-status.yaml) | BMM methodology progress tracking | 🔄 Active |

---

## Current Project State

### Completed Phases

**Phase 0: Discovery** ✅
- Brainstorming session completed (40+ UX ideas)
- Technical research completed (Cloudflare stack validated)
- Product brief completed (strategic vision documented)

**Key Insights:**
- **Killer app:** Procurement intelligence preventing £millions in duplicate spending
- **Technical stack:** Cloudflare Vectorize + Workers + R2
- **Architecture:** Write/read path separation for performance + cost

### Current Phase

**Phase 1: Planning** 🔄
- **Next:** PRD (Product Requirements Document)
- **Agent:** PM (Product Manager)
- **Command:** `/bmad:bmm:agents:pm` → `/bmad:bmm:workflows:prd`

### Implementation Progress

**Container Implementation (Write Path)** 🔄
- **Decisions Made:**
  - TD-001: Container-based gitingest processing
  - TD-002: R2 metadata caching (pushedAt timestamps)
  - TD-003: Write/read path separation
  - TD-004: R2 primary storage
  - TD-005: Environment-based configuration

- **Files Planned:**
  ```
  govscraperepo-mcp/
  ├── Dockerfile          # Python 3.11 + gitingest + boto3
  ├── ingest.py           # Main ingestion pipeline
  ├── config.py           # Environment configuration
  ├── .env.example        # Configuration template
  └── README-ingestion.md # Setup and usage docs
  ```

- **Status:** Technical decisions documented, ready for implementation

**Read Path (Workers MCP API)** ⏸️
- **Status:** Pending write path validation
- **Dependencies:** gitingest quality proven, embeddings strategy chosen

---

## Quick Start for New Contributors

### Understanding the Project

1. **Start here:** [Product Brief](product-brief-govscraperepo-2025-11-11.md) - Understand the "why"
2. **Then:** [Technical Decisions](technical-decisions.md) - Understand the "how"
3. **Context:** [Brainstorming](bmm-brainstorming-session-2025-11-11.md) + [Research](bmm-research-technical-2025-11-11.md) - Deep dive

### Current Work

Check [Workflow Status](bmm-workflow-status.yaml) to see:
- What's completed
- What's next
- Which agent/workflow to run

### Getting Involved

**For Developers:**
- Review technical decisions before implementing
- Follow BMM methodology for structured delivery
- Use appropriate agent for each phase (analyst, pm, architect, dev, etc.)

**For Stakeholders:**
- Product brief contains strategic positioning
- Success metrics defined for MVP and scale
- Risks and assumptions documented

---

## Architecture Overview

### High-Level System Design

```
┌─────────────────────────────────────────────────────────┐
│               WRITE PATH (Async Ingestion)              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  repos.json → Container → gitingest → R2 + Vectorize    │
│  (6hr cron)   (Python)    (2-30s/repo)  (smart cache)   │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                READ PATH (Edge Queries)                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  MCP API → Workers → Vectorize → Results (<2s p95)      │
│  (User)    (Edge)    (Semantic)   (Top 5 + context)     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Technical Decisions

1. **Container for gitingest** - Avoids Workers CPU limits, enables batch processing
2. **R2 metadata caching** - No separate cache DB, pushedAt-based invalidation
3. **Path separation** - Write slow/async, read fast/edge
4. **Cloudflare stack** - Vectorize + Workers + R2 for cost + performance
5. **MCP-first** - Ambient integration vs destination website

---

## Success Metrics

### MVP (Weeks 1-2)
- **Adoption:** Hundreds of uses/week from gov developers
- **Quality:** 80%+ query relevance
- **Performance:** <2s response time (p95)
- **Cost:** <£50/month infrastructure

### Scale (Months 6-12)
- **Impact:** Thousands of hours saved, £millions prevented duplication
- **Visibility:** Celebrated by DSIT Secretary, Blueprint metrics
- **Adoption:** Majority of UK gov departments using
- **Features:** Web interface, procurement scanning, SBOM integration

---

## Technology Stack

### Current Stack

**Data Pipeline (Write Path):**
- Docker container (Python 3.11)
- gitingest library (code summarization)
- boto3 (S3-compatible R2 access)
- Cron scheduling (6-hour updates)

**Storage:**
- Cloudflare R2 (gitingest summaries + metadata)
- Cloudflare Vectorize (code embeddings)
- Cloudflare KV (future: metadata cache)

**API Layer (Read Path - planned):**
- Cloudflare Workers (edge compute)
- MCP v2 protocol (AI assistant integration)
- Workers AI (embedding generation)

**Open Decisions:**
- Embedding model: StarCoder2 vs text-embedding-3-small
- Chunking strategy: Function-level vs file-level vs semantic
- Container hosting: Docker VM vs GitHub Actions vs Lambda

---

## Contributing

### BMM Methodology Workflow

This project follows the **BMad Method** for structured product delivery:

**Phase 0: Discovery** ✅
1. Brainstorm project ideas
2. Research technical/market landscape
3. Create product brief

**Phase 1: Planning** 🔄
1. Create PRD with epics and stories
2. (Optional) Validate PRD
3. (Conditional) Create UX design if needed

**Phase 2: Solutioning** ⏸️
1. Create architecture document
2. (Optional) Validate architecture
3. Solutioning gate check (PRD + UX + Architecture cohesion)

**Phase 3: Implementation** ⏸️
1. Sprint planning
2. Story development (create → dev → review → done)
3. Retrospectives

**Check current status:** `/bmad:bmm:workflows:workflow-status`

### Development Workflow

1. Load appropriate agent for phase (analyst, pm, architect, sm, dev)
2. Run workflow command for current task
3. Update workflow status when complete
4. Document decisions in technical-decisions.md
5. Commit with descriptive messages

---

## Links and Resources

### External Resources

- [xgov-opensource-repo-scraper](https://github.com/uk-x-gov-software-community/xgov-opensource-repo-scraper) - Data source (repos.json feed)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/) - Vector database
- [MCP Protocol](https://modelcontextprotocol.io/) - AI assistant integration
- [gitingest](https://github.com/cyclotruc/gitingest) - Code summarization library

### Government Context

- [Blueprint for Modern Digital Government](https://www.gov.uk) - Strategic vision
- [Technology Code of Practice](https://www.gov.uk/guidance/the-technology-code-of-practice) - Open source mandate
- [GDS Service Standard](https://www.gov.uk/service-manual/service-standard) - Make code open (point 12)

---

## Questions or Feedback?

- **Technical questions:** Review [technical-decisions.md](technical-decisions.md)
- **Strategy questions:** Review [product-brief](product-brief-govscraperepo-2025-11-11.md)
- **Implementation questions:** Check [workflow status](bmm-workflow-status.yaml) for current phase

---

**Last Updated:** 2025-11-12 by cns
**Project Status:** Planning phase, moving toward PRD and architecture
**Next Milestone:** Complete PRD, then architecture, then sprint planning
