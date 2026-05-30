# Structured Dependency Index over the Aggregate SBOM

**Project:** govreposcrape · **Date:** 2026-05-30 · **Status:** Implementation-ready design

> How to use the scraper's new aggregate SBOM to answer structured dependency
> questions through the MCP API — "who's using expressjs", "who's running
> express < 2", package popularity, license rollups, per-repo dependency lists —
> alongside (not replacing) the existing Vertex AI Search semantic tool.

---

## Implementation status (as-built, 2026-05-30)

**Built, tested, security-reviewed, and deployed.** The design below is the plan; the
shipped implementation deviates in three deliberate ways, all driven by measured behaviour:

1. **Range evaluation is app-side in JS, not a BigQuery `version_sort_key` range scan.**
   On the real (small, ~922 MB) table, BigQuery clusters into coarse blocks, so scanning the
   fat `version_sort_key` column for a range cost ~384 MB/query while fetching just
   `(repo_full_name, version_raw)` costs ~41 MB. The query service therefore fetches the
   minimal columns (cluster-pruned) and runs classification + range matching + ranking in JS
   using the **same golden-tested `versionKeys.ts`** logic — cheaper, and it removes the
   BigQuery-side version-comparison dependency entirely. `version_sort_key` is still stored
   (analytics) but unread on the hot path. (`maximumBytesBilled` is enforced against BigQuery's
   pre-flight *estimate*, ~208–230 MB; actual billed is ~10–41 MB.)
2. **An in-process TTL response cache + per-IP rate limiter** were added (the design's §7/§8
   backstops). Cache: 5-min TTL, compute-once-per-package then paginate from cache. Rate limit:
   per-IP sliding window on `/mcp` + `/mcp/search`. Cloud Armor + a BigQuery daily-bytes quota
   remain the recommended edge backstops.
3. **The served `current` view uses a literal date** (refreshed each load) so BigQuery prunes
   partitions; summary tables are rebuilt from the new partition and the view is swapped **last**
   so the primary query path is never half-updated.

**Real numbers (full parse, live index):** 2,906,144 rows across 15,578 repos; `express` used by
**1,830** repos; `express < 2` → **0** (proven live). An aggressive adversarial security + functional
review (33 agents) found 18 defects; all were fixed and re-verified to **zero residual defects**.
Tools, schema, ingestion, MCP wiring: `api/src/services/{versionKeys,depsQueryService}.ts`,
`api/src/controllers/mcpController.ts`, `api/src/middleware/rateLimit.ts`,
`container/{version_keys,build_deps_index}.py`, `container/deploy-deps-index.sh`.

---

## 0. Ground truth (full parse of the real `sbom.json`)

These numbers come from a **full streaming parse of the entire 412.9 MB** aggregate
(`https://uk-x-gov-software-community.github.io/xgov-opensource-repo-scraper/sbom.json`,
49 MB gzipped), not a sample. They shape every decision below.

| Fact | Value | Why it matters |
|---|---|---|
| Format | **CycloneDX 1.5**, exactly 2 levels deep | repos → libraries; non-recursive double-loop captures everything (the per-repo files the code uses today are SPDX 2.3) |
| Repos in aggregate | **15,594** (NOT ~24,500) | Only repos with a generatable SBOM. ~9k feed repos absent → "no result" ≠ "no dependency" |
| Exploded `(repo, library)` rows | **2,906,144** | Tiny for BigQuery; full daily reload is cents/seconds |
| Avg deps/repo | 186 (max 12,803) | — |
| Repos > 100 deps | **3,698 (24%)** | Exactly the repos the current `deps[:100]` cap silently truncates today |
| `purl` present | **100%** of rows | Authoritative key; no name-inference needed |
| Percent-encoded purls | **583,341 (~20%)** | `%40`→`@` (scoped npm), `%5E`→`^`, `%2A`→`*` — **must `unquote` before parsing** |
| Ecosystems | npm **89.4%**, gem 3.1%, pypi 2.6%, maven 1.2%, nuget 1.0%, githubactions 1.0%, golang 0.6%, github(self-ref) 0.5%, composer 0.3%, cargo 0.24% | Getting **npm semver** right covers ~90% of value |
| `bom-ref` / transitive graph / multi-license | **none** | No `$ref` indirection to resolve; license = `licenses[0].license.id` |
| Messy "versions" | 35,042 ranges/wildcards-as-version (16,670 `^`/`~`), 12,484 empty, 8,961 prerelease, 8,479 SHA/opaque; **0 NOASSERTION** | A real minority of "versions" are ranges/branches/SHAs → must be quarantined, not string-compared |

