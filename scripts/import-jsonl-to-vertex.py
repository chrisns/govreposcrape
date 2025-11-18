#!/usr/bin/env python3
"""
Import JSON Lines documents from GCS to Vertex AI Search.

Uses service account credentials and the Discovery Engine API to trigger
document import with the proper schema.
"""

import json
import os
from google.cloud import discoveryengine_v1 as discoveryengine
from google.api_core import operation

# Configuration
PROJECT_ID = "govreposcrape"
LOCATION = "global"
DATA_STORE_ID = "govreposcrape-summaries"
GCS_URI = "gs://govreposcrape-summaries/**/*.jsonl"

def import_documents():
    """Trigger import of JSON Lines documents from GCS."""

    # Initialize the DocumentService client
    client = discoveryengine.DocumentServiceClient()

    # Construct the parent path
    parent = f"projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/dataStores/{DATA_STORE_ID}/branches/0"

    # Create import request
    request = discoveryengine.ImportDocumentsRequest(
        parent=parent,
        gcs_source=discoveryengine.GcsSource(
            input_uris=[GCS_URI],
            data_schema="document"  # Use document schema for JSON Lines with structData
        ),
        reconciliation_mode=discoveryengine.ImportDocumentsRequest.ReconciliationMode.INCREMENTAL
    )

    print(f"Triggering import from {GCS_URI}...")
    print(f"Parent: {parent}")
    print(f"Schema: document")
    print(f"Reconciliation mode: INCREMENTAL")

    # Trigger the import operation
    operation_obj = client.import_documents(request=request)

    print(f"\nImport operation started: {operation_obj.operation.name}")
    print("This is a long-running operation. You can monitor it using:")
    print(f"  gcloud discovery-engine operations describe {operation_obj.operation.name.split('/')[-1]}")

    return operation_obj

if __name__ == "__main__":
    # Ensure GOOGLE_APPLICATION_CREDENTIALS is set
    if not os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
        print("ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable not set")
        print("Please set it to the path of your service account key file")
        exit(1)

    try:
        op = import_documents()
        print("\n✓ Import operation triggered successfully")
    except Exception as e:
        print(f"\n✗ Import failed: {e}")
        exit(1)
