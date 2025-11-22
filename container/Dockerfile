# govreposcrape - gitingest Processing Container
# Google Cloud Platform Migration - Vertex AI Search Backend
#
# Base image: Python 3.11 slim for gitingest compatibility
# Dependencies: gitingest (code summarization), google-cloud-storage (Vertex AI backend), pytest (testing)

FROM python:3.14-slim@sha256:0aecac02dc3d4c5dbb024b753af084cafe41f5416e02193f1ce345d671ec966e

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
    pytest-asyncio

# Copy application code
COPY ingest.py .
COPY google_filesearch_client.py .
COPY gcs_client.py .
COPY orchestrator.py .
COPY test_ingest.py .
COPY test_orchestrator.py .
COPY test_gcs_client.py .
COPY test_cloudrun.py .

# Set environment variables (will be overridden by runtime)
ENV GCS_BUCKET_NAME="govreposcrape-summaries"
# Note: GOOGLE_APPLICATION_CREDENTIALS not needed in Cloud Run - uses service account metadata

# Default command: run full ingestion (can be overridden with --args)
CMD ["python", "orchestrator.py", "--batch-size=1", "--offset=0"]