**Express validation (the headline queries, against real data):**
`pkg:npm/express` is used by **1,830 distinct repos**, 71 version strings. Top: 4.22.1 (288),
5.2.1 (280), 4.21.2 (268), 4.17.1 (252), 4.18.2 (233). **Zero** instances have major < 2
(lowest concrete is `2.5.11`, 6 repos). So **"express < 2" correctly returns ∅** — and 54 repos
declare `^4.14.0` (decoded from `%5E4.14.0`), which must be excluded as a declared *range*, not
mis-counted. A naive string compare would falsely match `1.x`-looking substrings; this design cannot.

---

## 1. TL;DR recommendation

**Build a BigQuery-native exploded dependency index with persisted, ecosystem-aware *string* sort keys, served by three new MCP tools on the existing TS/Express server.** A daily Cloud Run Job step streams the 49 MB gzip CycloneDX aggregate, explodes it into ~2.9 M flat `(repo, library)` rows, and persists per-row a `version_sort_key` (zero-padded *string*, never a packed float), a `version_kind` enum, and a `comparable` flag. "Who uses express" becomes a clustered `GROUP BY` returning the exhaustive 1,830-repo set; "express < 2" becomes a parameterised sort-key range scan returning the correct empty set.

**Why BigQuery wins:** top score on every lens that matters — correctness (no IEEE-754 ceiling on a string key), cost/ops (the *only* engine with a native hard per-query cap via `maximumBytesBilled`, plus zero-touch serverless refresh), stack-fit (pure-JS `@google-cloud/bigquery`, no native addon on the Node-24/musl image), and build-effort (no embedded-artifact lifecycle to stand up). DuckDB and SQLite tie on correctness but each forces a native addon + a 50–200 MB artifact into the verified **512 Mi** API service and a bespoke daily hot-swap the git-push-only deploy pipeline lacks. Vertex-structured is disqualified for this job: a packed-double version key loses precision below the major segment, and exhaustive listing fights a ranked-retrieval product with deep-pagination ceilings.

Grafted best ideas: **string** sort key, `comparable`/`version_kind` quarantine with an honest excluded-denominator, an `exact_scheme` flag routing the confirm-pass, `is_self_ref`/`is_action` exclusion flags, materialised summary tables, and a disciplined **three-tool** surface.

---

## 2. Data model

One BigQuery dataset `govreposcrape_deps`, one fact table, two summary tables. One row per nested `(repo, library)` occurrence.

### 2.1 The PURL explosion (exactly 2 levels, no recursion)

```
sbom.json
└─ components[]                 ← 15,594 top-level repo components (NOT 24,500 — that's the feed)
   ├─ name = "<org>/<repo>"     ← repo identity (version empty on 100% of these)
   ├─ externalReferences[type=vcs].url   ← repo_url
   └─ components[]              ← the repo's libraries (2,906,144 rows, avg 186, max 12,803)
      ├─ purl  = "pkg:npm/express@4.18.2"   ← present 100%; authoritative key
      ├─ version = "4.18.2"
      └─ licenses[0].license.id = "MIT"     ← single uniform shape; 121,572 rows have none
```

**Mandatory:** `urllib.parse.unquote(purl)` *before* any parse (~20% are percent-encoded).

### 2.2 `deps.dependencies` schema

