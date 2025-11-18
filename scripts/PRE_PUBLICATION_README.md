# Pre-Publication Security Cleanup

## Overview

The `pre-publication-cleanup.sh` script prepares the govreposcrape repository for public release by removing sensitive Cloudflare credentials from git history while preserving Google Cloud project numbers and infrastructure IDs (which are acceptable for public repos).

## What It Does

### ✅ Automatic Operations

1. **Git History Rewrite** - Removes Cloudflare credentials from entire git history:
   - Cloudflare Account ID: `REDACTED_CLOUDFLARE_ACCOUNT`
   - Cloudflare D1 Database ID: `REDACTED_CLOUDFLARE_D1_ID`
   - Cloudflare KV Namespace ID: `REDACTED_CLOUDFLARE_KV_ID`

2. **Local File Deletion**:
   - `google-credentials.json` (service account key)
   - `.env` (local environment variables with secrets)
   - `api/.env` (if exists)
   - `logs/` directory (may contain debug output)

3. **Git Configuration**:
   - Adds `logs/` to `.gitignore`
   - Adds `.claude/settings.local.json` to `.gitignore`
   - Removes `.claude/settings.local.json` from git tracking

4. **Dependency Updates**:
   - Runs `npm audit fix`
   - Attempts to fix glob vulnerability (GHSA-5j98-mcp5-4vw2)

5. **Verification Checks**:
   - Confirms Cloudflare credentials removed from git history
   - Verifies no credential files remain on disk
   - Checks `.gitignore` configuration
   - Validates no `.env` files in git history

### ⚠️ What It PRESERVES (Intentionally)

The script does NOT remove:
- ✅ Google Cloud Project Number: `1060386346356` (acceptable for public repos)
- ✅ Vertex AI Search Engine IDs (public metadata)
- ✅ Cloud Run service URLs (public endpoints)
- ✅ Service account emails (non-sensitive)
- ✅ GCS bucket names (public resources)

These are considered acceptable for publication per security audit recommendations.

## Prerequisites

### Required Tools
- `git` - Version control
- `npm` - Dependency management
- `sed` - Text replacement

### Optional (Recommended)
- `git-filter-repo` - Faster, safer history rewriting
  ```bash
  # macOS
  brew install git-filter-repo

  # Linux
  pip install git-filter-repo
  ```

If `git-filter-repo` is not available, the script falls back to `git filter-branch` (slower but works).

## Usage

### Basic Usage (Recommended)

```bash
# Run with all safety features (creates backup, asks for confirmation)
./scripts/pre-publication-cleanup.sh
```

### Advanced Options

```bash
# Skip backup creation (faster, riskier)
./scripts/pre-publication-cleanup.sh --skip-backup

# Auto-confirm all prompts (for automation/CI)
./scripts/pre-publication-cleanup.sh --auto-confirm

# Combine options
./scripts/pre-publication-cleanup.sh --skip-backup --auto-confirm

# Show help
./scripts/pre-publication-cleanup.sh --help
```

## Step-by-Step Guide

### 1. Pre-Flight Checks

Before running the script:

```bash
# Ensure you're on the correct branch
git branch --show-current
# Should show: feat/google-cloud-migration

# Check for uncommitted changes
git status

# Optional: Create manual backup
cp -r .git .git.manual-backup
```

### 2. Run the Cleanup Script

```bash
cd ~/govreposcrape
./scripts/pre-publication-cleanup.sh
```

**Expected output:**
```
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║         Pre-Publication Security Cleanup Script               ║
║         Repository: govreposcrape                             ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

ℹ Running pre-flight checks...
✓ All required tools available

This script will perform the following operations:
  1. ✓ Create backup of .git directory
  2. ✓ Rewrite git history to remove Cloudflare credentials
  ...

? Proceed with cleanup? [y/N]: y
```

### 3. Review Changes

After cleanup:

```bash
# Check git status
git status

# Verify Cloudflare credentials removed
git log --all -p | grep "REDACTED_CLOUDFLARE_ACCOUNT"
# Should return: (nothing)

# Verify local credentials deleted
ls -la google-credentials.json .env
# Should return: No such file or directory

# Check .gitignore
cat .gitignore | grep -E "(logs/|settings.local.json)"
# Should show both entries
```

### 4. Commit .gitignore Changes

```bash
git add .gitignore
git commit -m "security: Update .gitignore for publication"
```

### 5. Rotate Credentials (CRITICAL)

**Before pushing to public repository:**

#### a. Rotate Cloudflare R2 Credentials

```bash
# 1. Archive R2 bucket data (if needed)
# 2. Revoke old access keys via Cloudflare dashboard
# 3. Delete R2 bucket: govreposcrape-gitingest
```

Old credentials to revoke:
- Account ID: `REDACTED_CLOUDFLARE_ACCOUNT`
- Access Key: `REDACTED_R2_ACCESS_KEY`
- Secret Key: `REDACTED_R2_SECRET_KEY`

#### b. Rotate Google Cloud Service Account

```bash
# Create new service account
gcloud iam service-accounts create govreposcrape-sa-v2 \
  --display-name="govreposcrape SA v2"

# Grant required roles
gcloud projects add-iam-policy-binding govreposcrape \
  --member="serviceAccount:govreposcrape-sa-v2@govreposcrape.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Generate new key
gcloud iam service-accounts keys create google-credentials-v2.json \
  --iam-account=govreposcrape-sa-v2@govreposcrape.iam.gserviceaccount.com

# Update Cloud Run with new SA
gcloud run services update govreposcrape-api \
  --service-account=govreposcrape-sa-v2@govreposcrape.iam.gserviceaccount.com

# Delete old service account
gcloud iam service-accounts delete govreposcrape-sa@govreposcrape.iam.gserviceaccount.com
```

