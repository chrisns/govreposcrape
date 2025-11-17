# Definition of Done (DoD)

**Project:** govreposcrape
**Last Updated:** 2025-11-13
**Version:** 1.0

## Purpose

This Definition of Done establishes the quality criteria that all user stories must meet before being marked as "done." These criteria ensure consistent quality, prevent regressions, and maintain high standards across all development work.

## When to Use This DoD

- **Every story** must meet these criteria before moving from "in-progress" to "done"
- **SM code review** validates compliance with DoD before approval
- **Developer self-check** confirms all criteria met before marking story "review"

---

## 1. Code Quality

### 1.1 Code Review
- [ ] Code reviewed by at least one team member
- [ ] All review feedback addressed or explicitly deferred with rationale
- [ ] No unresolved blocking comments

### 1.2 Coding Standards
- [ ] Follows project coding standards and conventions (see [architecture.md](../docs/architecture.md))
- [ ] File naming: TypeScript files use kebab-case.ts, Python files use snake_case.py
- [ ] Function naming: camelCase for functions/methods, PascalCase for classes
- [ ] Module exports: Named exports preferred (not default exports except for Workers entry point)
- [ ] No linting errors or warnings (`npm run lint` passes)
- [ ] TypeScript strict mode compliance (no `@ts-ignore` without documented justification)

### 1.3 Code Organization
- [ ] Code placed in appropriate directory per project structure
- [ ] No duplicated code (DRY principle applied)
- [ ] Functions and classes have single, clear responsibilities
- [ ] Magic numbers/strings extracted to named constants

---

## 2. Testing Requirements

### 2.1 Unit Tests (Required for ALL stories with logic)

**Definition:** Unit tests verify individual functions/modules in isolation using mocked dependencies.

**Requirements:**
- [ ] 80%+ code coverage for core logic (verify with `npm run test -- --coverage` or `pytest --cov`)
- [ ] Fast execution (<1s per test)
- [ ] All dependencies mocked (no real service calls)
- [ ] Tests co-located with source code (*.test.ts or *test.py pattern)
- [ ] Edge cases and error conditions covered

**When Required:**
- ALL stories that introduce or modify business logic
- ALL stories that add new functions, classes, or modules

### 2.2 Integration Tests (Required for service-binding stories)

**Definition:** Integration tests verify multiple components working together using real service bindings and realistic data volumes.

**Requirements - Based on [Story Quality-2 Integration Testing Standards](../../.bmad-ephemeral/stories/quality-2-establish-integration-testing-standards.md):**

- [ ] **Real service bindings** used (KV, R2, AI Search) - NOT mocks
- [ ] **Realistic data volumes:** 100-1000 items minimum (not 5 items)
- [ ] **End-to-end workflow validation** from entry point to final output
- [ ] **Acceptable execution time:** 5-10 minutes for 100-item tests (slower is acceptable for quality)
- [ ] **Test data management:** Deterministic test data with documented expected outcomes
- [ ] **Test infrastructure:** Separate test namespaces (govscraperepo-test-kv, govscraperepo-test-r2)
- [ ] **Cleanup procedures:** Automated teardown after test runs

**When Required:**
- Stories touching Cloudflare Workers service bindings (KV, R2, AI Search, D1)
- Stories implementing data ingestion or storage pipelines
- Stories with external API integrations
- BLOCKING CRITERIA: Stories touching data pipelines MUST have integration tests - not optional

**When Optional:**
- Pure UI stories with no backend integration
- Documentation-only stories
- Configuration-only changes

**Test Markers (pytest):**
Use markers to categorize tests: `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.network`, `@pytest.mark.r2`, `@pytest.mark.slow`

### 2.3 Scale Testing (Required for data pipeline stories)

**Definition:** Scale testing validates that the system works correctly at realistic production-like data volumes.

**Requirements:**
- [ ] **Test at 10x MVP scale minimum:** 100-1000 items (not 5 items)
- [ ] **Performance within acceptable ranges:** Document acceptable execution times
- [ ] **Cache hit rate validation:** For caching stories, verify 90%+ hit rate target
- [ ] **Error rate validation:** System handles failures gracefully without cascading