```sql
CREATE TABLE govreposcrape_deps.dependencies (
  -- repo identity (top-level component)
  repo_full_name   STRING  NOT NULL,    -- "alphagov/whitehall"
  org              STRING  NOT NULL,
  repo             STRING  NOT NULL,
  repo_url         STRING,              -- externalReferences[type=vcs].url
  pushed_at        TIMESTAMP,           -- LEFT JOIN from repos.json feed (may be NULL)
  -- package identity (from %-decoded purl; never inferred from name)
  purl             STRING  NOT NULL,
  ecosystem        STRING  NOT NULL,    -- purl TYPE: npm|pypi|gem|maven|nuget|golang|cargo|composer|githubactions|github
  package_name     STRING  NOT NULL,    -- decoded display: "@babel/code-frame", "org.apache.logging.log4j/log4j-core"
  package_key      STRING  NOT NULL,    -- MATCH key: npm/pypi lowercased, pypi PEP503-fold, maven "group:artifact"
  -- version: raw + derived (both kept)
  version_raw      STRING,              -- exactly as in SBOM, %-decoded ("^4.14.0","4.18.2","master","")
  version_kind     STRING  NOT NULL,    -- release|prerelease|range|sha|branch|wildcard|empty|unparseable
  comparable       BOOL    NOT NULL,    -- TRUE iff version_raw parsed to a single orderable point
  exact_scheme     BOOL    NOT NULL,    -- TRUE for npm/pypi/gem/cargo/golang (exact); FALSE for maven/nuget/composer (confirm pass)
  version_sort_key STRING,              -- zero-padded ecosystem-normalised STRING key; NULL when !comparable
  epoch            INT64   NOT NULL,    -- PEP440/debian epoch, default 0 (also folded into key prefix)
  is_prerelease    BOOL    NOT NULL,
  -- license + provenance + exclusion flags
  license_id       STRING,              -- licenses[0].license.id (SPDX); NULL on 121,572 rows
  is_self_ref      BOOL    NOT NULL,    -- TRUE for 15,594 pkg:github/<org>/<repo> self-refs
  is_action        BOOL    NOT NULL,    -- TRUE for 28,513 pkg:githubactions rows
  ingested_date    DATE    NOT NULL
)
PARTITION BY ingested_date
CLUSTER BY ecosystem, package_key;
```

**Clustering by `(ecosystem, package_key)` is the single most important performance decision** — it prunes "express" queries to single-digit MB scanned.

### 2.3 Version stored twice (deliberately)

- `version_raw` = source of truth (exact-match, display, TS confirm pass).
- `version_sort_key` = derived, lexically comparable **string** such that `ORDER BY version_sort_key` equals the ecosystem's true semantic order → range predicates are plain SQL, **no UDF**.

**Sort-key construction** (computed once in Python via `univers`; vendored module with golden-vector tests in **both** Python and TS CI):

1. Parse to ecosystem `Version`.
2. Release segments → integers, each zero-padded to 8 digits, fixed arity 5: `4.18.2` → `00000004.00000018.00000002.00000000.00000000`.
3. Prerelease discriminator so a release sorts **above** its prereleases: release → append `~~~~~` (`~`=0x7E, sorts high); prerelease → `_` + normalised tags. So `1.0.0-rc1` < `1.0.0`.
4. Epoch prefix: `lpad(epoch,4,'0') + "!"` so `1!1.0` > `2.0`.

```
("express","4.18.2",  release, comparable=T, exact=T, key="00000004.00000018.00000002.00000000.00000000.~~~~~")
("express","5.2.1",   release, comparable=T, exact=T, key="00000005.00000002.00000001.00000000.00000000.~~~~~")
("express","2.5.11",  release, comparable=T, exact=T, key="00000002.00000005.00000011.00000000.00000000.~~~~~")
("express","^4.14.0", range,   comparable=F, exact=T, key=NULL)   -- %5E decoded; a declared RANGE, not a point
```

Fixes the canonical trap: `0.9.2` → `...00000009.00000002...` sorts **below** `0.10.0` → `...00000010.00000000...`. A **string** key (not a packed double) is exact at any magnitude.

### 2.4 Satellite + materialised summary tables

- **`deps.repos`** — `(repo_full_name, org, repo, repo_url, pushed_at, dep_count, has_sbom)`. Surfaces the 15,594-vs-24,500 coverage gap.
- **`deps.pkg_popularity`** — `GROUP BY (ecosystem, package_key)` → `(package_name, repo_count, version_count)`, excluding `is_self_ref OR is_action`.
- **`deps.license_rollup`** — `(ecosystem, license_id, repo_count, occurrence_count)`; NULL → `UNKNOWN`.

The API reads a view `deps.current` = `SELECT * FROM deps.dependencies WHERE ingested_date = (SELECT MAX(ingested_date) ...)` so readers never see a half-loaded table.

---

## 3. Version-range handling

### 3.1 Strategy: "index narrows, library confirms"

