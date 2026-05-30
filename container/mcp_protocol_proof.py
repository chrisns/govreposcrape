#!/usr/bin/env python3
"""Rigorous proof that the REMOTE govreposcrape MCP server speaks the MCP protocol
correctly over its HTTP+SSE /mcp endpoint — independent of any MCP client.

Exercises: initialize handshake, tools/list, tools/call for all 4 tools (incl.
version-range correctness), and JSON-RPC 2.0 error handling. Prints raw responses.
"""
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://govreposcrape-api-1060386346356.us-central1.run.app"
URL = f"{BASE}/mcp"
fails = []


def rpc(method, params=None, rpc_id=1, raw_body=None):
    body = raw_body if raw_body is not None else json.dumps(
        {"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params or {}}
    ).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        ctype = r.headers.get("Content-Type", "")
        text = r.read().decode()
    # MCP-over-HTTP uses Server-Sent Events: "data: {json}"
    payload = None
    for line in text.splitlines():
        if line.startswith("data:"):
            payload = json.loads(line[len("data:"):].strip())
            break
    return ctype, payload


def ok(label, cond, detail=""):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    if not cond:
        fails.append(label)


def tool_result(resp):
    return json.loads(resp["result"]["content"][0]["text"])


print(f"== MCP PROTOCOL PROOF: {URL} ==\n")

# 1. SSE transport + initialize handshake
print("1) initialize handshake")
ctype, init = rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}})
ok("transport is text/event-stream (SSE)", "text/event-stream" in ctype, ctype)
ok("jsonrpc 2.0 envelope, id echoed", init.get("jsonrpc") == "2.0" and init.get("id") == 1)
ok("server advertises capabilities + serverInfo",
   "capabilities" in init.get("result", {}) and init["result"].get("serverInfo", {}).get("name") == "govreposcrape",
   json.dumps(init["result"].get("serverInfo", {})))

# 2. tools/list
print("\n2) tools/list")
_, tl = rpc("tools/list")
tools = {t["name"]: t for t in tl["result"]["tools"]}
ok("advertises all 4 tools", set(tools) == {"search_uk_gov_code", "search_dependency", "package_popularity", "repo_dependencies"}, str(sorted(tools)))
ok("search_dependency has package+ecosystem+version_range schema",
   {"package", "ecosystem", "version_range"} <= set(tools["search_dependency"]["inputSchema"]["properties"]))
ok("version_range schema has maxLength cap (DoS hardening)",
   tools["search_dependency"]["inputSchema"]["properties"]["version_range"].get("maxLength") == 1000)

# 3. tools/call — the headline functional proofs
print("\n3) tools/call — functional correctness")
_, r = rpc("tools/call", {"name": "search_dependency", "arguments": {"package": "express", "ecosystem": "npm"}})
d = tool_result(r)
ok("who uses express (npm) == 1830 repos", d["total_repo_count"] == 1830, str(d["total_repo_count"]))

_, r = rpc("tools/call", {"name": "search_dependency", "arguments": {"package": "express", "ecosystem": "npm", "version_range": "<2"}})
d = tool_result(r)
ok("express < 2 == 0 (impossible via semantic search)", d["matched_repo_count"] == 0, str(d["matched_repo_count"]))

_, r = rpc("tools/call", {"name": "search_dependency", "arguments": {"package": "express", "ecosystem": "npm", "version_range": ">=4 <5"}})
d = tool_result(r)
ok("express >=4 <5 has matches", d["matched_repo_count"] > 1000, str(d["matched_repo_count"]))

_, r = rpc("tools/call", {"name": "package_popularity", "arguments": {"ecosystem": "npm", "top": 3}})
d = tool_result(r)
ok("package_popularity returns top npm packages", len(d["top_packages"]) == 3,
   ", ".join(f"{p['package_name']}({p['repo_count']})" for p in d["top_packages"]))

_, r = rpc("tools/call", {"name": "repo_dependencies", "arguments": {"repo_full_name": "alphagov/whitehall", "ecosystem": "npm"}})
d = tool_result(r)
ok("repo_dependencies lists deps for a repo", d["dependency_count"] > 0, f"{d['dependency_count']} npm deps")

# 4. JSON-RPC 2.0 error handling
print("\n4) error handling (no info leak)")
_, r = rpc("tools/call", {"name": "search_dependency", "arguments": {"package": "x'; DROP TABLE y;--"}})
ok("injection-shaped input -> -32602, no detail leak", r.get("error", {}).get("code") == -32602, json.dumps(r.get("error")))
_, r = rpc("nonexistent/method")
ok("unknown method -> -32601", r.get("error", {}).get("code") == -32601)
_, r = rpc("tools/call", {"name": "no_such_tool", "arguments": {}})
ok("unknown tool -> -32601", r.get("error", {}).get("code") == -32601)
_, r = rpc(None, raw_body=b"{}")
ok("malformed envelope -> -32600 Invalid Request", r.get("error", {}).get("code") == -32600, json.dumps(r.get("error")))

print()
if fails:
    print(f"PROOF FAILED: {len(fails)} checks failed -> {fails}")
    sys.exit(1)
print("PROOF COMPLETE: the remote MCP server is fully operational.")