**Scale Testing Examples:**
- **Ingestion Pipeline:** Process 100-200 repos (not 5)
- **Caching:** Validate 90%+ hit rate with 100+ cache checks
- **Search:** Query with 1000+ indexed documents
- **Batch Processing:** Process batches of 50-100 items

**When Required:**
- Stories implementing or modifying data ingestion pipelines
- Stories implementing batch processing features
- Stories handling large datasets (>10 items in production)
- BLOCKING CRITERIA: Data pipeline stories MUST have scale tests before marking "done"

**Acceptable Performance:**
- Integration tests: 5-10 minutes for 100-item test
- Scale tests: 10-30 minutes for 500-1000 item test
- **Trade-off:** Slower tests, higher confidence - this is acceptable

### 2.4 Manual Validation (When automated tests insufficient)

**When Required:**
- UI/UX changes requiring visual inspection
- Complex user workflows not covered by automated tests
- Security or compliance validations

**Requirements:**
- [ ] Manual test steps documented in story completion notes
- [ ] Screenshots or recordings provided for UI changes (if applicable)
- [ ] Edge cases manually verified and documented

### 2.5 Test Documentation

- [ ] All tests have clear, descriptive names explaining what they validate
- [ ] Test setup instructions provided (environment variables, prerequisites)
- [ ] Expected outcomes documented
- [ ] Test data sources documented (fixtures, snapshots)

---

## 3. Documentation

### 3.1 Code Documentation
- [ ] Complex logic has explanatory comments
- [ ] Public APIs/functions have JSDoc or docstring comments
- [ ] Non-obvious design decisions documented in code or Dev Notes

### 3.2 API Documentation
- [ ] New API endpoints documented in OpenAPI spec (if applicable)
- [ ] Request/response examples provided
- [ ] Error codes and meanings documented

### 3.3 Project Documentation
- [ ] README.md updated with new features/changes (if user-facing)
- [ ] DEPLOYMENT.md updated if deployment process changes
- [ ] Architecture.md updated if architectural changes made

### 3.4 Story Documentation
- [ ] Dev Agent Record → Completion Notes summarizes what was implemented
- [ ] Dev Agent Record → Debug Log references provided for non-trivial issues
- [ ] File List includes all new, modified, or deleted files with paths relative to repo root

---

## 4. Validation Checkpoints

### 4.1 Developer Self-Check (Before marking "review")

**Complete this checklist before changing story status from "in-progress" to "review":**

- [ ] All tasks and subtasks marked [x]
- [ ] All acceptance criteria satisfied
- [ ] Tests written and passing (unit, integration, scale as required)
- [ ] Linting and formatting pass (`npm run lint`, `npm run format:check`)
- [ ] No console.log or debug code left in production code
- [ ] Integration tests run with realistic data volumes (100-1000 items, not 5)
- [ ] Manual validation performed if automated tests insufficient
- [ ] File List updated with all changes
- [ ] Completion Notes summarize implementation

**CRITICAL QUESTION:** "Have integration tests been run with realistic data volumes (100+ items)?"
- If NO and story touches service bindings → BLOCKED, cannot mark "review"
- If YES → Document test results in Dev Agent Record

### 4.2 SM Code Review Checklist

**SM validates story against DoD before approving:**

- [ ] Code quality standards met (Section 1)
- [ ] Testing requirements satisfied (Section 2) - verify test coverage, data volumes
- [ ] Documentation complete (Section 3)
- [ ] Developer self-check completed (Section 4.1)
- [ ] Technical debt documented if any deferred (Section 5)
- [ ] Deployment readiness validated (Section 6)

**Integration Test Validation:**
- [ ] If story touches service bindings: Integration tests present with 100+ item data volumes
- [ ] If data pipeline story: Scale tests present with realistic volumes
- [ ] Test execution logs reviewed for failures or warnings

