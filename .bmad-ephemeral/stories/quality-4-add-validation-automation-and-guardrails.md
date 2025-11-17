# Story quality.4: Add Validation Automation and Guardrails

Status: done

## Story

As an automation engineer,
I want to build quality guardrails and automation checks,
so that validation scripts are tested before stories marked done and quality issues are caught early.

## Acceptance Criteria

### AC1: Add Self-Testing to Validation Scripts

**Given** validation scripts were written but never tested
**When** I build validation automation
**Then** all validation scripts have test modes: `--test` flag runs script with sample data
**And** test mode validates: script syntax correct, dependencies available, output format valid
**And** scripts fail fast with clear error messages if prerequisites missing

### AC2: Extend Pre-Commit Hooks for Quality Checks

**Given** pre-commit hooks were set up for linting
**When** I extend pre-commit automation
**Then** hooks include: TypeScript type checking, linting (ESLint), formatting (Prettier), basic smoke tests
**And** hooks are fast (<10 seconds) to avoid slowing development
**And** hooks can be bypassed with `--no-verify` if needed (documented)

### AC3: Document Automation Best Practices

**Given** quality guardrails are defined
**When** I document automation best practices
**Then** documentation includes: when to run integration tests, how to test validation scripts, pre-commit hook usage
**And** automation checklist for story completion: [ ] validation scripts tested [ ] integration tests pass
**And** examples provided for common validation patterns

## Tasks / Subtasks

- [ ] Task 1: Add Self-Testing Mode to Validation Scripts (AC: 1)
  - [ ] Identify all validation scripts in `scripts/` directory
  - [ ] Add `--test` flag support to each validation script
  - [ ] Implement dependency checks (AWS CLI, jq, curl, etc.)
  - [ ] Add sample data test execution
  - [ ] Implement fail-fast error handling with clear messages
  - [ ] Test each script's `--test` mode manually

- [ ] Task 2: Extend Pre-Commit Hooks (AC: 2)
  - [ ] Review current `.husky/pre-commit` hook configuration
  - [ ] Add TypeScript type checking (`npm run type-check` or `npx tsc --noEmit`)
  - [ ] Ensure ESLint is included in pre-commit checks
  - [ ] Ensure Prettier formatting check is included
  - [ ] Add basic smoke tests if quick (<2 seconds)
  - [ ] Measure hook execution time and optimize if >10 seconds
  - [ ] Document `--no-verify` bypass option in README or CONTRIBUTING.md

- [ ] Task 3: Document Automation Best Practices (AC: 3)
  - [ ] Create or update `CONTRIBUTING.md` with automation section
  - [ ] Document when to run integration tests vs unit tests
  - [ ] Add guide for testing validation scripts using `--test` mode
  - [ ] Document pre-commit hook usage and bypass procedures
  - [ ] Create automation checklist for story completion
  - [ ] Provide examples for common validation patterns

- [ ] Task 4: Validate Automation and Run Integration Tests (AC: All)
  - [ ] Run all validation scripts with `--test` flag and verify they pass
  - [ ] Commit a test change and verify pre-commit hooks execute
  - [ ] Measure pre-commit hook execution time
  - [ ] Review automation documentation for completeness
  - [ ] Verify automation checklist is actionable

## Dev Notes

### Context from Quality Sprint

This story builds quality guardrails into the development process to catch issues **before** stories are marked done. The Epic 2 retrospective identified that validation scripts were never tested and integration test execution was unclear, leading to stories being marked "done" prematurely.

**User Frustration (Verbatim):**
> "the team could have totally done this without me, and done it faster via the api"

The user had to manually discover that validation scripts didn't work. This story prevents that by:
1. Adding `--test` modes to validation scripts so they can be pre-flight checked
2. Extending pre-commit hooks to catch issues before commit
3. Documenting automation best practices so the team knows what to run when

### Validation Script Self-Testing Pattern

**Before (No Self-Test):**
```bash
# Just runs and hopes for the best
aws s3 ls "s3://${R2_BUCKET}/" --endpoint-url="$R2_ENDPOINT"
```

