#!/usr/bin/env python3
"""
build_deps_index.py — build the structured dependency index from the xgov
aggregate CycloneDX SBOM and load it into BigQuery.

Pipeline (≈2-3 min wall clock for ~2.9M rows):
  1. Stream-download the gzipped aggregate SBOM (≈49 MB) — replaces ~15.6k
     per-repo SBOM fetches with a single download.
  2. Fetch repos.json (≈14.5 MB) for pushed_at / repo_url enrichment.
  3. ijson-stream the 412 MB JSON one repo at a time (never json.load it),
     explode the exactly-2-level tree into flat (repo, library) rows,
     %-decode every PURL, classify the version and build the sort key
     (shared logic in version_keys.py — byte-identical to the TS query side).
  4. Write gzipped NDJSON, stage to GCS, then bq-load into the date partition
     dependencies$YYYYMMDD (atomic per-partition WRITE_TRUNCATE).
  5. Refresh the deps.current view and the popularity / license / repos
     summary tables.

Usage:
  python build_deps_index.py                     # full prod run
  python build_deps_index.py --limit 500         # first 500 repos (smoke)
  python build_deps_index.py --local-only out.ndjson.gz   # no BQ, just write NDJSON
  python build_deps_index.py --dry-run           # parse + stats only, no writes

Env: GOOGLE_PROJECT_ID, DEPS_DATASET (default govreposcrape_deps),
     DEPS_STAGING_BUCKET (default govreposcrape-summaries), SBOM_AGGREGATE_URL.
"""
from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from typing import Dict, Iterator, Optional, Tuple

import requests

from version_keys import normalize_version, parse_purl, package_key

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout
)
logger = logging.getLogger("build-deps-index")

DEFAULT_SBOM_URL = os.getenv(
    "SBOM_AGGREGATE_URL",
    "https://uk-x-gov-software-community.github.io/xgov-opensource-repo-scraper/sbom.json.gz",
)
DEFAULT_REPOS_URL = os.getenv(
    "REPOS_FEED_URL",
    "https://uk-x-gov-software-community.github.io/xgov-opensource-repo-scraper/repos.json",
)
DEFAULT_DATASET = os.getenv("DEPS_DATASET", "govreposcrape_deps")
DEFAULT_BUCKET = os.getenv("DEPS_STAGING_BUCKET", "govreposcrape-summaries")
TABLE = "dependencies"

# BigQuery schema for the exploded fact table (also used to create the table).
BQ_SCHEMA = [
    {"name": "repo_full_name", "type": "STRING", "mode": "REQUIRED"},
    {"name": "org", "type": "STRING", "mode": "REQUIRED"},
    {"name": "repo", "type": "STRING", "mode": "REQUIRED"},
    {"name": "repo_url", "type": "STRING", "mode": "NULLABLE"},
    {"name": "pushed_at", "type": "TIMESTAMP", "mode": "NULLABLE"},
    {"name": "purl", "type": "STRING", "mode": "REQUIRED"},
    {"name": "ecosystem", "type": "STRING", "mode": "REQUIRED"},
    {"name": "package_name", "type": "STRING", "mode": "REQUIRED"},
    {"name": "package_key", "type": "STRING", "mode": "REQUIRED"},
    {"name": "version_raw", "type": "STRING", "mode": "NULLABLE"},
    {"name": "version_kind", "type": "STRING", "mode": "REQUIRED"},
    {"name": "comparable", "type": "BOOL", "mode": "REQUIRED"},
    {"name": "exact_scheme", "type": "BOOL", "mode": "REQUIRED"},
    {"name": "version_sort_key", "type": "STRING", "mode": "NULLABLE"},
    {"name": "epoch", "type": "INT64", "mode": "REQUIRED"},
    {"name": "is_prerelease", "type": "BOOL", "mode": "REQUIRED"},
    {"name": "license_id", "type": "STRING", "mode": "NULLABLE"},
    {"name": "is_self_ref", "type": "BOOL", "mode": "REQUIRED"},
    {"name": "is_action", "type": "BOOL", "mode": "REQUIRED"},
    {"name": "ingested_date", "type": "DATE", "mode": "REQUIRED"},
]


