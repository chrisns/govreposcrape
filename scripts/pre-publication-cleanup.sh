#!/bin/bash
#
# Pre-Publication Security Cleanup Script
# =========================================
# This script prepares the govreposcrape repository for public publication by:
# 1. Rewriting git history to remove Cloudflare credentials
# 2. Deleting local credential files
# 3. Fixing security vulnerabilities
# 4. Adding logs/ to .gitignore
# 5. Verifying cleanup success
#
# DESTRUCTIVE OPERATIONS: This script rewrites git history
# BACKUP: Creates .git.backup before proceeding
#
# Usage: ./scripts/pre-publication-cleanup.sh [--skip-backup] [--auto-confirm]
#

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${REPO_ROOT}/.git.backup.$(date +%Y%m%d-%H%M%S)"
SKIP_BACKUP=false
AUTO_CONFIRM=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-backup)
      SKIP_BACKUP=true
      shift
      ;;
    --auto-confirm)
      AUTO_CONFIRM=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--skip-backup] [--auto-confirm]"
      echo ""
      echo "Options:"
      echo "  --skip-backup     Skip creating .git backup (faster, riskier)"
      echo "  --auto-confirm    Skip all confirmation prompts (use with caution)"
      echo "  -h, --help        Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run with -h for help"
      exit 1
      ;;
  esac
done

cd "$REPO_ROOT"

# Helper functions
info() {
  echo -e "${BLUE}ℹ ${NC}$1"
}

success() {
  echo -e "${GREEN}✓ ${NC}$1"
}

warning() {
  echo -e "${YELLOW}⚠ ${NC}$1"
}

error() {
  echo -e "${RED}✗ ${NC}$1"
}

confirm() {
  if [[ "$AUTO_CONFIRM" == "true" ]]; then
    return 0
  fi

  local prompt="$1"
  local response
  echo -e "${YELLOW}?${NC} $prompt [y/N]: "
  read -r response
  case "$response" in
    [yY][eE][sS]|[yY])
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# Header
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║         Pre-Publication Security Cleanup Script               ║"
echo "║         Repository: govreposcrape                             ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Pre-flight checks
info "Running pre-flight checks..."

# Check we're in a git repository
if [[ ! -d .git ]]; then
  error "Not a git repository. Please run from repository root."
  exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  warning "You have uncommitted changes:"
  git status --short
  echo ""
  if ! confirm "Continue anyway? (Changes will be preserved)"; then
    error "Aborted by user"
    exit 1
  fi
fi

# Check for required tools
info "Checking required tools..."
MISSING_TOOLS=()

if ! command -v git &> /dev/null; then
  MISSING_TOOLS+=("git")
fi

if ! command -v npm &> /dev/null; then
  MISSING_TOOLS+=("npm")
fi

if ! command -v sed &> /dev/null; then
  MISSING_TOOLS+=("sed")
fi

if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
  error "Missing required tools: ${MISSING_TOOLS[*]}"
  exit 1
fi

success "All required tools available"

# Display what will be done
echo ""
info "This script will perform the following operations:"
echo ""
echo "  1. ✓ Create backup of .git directory"
echo "  2. ✓ Rewrite git history to remove Cloudflare credentials:"
echo "      - Account ID: REDACTED_CLOUDFLARE_ACCOUNT"
echo "      - D1 Database ID: REDACTED_CLOUDFLARE_D1_ID"
echo "      - KV Namespace ID: REDACTED_CLOUDFLARE_KV_ID"
echo "  3. ✓ Delete local credential files:"
echo "      - google-credentials.json"
echo "      - .env"
echo "      - api/.env"
echo "  4. ✓ Delete logs/ directory"
echo "  5. ✓ Add logs/ to .gitignore"
echo "  6. ✓ Update npm dependencies (fix glob vulnerability)"
echo "  7. ✓ Remove .claude/settings.local.json from git tracking"
echo "  8. ✓ Run verification checks"
echo ""
warning "IMPORTANT: Git history rewrite is DESTRUCTIVE and cannot be easily undone"
warning "IMPORTANT: This will require force-push if you've already pushed to remote"
echo ""

