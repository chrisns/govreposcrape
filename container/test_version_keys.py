"""Tests for version_keys.py — asserts the committed golden vectors match the code
(guaranteeing the testdata stays in sync, which is what the TS suite also asserts,
giving cross-language parity) plus PURL parsing and ordering."""
import json
import os

import pytest

from version_keys import normalize_version, parse_purl, package_key, build_sort_key

VECTORS = json.load(
    open(os.path.join(os.path.dirname(__file__), "..", "testdata", "version-key-vectors.json"))
)


@pytest.mark.parametrize("v", VECTORS["keys"], ids=lambda v: f'{v["ecosystem"]}:{v["version"]}')
def test_key_vectors_match_code(v):
    nv = normalize_version(v["ecosystem"], v["version"])
    assert nv["version_sort_key"] == v["version_sort_key"]
    assert nv["version_kind"] == v["version_kind"]
    assert nv["comparable"] == v["comparable"]
    assert nv["exact_scheme"] == v["exact_scheme"]
    assert nv["is_prerelease"] == v["is_prerelease"]
    assert nv["epoch"] == v["epoch"]


@pytest.mark.parametrize("group", VECTORS["ordering"], ids=lambda g: g["ecosystem"])
def test_ordering(group):
    keys = [normalize_version(group["ecosystem"], v)["version_sort_key"] for v in group["ascending"]]
    for i in range(len(keys) - 1):
        assert keys[i] is not None and keys[i + 1] is not None
        assert keys[i] < keys[i + 1], f'{group["ascending"][i]} !< {group["ascending"][i+1]}'


def test_canonical_ordering_trap():
    a = normalize_version("npm", "0.9.2")["version_sort_key"]
    b = normalize_version("npm", "0.10.0")["version_sort_key"]
    assert a < b  # the bug a naive string compare would get wrong


def test_release_above_prerelease():
    rel = normalize_version("npm", "5.0.0")["version_sort_key"]
    pre = normalize_version("npm", "5.0.0-rc.1")["version_sort_key"]
    assert pre < rel


def test_pypi_epoch_dominates():
    assert normalize_version("pypi", "2.0")["version_sort_key"] < normalize_version("pypi", "1!1.0")["version_sort_key"]


@pytest.mark.parametrize(
    "purl,expected",
    [
        ("pkg:npm/express@4.18.2", ("npm", "express", "4.18.2")),
        ("pkg:npm/%40babel/code-frame@7.23.4", ("npm", "@babel/code-frame", "7.23.4")),
        ("pkg:npm/express@%5E4.14.0", ("npm", "express", "^4.14.0")),
        ("pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1",
         ("maven", "org.apache.logging.log4j/log4j-core", "2.14.1")),
        ("pkg:gem/rake", ("gem", "rake", "")),
        ("pkg:githubactions/actions/checkout@4.%2A.%2A", ("githubactions", "actions/checkout", "4.*.*")),
    ],
)
def test_parse_purl(purl, expected):
    assert parse_purl(purl) == expected


def test_parse_purl_rejects_non_purl():
    assert parse_purl("not-a-purl") is None
    assert parse_purl("") is None


def test_package_key():
    assert package_key("npm", "@Babel/Core") == "@babel/core"
    assert package_key("pypi", "Flask_SQLAlchemy") == "flask-sqlalchemy"
    assert package_key("pypi", "zope.interface") == "zope-interface"


def test_build_sort_key_clamps_huge_segment():
    # huge segment must not overflow; clamps identically to TS
    k = build_sort_key(0, [10 ** 12], False, [])
    assert "9999999999" in k