def fetch_repos_meta(url: str) -> Dict[str, dict]:
    """Return {lower(org/repo): {pushed_at, repo_url}} from the repos.json feed."""
    logger.info("Fetching repos.json feed from %s", url)
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    feed = resp.json()
    meta: Dict[str, dict] = {}
    for r in feed:
        owner = r.get("owner") or r.get("org") or ""
        name = r.get("name") or ""
        if not owner or not name:
            continue
        full = f"{owner}/{name}"
        meta[full.lower()] = {
            "pushed_at": r.get("pushedAt") or None,
            "repo_url": r.get("url") or f"https://github.com/{full}",
        }
    logger.info("Loaded metadata for %d repos", len(meta))
    return meta


def download_aggregate(url: str) -> str:
    """Stream the gzipped aggregate to a temp file; return its path."""
    logger.info("Downloading aggregate SBOM from %s", url)
    tmp = tempfile.NamedTemporaryFile(prefix="sbom-agg-", suffix=".json.gz", delete=False)
    content_length = None
    with requests.get(url, stream=True, timeout=300) as resp:
        resp.raise_for_status()
        cl = resp.headers.get("Content-Length")
        content_length = int(cl) if cl and cl.isdigit() else None
        total = 0
        for chunk in resp.iter_content(chunk_size=1 << 20):
            tmp.write(chunk)
            total += len(chunk)
    tmp.close()
    # Integrity checks: catch truncated/corrupt downloads here with a clear error
    # rather than as a cryptic EOFError deep in the streaming parse.
    if content_length is not None and total != content_length:
        raise ValueError(
            f"downloaded SBOM size {total} != Content-Length {content_length} (truncated download)"
        )
    with open(tmp.name, "rb") as fh:
        magic = fh.read(2)
    if magic != b"\x1f\x8b":
        raise ValueError(f"downloaded SBOM is not valid gzip (magic bytes {magic!r})")
    logger.info("Downloaded %.1f MB to %s (gzip OK)", total / 1e6, tmp.name)
    return tmp.name


def _repo_url_from_refs(component: dict) -> Optional[str]:
    for ref in component.get("externalReferences", []) or []:
        if ref.get("type") == "vcs" and ref.get("url"):
            return ref["url"]
    return None


def _license_id(lib: dict) -> Optional[str]:
    lics = lib.get("licenses") or []
    if not lics:
        return None
    lic = (lics[0] or {}).get("license") or {}
    return lic.get("id") or None


def iter_rows(agg_path: str, repos_meta: Dict[str, dict], ingested_date: str,
              limit: Optional[int] = None) -> Iterator[dict]:
    """Stream the aggregate one repo at a time and yield exploded dependency rows."""
    import ijson  # imported here so --help works without the dep

    with gzip.open(agg_path, "rb") as gz:
        for repo_idx, comp in enumerate(ijson.items(gz, "components.item")):
            if limit is not None and repo_idx >= limit:
                break
            full = comp.get("name") or ""
            if "/" not in full:
                continue
            org, _, repo = full.partition("/")
            repo_url = _repo_url_from_refs(comp) or f"https://github.com/{full}"
            m = repos_meta.get(full.lower(), {})
            pushed_at = m.get("pushed_at")
            base_url = m.get("repo_url") or repo_url

            for lib in comp.get("components", []) or []:
                purl = lib.get("purl")
                if not purl:
                    continue
                parsed = parse_purl(purl)
                if parsed is None:
                    continue
                eco, pkg_name, purl_version = parsed
                # prefer the component.version field; fall back to the purl version
                raw_version = lib.get("version")
                if raw_version is None or raw_version == "":
                    raw_version = purl_version
                nv = normalize_version(eco, raw_version)
                yield {
                    "repo_full_name": full,
                    "org": org,
                    "repo": repo,
                    "repo_url": base_url,
                    "pushed_at": pushed_at,
                    "purl": purl if len(purl) <= 2048 else purl[:2048],
                    "ecosystem": eco,
                    "package_name": pkg_name,
                    "package_key": package_key(eco, pkg_name),
                    "version_raw": (raw_version or "")[:512],
                    "version_kind": nv["version_kind"],
                    "comparable": nv["comparable"],
                    "exact_scheme": nv["exact_scheme"],
                    "version_sort_key": nv["version_sort_key"],
                    "epoch": nv["epoch"],
                    "is_prerelease": nv["is_prerelease"],
                    "license_id": _license_id(lib),
                    "is_self_ref": eco == "github",
                    "is_action": eco == "githubactions",
                    "ingested_date": ingested_date,
                }