**Primary path — precomputed string sort key, evaluated as a native BQ range scan.** At query time the TS API parses the *user's* predicate (`<2`, `4.x`, `>=1.2 <2`) with node-`semver` into `[lo, hi)` bounds, then maps those to sort-key strings using the **same vendored zero-pad algorithm** as ingest:

```sql
WHERE ecosystem=@eco AND package_key=@pkg
  AND comparable
  AND version_sort_key >= @loKey AND version_sort_key < @hiKey
  AND (@incPre OR NOT is_prerelease)
```

`<2` → `hiKey="00000002.00000000.00000000.00000000.00000000.~~~~~"`. **Exact** for the SemVer-family + PEP 440 ecosystems (`exact_scheme=TRUE`): npm (89.4%), pypi, cargo, golang-tagged, gem — ~96%+ of comparable volume.

**Confirm pass — TS library over the candidate set, for the hard minority.** maven `ComparableVersion` qualifier precedence, nuget's 4th field, composer stability flags do **not** pack into a fixed-width key. For `exact_scheme=FALSE` rows the sort-key scan is a **coarse pre-filter**; the API then runs the real library `satisfies()` over the small single-package candidate set. **We never run a version library over millions of rows** — only over the handful a clustered scan returns.

### 3.2 Minimum-viable correctness bar

1. **Ecosystem is always the PURL type, never the name** — `express`(npm) ≠ a same-named gem; `json` exists in npm+gem+pypi+nuget.
2. **Existence + popularity + license work for 100% of ecosystems** (messy versions still count as "uses X").
3. **Range predicates exactly correct for npm + pypi + gem + maven** (the log4j use-case is *maven* → gets the confirm pass).
4. **Correct-by-coercion for cargo/golang/nuget**; non-comparable rows excluded and **footnoted**.
5. **Every result discloses `version_kind` counts** + the 15,594/24,500 coverage caveat.
6. **String comparison of raw versions is banned anywhere in the path.**

### 3.3 Messy versions (from the real profile)

| Real input (full-parse counts) | `version_kind` | `comparable` | Behaviour |
|---|---|---|---|
| empty (**12,484**) | `empty` | F | counts in "uses X"; excluded from ranges |
| `^4.14.0`/`>=2.11.1`/`~> 2.9.9` as the version (**35,042**; 16,670 `^`/`~`) | `range` | F | counts in "uses X"; excluded from point ranges |
| git SHA / opaque date `20160810` (**8,479**) | `sha` | F | "commit-pinned"; excluded |
| go pseudo-version `v0.0.0-2021…-abc` | `sha`/`prerelease` | F | commit-pinned; golden vector so it orders as prerelease of 0.0.0 |
| prerelease `1.0.0-rc.3` (**8,961**) | `prerelease` | **T** | excluded from default ranges; included with `include_prereleases` |
| githubactions `4.*.*` (**28,513**) | `wildcard` | F | `is_action=TRUE`; excluded from popularity/version semantics |
| github self-ref `@master` (**15,594**) | `branch` | F | `is_self_ref=TRUE`; excluded |
| maven codename `Edgware.RELEASE`, `3.0.0-M1` | `unparseable`/`prerelease` | F | `exact_scheme=FALSE`; never claimed comparable |

`NOASSERTION` and debian epochs: **0 found**.

---

## 4. Ingestion pipeline

**Where it runs:** a **new entrypoint** in the existing Python Cloud Run Job (`container/`), invoked via `--mode=aggregate-deps` — a sibling to the gitingest path, sharing `repos.json` fetching from `container/ingest.py`. The job is already 4 Gi/2 CPU/6 h on a daily 02:00 UTC Cloud Scheduler trigger (`container/deploy-job.sh`). New file: `container/build_deps_index.py`. New `requirements.txt` deps: `ijson`, `univers`, `packaging`, `python-semver`, `google-cloud-bigquery`.

**Full rebuild, not incremental** — single regenerated source, no stable per-row identity, 2.9 M rows = cents.