if ! confirm "Proceed with cleanup?"; then
  error "Aborted by user"
  exit 1
fi

echo ""
info "Starting cleanup process..."
echo ""

# ============================================================================
# PHASE 1: Backup
# ============================================================================

if [[ "$SKIP_BACKUP" == "false" ]]; then
  info "Phase 1: Creating backup of .git directory..."

  if [[ -d "$BACKUP_DIR" ]]; then
    error "Backup directory already exists: $BACKUP_DIR"
    exit 1
  fi

  cp -r .git "$BACKUP_DIR"
  success "Backup created: $BACKUP_DIR"
  info "To restore: rm -rf .git && mv $BACKUP_DIR .git"
else
  warning "Phase 1: Skipping backup (--skip-backup flag)"
fi

echo ""

# ============================================================================
# PHASE 2: Git History Rewrite
# ============================================================================

info "Phase 2: Rewriting git history to remove Cloudflare credentials..."

# Create temporary replacements file
REPLACEMENTS_FILE=$(mktemp)
cat > "$REPLACEMENTS_FILE" << 'EOF'
REDACTED_CLOUDFLARE_ACCOUNT
REDACTED_CLOUDFLARE_D1_ID
REDACTED_CLOUDFLARE_KV_ID
EOF

info "Using git filter-repo for history rewrite (safer than filter-branch)..."

# Check if git-filter-repo is available
if command -v git-filter-repo &> /dev/null; then
  info "Using git-filter-repo (recommended)"

  # Create replacements in git-filter-repo format
  FILTER_REPLACEMENTS=$(mktemp)
  cat > "$FILTER_REPLACEMENTS" << 'EOF'
literal:REDACTED_CLOUDFLARE_KV_ID==>REDACTED_CLOUDFLARE_KV_ID
literal:REDACTED_CLOUDFLARE_D1_ID==>REDACTED_CLOUDFLARE_D1_ID
literal:REDACTED_CLOUDFLARE_ACCOUNT==>REDACTED_CLOUDFLARE_ACCOUNT
literal:REDACTED_R2_ACCESS_KEY==>REDACTED_R2_ACCESS_KEY
literal:REDACTED_R2_SECRET_KEY==>REDACTED_R2_SECRET_KEY
EOF

  # Run git-filter-repo
  git filter-repo --replace-text "$FILTER_REPLACEMENTS" --force

  rm "$FILTER_REPLACEMENTS"
  success "Git history rewritten with git-filter-repo"

else
  warning "git-filter-repo not found, falling back to git filter-branch (slower)"
  info "Install git-filter-repo for better performance: brew install git-filter-repo"

  # Fallback to filter-branch
  git filter-branch --force --tree-filter "
    # Replace in all tracked files
    find . -type f -exec sed -i '' 's/REDACTED_CLOUDFLARE_ACCOUNT/REDACTED_CLOUDFLARE_ACCOUNT/g' {} + 2>/dev/null || true
    find . -type f -exec sed -i '' 's/REDACTED_CLOUDFLARE_D1_ID/REDACTED_CLOUDFLARE_D1_ID/g' {} + 2>/dev/null || true
    find . -type f -exec sed -i '' 's/REDACTED_CLOUDFLARE_KV_ID/REDACTED_CLOUDFLARE_KV_ID/g' {} + 2>/dev/null || true
  " --prune-empty --tag-name-filter cat -- --all

  success "Git history rewritten with git filter-branch"
fi

rm "$REPLACEMENTS_FILE"

# Clean up repository
info "Cleaning up repository..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

success "Phase 2 complete: Git history cleaned"
echo ""

# ============================================================================
# PHASE 3: Delete Local Credential Files
# ============================================================================

info "Phase 3: Deleting local credential files..."

FILES_DELETED=0

# Delete google-credentials.json
if [[ -f google-credentials.json ]]; then
  rm -f google-credentials.json
  success "Deleted: google-credentials.json"
  FILES_DELETED=$((FILES_DELETED + 1))
else
  info "Not found (OK): google-credentials.json"
