"""
Canonical, self-contained version normalisation for the SBOM dependency index.

╔══════════════════════════════════════════════════════════════════════════╗
║  PARITY CONTRACT                                                          ║
║  This module MUST produce byte-identical sort keys and identical          ║
║  classification to api/src/services/versionKeys.ts. Both are validated    ║
║  against the shared golden vectors in testdata/version-key-vectors.json.  ║
║  Never change one side without the other and without extending vectors.   ║
╚══════════════════════════════════════════════════════════════════════════╝

A *sort key* is an ASCII string whose lexicographic (Unicode code point)
ordering equals the semantic ordering of release versions. Because BigQuery,
Python and JavaScript all compare ASCII strings by code point, the same key
orders identically in all three. Range predicates therefore become plain
string range scans in BigQuery (``WHERE version_sort_key >= @lo AND < @hi``)
with no UDF and no IEEE-754 precision ceiling.

Design notes:
  * Fixed arity / fixed width zero-padding makes release segments compare
    numerically under lexicographic ordering (0.9.2 < 0.10.0).
  * A release sorts ABOVE all of its prereleases: release discriminator is
    '~' (0x7E, highest printable used here); prerelease discriminator starts
    with '-' (0x2D, below digits) so prereleases sort first.
  * Epoch (PEP 440) is a zero-padded prefix so 1!1.0 > 2.0.
  * We deliberately hand-roll a simple parser in BOTH languages rather than
    trust two different third-party libraries to agree byte-for-byte.
"""
from __future__ import annotations

import re
from urllib.parse import unquote

# --- canonical constants (MUST match versionKeys.ts) ---
ARITY = 6          # number of release segments encoded
WIDTH = 10         # zero-pad width per release segment (covers CalVer / epoch-seconds)
SEG_MAX = 10 ** WIDTH - 1
PRE_NUM_WIDTH = 12  # zero-pad width for numeric prerelease identifiers

# Ecosystems whose numeric-dotted release strings compare exactly via the key.
EXACT_SCHEMES = frozenset(
    {"npm", "pypi", "gem", "cargo", "golang", "nuget", "composer", "pub", "swift"}
)
# Ecosystems that are not real installable package releases (self-ref / CI actions).
NON_PACKAGE_ECOSYSTEMS = frozenset({"github", "githubactions"})

_RANGE_PREFIX = ("^", "~", ">", "<")
_GO_PSEUDO_RE = re.compile(r"-\d{12,14}-[0-9a-f]{12}$")
_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,40}$")
_LEADING_NUM_RE = re.compile(r"^(\d+(?:\.\d+)*)")
_PRE_SPLIT_RE = re.compile(r"[.\-_]")


def _result(kind, comparable, exact_scheme, is_prerelease=False, epoch=0, sort_key=None):
    return {
        "version_kind": kind,
        "comparable": comparable,
        "exact_scheme": exact_scheme,
        "is_prerelease": is_prerelease,
        "epoch": epoch,
        "version_sort_key": sort_key,
    }


def _is_range_or_wildcard(v: str) -> bool:
    s = v.strip()
    if s.startswith("="):
        s = s[1:].strip()
    if not s:
        return False
    if s[0] in _RANGE_PREFIX:
        return True
    if "||" in v or "," in v or " - " in v:
        return True
    if "*" in s:
        return True
    for seg in _PRE_SPLIT_RE.split(s):
        if seg in ("x", "X"):
            return True
    return False


def _is_sha(v: str) -> bool:
    if _GO_PSEUDO_RE.search(v):
        return True
    if v.isdigit():
        return False  # pure-digit is CalVer, comparable
    return bool(_SHA_RE.match(v))


def _split_pre(s: str):
    return [t.lower() for t in _PRE_SPLIT_RE.split(s) if t != ""]


def _parse_semver_family(v: str):
    core = v.split("+", 1)[0]
    rel, dash, pre = core.partition("-")
    release = []
    for seg in rel.split("."):
        if not seg.isdigit():
            return None
        release.append(int(seg))
    if not release:
        return None
    is_pre = bool(dash) and pre != ""
    return 0, release, is_pre, (_split_pre(pre) if is_pre else [])


def _parse_pypi(v: str):
    s = v.lower().strip()
    epoch = 0
    if "!" in s:
        e, _, s = s.partition("!")
        epoch = int(e) if e.isdigit() else 0
    s = s.split("+", 1)[0]
    m = _LEADING_NUM_RE.match(s)
    if not m:
        return None
    release = [int(x) for x in m.group(1).split(".")]
    rest = s[m.end():]
    is_pre = False
    pre_tags = []
    if rest and re.match(r"^[._-]?(a|b|c|rc|alpha|beta|pre|preview|dev)", rest):
        is_pre = True
        pre_tags = _split_pre(rest)
    # .postN / unknown trailing -> treated as release (not prerelease)
    return epoch, release, is_pre, pre_tags


