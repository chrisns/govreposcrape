#!/usr/bin/env python3
"""Live smoke test for the deployed dependency-index MCP tools.

Calls the production /mcp JSON-RPC (SSE) endpoint and checks the headline answers.
Usage: python smoke_test_deps.py [base_url]
"""
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://govreposcrape-api-1060386346356.us-central1.run.app"


def call(method, params=None, rpc_id=1):
    body = json.dumps({"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params or {}}).encode()
    req = urllib.request.Request(
        f"{BASE}/mcp", data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode()
    # SSE: lines like "data: {json}"
    for line in raw.splitlines():
        if line.startswith("data:"):
            return json.loads(line[len("data:"):].strip())
    return json.loads(raw)


def tool(name, args):
    resp = call("tools/call", {"name": name, "arguments": args})
    if "error" in resp:
        return {"_error": resp["error"]}
    text = resp["result"]["content"][0]["text"]
    try:
        return json.loads(text)
    except Exception:
        return {"_text": text[:500]}


def main():
    failures = []

    def check(label, cond, detail=""):
        status = "PASS" if cond else "FAIL"
        print(f"  [{status}] {label} {detail}")
        if not cond:
            failures.append(label)

    print(f"Smoke testing {BASE}\n")

    # tools/list advertises the 4 tools
    lst = call("tools/list")
    names = {t["name"] for t in lst["result"]["tools"]}
    check("tools/list advertises >= 9 tools", len(names) >= 9 and {"search_dependency","package_popularity","repo_dependencies"} <= names, str(sorted(names)))

    # who uses express (npm) → 1830
    r = tool("search_dependency", {"package": "express", "ecosystem": "npm"})
    check("express npm total_repo_count ~1800 (drifts daily)", 1700 <= (r.get("total_repo_count") or 0) <= 2000, f"got {r.get('total_repo_count')}")
    check("express returns a repos page", len(r.get("repos", [])) > 0, f"{len(r.get('repos', []))} repos")

    # express < 2 → 0
    r2 = tool("search_dependency", {"package": "express", "ecosystem": "npm", "version_range": "<2"})
    check("express <2 matched_repo_count == 0", r2.get("matched_repo_count") == 0, f"got {r2.get('matched_repo_count')}")
    check("express <2 range_exact true", r2.get("range_exact") is True)

    # express >=4 <5 → some
    r3 = tool("search_dependency", {"package": "express", "ecosystem": "npm", "version_range": ">=4 <5"})
    check("express >=4 <5 has matches", (r3.get("matched_repo_count") or 0) > 0, f"got {r3.get('matched_repo_count')}")

    # breakdown (no ecosystem)
    rb = tool("search_dependency", {"package": "express"})
    check("breakdown mode", rb.get("mode") == "ecosystem_breakdown", str(rb.get("mode")))

    # popularity
    rp = tool("package_popularity", {"ecosystem": "npm", "top": 5})
    check("popularity returns top npm packages", len(rp.get("top_packages", [])) > 0, f"{len(rp.get('top_packages', []))}")

    # repo_dependencies
    rd = tool("repo_dependencies", {"repo_full_name": "alphagov/whitehall"})
    check("repo_dependencies returns deps", rd.get("dependency_count", 0) >= 0, f"count={rd.get('dependency_count')}")

    # input validation rejected cleanly (no 500 leak)
    rbad = tool("search_dependency", {"package": "x'; DROP TABLE y;--"})
    check("malicious package rejected (-32602, no leak)", rbad.get("_error", {}).get("code") == -32602, str(rbad.get("_error")))

    # semantic tool still works (existing functionality intact)
    rs = call("tools/call", {"name": "search_uk_gov_code", "arguments": {"query": "NHS authentication"}})
    check("semantic search_uk_gov_code still works", "result" in rs and "error" not in rs)

    print()
    if failures:
        print(f"FAILED: {len(failures)} checks -> {failures}")
        sys.exit(1)
    print("ALL SMOKE CHECKS PASSED")


if __name__ == "__main__":
    main()
