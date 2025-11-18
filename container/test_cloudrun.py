#!/usr/bin/env python3
"""Minimal test script for Cloud Run"""
import sys
import os

print("=== Cloud Run Test Script ===", flush=True)
print(f"Python version: {sys.version}", flush=True)
print(f"Working directory: {os.getcwd()}", flush=True)
print(f"GCS_BUCKET_NAME: {os.getenv('GCS_BUCKET_NAME', 'NOT SET')}", flush=True)
print(f"GOOGLE_APPLICATION_CREDENTIALS: {os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'NOT SET')}", flush=True)

try:
    from google.cloud import storage
    print("✓ google.cloud.storage imported successfully", flush=True)

    client = storage.Client()
    print(f"✓ Storage client created: {client.project}", flush=True)
except Exception as e:
    print(f"✗ Error: {e}", flush=True)
    sys.exit(1)

print("=== Test completed successfully ===", flush=True)
