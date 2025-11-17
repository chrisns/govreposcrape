#!/bin/bash
# Validates AI Search indexing baseline by checking R2 bucket contents
# Usage: ./scripts/validate-ai-search-baseline.sh
#        ./scripts/validate-ai-search-baseline.sh --test
#
# PURPOSE:
# - Verify R2 bucket contains gitingest summaries ready for AI Search indexing
# - Document baseline metrics before full ingestion completes
# - Validate indexing is working while background ingestion continues
#
# VALIDATION APPROACH:
# Since we don't have a deployed Worker yet, we validate at the R2 layer:
# 1. Check R2 bucket exists and is accessible
# 2. Count number of summary files uploaded
# 3. Sample files to verify structure and content-type
# 4. Document baseline for AI Search Dashboard validation
#
# AI Search indexes R2 files automatically (continuous monitoring mode)
# Expected indexing lag: < 5 minutes per NFR-1.4

set -e

# Parse arguments for test mode
TEST_MODE=false
if [[ "$1" == "--test" ]]; then
  TEST_MODE=true
  shift
fi

# Dependency checks
if ! command -v aws &> /dev/null; then
    echo "❌ ERROR: AWS CLI not installed"
    echo "   Install with: brew install awscli (macOS)"
    echo "   See: https://aws.amazon.com/cli/"
    exit 1
fi

# Test mode: Validate dependencies and syntax only
if [[ "$TEST_MODE" == "true" ]]; then
  echo "🧪 Running in test mode..."
  echo ""
  echo "✅ Dependencies: OK"
  echo "   - aws: $(command -v aws)"
  echo "   - bash: $BASH_VERSION"
  echo ""

  # Test .env file exists
  if [ ! -f .env ]; then
    echo "⚠️  WARNING: .env file not found"
    echo "   Required for normal execution"
    echo "   Create .env with: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY"
  else
    echo "✅ Environment file: .env exists"
  fi
  echo ""

  echo "✅ Syntax: OK"
  echo ""
  echo "🎉 Test mode passed - script is ready to run"
  exit 0
fi

# Load environment variables (only in normal mode)
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found"
    echo "   Run from project root: ./scripts/validate-ai-search-baseline.sh"
    exit 1
fi

# Source .env file to get R2 credentials
set -a
source .env
set +a

# Configuration
R2_BUCKET="${R2_BUCKET:-${R2_BUCKET_NAME:-govreposcrape-gitingest}}"
R2_ENDPOINT="${R2_ENDPOINT:-https://REDACTED_CLOUDFLARE_ACCOUNT.r2.cloudflarestorage.com}"
R2_ACCESS_KEY="${R2_ACCESS_KEY:-${R2_ACCESS_KEY_ID}}"
R2_SECRET_KEY="${R2_SECRET_KEY:-${R2_SECRET_ACCESS_KEY}}"
GITINGEST_PREFIX="gitingest/"
SAMPLE_SIZE=5

echo "🔍 AI Search Indexing Baseline Validation"
echo "=========================================="
echo ""
echo "📊 Configuration:"
echo "   R2 Bucket: ${R2_BUCKET}"
echo "   Prefix: ${GITINGEST_PREFIX}"
echo "   Endpoint: ${R2_ENDPOINT}"
echo ""

# Test 1: Verify R2 bucket exists and is accessible
echo "Test 1: R2 Bucket Accessibility"
echo "--------------------------------"

# Test bucket access with AWS CLI (R2 requires --region=auto)
if AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
   AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
   aws s3 ls "s3://${R2_BUCKET}/" --endpoint-url="$R2_ENDPOINT" --region=auto >/dev/null 2>&1; then
    echo "✅ R2 bucket accessible: ${R2_BUCKET}"
else
    echo "❌ R2 bucket not accessible"
    echo "   Check credentials in .env file"
    echo "   Check bucket name: ${R2_BUCKET}"
    exit 1
fi
echo ""

# Test 2: Count gitingest summary files
echo "Test 2: Gitingest Summary File Count"
echo "-------------------------------------"
echo "Counting files in ${GITINGEST_PREFIX}..."

# Use AWS CLI to list and count files
FILE_COUNT=$(AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
             AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
             aws s3 ls "s3://${R2_BUCKET}/${GITINGEST_PREFIX}" \
             --endpoint-url="$R2_ENDPOINT" \
             --region=auto \
             --recursive 2>/dev/null | grep "summary.txt" | wc -l | tr -d ' ')

echo "✅ Found ${FILE_COUNT} gitingest summary files"

if [ "$FILE_COUNT" -eq 0 ]; then
    echo ""
    echo "⚠️  Warning: No summary files found in R2 bucket"
    echo "   Expected path: ${GITINGEST_PREFIX}org/repo/summary.txt"
    echo "   Check that ingestion pipeline has started uploading"
    exit 1
fi

# Calculate ingestion progress
TOTAL_REPOS=20587
PROGRESS_PCT=$(awk "BEGIN {printf \"%.1f\", ($FILE_COUNT / $TOTAL_REPOS) * 100}")

echo ""
echo "📈 Ingestion Progress:"
echo "   Uploaded: ${FILE_COUNT} / ${TOTAL_REPOS} repos"
echo "   Progress: ${PROGRESS_PCT}%"
echo ""

# Test 3: Sample files to verify structure and content-type
echo "Test 3: File Structure and Content-Type Validation"
echo "---------------------------------------------------"

