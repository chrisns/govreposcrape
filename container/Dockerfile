# govreposcrape - gitingest Processing Container
# Story 2.3: Container-Based gitingest Processing with Retry Logic
#
# Base image: Python 3.11 slim for gitingest compatibility
# Dependencies: gitingest (code summarization), boto3 (R2 access), pytest (testing)

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install test dependencies
RUN pip install --no-cache-dir \
    pytest \
    pytest-cov \
    pytest-asyncio \
    moto

# Copy application code
COPY ingest.py .
COPY r2_client.py .
COPY cache.py .
COPY orchestrator.py .
COPY test_ingest.py .
COPY test_r2_client.py .
COPY test_orchestrator.py .
COPY test_cache.py .

# Set environment variables (will be overridden by runtime)
ENV R2_BUCKET=""
ENV R2_ENDPOINT=""
ENV R2_ACCESS_KEY=""
ENV R2_SECRET_KEY=""

# Default command: run ingest.py with help
CMD ["python", "ingest.py", "--help"]