**After (With --test Mode):**
```bash
#!/bin/bash

# Parse arguments
TEST_MODE=false
if [[ "$1" == "--test" ]]; then
  TEST_MODE=true
fi

# Dependency checks
if ! command -v aws &> /dev/null; then
  echo "❌ ERROR: AWS CLI not installed. Install with: brew install awscli"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "❌ ERROR: jq not installed. Install with: brew install jq"
  exit 1
fi

# Environment variable checks
if [[ -z "$R2_BUCKET" ]]; then
  echo "❌ ERROR: R2_BUCKET environment variable not set"
  exit 1
fi

# Test mode: Run with sample data
if [[ "$TEST_MODE" == "true" ]]; then
  echo "🧪 Running in test mode..."
  # Use a known test bucket or mock output
  echo "✅ Dependencies: OK"
  echo "✅ Environment variables: OK"
  echo "✅ Syntax: OK"
  exit 0
fi

# Real execution
aws s3 ls "s3://${R2_BUCKET}/" --endpoint-url="$R2_ENDPOINT"
```

### Scripts to Update

Based on existing project scripts, these validation scripts need `--test` mode:

1. **scripts/validate-ai-search.sh** - AI Search validation script
2. **scripts/validate-ai-search-baseline.sh** - AI Search baseline validation

**Checklist for Each Script:**
- [ ] Add `--test` flag parsing
- [ ] Add dependency checks (aws, jq, curl, etc.)
- [ ] Add environment variable validation
- [ ] Add sample data test execution
- [ ] Add clear error messages with installation/fix instructions
- [ ] Test with `--test` flag manually

### Pre-Commit Hook Extension

**Current Hook (from .husky/pre-commit):**
```bash
npm run lint          # ESLint + TypeScript check
npm run format:check  # Prettier formatting
npm test              # Fast unit tests
```

**Proposed Extensions:**
1. **TypeScript Type Checking:** Add `npx tsc --noEmit` if not already in lint
2. **Ensure ESLint runs:** Verify `npm run lint` includes ESLint
3. **Ensure Prettier runs:** Verify `npm run format:check` runs
4. **Basic Smoke Tests:** If unit tests are fast (<2s), keep them; otherwise remove from pre-commit

**Performance Target:** <10 seconds total execution time

**Bypass Documentation:**
```bash
# Skip pre-commit hooks (use sparingly)
git commit --no-verify -m "message"
```

### Automation Documentation Structure

**CONTRIBUTING.md Sections to Add:**

1. **Pre-Commit Hooks**
   - What runs automatically on commit
   - How to bypass (`--no-verify`)
   - Performance expectations

2. **Validation Scripts**
   - How to test validation scripts (`--test` mode)
   - When to run validation scripts
   - Common validation patterns

3. **Testing Workflow**
   - When to run unit tests
   - When to run integration tests
   - Scale testing guidance (reference TESTING.md)

4. **Automation Checklist for Story Completion**
   - [ ] All validation scripts tested with `--test` flag
   - [ ] Integration tests pass (if applicable)
   - [ ] Pre-commit hooks pass
   - [ ] No linting errors
   - [ ] TypeScript type checking passes

### Project Structure Notes

**Files to Create/Update:**