def write_ndjson(rows: Iterator[dict], out_path: str) -> dict:
    """Write rows to a gzipped NDJSON file; return summary stats."""
    stats = {"rows": 0, "repos": set(), "ecosystems": {}, "comparable": 0, "kinds": {}}
    with gzip.open(out_path, "wt", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, separators=(",", ":")))
            f.write("\n")
            stats["rows"] += 1
            stats["repos"].add(row["repo_full_name"])
            stats["ecosystems"][row["ecosystem"]] = stats["ecosystems"].get(row["ecosystem"], 0) + 1
            stats["kinds"][row["version_kind"]] = stats["kinds"].get(row["version_kind"], 0) + 1
            if row["comparable"]:
                stats["comparable"] += 1
    stats["repos"] = len(stats["repos"])
    return stats


# ───────────────────────────── BigQuery load + summaries ─────────────────────────────

def load_to_bigquery(project: str, dataset: str, bucket: str, ndjson_path: str,
                     ingested_date: str) -> None:
    from google.cloud import bigquery, storage

    bq = bigquery.Client(project=project)
    ds_ref = bigquery.DatasetReference(project, dataset)
    try:
        bq.get_dataset(ds_ref)
    except Exception:
        ds = bigquery.Dataset(ds_ref)
        ds.location = "US"
        bq.create_dataset(ds, exists_ok=True)
        logger.info("Created dataset %s.%s", project, dataset)

    # ensure the partitioned + clustered table exists
    table_id = f"{project}.{dataset}.{TABLE}"
    schema = [bigquery.SchemaField(f["name"], f["type"], mode=f["mode"]) for f in BQ_SCHEMA]
    table = bigquery.Table(table_id, schema=schema)
    table.time_partitioning = bigquery.TimePartitioning(
        type_=bigquery.TimePartitioningType.DAY,
        field="ingested_date",
        # keep ~10 days of partitions for cheap rollback + short trend history; old
        # partitions auto-expire so storage/cost stays bounded.
        expiration_ms=10 * 24 * 60 * 60 * 1000,
    )
    table.clustering_fields = ["ecosystem", "package_key"]
    bq.create_table(table, exists_ok=True)

    # stage to GCS
    date_compact = ingested_date.replace("-", "")
    blob_name = f"deps/staging/deps-{date_compact}.ndjson.gz"
    gcs = storage.Client(project=project)
    blob = gcs.bucket(bucket).blob(blob_name)
    logger.info("Uploading NDJSON to gs://%s/%s", bucket, blob_name)
    blob.upload_from_filename(ndjson_path, content_type="application/gzip")
    uri = f"gs://{bucket}/{blob_name}"

    # atomic per-partition load (WRITE_TRUNCATE replaces just this date partition)
    partition = f"{table_id}${date_compact}"
    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        ignore_unknown_values=False,
        max_bad_records=0,
    )
    # WRITE_TRUNCATE on the date partition makes same-day re-runs idempotent: the
    # partition is fully replaced, never appended/duplicated.
    logger.info("Loading %s -> %s (WRITE_TRUNCATE; idempotent per day)", uri, partition)
    job = bq.load_table_from_uri(uri, partition, job_config=job_config)
    job.result()
    loaded = bq.get_table(table_id).num_rows
    logger.info("Load complete. Table now has %s rows total.", loaded)

    refresh_views_and_summaries(bq, project, dataset, ingested_date)

    # Clean up the staging object so they don't accumulate (~tens of MB per run).
    try:
        blob.delete()
        logger.info("Deleted staging object gs://%s/%s", bucket, blob_name)
    except Exception as e:
        logger.warning("Could not delete staging object gs://%s/%s: %s", bucket, blob_name, e)


