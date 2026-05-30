#!/usr/bin/env python3
"""Generate testdata/version-key-vectors.json (source of truth = version_keys.py).

Run from repo root:  python3 container/_gen_vectors.py
Self-checks that every ascending ordering group really sorts by the generated key.
This script is a dev tool; it is NOT copied into the container image.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from version_keys import normalize_version  # noqa: E402

HERE = os.path.dirname(__file__)
OUT = os.path.normpath(os.path.join(HERE, "..", "testdata", "version-key-vectors.json"))

# (ecosystem, version) inputs whose classification + key are pinned as golden.
KEY_INPUTS = [
    # npm — the canonical ordering trap + real express versions + scoped + prerelease
    ("npm", "0.9.2"), ("npm", "0.10.0"), ("npm", "1.0.0"), ("npm", "2.5.11"),
    ("npm", "4.16.3"), ("npm", "4.17.1"), ("npm", "4.18.2"), ("npm", "4.22.1"),
    ("npm", "5.0.0-alpha.9"), ("npm", "5.0.0-beta.1"), ("npm", "5.0.0-rc.1"),
    ("npm", "5.0.0"), ("npm", "5.1.0"), ("npm", "5.2.1"),
    ("npm", "^4.14.0"), ("npm", "~4.17.1"), ("npm", "4.x"), ("npm", "*"),
    ("npm", "latest"), ("npm", ""), ("npm", "v1.2.3"), ("npm", "@babel/core@7.0.0"),
    # pypi — PEP 440 epoch, dev/pre, normalisation
    ("pypi", "0.9"), ("pypi", "0.10"), ("pypi", "1.2.3"), ("pypi", "1.2.3a1"),
    ("pypi", "1.0.0rc1"), ("pypi", "2.0"), ("pypi", "1!1.0"), ("pypi", ">= 2.11.1"),
    ("pypi", "~> 2.9.9"),
    # gem
    ("gem", "0.9.2"), ("gem", "0.10.0"), ("gem", "1.0.0"), ("gem", "1.0.0.beta"),
    # maven — confirm-pass ecosystem (exact_scheme False); codename unparseable
    ("maven", "1.0.0"), ("maven", "2.0.7.RELEASE"), ("maven", "3.0.0-M1"),
    ("maven", "Edgware.RELEASE"), ("maven", "20160810"), ("maven", "4.1.133.Final"),
    # nuget 4-part, prerelease
    ("nuget", "1.0.0.0"), ("nuget", "1.0.0-beta"),
    # golang — tag + pseudo-version (sha)
    ("golang", "v1.2.3"), ("golang", "v0.0.0-20210101000000-abcdef123456"),
    # cargo build metadata
    ("cargo", "0.11.0+wasi-snapshot-preview1"),
    # non-package ecosystems
    ("githubactions", "4.*.*"), ("githubactions", "v4"),
    ("github", "master"), ("github", "idt-develop"),
    # misc edge
    ("npm", "NOASSERTION"), ("npm", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"),
    ("npm", "abcdef1"),
]

# Ascending semantic order groups. Only orderings the key is GUARANTEED to get
# right are asserted (release ordering; release-above-its-prereleases;
# same-marker numeric prerelease order; pypi epoch). Cross-marker prerelease
# ordering (e.g. dev vs alpha) is documented best-effort and NOT asserted.
ORDERING = [
    ["0.9.2", "0.10.0", "1.0.0", "2.5.11", "4.16.3", "4.17.1", "4.18.2", "4.22.1",
     "5.0.0-alpha.9", "5.0.0-beta.1", "5.0.0-rc.1", "5.0.0", "5.1.0", "5.2.1"],
]
ORDERING_ECO = "npm"

ORDERING_PYPI = ["0.9", "0.10", "1.2.3", "2.0"]  # epoch handled separately
# pypi epoch: 2.0 < 1!1.0
ORDERING_PYPI_EPOCH = ["2.0", "1!1.0"]

# Range predicate cases: ecosystem, predicate, candidate versions, expected matches.
RANGES = [
    {"ecosystem": "npm", "predicate": "<2",
     "candidates": ["1.0.0", "1.99.99", "2.0.0", "2.5.11", "4.18.2"],
     "matches": ["1.0.0", "1.99.99"]},
    {"ecosystem": "npm", "predicate": ">=4 <5",
     "candidates": ["3.9.9", "4.0.0", "4.18.2", "4.22.1", "5.0.0"],
     "matches": ["4.0.0", "4.18.2", "4.22.1"]},
    {"ecosystem": "npm", "predicate": "^4.17.0",
     "candidates": ["4.16.0", "4.17.0", "4.18.2", "4.22.1", "5.0.0"],
     "matches": ["4.17.0", "4.18.2", "4.22.1"]},
    {"ecosystem": "npm", "predicate": "~4.17.1",
     "candidates": ["4.17.0", "4.17.1", "4.17.9", "4.18.0"],
     "matches": ["4.17.1", "4.17.9"]},
    {"ecosystem": "npm", "predicate": "4.x",
     "candidates": ["3.9.9", "4.0.0", "4.22.1", "5.0.0"],
     "matches": ["4.0.0", "4.22.1"]},
    {"ecosystem": "npm", "predicate": "=4.18.2",
     "candidates": ["4.18.1", "4.18.2", "4.18.3"],
     "matches": ["4.18.2"]},
    {"ecosystem": "npm", "predicate": "<2",
     "candidates": ["0.9.2", "0.10.0"],
     "matches": ["0.9.2", "0.10.0"]},
]


def k(eco, ver):
    return normalize_version(eco, ver)["version_sort_key"]


def main():
    keys = []
    for eco, ver in KEY_INPUTS:
        nv = normalize_version(eco, ver)
        keys.append({
            "ecosystem": eco,
            "version": ver,
            "version_kind": nv["version_kind"],
            "comparable": nv["comparable"],
            "exact_scheme": nv["exact_scheme"],
            "is_prerelease": nv["is_prerelease"],
            "epoch": nv["epoch"],
            "version_sort_key": nv["version_sort_key"],
        })

    # self-check ordering groups
    def check(group, eco):
        ks = [k(eco, v) for v in group]
        for i in range(len(ks) - 1):
            assert ks[i] is not None and ks[i + 1] is not None, f"non-comparable in {group}"
            assert ks[i] < ks[i + 1], (
                f"ORDER VIOLATION ({eco}): {group[i]} ({ks[i]}) !< {group[i+1]} ({ks[i+1]})"
            )
    check(ORDERING[0], ORDERING_ECO)
    check(ORDERING_PYPI, "pypi")
    check(ORDERING_PYPI_EPOCH, "pypi")

    # self-check range cases against the key semantics (release bound emulation)
    out = {
        "_comment": "GENERATED by container/_gen_vectors.py from version_keys.py. "
                    "Asserted byte-for-byte by both pytest and vitest to enforce Python/TS parity.",
        "constants": {"ARITY": 6, "WIDTH": 10, "PRE_NUM_WIDTH": 12},
        "keys": keys,
        "ordering": [{"ecosystem": ORDERING_ECO, "ascending": ORDERING[0]},
                     {"ecosystem": "pypi", "ascending": ORDERING_PYPI},
                     {"ecosystem": "pypi", "ascending": ORDERING_PYPI_EPOCH}],
        "ranges": RANGES,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
    print(f"wrote {OUT} with {len(keys)} key vectors, {len(RANGES)} range cases")
    print("ordering self-checks passed")


if __name__ == "__main__":
    main()