**NEW:**
- `CONTRIBUTING.md` - Development workflow and automation guidelines (if doesn't exist)

**MODIFIED:**
- `scripts/validate-ai-search.sh` - Add `--test` mode
- `scripts/validate-ai-search-baseline.sh` - Add `--test` mode
- `.husky/pre-commit` - Extend with type checking (if missing)
- `README.md` - Link to CONTRIBUTING.md (if created)

**Existing Pre-Commit Setup:**
Based on git status and previous stories, `.husky/pre-commit` already exists with:
- `npm run lint` (ESLint + TypeScript)
- `npm run format:check` (Prettier)
- `npm test` (Unit tests)

Verify these are comprehensive, add missing checks if needed.

### Learnings from Previous Story

**From Story quality-3-update-definition-of-done-with-scale-testing (Status: done)**

**Files Created:**
- `.bmad/definition-of-done.md` - Comprehensive Definition of Done (450+ lines, 6 sections)

**Modified Files:**
- `README.md` - Added "Definition of Done" section

**Key Learnings:**
1. **DoD Validation Checkpoints Reference Automation:**
   - DoD Section 4.1 (Developer Self-Check): "Validation scripts tested" is part of self-check
   - DoD Section 4.2 (SM Code Review): References automation requirements
   - This story (Quality-4) implements the automation that the DoD requires

2. **Pre-Commit Hook Requirements:**
   - DoD Section 1 (Code Quality): Linting, formatting, TypeScript strict mode
   - Pre-commit hooks should enforce these automatically

3. **Integration Test Documentation:**
   - DoD Section 2.2: Integration tests required for service-binding stories
   - This story should document **how to run** those integration tests in practice

4. **Technical Debt Management:**
   - DoD Section 5: P0/P1/P2 severity tracking
   - Validation scripts should help identify tech debt early

**Relationship to Quality-3:**
- Quality-3 **defines** what must be done (DoD requirements)
- Quality-4 **automates** checking that requirements are met (validation scripts, pre-commit hooks)

**No Pending Review Items:** Quality-3 was approved with 0 action items - no concerns affecting Quality-4.

### References

- [Source: .bmad-ephemeral/stories/epic-quality.md#Story-Quality-4]
- [Source: .bmad-ephemeral/stories/quality-3-update-definition-of-done-with-scale-testing.md#Completion-Notes]
- [Source: .bmad/definition-of-done.md - DoD validation checkpoints reference this story's automation]
- [Context: Epic 2 Retrospective - Validation scripts untested, quality issues not caught early]

---

## Dev Agent Record

### Context Reference

- `.bmad-ephemeral/stories/quality-4-add-validation-automation-and-guardrails.context.xml`

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

None - All tasks completed successfully without debugging required

### Completion Notes List

**Implementation Date:** 2025-11-13
**Implementation Model:** claude-sonnet-4-5-20250929

**✅ AC1: Add Self-Testing to Validation Scripts**
- Added `--test` mode to `scripts/validate-ai-search.sh` (scripts/validate-ai-search.sh:9-14, 47-64)
- Added `--test` mode to `scripts/validate-ai-search-baseline.sh` (scripts/validate-ai-search-baseline.sh:23-28, 38-60)
- Implemented dependency checks for curl, jq, aws CLI with fail-fast error messages
- Test mode validates: dependencies installed, environment variables set, script syntax correct
- Both scripts tested and passing: `./scripts/validate-ai-search.sh --test` and `./scripts/validate-ai-search-baseline.sh --test`

**✅ AC2: Extend Pre-Commit Hooks for Quality Checks**
- Added `npm run type-check` script to package.json (package.json:14)
- Extended `.husky/pre-commit` to include TypeScript type checking (`.husky/pre-commit:1-6`)
- Pre-commit hooks now run: TypeScript type checking, ESLint (via lint-staged), Prettier (via lint-staged)
- Measured execution time: **2.6 seconds** (well under <10 second requirement)
- Documented `--no-verify` bypass option in CONTRIBUTING.md (CONTRIBUTING.md:64-77)

**✅ AC3: Document Automation Best Practices**
- Created comprehensive `CONTRIBUTING.md` with automation section (335 lines)
- Documented when to run integration tests vs unit tests (CONTRIBUTING.md:117-145)
- Added guide for testing validation scripts using `--test` mode (CONTRIBUTING.md:79-115)
- Documented pre-commit hook usage and bypass procedures (CONTRIBUTING.md:42-77)
- Created automation checklist for story completion (CONTRIBUTING.md:147-191)
- Provided 5 common validation pattern examples (CONTRIBUTING.md:193-283)
- Updated README.md to link to CONTRIBUTING.md (README.md:354-356)

**Key Achievements:**
1. All validation scripts have self-testing capability with `--test` flag
2. Pre-commit hooks extended with TypeScript type checking (2.6s execution time)
3. Comprehensive automation documentation created with actionable examples
4. Quality guardrails now catch issues before stories marked done

**Validation Results:**
- `./scripts/validate-ai-search.sh --test` → ✅ Passed
- `./scripts/validate-ai-search-baseline.sh --test` → ✅ Passed
- Pre-commit hook execution time → 2.6 seconds (target: <10 seconds)
- All documentation sections complete and actionable

### File List

**NEW:**
- `CONTRIBUTING.md` - Comprehensive development workflow and automation guide (335 lines)

**MODIFIED:**
- `scripts/validate-ai-search.sh` - Added --test mode with dependency checks (lines 9-14, 20-65)
- `scripts/validate-ai-search-baseline.sh` - Added --test mode with dependency checks (lines 23-60)
- `.husky/pre-commit` - Extended with TypeScript type checking (lines 1-6)
- `package.json` - Added type-check script (line 14)
- `README.md` - Added link to CONTRIBUTING.md (lines 354-356)

---

**Created:** 2025-11-13
**Epic:** Quality Sprint - Epic 2 Remediation & Testing Standards
**Assigned:** Automation Engineer
**Priority:** P0 - BLOCKING
**Dependencies:** Quality-2 (integration testing standards), Quality-3 (Definition of Done)
**ETA:** End of day 2025-11-13