**Daily pipeline (~2–3 min wall):**
1. `GET sbom.json.gz` (49 MB) **once** — replaces 15,594 per-repo SBOM fetches (reliability/cost win on its own).
2. Stream-decode with `ijson` over `components.item → components.item`. **Never `json.load` the 412 MB** (~9 s streamed).
3. Fetch `repos.json` (14.5 MB) → dict keyed by `org/repo` for `pushed_at`/`repo_url`.
4. Per `(repo, lib)`: `unquote(purl)` **first**; split `pkg:<eco>/<name>@<version>`; classify `version_kind`; if comparable, build `version_sort_key`/`epoch`/`is_prerelease`/`exact_scheme` via `univers`; tag `is_self_ref`/`is_action`.
5. Write gzipped NDJSON to `gs://govreposcrape-summaries/deps/staging/deps-YYYYMMDD.ndjson.gz`. **Load jobs are free — never streaming-insert.**
6. **Atomic swap:** `bq load` into partition `deps.dependencies$YYYYMMDD`; `deps.current` selects `MAX(ingested_date)` → instantaneous, tear-free. Partitions expire after 7 days → cheap rollback + short history.
7. **Rebuild summaries** (`CREATE OR REPLACE TABLE … AS SELECT` off `deps.current`, excluding self-ref/action for popularity).

**Failure mode is graceful:** a failed load leaves `deps.current` on yesterday's partition (stale, not down). **Retire** `fetch_sbom_dependencies()` in `container/orchestrator.py` (SPDX-2.3, `deps[:100]` cap at line 83) — the aggregate covers all deps untruncated, fixing silent loss on the 3,698 repos > 100 deps.

---

## 5. Query layer & MCP tools

**Decision: three focused tools** — one smart core + two specialised — not one mega-tool, not five.

**Where the code lands:** new `api/src/services/depsQueryService.ts` (sibling to `vertexSearchService.ts`), owning the `@google-cloud/bigquery` client. In `api/src/controllers/mcpController.ts`: add tool defs to the `tools/list` array (lines 71–95), and replace the hard guard at **line 101** with a name→handler dispatch. New API deps: `@google-cloud/bigquery` (pure JS), `semver`, `@snyk/ruby-semver`, `@renovatebot/pep440`. Every query is parameterised and fixed-shape — no user string reaches SQL.

### 5.1 `search_dependency` (smart core)

```
search_dependency(
  package: string,                       // "express"
  ecosystem?: string,                    // npm|pypi|gem|maven|nuget|golang|cargo|composer
  version_range?: string,                // node-semver grammar: "<2", ">=1.2 <2", "4.x"
  include_prereleases?: boolean = false,
  limit?: number = 200, offset?: number = 0
)
```
Exhaustive list of UK-gov repos depending on a package, optionally version-constrained. If `ecosystem` omitted, returns a per-ecosystem breakdown and asks the caller to narrow before applying a range. Always discloses the `version_kind` excluded-denominator + coverage caveat.

### 5.2 `package_popularity`
```
package_popularity(ecosystem?: string, license?: string, top?: number = 50, name_contains?: string)
```
Ranked reverse-dependency counts + license rollups from the materialised tables (KB scan). Excludes self-ref/action.

### 5.3 `repo_dependencies`
```
repo_dependencies(repo_full_name: string, ecosystem?: string, limit?: number = 500)
```
Full **untruncated** dependency listing for one repo (fixes the 100-cap; some repos have 12,803 deps).

### 5.4 "who's using expressjs" — END-TO-END

`search_dependency({ package:"express", ecosystem:"npm" })`. Count from `pkg_popularity` (KB); exhaustive page from `deps.current`, cluster-pruned to a few MB:
```sql
SELECT repo_full_name, repo_url, version_raw, version_kind
FROM   govreposcrape_deps.deps.current
WHERE  ecosystem=@eco AND package_key=@pkg          -- 'npm','express'
ORDER  BY version_sort_key DESC NULLS LAST
LIMIT  @limit OFFSET @offset;
```
```json
{
  "repo_count": 1830,
  "top_versions": [["4.22.1",288],["5.2.1",280],["4.21.2",268],["4.17.1",252],["4.18.2",233]],
  "excluded": { "range_specifier": 54, "empty": 2 },
  "coverage_note": "Index covers 15,594 of ~24,500 feed repos that have an SBOM; 'no result' may mean 'no SBOM'.",
  "repos": [ { "repo":"cabinetoffice/x", "url":"https://github.com/cabinetoffice/x", "version":"4.18.2" } ],
  "next_offset": 100
}
```