def _parse_gem(v: str):
    release = []
    pre_segs = []
    is_pre = False
    for seg in v.split("."):
        if seg.isdigit() and not is_pre:
            release.append(int(seg))
        else:
            is_pre = True
            pre_segs.append(seg)
    if not release:
        return None
    pre_tags = _split_pre(".".join(pre_segs)) if pre_segs else []
    return 0, release, is_pre, pre_tags


def _parse_maven(v: str):
    m = _LEADING_NUM_RE.match(v)
    if not m:
        return None  # codename like Edgware.RELEASE
    release = [int(x) for x in m.group(1).split(".")]
    rest = v[m.end():].lower()
    is_pre = bool(re.search(r"(alpha|beta|rc|m\d|snapshot|cr\d|milestone|preview)", rest))
    return 0, release, is_pre, (_split_pre(rest) if is_pre else [])


def _parse_version(eco: str, v: str):
    if eco in ("npm", "cargo", "golang", "nuget", "composer", "pub", "swift"):
        return _parse_semver_family(v)
    if eco == "pypi":
        return _parse_pypi(v)
    if eco == "gem":
        return _parse_gem(v)
    if eco == "maven":
        return _parse_maven(v)
    # unknown ecosystem: try semver family then pypi-style leading numeric
    parsed = _parse_semver_family(v)
    if parsed is not None:
        return parsed
    return _parse_pypi(v)


def build_sort_key(epoch: int, release, is_prerelease: bool, pre_tags) -> str:
    epoch_part = str(min(max(epoch, 0), 9999)).zfill(4)
    segs = []
    for i in range(ARITY):
        val = release[i] if i < len(release) else 0
        val = min(max(val, 0), SEG_MAX)
        segs.append(str(val).zfill(WIDTH))
    release_part = ".".join(segs)
    if not is_prerelease:
        disc = "~"
    else:
        norm = []
        for t in pre_tags:
            if t.isdigit():
                norm.append("0" + t.zfill(PRE_NUM_WIDTH))
            else:
                norm.append("1" + t)
        disc = "-" + ".".join(norm) if norm else "-"
    return f"{epoch_part}!{release_part}.{disc}"


def normalize_version(ecosystem: str, raw_version) -> dict:
    """Classify and (where comparable) build the sort key for one version string.

    ``ecosystem`` is the PURL type (npm, pypi, ...). ``raw_version`` should be the
    already %-decoded version; we defensively decode again (idempotent).
    """
    eco = (ecosystem or "").lower()
    exact_scheme = eco in EXACT_SCHEMES
    v = unquote(raw_version if raw_version is not None else "").strip()

    if v == "":
        return _result("empty", False, exact_scheme)
    if eco == "github":
        return _result("branch", False, False)
    if eco == "githubactions":
        kind = "wildcard" if _is_range_or_wildcard(v) else "branch"
        return _result(kind, False, False)
    if _is_range_or_wildcard(v):
        return _result("range", False, exact_scheme)

    vv = v
    if len(vv) > 1 and vv[0] in ("v", "V") and vv[1].isdigit():
        vv = vv[1:]
    if vv.startswith("="):
        vv = vv[1:].strip()

    if _is_sha(vv):
        return _result("sha", False, exact_scheme)

    parsed = _parse_version(eco, vv)
    if parsed is None:
        return _result("unparseable", False, exact_scheme)

    epoch, release, is_pre, pre_tags = parsed
    key = build_sort_key(epoch, release, is_pre, pre_tags)
    return _result(
        "prerelease" if is_pre else "release",
        True,
        exact_scheme,
        is_prerelease=is_pre,
        epoch=epoch,
        sort_key=key,
    )


def parse_purl(purl: str):
    """Parse a (possibly %-encoded) PURL into (ecosystem, package_name, version).

    pkg:<type>/<namespace>/<name>@<version>?<qualifiers>#<subpath>
    Returns decoded components. version may be '' when absent.
    """
    if not purl or not purl.startswith("pkg:"):
        return None
    body = purl[4:]
    # strip qualifiers / subpath
    body = body.split("#", 1)[0].split("?", 1)[0]
    # version follows the last '@'; encoded scoped names use %40 so contain no literal '@'
    head, sep, tail = body.rpartition("@")
    if sep:
        name_part, version = head, tail
    else:
        name_part, version = tail, ""
    eco, _, ns_name = name_part.partition("/")
    eco = unquote(eco).lower()
    package_name = unquote(ns_name)
    version = unquote(version)
    return eco, package_name, version


def package_key(ecosystem: str, package_name: str) -> str:
    """Canonical match key for a package within an ecosystem.

    npm: lowercase (scoped names kept). pypi: PEP 503 normalisation
    (lowercase, runs of [._-] -> '-'). Others: lowercase.
    """
    eco = (ecosystem or "").lower()
    name = package_name or ""
    if eco == "pypi":
        return re.sub(r"[-_.]+", "-", name).lower()
    return name.lower()