#### c. Rotate Google Gemini API Key

```bash
# 1. Create new API key in GCP Console
# 2. Update production Cloud Run/Jobs environment variables
# 3. Delete old API key
```

Old key to delete: `REDACTED_GEMINI_API_KEY`

### 6. Force Push (Required)

Due to git history rewrite, you **must** force push:

```bash
# Force push with safety check (recommended)
git push --force-with-lease origin feat/google-cloud-migration

# Or if you're certain (more dangerous)
git push --force origin feat/google-cloud-migration
```

⚠️ **WARNING**: This will overwrite remote history. Ensure no one else is working on this branch.

### 7. Verify Remote Repository

After pushing:

```bash
# Clone to fresh directory to verify
cd /tmp
git clone https://github.com/YOUR_ORG/govreposcrape.git govreposcrape-verify
cd govreposcrape-verify

# Check for Cloudflare credentials (should be empty)
git log --all -p | grep "REDACTED_CLOUDFLARE_ACCOUNT"

# Check for .env files (should be empty)
git log --all --name-only | grep "^\.env$"
```

## Backup & Recovery

### Automatic Backup

The script creates a timestamped backup before proceeding:

```bash
.git.backup.YYYYMMDD-HHMMSS/
```

### Restore from Backup

If something goes wrong:

```bash
# Stop and restore
rm -rf .git
mv .git.backup.YYYYMMDD-HHMMSS .git

# Verify restoration
git status
```

### Manual Backup (Recommended)

Before running the script:

```bash
# Create manual backup
tar -czf git-backup-$(date +%Y%m%d).tar.gz .git

# To restore
tar -xzf git-backup-YYYYMMDD.tar.gz
```

## Troubleshooting

### Script Fails: "git-filter-repo not found"

**Solution**: Install git-filter-repo or let script use fallback:

```bash
# macOS
brew install git-filter-repo

# Linux
pip install git-filter-repo

# Or just let script use git filter-branch fallback
```

### Verification Fails: "Cloudflare credentials still found"

**Diagnosis**:

```bash
# Find where credentials remain
git log --all -p | grep -B5 -A5 "REDACTED_CLOUDFLARE_ACCOUNT"
```

**Solution**: The script may need manual intervention. Check:
1. Binary files (PDFs, images) containing credentials
2. Commit messages with credentials
3. Git tags or stashes

### npm audit still shows vulnerabilities

**Check severity**:

```bash
npm audit --audit-level=high
```

If only LOW/MEDIUM vulnerabilities remain, acceptable for publication. For HIGH/CRITICAL:

```bash
# Manual update
npm update [package-name]

# Or remove package if not essential
npm uninstall [package-name]
```

### Force push rejected: "stale info"

**Solution**: Someone else pushed to the branch:

```bash
# Fetch latest
git fetch origin

# Rebase and retry (careful!)
git rebase origin/feat/google-cloud-migration
git push --force-with-lease origin feat/google-cloud-migration
```

## What Happens If...?

### Q: What if I don't rotate credentials?

**A**: Old Cloudflare credentials are removed from git history but were captured in the security audit. Assume they're compromised. If you don't rotate:
- R2 buckets could be accessed/deleted
- Unexpected charges from abuse
- Data exfiltration risk

**Always rotate before making repository public.**

### Q: What if I skip the backup?

**A**: You cannot easily undo the git history rewrite. If something goes wrong:
- Lost commits
- Corrupted repository
- Need to restore from remote (if pushed) or start over

**Only skip backup if you're confident and have remote backup.**

### Q: What if I already pushed to GitHub?

**A**: You need to force-push after cleanup:

```bash
git push --force-with-lease origin feat/google-cloud-migration
```

This **overwrites remote history**. Coordinate with team members first.

### Q: What about Google Cloud project numbers?

**A**: Per security audit, project numbers are **acceptable for public repos**:
- Project numbers are public metadata (visible in Cloud Run URLs)
- Don't grant access (authentication required)
- Common in open-source GCP projects

The script preserves them intentionally.

## Final Checklist

Before making repository public:

- [ ] Script completed successfully (all checks PASS)
- [ ] `.gitignore` changes committed
- [ ] Cloudflare R2 credentials rotated/revoked
- [ ] Google Cloud service account rotated
- [ ] Google Gemini API key rotated
- [ ] Force-pushed to remote (if applicable)
- [ ] Verified clean clone (no credentials in history)
- [ ] Team notified of credential rotation
- [ ] Production deployments updated with new credentials
- [ ] Documentation updated (if credential rotation changed setup)
- [ ] Security.md reviewed and current
- [ ] README.md contains no sensitive info

## Support

If you encounter issues:

1. Check this README's Troubleshooting section
2. Review script output for specific error messages
3. Restore from backup if needed
4. Consult security audit report for context

## Additional Resources

- [Git History Rewriting Best Practices](https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History)
- [git-filter-repo Documentation](https://github.com/newren/git-filter-repo)
- [GitHub: Removing Sensitive Data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [NCSC Secure Development Guidance](https://www.ncsc.gov.uk/collection/developers-collection)

---

**Last Updated**: 2025-11-18
**Script Version**: 1.0.0
**Maintainer**: govreposcrape team