### 5.5 "who's running express version < 2" — END-TO-END

`search_dependency({ package:"express", ecosystem:"npm", version_range:"<2" })`. TS parses `<2` → `[0.0.0, 2.0.0)`; shared key-builder maps to `hiKey`:
```sql
SELECT repo_full_name, repo_url, version_raw
FROM   govreposcrape_deps.deps.current
WHERE  ecosystem='npm' AND package_key='express'
  AND  comparable
  AND  version_sort_key >= @loKey AND version_sort_key < @hiKey
  AND  NOT is_prerelease;
```
npm is `exact_scheme=TRUE`, so the empty set is **final** — no confirm pass.
```json
{
  "matched_repo_count": 0,
  "total_express_users": 1830,
  "excluded": { "range_specifier": 54, "empty": 2 },
  "note": "0 repos run express <2. Lowest concrete version present is 2.5.11 (6 repos); usage is v4/v5. 54 repos declare a range like ^4.14.0 (not range-evaluated). SBOM coverage: 15,594/~24,500."
}
```
Correct and honest — the version-range predicate that is *impossible* via semantic search.

---

## 6. Coexistence with the Vertex semantic tool

**Strictly additive, zero regression.** The unstructured datastore (`govreposcrape-summaries` markdown) and `search_uk_gov_code` are untouched. Two backends side by side: **Vertex = semantic "what does this repo do"; BigQuery = structured "who depends on what."** They share the `org/repo` identity convention, so `search_dependency` can cite the same GitHub + SBOM URLs (formatter at `mcpController.ts` lines 156–164).

**Do NOT enrich Vertex docs with the structured fields** — keeps version logic out of a product that can't do ordered version semantics and avoids re-indexing. The one ingestion change: **drop the lossy "first 100 deps" markdown block** (now covered untruncated), which also shrinks the Vertex docs.

Optional later: a thin MCP-layer router (or `geminiService` intent classification) sends "who/which/list … uses/runs/depends-on `<pkg>`" + version predicates to `search_dependency`, free-text "what/how" to `search_uk_gov_code`.

---

## 7. Cost & abuse control (public, no-auth API)

**Dollar intuition.** Storage: a few hundred MB columnar + KB–MB summaries → pennies/month, inside the 10 GB BQ free tier. Ingest: load jobs **free**; job CPU cents/day. Query bytes: clustering prunes "express" to single-digit MB; popularity/license hit materialised tables (KB). On-demand $6.25/TB with first 1 TB/month free → realistic public traffic stays **effectively $0**.

**The hard truth:** BigQuery *is* a billable, attacker-amplifiable surface on a no-auth endpoint. Safe **only if all four guardrails are wired:**