def refresh_views_and_summaries(bq, project: str, dataset: str, ingested_date: str) -> None:
    """Rebuild summary tables from the newly-loaded partition, then swap the served
    `current` view LAST so the primary query path is never half-updated.

    ingested_date is produced internally (datetime.strftime), never user input. A
    LITERAL date in the view is essential: a dynamic (SELECT MAX(...)) predicate
    cannot prune partitions, so it would scan every retained day; the literal prunes
    to exactly the latest partition.

    Ordering for crash-safety: the summary tables are built from the partition
    DIRECTLY (not via `current`), and `current` is repointed only after every
    summary succeeds. If any step fails, the exception propagates (the job fails and
    alerts) and `current` still points at the previous day's fully-consistent data —
    searchDependency never sees a half-swapped state. This is not a true multi-object
    transaction (BigQuery has none), but the primary path swaps atomically and last.
    """
    fq = f"`{project}.{dataset}`"
    # the new partition as a source expression (not the current view)
    src = f"(SELECT * FROM {fq}.{TABLE} WHERE ingested_date = DATE '{ingested_date}')"
    summary_statements = [
        # popularity (excludes self-refs and CI actions)
        f"""CREATE OR REPLACE TABLE {fq}.pkg_popularity
            CLUSTER BY ecosystem, package_key AS
            SELECT ecosystem, package_key,
                   ANY_VALUE(package_name) AS package_name,
                   COUNT(DISTINCT repo_full_name) AS repo_count,
                   COUNT(DISTINCT version_raw) AS version_count
            FROM {src}
            WHERE NOT is_self_ref AND NOT is_action
            GROUP BY ecosystem, package_key""",
        # license rollup
        f"""CREATE OR REPLACE TABLE {fq}.license_rollup AS
            SELECT ecosystem, IFNULL(license_id, 'UNKNOWN') AS license_id,
                   COUNT(DISTINCT repo_full_name) AS repo_count,
                   COUNT(*) AS occurrence_count
            FROM {src}
            WHERE NOT is_self_ref AND NOT is_action
            GROUP BY ecosystem, license_id""",
        # per-repo rollup + coverage
        f"""CREATE OR REPLACE TABLE {fq}.repos AS
            SELECT repo_full_name, ANY_VALUE(org) AS org, ANY_VALUE(repo) AS repo,
                   ANY_VALUE(repo_url) AS repo_url, ANY_VALUE(pushed_at) AS pushed_at,
                   COUNT(*) AS dep_count
            FROM {src}
            GROUP BY repo_full_name""",
        # per-repo listing table, clustered by repo so single-repo lookups stay cheap
        # (the fact table is clustered by (ecosystem, package_key), which does not
        # prune a repo-only filter).
        f"""CREATE OR REPLACE TABLE {fq}.dependencies_by_repo
            CLUSTER BY repo_full_name AS
            SELECT repo_full_name, ecosystem, package_name,
                   version_raw, version_kind, license_id
            FROM {src}""",
    ]
    for sql in summary_statements:
        logger.info("Refreshing summary: %s", sql.strip().split("\n")[0])
        bq.query(sql).result()
    # Swap the served view LAST (the only object searchDependency reads).
    view_sql = (
        f"CREATE OR REPLACE VIEW {fq}.current AS "
        f"SELECT * FROM {fq}.{TABLE} WHERE ingested_date = DATE '{ingested_date}'"
    )
    logger.info("Swapping current view -> %s", ingested_date)
    bq.query(view_sql).result()
    logger.info("Views and summary tables refreshed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-url", default=DEFAULT_SBOM_URL)
    parser.add_argument("--repos-url", default=DEFAULT_REPOS_URL)
    parser.add_argument("--project", default=os.getenv("GOOGLE_PROJECT_ID", "govreposcrape"))
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--ingested-date", default=None, help="YYYY-MM-DD (default: today UTC)")
    parser.add_argument("--limit", type=int, default=None, help="process first N repos only")
    parser.add_argument("--local-only", metavar="PATH", default=None,
                        help="write NDJSON to PATH and skip BigQuery")
    parser.add_argument("--dry-run", action="store_true", help="parse + stats only, no writes")
    parser.add_argument("--keep-ndjson", action="store_true")
    args = parser.parse_args()

    ingested_date = args.ingested_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # ingested_date is interpolated into DDL (partition decorator + literal-date view),
    # so enforce a strict YYYY-MM-DD shape — this also hardens the operator-only
    # --ingested-date flag against any injection-shaped value.
    try:
        datetime.strptime(ingested_date, "%Y-%m-%d")
    except ValueError:
        parser.error(f"--ingested-date must be YYYY-MM-DD, got {ingested_date!r}")
    start = time.time()
    logger.info("Build deps index: project=%s dataset=%s date=%s limit=%s",
                args.project, args.dataset, ingested_date, args.limit)

    repos_meta = fetch_repos_meta(args.repos_url)
    agg_path = download_aggregate(args.source_url)

    ndjson_path = args.local_only or tempfile.NamedTemporaryFile(
        prefix="deps-", suffix=".ndjson.gz", delete=False
    ).name

    try:
        rows = iter_rows(agg_path, repos_meta, ingested_date, limit=args.limit)
        if args.dry_run:
            # consume for stats without persisting
            stats = {"rows": 0}
            count = 0
            for _ in rows:
                count += 1
            stats["rows"] = count
        else:
            stats = write_ndjson(rows, ndjson_path)
        elapsed = time.time() - start
        logger.info("Parsed %s rows across %s repos in %.1fs",
                    stats["rows"], stats.get("repos", "?"), elapsed)
        if "ecosystems" in stats:
            top = sorted(stats["ecosystems"].items(), key=lambda kv: -kv[1])[:8]
            logger.info("Top ecosystems: %s", top)
            logger.info("Version kinds: %s", stats["kinds"])
            logger.info("Comparable rows: %s (%.1f%%)", stats["comparable"],
                        100.0 * stats["comparable"] / max(stats["rows"], 1))

        if args.dry_run or args.local_only:
            logger.info("Skipping BigQuery load (%s).",
                        "dry-run" if args.dry_run else f"wrote {ndjson_path}")
            return

        load_to_bigquery(args.project, args.dataset, args.bucket, ndjson_path, ingested_date)
        logger.info("Done in %.1fs", time.time() - start)
    except Exception as e:
        # Surface a clear cause and a non-zero exit so the scheduler/alerting fires.
        # On failure the served `current` view is left on the previous day's data.
        logger.error("Deps index build FAILED: %s: %s", type(e).__name__, e)
        raise
    finally:
        try:
            os.unlink(agg_path)
        except OSError:
            pass
        if not args.local_only and not args.keep_ndjson and not args.dry_run:
            try:
                os.unlink(ndjson_path)
            except OSError:
                pass


if __name__ == "__main__":
    main()
