# Contributing to govreposcrape

Thank you for contributing to govreposcrape! This guide covers development workflows, automation tools, and quality standards.

## Table of Contents

- [Development Workflow](#development-workflow)
- [Pre-Commit Hooks](#pre-commit-hooks)
- [Validation Scripts](#validation-scripts)
- [Testing Guidelines](#testing-guidelines)
- [Automation Checklist](#automation-checklist)
- [Common Validation Patterns](#common-validation-patterns)

## Development Workflow

### Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment: Copy `.env.example` to `.env` and add credentials
4. Generate TypeScript types: `npm run cf-typegen`
5. Start development server: `npm run dev`

### Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Run local validation:
   ```bash
   npm run type-check  # TypeScript type checking
   npm run lint        # ESLint
   npm test            # Unit tests
   ```
4. Commit your changes (pre-commit hooks will run automatically)
5. Push to your branch and create a pull request

### Definition of Done

All changes must meet the [Definition of Done](.bmad/definition-of-done.md) before being merged:

- Code quality: Linting, formatting, type checking
- Testing: Unit tests (80%+ coverage), integration tests (for service bindings), scale tests (for data pipelines)
- Documentation: Code comments, API docs, README updates
- Validation: Developer self-check, code review approval

## Pre-Commit Hooks

Pre-commit hooks run automatically when you commit changes to catch issues early.

### What Runs on Commit

The pre-commit hook (`.husky/pre-commit`) runs:

1. **TypeScript Type Checking** (`npm run type-check`)
   - Validates TypeScript types without emitting files
   - Fast: ~0.5 seconds
   - Catches type errors before commit

2. **ESLint** (via lint-staged)
   - Lints and auto-fixes staged `.ts` files
   - Enforces code quality standards

3. **Prettier** (via lint-staged)
   - Formats staged `.ts` files
   - Ensures consistent code style

### Performance

Pre-commit hooks are optimized to complete in **<10 seconds** to avoid slowing development.

Current execution time: **~2-3 seconds** (measured on M1 Mac)

### Bypassing Hooks

If you need to bypass pre-commit hooks (use sparingly):

```bash
git commit --no-verify -m "your commit message"
```

**When to bypass:**
- Emergency hotfixes
- WIP commits on feature branches
- Reverting broken commits

**Never bypass for:**
- Commits to main/master
- Pull request commits
- Production deployments

### Troubleshooting

**Issue: Pre-commit hook fails with type errors**
- Fix: Run `npm run type-check` to see full error details
- Fix: Resolve type errors before committing

**Issue: Pre-commit hook takes >10 seconds**
- Report: File an issue with execution time details
- Workaround: Use `--no-verify` temporarily

**Issue: ESLint or Prettier errors**
- Fix: Run `npm run lint:fix` to auto-fix ESLint issues
- Fix: Run `npm run format` to format all files

## Validation Scripts

Validation scripts test service bindings and integrations. All validation scripts support `--test` mode for pre-flight checks.

### Available Scripts

1. **`scripts/validate-ai-search.sh`** - Validates AI Search health endpoint
2. **`scripts/validate-ai-search-baseline.sh`** - Validates R2 bucket and AI Search indexing baseline

### Testing Validation Scripts

Before running validation scripts for real, test them with `--test` mode:

```bash
# Test validation scripts (no API calls)
./scripts/validate-ai-search.sh --test
./scripts/validate-ai-search-baseline.sh --test
```

**Test mode validates:**
- Dependencies are installed (curl, aws CLI, jq, etc.)
- Environment variables are set
- Script syntax is correct

**Exit codes:**
- `0` = Success (script is ready to run)
- `1` = Failure (missing dependencies or configuration)

### Running Validation Scripts

After testing, run scripts normally:

```bash
# Validate AI Search health endpoint
./scripts/validate-ai-search.sh

# Validate AI Search indexing baseline (requires .env with R2 credentials)
./scripts/validate-ai-search-baseline.sh
```

### When to Run Validation Scripts

- **After deployment**: Verify service bindings are connected
- **After configuration changes**: Verify wrangler.jsonc changes work
- **During debugging**: Diagnose service connectivity issues
- **Before marking story done**: Validate integration tests pass

## Testing Guidelines

govreposcrape uses multiple test types. See [TESTING.md](TESTING.md) for complete testing documentation.

### When to Run Each Test Type

| Test Type | When to Run | Command | Duration |
|-----------|-------------|---------|----------|
| **Unit Tests** | Every commit | `npm test` | <5 seconds |
| **Integration Tests** | Before PR, after service changes | `npm test -- --grep "Integration"` | 5-10 minutes |
| **Scale Tests** | Before marking data pipeline stories done | See [TESTING.md](TESTING.md) | 30-60 minutes |

### Unit Tests vs Integration Tests

**Unit Tests:**
- Fast (<1 second per test)
- Mocked dependencies
- Small test data (5 items)
- Required: 80%+ code coverage
- When: Every commit via pre-commit hooks

**Integration Tests:**
- Slower (minutes)
- Real service bindings (KV, R2, D1, AI Search)
- Realistic data volumes (100-1000 items)
- Required: Stories with service integration
- When: Before pull requests, after service binding changes

**Scale Tests:**
- Very slow (30-60 minutes)
- Production-scale data (1000-5000 items)
- Required: Data pipeline stories only
- When: Before marking data pipeline stories done

See [Integration Testing Standards](docs/integration-testing-standards.md) for detailed requirements.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm test -- --watch

# Run with coverage report
npm test -- --coverage

# Run only unit tests (exclude integration)
npm test -- --exclude "test/integration/**"

# Run only integration tests
npm test -- --grep "Integration"
```

## Automation Checklist

Use this checklist before marking a story as "done" or "review":

### Developer Self-Check

- [ ] **Code Quality**
  - [ ] TypeScript strict mode: No type errors (`npm run type-check`)
  - [ ] Linting: No ESLint errors (`npm run lint`)
  - [ ] Formatting: Code formatted with Prettier (`npm run format:check`)
  - [ ] Code review: Self-reviewed for common issues

- [ ] **Testing**
  - [ ] Unit tests: Written for new logic, 80%+ coverage maintained
  - [ ] Integration tests: Written for service binding changes (if applicable)
  - [ ] Scale tests: Validated for data pipeline stories (if applicable)
  - [ ] All tests pass: `npm test`

- [ ] **Validation Scripts**
  - [ ] Scripts tested: All validation scripts run with `--test` flag
  - [ ] Scripts pass: All validation scripts execute successfully
  - [ ] Dependencies documented: New dependencies added to prerequisites

- [ ] **Documentation**
  - [ ] Code comments: Public APIs and complex logic documented
  - [ ] README updates: User-facing changes documented
  - [ ] API docs: API changes documented (if applicable)

- [ ] **Pre-Commit Hooks**
  - [ ] Hooks pass: Commit succeeded without `--no-verify`
  - [ ] Performance: Hooks complete in <10 seconds

### Before Pull Request

- [ ] All tests pass (unit + integration)
- [ ] Validation scripts tested and pass
- [ ] Documentation complete
- [ ] Pre-commit hooks pass without bypass
- [ ] Branch up to date with main

## Common Validation Patterns

### Pattern 1: Dependency Validation

Check if required tools are installed before running a script:

```bash
#!/bin/bash

# Check for required dependency
if ! command -v <tool> &> /dev/null; then
    echo "❌ ERROR: <tool> is not installed"
    echo "   Install with: brew install <tool> (macOS)"
    echo "   See: https://example.com/docs"
    exit 1
fi

echo "✅ Dependency check passed"
```

### Pattern 2: Environment Variable Validation

Validate required environment variables are set:

```bash
#!/bin/bash

# Check required environment variables
if [[ -z "$REQUIRED_VAR" ]]; then
  echo "❌ ERROR: REQUIRED_VAR environment variable not set"
  echo "   Add to .env: REQUIRED_VAR=value"
  exit 1
fi

echo "✅ Environment variable check passed"
```

### Pattern 3: Validation Script --test Mode

Add self-testing capability to validation scripts:

```bash
#!/bin/bash

# Parse test mode flag
TEST_MODE=false
if [[ "$1" == "--test" ]]; then
  TEST_MODE=true
  shift
fi

# Dependency checks (always run)
if ! command -v curl &> /dev/null; then
    echo "❌ ERROR: curl not installed"
    exit 1
fi

# Test mode: Validate and exit
if [[ "$TEST_MODE" == "true" ]]; then
  echo "🧪 Running in test mode..."
  echo "✅ Dependencies: OK"
  echo "✅ Syntax: OK"
  echo "🎉 Test mode passed"
  exit 0
fi

# Normal execution
echo "Running validation..."
# ... actual validation logic
```

### Pattern 4: Integration Test Structure

Structure integration tests with clear setup, execution, and verification:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Integration: Feature Name', () => {
  let testResources: any;

  beforeEach(async () => {
    // Setup: Create test resources
    testResources = await setupTestResources();
  });

  afterEach(async () => {
    // Cleanup: Remove test resources
    await cleanupTestResources(testResources);
  });

  it('should validate end-to-end workflow', async () => {
    // Execute workflow
    const result = await runWorkflow(testResources);

    // Verify results
    expect(result.success).toBe(true);
    expect(result.itemsProcessed).toBeGreaterThan(0);
  });
});
```

### Pattern 5: Pre-Commit Hook Performance

Optimize pre-commit hooks to complete in <10 seconds:

```bash
#!/bin/sh

# Run fast checks first (fail fast)
npm run type-check || exit 1

# Run lint-staged (only on staged files)
npx lint-staged --config lint-staged.config.js || exit 1

# Skip slow tests in pre-commit (run in CI)
# npm test  # ← Don't run in pre-commit if slow
```

## Getting Help

- **Documentation**: See [README.md](README.md), [TESTING.md](TESTING.md), [Definition of Done](.bmad/definition-of-done.md)
- **Integration Testing**: See [Integration Testing Standards](docs/integration-testing-standards.md)
- **Issues**: File issues on GitHub
- **Questions**: Ask in pull request comments

## License

[License information to be added]