fi

# Delete .env
if [[ -f .env ]]; then
  rm -f .env
  success "Deleted: .env"
  FILES_DELETED=$((FILES_DELETED + 1))
else
  info "Not found (OK): .env"
fi

# Delete api/.env
if [[ -f api/.env ]]; then
  rm -f api/.env
  success "Deleted: api/.env"
  FILES_DELETED=$((FILES_DELETED + 1))
else
  info "Not found (OK): api/.env"
fi

success "Phase 3 complete: $FILES_DELETED credential files deleted"
echo ""

# ============================================================================
# PHASE 4: Delete Logs Directory
# ============================================================================

info "Phase 4: Deleting logs directory..."

if [[ -d logs ]]; then
  # Check size
  LOGS_SIZE=$(du -sh logs | cut -f1)
  info "Logs directory size: $LOGS_SIZE"

  rm -rf logs
  success "Deleted: logs/ directory"
else
  info "Logs directory not found (OK)"
fi

success "Phase 4 complete: Logs deleted"
echo ""

# ============================================================================
# PHASE 5: Update .gitignore
# ============================================================================

info "Phase 5: Updating .gitignore..."

# Check if logs/ already in .gitignore
if grep -q "^logs/$" .gitignore 2>/dev/null; then
  info "logs/ already in .gitignore"
else
  echo "" >> .gitignore
  echo "# Logs directory (ingestion logs, debug output)" >> .gitignore
  echo "logs/" >> .gitignore
  success "Added logs/ to .gitignore"
fi

# Check if .claude/settings.local.json in .gitignore
if grep -q "^\.claude/settings\.local\.json$" .gitignore 2>/dev/null; then
  info ".claude/settings.local.json already in .gitignore"
else
  echo "" >> .gitignore
  echo "# Local Claude settings (contains project-specific paths)" >> .gitignore
  echo ".claude/settings.local.json" >> .gitignore
  success "Added .claude/settings.local.json to .gitignore"
fi

success "Phase 5 complete: .gitignore updated"
echo ""

# ============================================================================
# PHASE 6: Remove .claude/settings.local.json from Git Tracking
# ============================================================================

info "Phase 6: Removing .claude/settings.local.json from git tracking..."

if git ls-files --error-unmatch .claude/settings.local.json >/dev/null 2>&1; then
  git rm --cached .claude/settings.local.json
  success "Removed from git tracking: .claude/settings.local.json"
  info "File still exists on disk (as intended)"
else
  info "File not tracked in git (OK)"
fi

success "Phase 6 complete"
echo ""

# ============================================================================
# PHASE 7: Fix npm Vulnerabilities
# ============================================================================

info "Phase 7: Fixing npm vulnerabilities..."

if [[ -f package.json ]]; then
  info "Running npm audit fix..."

  # Try automatic fix first
  npm audit fix --quiet || true

  # Check if glob vulnerability still exists
  if npm audit --json 2>/dev/null | grep -q "glob"; then
    warning "glob vulnerability still present, attempting manual update..."

    # Update openapi-generator-cli which pulls in glob
    npm update @openapitools/openapi-generator-cli --quiet || true
  fi

  # Run final audit
  AUDIT_OUTPUT=$(npm audit --audit-level=high 2>&1 || true)

  if echo "$AUDIT_OUTPUT" | grep -q "found 0 vulnerabilities"; then
    success "No high/critical vulnerabilities found"
  else
    warning "Some vulnerabilities may remain:"
    echo "$AUDIT_OUTPUT"
  fi
else
  info "No package.json found, skipping npm audit"
fi

success "Phase 7 complete: Dependencies updated"
echo ""

# ============================================================================
# PHASE 8: Verification
# ============================================================================

info "Phase 8: Running verification checks..."

VERIFICATION_FAILED=false

echo ""
info "Checking for Cloudflare credentials in git history..."

# Check for Cloudflare Account ID
if git log --all -p | grep -q "REDACTED_CLOUDFLARE_ACCOUNT"; then
  error "FAIL: Cloudflare Account ID still found in git history"
  VERIFICATION_FAILED=true