1. **No user string ever becomes SQL** — parameterised, shape-fixed queries; `version_range` parsed to bounds *in the app*.
2. **`maximumBytesBilled` on every query** (e.g. 50 MB) → pathological queries **fail rather than bill**. The decisive advantage over Vertex-structured (no equivalent cap).
3. **Cloud Quotas custom daily-bytes quota** at project level.
4. **Cloud Run rate-limit + in-process short-TTL response cache** (data refreshes daily → 1-day TTL safe; collapses BQ's ~0.3–0.8 s job-submission floor to ms on hot paths). Cap `max-instances`; keep `min-instances=0`.

> Rate-limiting and a response cache do **not** exist in `api/src` today — must be built, but benefit any engine.

---

## 8. Phased rollout

| Phase | Scope | Effort | Value |
|---|---|---|---|
| **0 — this week** | npm-only (89.4%). `container/build_deps_index.py`: ijson + unquote + purl parse + `version_sort_key`/`version_kind`/`comparable` via node-semver-equiv. `bq load` → `deps.dependencies` + `deps.current` view + `pkg_popularity`. Add `search_dependency` (npm) to `mcpController.ts` with `maximumBytesBilled`. | ~3–4 days | Both flagship questions end-to-end: "who uses express" = exhaustive 1,830; "express < 2" = correct ∅. Untruncated npm counts. |
| **1 — Tier-A correctness** | Add pypi (PEP 440) + gem + maven incl. `exact_scheme` confirm-pass (log4j/CVE use-case). Vendor sort-key module + golden-vector CI in **both** Python and TS. | ~3–4 days | Cross-ecosystem ranges exact for the 4 highest-value ecosystems; vulnerable-version lookups. |
| **2 — full tools + Tier-B** | Add `package_popularity` (+`license_rollup`) + `repo_dependencies`. cargo/golang/nuget by coercion. Atomic-swap hardening, partition expiry, `deps.repos`. Retire `fetch_sbom_dependencies` + drop the 100-dep block. | ~3–4 days | Popularity, license rollups, untruncated per-repo listing; 100-cap loss fixed. |
| **3 — productionise** | Cloud Run rate-limit + cache, Cloud Quotas daily-bytes quota, composer/generic best-effort (labelled), MCP intent router. | ~2–3 days | Hardened no-auth posture; full coverage. |

**Total ~2–2.5 engineer-weeks.** Phase 0 ships standalone value with no new serving engine and no artifact-swap machinery.

---

## 9. Honest alternatives

| Engine | Pick it instead when | Why runner-up here |
|---|---|---|
| **DuckDB-embedded (Parquet, baked-in)** | Need ~5–30 ms latency + heavy columnar rollups + truly zero query-time billing surface | Ties on correctness. Loses: native addon on Node-24/musl; 50–70 MB working set vs **512 Mi** service; refresh couples to app (redeploy/hot-swap) — none exist in git-push pipeline. Reconsider if MCP latency becomes a hard SLO. |
| **SQLite shipped artifact** | Want the simplest single engine, no analytics headroom needed | Same correctness/routing. Loses: `better-sqlite3` also a native addon; ~200 MB mmap > DuckDB vs 512 Mi; weaker at rollups; same bespoke hot-swap. |
| **Hybrid (BQ + DuckDB cache + Vertex)** | Need BQ analytics + DuckDB ms-latency + willing to run 3 engines | Best capability, heaviest build/ops; its own minimal slice *is* the BigQuery-only design — start there. |
| **Vertex-Native structured** | Single-platform reuse above all, never need sub-major ranges or exhaustive listing | **Disqualified.** Packed-double key loses sub-major/prerelease precision → silently wrong ranges; ranked-retrieval fights exhaustive listing; no hard per-query cost cap on a no-auth endpoint. Keep Vertex for semantic only. |

---

## 10. Risks & open questions

1. **Python↔TS sort-key drift (highest-value invariant).** The zero-pad key must be **byte-identical** on ingest (Python) and query-bound-mapping (TS). One vendored, spec'd module with golden-vector CI in **both** languages (incl. go-pseudo-version + `Edgware.RELEASE` non-comparable vectors). Non-negotiable.
2. **maven/nuget/composer lean on the confirm pass** — rarely exercised given npm dominance, so bugs lurk. `exact_scheme` routes deterministically; add maven golden vectors (`4.1.133.Final`, `3.0.0-M1`); never skip the confirm pass under load.
3. **Coverage gap.** 15,594 with SBOM vs ~24,500 feed → "no results" must be disambiguated from "no SBOM" in every answer.
4. **Range-as-version minority.** 35,042 range/wildcard + 12,484 empty are quarantined (`comparable=FALSE`) and disclosed as excluded denominator — verify the denominator is surfaced.
5. **Guardrail completeness.** BigQuery safe only with all four §7 controls. Enforce `maximumBytesBilled` centrally in `depsQueryService` so no future tool issues an uncapped query.
6. **Daily freshness only.** Index ≤24 h stale, 7-day partition history — surface `ingested_date` in responses.
7. **First-run spot-checks:** percent-decoding coverage (0 mis-parsed scoped-npm names), per-ecosystem `comparable` rate vs profile, self-ref/action correctly excluded from popularity.

**Paths for Phase 0:** `container/build_deps_index.py` (new), `container/orchestrator.py` (retire `fetch_sbom_dependencies`, lines 56–116; cap at line 83), `container/ingest.py` (reuse `fetch_repos_json`), `container/requirements.txt` (add deps), `api/src/services/depsQueryService.ts` (new), `api/src/controllers/mcpController.ts` (tool defs ~line 71; replace guard at line 101), `api/package.json` (add `@google-cloud/bigquery`, `semver`, `@snyk/ruby-semver`, `@renovatebot/pep440`), GCS staging `gs://govreposcrape-summaries/deps/`, dataset `govreposcrape_deps`.
