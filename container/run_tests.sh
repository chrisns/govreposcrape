#!/bin/bash
# Test runner script for govreposcrape container tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== govreposcrape Container Test Suite ===${NC}"
echo ""

# Check if pytest is installed
if ! command -v pytest &> /dev/null; then
    echo -e "${RED}pytest not found. Installing test dependencies...${NC}"
    pip install -r requirements-test.txt
fi

# Default: run all tests
TEST_MODE="${1:-all}"

case "$TEST_MODE" in
    unit)
        echo -e "${YELLOW}Running unit tests only (fast)...${NC}"
        pytest -m unit -v
        ;;
    integration)
        echo -e "${YELLOW}Running integration tests...${NC}"
        pytest -m integration -v
        ;;
    coverage)
        echo -e "${YELLOW}Running all tests with coverage...${NC}"
        pytest --cov=. --cov-report=html --cov-report=term-missing -v
        echo ""
        echo -e "${GREEN}Coverage report generated: htmlcov/index.html${NC}"
        ;;
    fast)
        echo -e "${YELLOW}Running fast tests (excluding integration)...${NC}"
        pytest -m "not integration" -v
        ;;
    all)
        echo -e "${YELLOW}Running all tests...${NC}"
        pytest -v
        ;;
    *)
        echo -e "${RED}Unknown test mode: $TEST_MODE${NC}"
        echo ""
        echo "Usage: $0 [unit|integration|coverage|fast|all]"
        echo ""
        echo "  unit        - Run unit tests only (fast, mocked)"
        echo "  integration - Run integration tests only"
        echo "  coverage    - Run all tests with coverage report"
        echo "  fast        - Run all except integration tests"
        echo "  all         - Run all tests (default)"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✓ Tests complete!${NC}"