else
  success "PASS: Cloudflare Account ID removed from git history"
fi

# Check for D1 Database ID
if git log --all -p | grep -q "REDACTED_CLOUDFLARE_D1_ID"; then
  error "FAIL: Cloudflare D1 ID still found in git history"
  VERIFICATION_FAILED=true
else
  success "PASS: Cloudflare D1 ID removed from git history"
fi

# Check for KV Namespace ID
if git log --all -p | grep -q "REDACTED_CLOUDFLARE_KV_ID"; then
  error "FAIL: Cloudflare KV ID still found in git history"
  VERIFICATION_FAILED=true
else
  success "PASS: Cloudflare KV ID removed from git history"
fi

echo ""
info "Checking for credential files..."

# Check for credential files
CRED_FILES=$(find . -name ".env" -o -name "*credentials.json" 2>/dev/null | grep -v node_modules || true)
if [[ -n "$CRED_FILES" ]]; then
  error "FAIL: Credential files still present:"
  echo "$CRED_FILES"
  VERIFICATION_FAILED=true
else
  success "PASS: No credential files found"
fi

echo ""
info "Checking for .env files in git history..."

# Check for .env in git history
if git log --all --name-only --pretty=format: | grep -q "^\.env$"; then
  error "FAIL: .env file found in git history"
  VERIFICATION_FAILED=true
else
  success "PASS: No .env files in git history"
fi

# Check for google-credentials.json in git history
if git log --all --name-only --pretty=format: | grep -q "google-credentials\.json"; then
  error "FAIL: google-credentials.json found in git history"
  VERIFICATION_FAILED=true
else
  success "PASS: No google-credentials.json in git history"
fi

echo ""
info "Checking .gitignore configuration..."

# Check logs/ in .gitignore
if grep -q "^logs/$" .gitignore; then
  success "PASS: logs/ in .gitignore"
else
  error "FAIL: logs/ not in .gitignore"
  VERIFICATION_FAILED=true
fi

# Check .claude/settings.local.json in .gitignore
if grep -q "\.claude/settings\.local\.json" .gitignore; then
  success "PASS: .claude/settings.local.json in .gitignore"
else
  error "FAIL: .claude/settings.local.json not in .gitignore"
  VERIFICATION_FAILED=true
fi

echo ""
success "Phase 8 complete: Verification checks finished"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║                     CLEANUP COMPLETE                           ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [[ "$VERIFICATION_FAILED" == "true" ]]; then
  error "⚠️  Some verification checks FAILED - review output above"
  echo ""
  warning "The repository may not be ready for publication"
  exit 1
else
  success "✓ All verification checks PASSED"
  echo ""
  info "Summary of changes:"
  echo "  • Git history rewritten (Cloudflare credentials removed)"
  echo "  • Local credential files deleted"
  echo "  • Logs directory deleted"
  echo "  • .gitignore updated"
  echo "  • .claude/settings.local.json removed from tracking"
  echo "  • npm dependencies updated"
  echo ""

  if [[ "$SKIP_BACKUP" == "false" ]]; then
    info "Backup location: $BACKUP_DIR"
    info "To restore: rm -rf .git && mv $BACKUP_DIR .git"
    echo ""
  fi

  warning "NEXT STEPS:"
  echo ""
  echo "  1. Review changes: git status"
  echo "  2. Commit updated .gitignore:"
  echo "     git add .gitignore"
  echo "     git commit -m 'security: Update .gitignore for publication'"
  echo ""
  echo "  3. BEFORE PUSHING: Rotate these credentials:"
  echo "     • Cloudflare R2 access keys (old account: 590...)"
  echo "     • Google Cloud service account"
  echo "     • Google Gemini API key"
  echo ""
  echo "  4. Force push (required due to history rewrite):"
  echo "     git push --force-with-lease origin feat/google-cloud-migration"
  echo ""
  echo "  5. Optional: Install git-filter-repo for better performance:"
  echo "     brew install git-filter-repo"
  echo ""

  success "Repository is ready for publication after credential rotation!"
fi

echo ""