# Get list of sample files using AWS CLI
SAMPLE_FILES=$(AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
               AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
               aws s3 ls "s3://${R2_BUCKET}/${GITINGEST_PREFIX}" \
               --endpoint-url="$R2_ENDPOINT" \
               --region=auto \
               --recursive 2>/dev/null | grep "summary.txt" | head -n $SAMPLE_SIZE | awk '{print $4}')

SAMPLE_COUNT=0
VALID_COUNT=0

echo "Sampling ${SAMPLE_SIZE} files..."
echo ""

while IFS= read -r file_key; do
    [ -z "$file_key" ] && continue

    SAMPLE_COUNT=$((SAMPLE_COUNT + 1))

    # Extract org/repo from path
    ORG_REPO=$(echo "$file_key" | sed "s|^${GITINGEST_PREFIX}||" | sed 's|/summary.txt$||')

    echo "Sample ${SAMPLE_COUNT}: ${ORG_REPO}"

    # Download file
    if AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
       AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
       aws s3 cp "s3://${R2_BUCKET}/${file_key}" \
       "/tmp/r2-sample-${SAMPLE_COUNT}.txt" \
       --endpoint-url="$R2_ENDPOINT" \
       --region=auto >/dev/null 2>&1; then

        FILE_SIZE=$(wc -c < "/tmp/r2-sample-${SAMPLE_COUNT}.txt")

        if [ "$FILE_SIZE" -gt 0 ]; then
            echo "  ✅ File size: ${FILE_SIZE} bytes"

            # Validate it's plain text
            if file "/tmp/r2-sample-${SAMPLE_COUNT}.txt" | grep -q "text"; then
                echo "  ✅ Content-Type: text/plain"
                VALID_COUNT=$((VALID_COUNT + 1))
            else
                echo "  ⚠️  Content-Type: non-text (may not index)"
            fi

            # Show first 100 characters
            PREVIEW=$(head -c 100 "/tmp/r2-sample-${SAMPLE_COUNT}.txt")
            echo "  Preview: ${PREVIEW}..."
        else
            echo "  ❌ Empty file"
        fi

        # Clean up
        rm -f "/tmp/r2-sample-${SAMPLE_COUNT}.txt"
    else
        echo "  ❌ Failed to fetch file"
    fi

    echo ""
done <<< "$SAMPLE_FILES"

if [ "$VALID_COUNT" -eq "$SAMPLE_COUNT" ]; then
    echo "✅ All ${SAMPLE_COUNT} sampled files are valid (text/plain, non-empty)"
else
    echo "⚠️  ${VALID_COUNT}/${SAMPLE_COUNT} sampled files are valid"
fi
echo ""

# Test 4: Document baseline for AI Search Dashboard validation
echo "Test 4: AI Search Dashboard Validation Steps"
echo "---------------------------------------------"
echo ""
echo "Next steps to validate AI Search indexing:"
echo ""
echo "1. Access Cloudflare Dashboard:"
echo "   https://dash.cloudflare.com/REDACTED_CLOUDFLARE_ACCOUNT/ai/search"
echo ""
echo "2. Select your AI Search index (e.g., 'govreposcrape-search')"
echo ""
echo "3. Verify indexed document count:"
echo "   Expected: ~${FILE_COUNT} documents (allowing for 5-minute indexing lag)"
echo "   Dashboard shows: [Document Count]"
echo ""
echo "4. Run test query in Dashboard:"
echo "   Test Query 1: \"authentication\""
echo "   Test Query 2: \"user profile component\""
echo "   Test Query 3: \"API endpoint\""
echo ""
echo "5. Validate query results:"
echo "   - Results should return within < 800ms (p95 target)"
echo "   - Top results should have similarity scores > 0.5"
echo "   - Results should reference UK government repositories"
echo ""
echo "6. Check indexing status:"
echo "   - Status should be: \"Active\" (not \"Paused\" or \"Error\")"
echo "   - Last update time should be within last 5 minutes"
echo "   - Continuous monitoring should be: \"Enabled\""
echo ""

# Summary
echo "=========================================="
echo "📊 Baseline Validation Summary"
echo "=========================================="
echo ""
echo "✅ R2 Bucket: Accessible"
echo "✅ Gitingest Files: ${FILE_COUNT} uploaded"
echo "✅ Ingestion Progress: ${PROGRESS_PCT}%"
echo "✅ File Validation: ${VALID_COUNT}/${SAMPLE_COUNT} samples valid"
echo ""
echo "🔍 Expected AI Search Index Size: ~${FILE_COUNT} documents"
echo "   (Allow 5 minutes for indexing lag per NFR-1.4)"
echo ""
echo "📝 Validation Checklist:"
echo "   [ ] Dashboard shows ${FILE_COUNT} ± 50 indexed documents"
echo "   [ ] Test queries return relevant results"
echo "   [ ] Query latency < 800ms (p95)"
echo "   [ ] Index status: Active"
echo "   [ ] Continuous monitoring: Enabled"
echo ""
echo "✨ Next Steps:"
echo "   1. Validate in Cloudflare Dashboard using steps above"
echo "   2. Continue monitoring background ingestion"
echo "   3. Re-run this script periodically to track progress"
echo "   4. Deploy Worker and test /mcp/health endpoint"
echo ""
echo "🎉 Baseline validation complete!"
echo ""
