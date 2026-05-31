#!/usr/bin/env python3
"""Live smoke test for the #198 dependency-intelligence MCP tools."""
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://govreposcrape-api-1060386346356.us-central1.run.app"


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).encode()
    req = urllib.request.Request(f"{BASE}/mcp", data=body, headers={"Content-Type": "application/json"}, method="POST")
    txt = urllib.request.urlopen(req, timeout=40).read().decode()
    for line in txt.splitlines():
        if line.startswith("data:"):
            return json.loads(line[5:].strip())


def tool(name, args):
    r = rpc("tools/call", {"name": name, "arguments": args})
    if "error" in r:
        return {"_error": r["error"]}
    return json.loads(r["result"]["content"][0]["text"])


fails = []


def check(label, cond, detail=""):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(label)


print(f"Smoke testing #198 tools @ {BASE}\n")

tl = rpc("tools/list")
names = {t["name"] for t in tl["result"]["tools"]}
check("tools/list has all 9 tools", len(names) == 9, str(sorted(names)))

print("\n-- vulnerability_exposure (live OSV.dev) --")
r = tool("vulnerability_exposure", {"package": "log4j-core", "ecosystem": "maven"})
# bare 'log4j-core' won't match (maven keyed by group/artifact) — expect 0; verifies graceful handling
check("vuln_exposure responds for bare maven name (expect 0)", "vulnerable_versions" in r, f"vv={r.get('vulnerable_versions')}")

r = tool("vulnerability_exposure", {"package": "org.apache.logging.log4j/log4j-core", "ecosystem": "maven"})
check("log4j-core (full coord) finds vulnerable versions", (r.get("vulnerable_versions") or 0) > 0,
      f"{r.get('vulnerable_versions')} vulnerable versions; osv_available={r.get('osv_available')}")
if r.get("findings"):
    f0 = r["findings"][0]
    cves = [v.get("cve") for v in f0.get("vulnerabilities", []) if v.get("cve")]
    check("findings include CVE ids", len(cves) > 0, f"e.g. {f0['version']} -> {cves[:3]}")

r = tool("vulnerability_exposure", {"package": "express", "ecosystem": "npm"})
check("express npm vuln scan returns (osv up)", r.get("osv_available") is True, f"vv={r.get('vulnerable_versions')}")

print("\n-- dependency_landscape --")
r = tool("dependency_landscape", {"org": "alphagov"})
check("alphagov landscape has repos + ecosystems", (r.get("repo_count") or 0) > 0 and len(r.get("ecosystems", [])) > 0,
      f"repos={r.get('repo_count')}, ecos={[e['ecosystem'] for e in r.get('ecosystems', [])][:5]}")
check("landscape has licence summary", "licence_summary" in r, f"copyleft={r.get('licence_summary', {}).get('copyleft_occurrences')}")
eol = r.get("eol_frameworks", [])
print(f"     EOL frameworks: {[(e['package'], e['version']) for e in eol[:3]]}")

print("\n-- dependency_compare --")
r = tool("dependency_compare", {"repo_a": "alphagov/govuk-frontend", "repo_b": "alphagov/whitehall"})
check("compare returns overlap + shared", "overlap_pct" in r and "shared_count" in r,
      f"overlap={r.get('overlap_pct')}% shared={r.get('shared_count')}")

print("\n-- sbom_export --")
r = tool("sbom_export", {"repo_full_name": "alphagov/whitehall"})
check("sbom_export has source URL + counts", "/sbom/alphagov/whitehall.json.gz" in (r.get("sbom_source_url") or ""),
      f"deps={r.get('dependency_count')}, ecos={list((r.get('by_ecosystem') or {}).keys())}")

print("\n-- dependency_trends --")
r = tool("dependency_trends", {"package": "express", "ecosystem": "npm"})
check("trends returns snapshots", "snapshots" in r, f"{len(r.get('snapshots', []))} snapshot(s): {r.get('snapshots')}")

print("\n-- input validation --")
r = tool("vulnerability_exposure", {})
check("vuln_exposure requires a scope (-32602)", r.get("_error", {}).get("code") == -32602)
r = tool("dependency_landscape", {"org": "../etc"})
check("landscape rejects bad org (-32602)", r.get("_error", {}).get("code") == -32602)

print()
if fails:
    print(f"FAILED: {fails}")
    sys.exit(1)
print("ALL #198 SMOKE CHECKS PASSED")