**Blocking Criteria:**
- Data pipeline stories WITHOUT integration tests → BLOCKED
- Integration tests with <100 items → REQUEST CHANGES (increase data volume)
- Zero test coverage for new logic → BLOCKED

---

## 5. Technical Debt Management

### 5.1 Documentation Requirements

**All deferred technical debt MUST be documented in story completion notes:**

- [ ] Technical debt explicitly listed in Dev Agent Record → Completion Notes
- [ ] Severity assessment provided (P0/P1/P2)
- [ ] Rationale for deferral documented

**Format:**
```markdown
### Technical Debt Deferred

- **[P1] Email verification not implemented**
  - Rationale: Time constraints, deferred to Story 1.3
  - Impact: Users can register without verified emails
  - Follow-up: Must be addressed in Story 1.3 (next sprint)
```

### 5.2 Severity Assessment

**P0 - Critical:**
- Security vulnerabilities
- Data loss risks
- Production-blocking issues
- **Action:** MUST be addressed in immediate follow-up story

**P1 - High:**
- Performance degradation
- Missing critical features
- Poor user experience
- **Action:** Should be addressed within same epic

**P2 - Medium:**
- Code quality issues
- Minor feature gaps
- Non-critical optimizations
- **Action:** Can be addressed in future epic or backlog

### 5.3 Defer Criteria (When acceptable to defer)

**Acceptable Reasons:**
- Time constraints with clear timeline for resolution
- Scope limitation documented in PRD/epic
- Dependency on external system not yet available
- Lower priority than MVP requirements

**NOT Acceptable:**
- "Didn't have time to test properly" → Should extend story timeline
- "Will fix later" without specific plan → Must fix now or document as P0/P1
- Critical bugs or security issues → MUST fix before marking done

### 5.4 Escalation Process

**P0/P1 Technical Debt:**
1. Document in story completion notes with severity
2. Create follow-up story immediately (or add to current sprint backlog)
3. Update sprint-status.yaml with new story
4. Notify SM and team of critical tech debt

**P2 Technical Debt:**
1. Document in story completion notes
2. Add to project backlog for future prioritization
3. No immediate follow-up required

---

## 6. Deployment

### 6.1 Staging Deployment
- [ ] Code deployed to staging environment successfully
- [ ] Smoke tests passed in staging
- [ ] No deployment errors or warnings

### 6.2 Production Readiness
- [ ] Breaking changes documented and migration plan provided
- [ ] Environment variables documented in .env.example
- [ ] Database migrations tested (if applicable)
- [ ] Rollback procedure documented for risky changes

### 6.3 Deployment Validation
- [ ] Health check endpoint returns 200 OK
- [ ] Critical user flows tested in staging
- [ ] Monitoring/alerts configured for new features

---

## Summary Checklist

Use this quick checklist for final validation before marking story "done":

- [ ] **Code Quality:** Linting passes, follows conventions, reviewed
- [ ] **Unit Tests:** 80%+ coverage, all tests pass
- [ ] **Integration Tests** (if applicable): Real services, 100+ items, end-to-end workflows
- [ ] **Scale Tests** (if applicable): 10x scale, performance acceptable
- [ ] **Documentation:** Code, API, README updated
- [ ] **Self-Check:** All criteria met, integration tests with realistic data
- [ ] **Tech Debt:** All deferred work documented with severity (P0/P1/P2)
- [ ] **Deployment:** Staged successfully, smoke tests pass

---

## References

- [Story Quality-2: Integration Testing Standards](../../.bmad-ephemeral/stories/quality-2-establish-integration-testing-standards.md)
- [Architecture Documentation](../docs/architecture.md)
- [Testing Quick Reference](../../container/TESTING_QUICK_REFERENCE.md)
- [Sprint Status Tracking](../../.bmad-ephemeral/sprint-status.yaml)

---

**Version History:**
- v1.0 (2025-11-13): Initial Definition of Done incorporating Epic 2 retrospective findings and Story Quality-2 integration testing standards
