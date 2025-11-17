var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/utils/logger.ts
var LOG_LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
function createLogger(baseContext, minLogLevel = "debug") {
  const minPriority = LOG_LEVEL_PRIORITY[minLogLevel];
  function log(level, message, metadata) {
    if (LOG_LEVEL_PRIORITY[level] < minPriority) {
      return;
    }
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message,
      context: {
        operation: baseContext.operation || "unknown",
        ...baseContext.requestId && { requestId: baseContext.requestId },
        ...metadata && { metadata }
      }
    };
    console.log(JSON.stringify(entry));
  }
  __name(log, "log");
  return {
    debug: /* @__PURE__ */ __name((message, metadata) => log("debug", message, metadata), "debug"),
    info: /* @__PURE__ */ __name((message, metadata) => log("info", message, metadata), "info"),
    warn: /* @__PURE__ */ __name((message, metadata) => log("warn", message, metadata), "warn"),
    error: /* @__PURE__ */ __name((message, metadata) => log("error", message, metadata), "error")
  };
}
__name(createLogger, "createLogger");

// src/utils/error-handler.ts
var AppError = class extends Error {
  static {
    __name(this, "AppError");
  }
  /** HTTP status code for this error */
  statusCode;
  /** Machine-readable error code */
  code;
  constructor(message, statusCode, code) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
  /**
   * Convert error to PRD FR-3 compliant ErrorResponse format
   * @returns Formatted error response object
   */
  toErrorResponse() {
    return {
      error: {
        code: this.code,
        message: this.message
      }
    };
  }
};
var ValidationError = class extends AppError {
  static {
    __name(this, "ValidationError");
  }
  constructor(message, code = "VALIDATION_ERROR") {
    super(message, 400, code);
    this.name = "ValidationError";
  }
};
var ServiceError = class extends AppError {
  static {
    __name(this, "ServiceError");
  }
  /** Optional: seconds to wait before retrying */
  retryAfter;
  constructor(message, statusCode = 500, code = "SERVICE_ERROR", retryAfter) {
    super(message, statusCode, code);
    this.name = "ServiceError";
    this.retryAfter = retryAfter;
  }
  /**
   * Convert error to PRD FR-3 compliant ErrorResponse format
   * Includes retry_after field if specified
   * @returns Formatted error response object
   */
  toErrorResponse() {
    const response = {
      error: {
        code: this.code,
        message: this.message
      }
    };
    if (this.retryAfter !== void 0) {
      response.error.retry_after = this.retryAfter;
    }
    return response;
  }
};

// src/api/health.ts
var logger = createLogger({ operation: "healthCheck" });
async function checkHealth(env, requestId) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const services = {};
  let allHealthy = true;
  logger.info("Starting health check", {
    requestId,
    timestamp
  });
  try {
    await env.KV.get("health-check-test");
    services.kv = {
      name: "KV Namespace",
      status: "ok"
    };
    logger.debug("KV health check passed", { requestId });
  } catch (error) {
    allHealthy = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    services.kv = {
      name: "KV Namespace",
      status: "failed",
      error: errorMessage
    };
    logger.error("KV health check failed", {
      requestId,
      error: errorMessage
    });
  }
  try {
    await env.R2.list({ limit: 1 });
    services.r2 = {
      name: "R2 Bucket",
      status: "ok"
    };
    logger.debug("R2 health check passed", { requestId });
  } catch (error) {
    allHealthy = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    services.r2 = {
      name: "R2 Bucket",
      status: "failed",
      error: errorMessage
    };
    logger.error("R2 health check failed", {
      requestId,
      error: errorMessage
    });
  }
  try {
    if (env.VECTORIZE) {
      services.vectorize = {
        name: "Vectorize Index",
        status: "ok"
      };
      logger.debug("Vectorize health check passed", { requestId });
    } else {
      throw new Error("Vectorize binding not available");
    }
  } catch (error) {
    allHealthy = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    services.vectorize = {
      name: "Vectorize Index",
      status: "failed",
      error: errorMessage
    };
    logger.error("Vectorize health check failed", {
      requestId,
      error: errorMessage
    });
  }
  try {
    await env.DB.prepare("SELECT 1").first();
    services.d1 = {
      name: "D1 Database",
      status: "ok"
    };
    logger.debug("D1 health check passed", { requestId });
  } catch (error) {
    allHealthy = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    services.d1 = {
      name: "D1 Database",
      status: "failed",
      error: errorMessage
    };
    logger.error("D1 health check failed", {
      requestId,
      error: errorMessage
    });
  }
  try {
    await env.AI.autorag("govreposcrape-search").search({
      query: "test",
      max_num_results: 1
    });
    services.ai_search = {
      name: "AI Search",
      status: "ok"
    };
    logger.debug("AI Search health check passed", { requestId });
  } catch (error) {
    allHealthy = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    services.ai_search = {
      name: "AI Search",
      status: "failed",
      error: errorMessage
    };
    logger.error("AI Search health check failed", {
      requestId,
      error: errorMessage
    });
  }
  const response = {
    status: allHealthy ? "healthy" : "unhealthy",
    services,
    timestamp
  };
  if (allHealthy) {
    logger.info("Health check completed: all services healthy", {
      requestId,
      services: Object.keys(services)
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } else {
    logger.warn("Health check completed: some services unhealthy", {
      requestId,
      failedServices: Object.entries(services).filter(([_, s]) => s.status === "failed").map(([name]) => name)
    });
    const error = new ServiceError(
      "One or more services are unavailable",
      503,
      "SERVICE_UNAVAILABLE"
    );
    const errorResponse = error.toErrorResponse();
    const detailedResponse = {
      ...errorResponse,
      details: response
    };
    return new Response(JSON.stringify(detailedResponse), {
      status: 503,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
}
__name(checkHealth, "checkHealth");

// src/utils/retry.ts
var logger2 = createLogger({ operation: "retry" });
async function withRetry(fn, maxRetries = 3, delays = [1e3, 2e3, 4e3]) {
  let lastError;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await fn();
      if (attempt > 0) {
        logger2.info("Retry succeeded", {
          attempt: attempt + 1,
          totalAttempts: maxRetries
        });
      }
      return result;
    } catch (error) {
      lastError = error;
      attempt++;
      if (attempt >= maxRetries) {
        logger2.error("All retry attempts exhausted", {
          attempts: maxRetries,
          error: error instanceof Error ? error.message : String(error)
        });
        throw lastError;
      }
      const delay = delays[attempt - 1] ?? delays[delays.length - 1];
      logger2.warn("Retry attempt failed, will retry", {
        attempt,
        maxRetries,
        nextDelayMs: delay,
        error: error instanceof Error ? error.message : String(error)
      });
      await sleep(delay);
    }
  }
  throw lastError;
}
__name(withRetry, "withRetry");
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");

// src/ingestion/cache.ts
var logger3 = createLogger({ operation: "cache" });
var cacheStats = {
  totalChecks: 0,
  hits: 0,
  misses: 0,
  hitRate: 0
};
function getCacheKey(org, name) {
  return `repo:${org}/${name}`;
}
__name(getCacheKey, "getCacheKey");
async function checkCache(repo, kv) {
  const key = getCacheKey(repo.org, repo.name);
  cacheStats.totalChecks++;
  try {
    logger3.debug("Checking cache", {
      repo: `${repo.org}/${repo.name}`,
      key
    });
    const cached = await kv.get(key, "json");
    if (!cached) {
      cacheStats.misses++;
      logger3.info("Cache miss - no entry", {
        repo: `${repo.org}/${repo.name}`
      });
      return {
        needsProcessing: true,
        reason: "cache-miss"
      };
    }
    if (!cached.pushedAt || !cached.processedAt || !cached.status) {
      cacheStats.misses++;
      logger3.warn("Cache miss - malformed entry", {
        repo: `${repo.org}/${repo.name}`,
        cached
      });
      return {
        needsProcessing: true,
        reason: "cache-miss"
      };
    }
    if (cached.pushedAt === repo.pushedAt) {
      cacheStats.hits++;
      logger3.info("Cache hit", {
        repo: `${repo.org}/${repo.name}`,
        cachedPushedAt: cached.pushedAt
      });
      return {
        needsProcessing: false,
        reason: "cache-hit",
        cachedEntry: cached
      };
    }
    cacheStats.misses++;
    logger3.info("Cache stale - pushedAt changed", {
      repo: `${repo.org}/${repo.name}`,
      cachedPushedAt: cached.pushedAt,
      currentPushedAt: repo.pushedAt
    });
    return {
      needsProcessing: true,
      reason: "stale-cache",
      cachedEntry: cached
    };
  } catch (error) {
    cacheStats.misses++;
    logger3.error("Cache check failed - treating as miss", {
      repo: `${repo.org}/${repo.name}`,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      needsProcessing: true,
      reason: "cache-miss"
    };
  }
}
__name(checkCache, "checkCache");
async function updateCache(repo, kv) {
  const key = getCacheKey(repo.org, repo.name);
  const entry = {
    pushedAt: repo.pushedAt,
    processedAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: "complete"
  };
  try {
    await withRetry(
      async () => {
        await kv.put(key, JSON.stringify(entry));
      },
      3,
      [1e3, 2e3, 4e3]
    );
    logger3.info("Cache updated", {
      repo: `${repo.org}/${repo.name}`,
      pushedAt: repo.pushedAt
    });
  } catch (error) {
    logger3.error("Cache update failed after retries", {
      repo: `${repo.org}/${repo.name}`,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
__name(updateCache, "updateCache");
function getCacheStats() {
  const hitRate = cacheStats.totalChecks > 0 ? cacheStats.hits / cacheStats.totalChecks * 100 : 0;
  return {
    ...cacheStats,
    hitRate
  };
}
__name(getCacheStats, "getCacheStats");

// src/api/cache-proxy.ts
var logger4 = createLogger({ operation: "cache-proxy" });
function parseOrgRepo(pathname) {
  const match = pathname.match(/^\/cache\/([^/]+)\/([^/]+)$/);
  if (!match) {
    return null;
  }
  return {
    org: decodeURIComponent(match[1]),
    repo: decodeURIComponent(match[2])
  };
}
__name(parseOrgRepo, "parseOrgRepo");
async function getCacheEntry(url, env, requestId) {
  const parsed = parseOrgRepo(url.pathname);
  if (!parsed) {
    logger4.warn("Invalid cache GET request", {
      requestId,
      path: url.pathname
    });
    return new Response(
      JSON.stringify({
        error: {
          code: "INVALID_PATH",
          message: "Expected format: /cache/:org/:repo"
        }
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  const { org, repo } = parsed;
  try {
    const pushedAt = url.searchParams.get("pushedAt");
    if (!pushedAt) {
      return new Response(
        JSON.stringify({
          error: {
            code: "MISSING_PUSHED_AT",
            message: "Query parameter 'pushedAt' is required"
          }
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const result = await checkCache(
      { org, name: repo, pushedAt, url: `https://github.com/${org}/${repo}` },
      env.KV
    );
    if (result.needsProcessing) {
      logger4.info("Cache proxy: miss/stale", {
        requestId,
        org,
        repo,
        reason: result.reason
      });
      return new Response(
        JSON.stringify({
          needsProcessing: true,
          reason: result.reason
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    logger4.info("Cache proxy: hit", {
      requestId,
      org,
      repo
    });
    return new Response(JSON.stringify(result.cachedEntry), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    logger4.error("Cache GET failed", {
      requestId,
      org,
      repo,
      error: error instanceof Error ? error.message : String(error)
    });
    return new Response(
      JSON.stringify({
        error: {
          code: "CACHE_READ_ERROR",
          message: "Failed to read from cache"
        }
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(getCacheEntry, "getCacheEntry");
async function putCacheEntry(url, request, env, requestId) {
  const parsed = parseOrgRepo(url.pathname);
  if (!parsed) {
    logger4.warn("Invalid cache PUT request", {
      requestId,
      path: url.pathname
    });
    return new Response(
      JSON.stringify({
        error: {
          code: "INVALID_PATH",
          message: "Expected format: /cache/:org/:repo"
        }
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  const { org, repo } = parsed;
  try {
    const body = await request.json();
    if (!body.pushedAt || !body.processedAt || !body.status) {
      return new Response(
        JSON.stringify({
          error: {
            code: "INVALID_BODY",
            message: "Request body must include: pushedAt, processedAt, status"
          }
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    await updateCache(
      { org, name: repo, pushedAt: body.pushedAt, url: `https://github.com/${org}/${repo}` },
      env.KV
    );
    logger4.info("Cache proxy: updated", {
      requestId,
      org,
      repo,
      pushedAt: body.pushedAt
    });
    return new Response(null, {
      status: 204
    });
  } catch (error) {
    logger4.error("Cache PUT failed", {
      requestId,
      org,
      repo,
      error: error instanceof Error ? error.message : String(error)
    });
    return new Response(
      JSON.stringify({
        error: {
          code: "CACHE_WRITE_ERROR",
          message: "Failed to update cache"
        }
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(putCacheEntry, "putCacheEntry");
async function getCacheStatistics(requestId) {
  const stats = getCacheStats();
  logger4.info("Cache stats requested", {
    requestId,
    hitRate: `${stats.hitRate.toFixed(1)}%`
  });
  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(getCacheStatistics, "getCacheStatistics");

// src/search/ai-search-client.ts
var MIN_QUERY_LENGTH = 3;
var MAX_QUERY_LENGTH = 500;
var MIN_LIMIT = 1;
var MAX_LIMIT = 20;
var AI_SEARCH_INDEX_NAME = "govreposcrape-search";
var MAX_RETRIES = 3;
var RETRY_DELAYS = [1e3, 2e3, 4e3];
var SLOW_QUERY_THRESHOLD = 800;
async function sleep2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep2, "sleep");
function validateQuery(query) {
  if (!query || query.trim().length < MIN_QUERY_LENGTH) {
    throw new ValidationError(
      `Query must be at least ${MIN_QUERY_LENGTH} characters`,
      "QUERY_TOO_SHORT"
    );
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(
      `Query must not exceed ${MAX_QUERY_LENGTH} characters`,
      "QUERY_TOO_LONG"
    );
  }
}
__name(validateQuery, "validateQuery");
function validateLimit(limit) {
  if (limit < MIN_LIMIT || limit > MAX_LIMIT) {
    throw new ValidationError(
      `Limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`,
      "INVALID_LIMIT"
    );
  }
}
__name(validateLimit, "validateLimit");
async function withRetry2(fn, operation, requestId) {
  const logger5 = createLogger({ operation, requestId });
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger5.info("Retry attempt", {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        error: lastError.message
      });
      if (attempt < MAX_RETRIES - 1) {
        await sleep2(RETRY_DELAYS[attempt]);
      }
    }
  }
  throw new ServiceError(
    `AI Search service unavailable after ${MAX_RETRIES} attempts`,
    503,
    "SEARCH_ERROR",
    60
    // retry_after in seconds
  );
}
__name(withRetry2, "withRetry");
async function searchCode(env, query, limit = 5) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const logger5 = createLogger({ operation: "search", requestId });
  validateQuery(query);
  validateLimit(limit);
  logger5.info("AI Search query started", {
    query,
    limit
  });
  try {
    const response = await withRetry2(
      () => env.AI.autorag(AI_SEARCH_INDEX_NAME).search({
        query,
        max_num_results: limit
      }),
      "ai_search_query",
      requestId
    );
    const duration = Date.now() - startTime;
    const resultCount = response.data.length;
    logger5.info("AI Search query completed", {
      duration,
      resultCount,
      aiSearchTookMs: response.took_ms,
      searchQuery: response.search_query
    });
    if (duration > SLOW_QUERY_THRESHOLD) {
      logger5.warn("Slow AI Search query detected", {
        duration,
        threshold: SLOW_QUERY_THRESHOLD,
        query
      });
    }
    return response.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger5.error("AI Search query failed", {
      duration,
      error: error instanceof Error ? error.message : String(error),
      query
    });
    throw error;
  }
}
__name(searchCode, "searchCode");

// src/search/result-enricher.ts
var SLOW_ENRICHMENT_THRESHOLD = 100;
function parseR2Path(path) {
  if (!path || typeof path !== "string") {
    return {
      org: "",
      repo: "",
      valid: false,
      error: "Invalid path: must be a non-empty string in format gitingest/{org}/{repo}/summary.txt"
    };
  }
  const pathPattern = /^gitingest\/([^/]*)\/([^/]*)\/summary\.txt$/;
  const match = path.match(pathPattern);
  if (!match) {
    return {
      org: "",
      repo: "",
      valid: false,
      error: `Invalid R2 path format. Expected: gitingest/{org}/{repo}/summary.txt, got: ${path}`
    };
  }
  try {
    const org = decodeURIComponent(match[1]);
    const repo = decodeURIComponent(match[2]);
    if (!org || !repo) {
      return {
        org: "",
        repo: "",
        valid: false,
        error: "Invalid R2 path: org or repo is empty"
      };
    }
    return {
      org,
      repo,
      valid: true
    };
  } catch (error) {
    return {
      org: "",
      repo: "",
      valid: false,
      error: `Failed to decode org/repo from path: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
__name(parseR2Path, "parseR2Path");
function buildGitHubURL(org, repo) {
  const encodedOrg = encodeURIComponent(org);
  const encodedRepo = encodeURIComponent(repo);
  return `https://github.com/${encodedOrg}/${encodedRepo}`;
}
__name(buildGitHubURL, "buildGitHubURL");
function buildCodespacesURL(org, repo) {
  const encodedOrg = encodeURIComponent(org);
  const encodedRepo = encodeURIComponent(repo);
  return `https://github.dev/${encodedOrg}/${encodedRepo}`;
}
__name(buildCodespacesURL, "buildCodespacesURL");
function buildGitpodURL(org, repo) {
  const encodedOrg = encodeURIComponent(org);
  const encodedRepo = encodeURIComponent(repo);
  const githubURL = `https://github.com/${encodedOrg}/${encodedRepo}`;
  return `https://gitpod.io/#${githubURL}`;
}
__name(buildGitpodURL, "buildGitpodURL");
async function fetchR2Metadata(env, path, requestId) {
  const logger5 = createLogger({ operation: "fetch_r2_metadata", requestId });
  const startTime = Date.now();
  try {
    const object = await env.R2.head(path);
    const duration = Date.now() - startTime;
    if (!object) {
      logger5.warn("R2 object not found", { path, duration });
      return {};
    }
    logger5.info("R2 metadata fetched", {
      path,
      duration,
      hasCustomMetadata: !!object.customMetadata
    });
    if (duration > SLOW_ENRICHMENT_THRESHOLD) {
      logger5.warn("Slow R2 HEAD request", {
        path,
        duration,
        threshold: SLOW_ENRICHMENT_THRESHOLD
      });
    }
    return {
      pushedAt: object.customMetadata?.pushedAt,
      url: object.customMetadata?.url,
      processedAt: object.customMetadata?.processedAt
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger5.error("R2 metadata fetch failed", {
      path,
      duration,
      error: error instanceof Error ? error.message : String(error)
    });
    return {};
  }
}
__name(fetchR2Metadata, "fetchR2Metadata");
async function enrichResult(env, rawResult) {
  const requestId = crypto.randomUUID();
  const logger5 = createLogger({ operation: "enrich_result", requestId });
  const startTime = Date.now();
  const parsed = parseR2Path(rawResult.metadata.path);
  if (!parsed.valid) {
    logger5.error("Invalid R2 path", {
      path: rawResult.metadata.path,
      error: parsed.error
    });
    const duration2 = Date.now() - startTime;
    logger5.info("Result enrichment completed (minimal)", { duration: duration2 });
    return {
      content: rawResult.content,
      score: rawResult.score,
      repository: {
        org: "unknown",
        name: "unknown",
        fullName: "unknown/unknown"
      },
      links: {
        github: "",
        codespaces: "",
        gitpod: ""
      },
      r2Path: rawResult.metadata.path
    };
  }
  const githubURL = buildGitHubURL(parsed.org, parsed.repo);
  const codespacesURL = buildCodespacesURL(parsed.org, parsed.repo);
  const gitpodURL = buildGitpodURL(parsed.org, parsed.repo);
  const r2Metadata = await fetchR2Metadata(env, rawResult.metadata.path, requestId);
  const duration = Date.now() - startTime;
  logger5.info("Result enriched", {
    duration,
    org: parsed.org,
    repo: parsed.repo,
    hasMetadata: Object.keys(r2Metadata).length > 0
  });
  if (duration > SLOW_ENRICHMENT_THRESHOLD) {
    logger5.warn("Slow result enrichment", {
      duration,
      threshold: SLOW_ENRICHMENT_THRESHOLD,
      org: parsed.org,
      repo: parsed.repo
    });
  }
  const enrichedResult = {
    content: rawResult.content,
    score: rawResult.score,
    repository: {
      org: parsed.org,
      name: parsed.repo,
      fullName: `${parsed.org}/${parsed.repo}`
    },
    links: {
      github: githubURL,
      codespaces: codespacesURL,
      gitpod: gitpodURL
    },
    r2Path: rawResult.metadata.path
  };
  if (Object.keys(r2Metadata).length > 0) {
    enrichedResult.metadata = r2Metadata;
  }
  return enrichedResult;
}
__name(enrichResult, "enrichResult");
async function enrichResults(env, rawResults) {
  const requestId = crypto.randomUUID();
  const logger5 = createLogger({ operation: "enrich_results", requestId });
  const startTime = Date.now();
  const enrichedResults = await Promise.all(rawResults.map((result) => enrichResult(env, result)));
  const duration = Date.now() - startTime;
  const avgDuration = rawResults.length > 0 ? duration / rawResults.length : 0;
  logger5.info("Batch enrichment complete", {
    duration,
    resultCount: rawResults.length,
    avgDuration: Math.round(avgDuration)
  });
  if (avgDuration > SLOW_ENRICHMENT_THRESHOLD) {
    logger5.warn("Slow batch enrichment", {
      avgDuration: Math.round(avgDuration),
      threshold: SLOW_ENRICHMENT_THRESHOLD,
      resultCount: rawResults.length
    });
  }
  return enrichedResults;
}
__name(enrichResults, "enrichResults");

// src/utils/metrics.ts
function calculateEmptyResultRate(collector) {
  if (collector.total_queries === 0) {
    return 0;
  }
  return collector.queries_with_zero_results / collector.total_queries * 100;
}
__name(calculateEmptyResultRate, "calculateEmptyResultRate");
function calculateSlowQueryRate(collector) {
  if (collector.total_queries === 0) {
    return 0;
  }
  return collector.queries_over_2s / collector.total_queries * 100;
}
__name(calculateSlowQueryRate, "calculateSlowQueryRate");
function trackQueryResult(collector, resultCount, logger5) {
  collector.total_queries++;
  if (resultCount === 0) {
    collector.queries_with_zero_results++;
  }
  if (logger5) {
    logger5.debug("Query result tracked", {
      result_count: resultCount,
      empty: resultCount === 0,
      total_queries: collector.total_queries,
      empty_rate: calculateEmptyResultRate(collector).toFixed(2)
    });
  }
}
__name(trackQueryResult, "trackQueryResult");
function trackQueryDuration(collector, durationMs, logger5) {
  const SLOW_QUERY_THRESHOLD_MS = 2e3;
  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    collector.queries_over_2s++;
    if (logger5) {
      logger5.warn("Slow query detected", {
        duration_ms: durationMs,
        threshold_ms: SLOW_QUERY_THRESHOLD_MS,
        slow_query_rate: calculateSlowQueryRate(collector).toFixed(2)
      });
    }
  } else if (logger5) {
    logger5.debug("Query duration tracked", {
      duration_ms: durationMs,
      slow: false
    });
  }
}
__name(trackQueryDuration, "trackQueryDuration");
function trackError(collector, errorType, logger5) {
  if (!collector.errors_by_type[errorType]) {
    collector.errors_by_type[errorType] = 0;
  }
  collector.errors_by_type[errorType]++;
  if (logger5) {
    logger5.debug("Error tracked", {
      error_type: errorType,
      count: collector.errors_by_type[errorType],
      total_error_types: Object.keys(collector.errors_by_type).length
    });
  }
}
__name(trackError, "trackError");
function createMetricsCollector() {
  return {
    total_cache_checks: 0,
    cache_hits: 0,
    total_queries: 0,
    queries_with_zero_results: 0,
    queries_over_2s: 0,
    errors_by_type: {}
  };
}
__name(createMetricsCollector, "createMetricsCollector");

// src/api/search-endpoint.ts
async function executeSearch(request, env, metricsCollector) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const logger5 = createLogger({ operation: "execute_search", requestId });
  logger5.info("Search request started", {
    query: request.query.substring(0, 100),
    // Truncate for privacy (Story 4.1 pattern)
    limit: request.limit
  });
  try {
    const aiSearchStartTime = Date.now();
    const aiResults = await searchCode(env, request.query, request.limit);
    const aiSearchDuration = Date.now() - aiSearchStartTime;
    logger5.info("AI Search completed", {
      duration: aiSearchDuration,
      resultCount: aiResults.length
    });
    if (aiSearchDuration > 800) {
      logger5.warn("Slow AI Search query detected", {
        duration: aiSearchDuration,
        threshold: 800,
        query: request.query.substring(0, 100)
      });
    }
    if (aiResults.length === 0) {
      const emptyDuration = Date.now() - startTime;
      logger5.info("No results found for query", {
        duration: emptyDuration,
        query: request.query.substring(0, 100)
      });
      if (metricsCollector) {
        trackQueryResult(metricsCollector, 0, logger5);
        trackQueryDuration(metricsCollector, emptyDuration, logger5);
      }
      return {
        results: [],
        took_ms: emptyDuration
      };
    }
    const enrichStartTime = Date.now();
    const enrichedResults = await enrichResults(env, aiResults);
    const enrichDuration = Date.now() - enrichStartTime;
    logger5.info("Result enrichment completed", {
      duration: enrichDuration,
      resultCount: enrichedResults.length
    });
    const mappedResults = enrichedResults.map((enriched) => mapToSearchResult(enriched));
    const totalDuration = Date.now() - startTime;
    logger5.info("Search request completed", {
      duration: totalDuration,
      resultCount: mappedResults.length,
      aiSearchDuration,
      enrichDuration
    });
    if (metricsCollector) {
      trackQueryResult(metricsCollector, mappedResults.length, logger5);
      trackQueryDuration(metricsCollector, totalDuration, logger5);
    }
    if (totalDuration > 2e3) {
      logger5.warn("Search request exceeded performance target", {
        duration: totalDuration,
        target: 2e3,
        query: request.query.substring(0, 100)
      });
    }
    return {
      results: mappedResults,
      took_ms: totalDuration
    };
  } catch (error) {
    const errorDuration = Date.now() - startTime;
    logger5.error("Search request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      duration: errorDuration,
      query: request.query.substring(0, 100)
    });
    if (metricsCollector) {
      const errorType = error instanceof ServiceError ? error.code : error instanceof Error ? error.name : "UNKNOWN_ERROR";
      trackError(metricsCollector, errorType, logger5);
    }
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError("Search service temporarily unavailable", 503, "SEARCH_ERROR", 60);
  }
}
__name(executeSearch, "executeSearch");
function mapToSearchResult(enriched) {
  const filePath = enriched.r2Path || "summary.txt";
  return {
    repository: enriched.repository.fullName,
    file_path: filePath,
    match_snippet: enriched.content,
    relevance_score: enriched.score,
    metadata: {
      language: enriched.metadata?.language || "Unknown",
      stars: 0,
      // Not available in R2 metadata (could add from repos.json in Phase 2)
      last_updated: enriched.metadata?.pushedAt || enriched.metadata?.processedAt || (/* @__PURE__ */ new Date()).toISOString(),
      github_url: enriched.links.github
    }
  };
}
__name(mapToSearchResult, "mapToSearchResult");

// src/api/mcp-handler.ts
var QUERY_MIN_LENGTH = 3;
var QUERY_MAX_LENGTH = 500;
var LIMIT_MIN = 1;
var LIMIT_MAX = 20;
var LIMIT_DEFAULT = 5;
var MAX_PAYLOAD_SIZE_KB = 1;
var MCP_VERSION = "2";
var ERROR_CODES = {
  INVALID_QUERY: "INVALID_QUERY",
  INVALID_LIMIT: "INVALID_LIMIT",
  INVALID_CONTENT_TYPE: "INVALID_CONTENT_TYPE",
  MALFORMED_JSON: "MALFORMED_JSON",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  SEARCH_ERROR: "SEARCH_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR"
};
async function validateMCPRequest(request) {
  const logger5 = createLogger({ operation: "validate_mcp_request" });
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new ValidationError(
      "Content-Type must be application/json",
      ERROR_CODES.INVALID_CONTENT_TYPE
    );
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_SIZE_KB * 1024) {
    throw new ValidationError(
      `Request payload must be less than ${MAX_PAYLOAD_SIZE_KB}KB`,
      ERROR_CODES.PAYLOAD_TOO_LARGE
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON", ERROR_CODES.MALFORMED_JSON);
  }
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Request body must be a JSON object", ERROR_CODES.MALFORMED_JSON);
  }
  const requestBody = body;
  if (!requestBody.query || typeof requestBody.query !== "string") {
    throw new ValidationError(
      "Query field is required and must be a string",
      ERROR_CODES.INVALID_QUERY
    );
  }
  const trimmedQuery = requestBody.query.trim();
  if (trimmedQuery.length < QUERY_MIN_LENGTH) {
    throw new ValidationError(
      `Query must be at least ${QUERY_MIN_LENGTH} characters`,
      ERROR_CODES.INVALID_QUERY
    );
  }
  if (trimmedQuery.length > QUERY_MAX_LENGTH) {
    throw new ValidationError(
      `Query must be at most ${QUERY_MAX_LENGTH} characters`,
      ERROR_CODES.INVALID_QUERY
    );
  }
  let limit = LIMIT_DEFAULT;
  if (requestBody.limit !== void 0) {
    const limitValue = requestBody.limit;
    if (typeof limitValue !== "number" || !Number.isInteger(limitValue)) {
      throw new ValidationError("Limit must be an integer", ERROR_CODES.INVALID_LIMIT);
    }
    if (limitValue < LIMIT_MIN || limitValue > LIMIT_MAX) {
      throw new ValidationError(
        `Limit must be between ${LIMIT_MIN} and ${LIMIT_MAX}`,
        ERROR_CODES.INVALID_LIMIT
      );
    }
    limit = limitValue;
  }
  const mcpVersion = request.headers.get("x-mcp-version");
  if (mcpVersion !== MCP_VERSION) {
    logger5.warn("MCP version mismatch or missing", {
      expected: MCP_VERSION,
      received: mcpVersion || "none"
    });
  }
  return {
    query: trimmedQuery,
    limit
  };
}
__name(validateMCPRequest, "validateMCPRequest");
function addCORSHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-MCP-Version, X-Request-ID");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(addCORSHeaders, "addCORSHeaders");
function handleOPTIONS() {
  return addCORSHeaders(
    new Response(null, {
      status: 204,
      headers: {
        "Content-Type": "application/json"
      }
    })
  );
}
__name(handleOPTIONS, "handleOPTIONS");
function formatErrorResponse(error) {
  const logger5 = createLogger({ operation: "format_error_response" });
  let statusCode = 500;
  let errorResponse;
  if (error instanceof ValidationError) {
    statusCode = 400;
    errorResponse = {
      error: {
        code: error.code,
        message: error.message
      }
    };
  } else if (error instanceof ServiceError) {
    statusCode = error.statusCode;
    errorResponse = {
      error: {
        code: error.code,
        message: error.message,
        retry_after: error.retryAfter
      }
    };
  } else {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : void 0;
    logger5.error("Unhandled exception", {
      error: errorMessage,
      stack: errorStack
    });
    errorResponse = {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "An unexpected error occurred"
      }
    };
  }
  return addCORSHeaders(
    new Response(JSON.stringify(errorResponse), {
      status: statusCode,
      headers: {
        "Content-Type": "application/json"
      }
    })
  );
}
__name(formatErrorResponse, "formatErrorResponse");
async function handleMCPSearch(request, env) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const startTime = Date.now();
  const logger5 = createLogger({ operation: "mcp_search", requestId });
  try {
    const mcpRequest = await validateMCPRequest(request);
    logger5.info("MCP request validated", {
      query: mcpRequest.query.substring(0, 100),
      // Truncate for privacy
      limit: mcpRequest.limit
    });
    const metricsCollector = createMetricsCollector();
    const mcpResponse = await executeSearch(mcpRequest, env, metricsCollector);
    const duration = Date.now() - startTime;
    logger5.info("MCP search completed", {
      duration,
      resultCount: mcpResponse.results.length,
      statusCode: 200
    });
    return addCORSHeaders(
      new Response(JSON.stringify(mcpResponse), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-MCP-Version": MCP_VERSION,
          "X-Request-ID": requestId
        }
      })
    );
  } catch (error) {
    logger5.error("MCP search failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      duration: Date.now() - startTime
    });
    return formatErrorResponse(error);
  }
}
__name(handleMCPSearch, "handleMCPSearch");

// static/openapi.json
var openapi_default = {
  openapi: "3.0.3",
  info: {
    title: "govscraperepo MCP API",
    description: "Semantic search API for discovering code patterns and implementations across UK government repositories. This API provides MCP v2 protocol-compliant endpoints for searching through indexed government code repositories using natural language queries. Powered by Cloudflare AI Search for intelligent, context-aware code discovery.",
    version: "1.0.0",
    contact: {
      name: "GitHub Issues",
      url: "https://github.com/chrisns/govreposcrape/issues"
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT"
    }
  },
  servers: [
    {
      url: "https://govreposcrape.cloud.cns.me",
      description: "Production API server"
    }
  ],
  security: [],
  paths: {
    "/mcp/search": {
      post: {
        summary: "Semantic code search",
        description: "Execute a semantic search query across indexed UK government repositories. Returns relevant code snippets ranked by similarity score. Supports natural language queries for discovering code patterns, implementations, and examples.",
        operationId: "searchCode",
        tags: ["MCP API"],
        parameters: [
          {
            name: "X-MCP-Version",
            in: "header",
            description: "MCP protocol version (optional but recommended)",
            required: false,
            schema: {
              type: "string",
              example: "2"
            }
          },
          {
            name: "X-Request-ID",
            in: "header",
            description: "Client-provided request correlation ID (optional)",
            required: false,
            schema: {
              type: "string",
              format: "uuid"
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MCPRequest"
              },
              examples: {
                authentication: {
                  summary: "Search for authentication implementations",
                  value: {
                    query: "authentication middleware JWT token validation",
                    limit: 5
                  }
                },
                api_endpoints: {
                  summary: "Search for API endpoint patterns",
                  value: {
                    query: "REST API endpoint handler Express routes",
                    limit: 10
                  }
                },
                data_validation: {
                  summary: "Search for data validation examples",
                  value: {
                    query: "form validation schema Zod TypeScript"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Successful search with results",
            headers: {
              "X-MCP-Version": {
                schema: {
                  type: "string",
                  example: "2"
                },
                description: "MCP protocol version"
              },
              "X-Request-ID": {
                schema: {
                  type: "string",
                  format: "uuid"
                },
                description: "Request correlation ID"
              },
              "Access-Control-Allow-Origin": {
                schema: {
                  type: "string",
                  example: "*"
                },
                description: "CORS header for cross-origin requests"
              }
            },
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/MCPResponse"
                },
                examples: {
                  success_with_results: {
                    summary: "Successful search with 5 results",
                    value: {
                      results: [
                        {
                          repository: "alphagov/govuk-frontend",
                          file_path: "src/auth/middleware/jwt-validator.ts",
                          match_snippet: "export function validateJWT(token: string): boolean {\n  const decoded = jwt.verify(token, process.env.JWT_SECRET);\n  return decoded.exp > Date.now();\n}",
                          relevance_score: 0.92,
                          metadata: {
                            language: "TypeScript",
                            stars: 1250,
                            last_updated: "2025-11-10T14:30:00Z",
                            github_url: "https://github.com/alphagov/govuk-frontend"
                          }
                        },
                        {
                          repository: "ministryofjustice/cloud-platform",
                          file_path: "lib/auth/token-handler.js",
                          match_snippet: "class TokenHandler {\n  validateToken(req, res, next) {\n    const token = req.headers.authorization?.split(' ')[1];\n    if (!token) return res.status(401).json({ error: 'No token provided' });\n    // Verify JWT token\n  }\n}",
                          relevance_score: 0.87,
                          metadata: {
                            language: "JavaScript",
                            stars: 890,
                            last_updated: "2025-11-09T10:15:00Z",
                            github_url: "https://github.com/ministryofjustice/cloud-platform"
                          }
                        },
                        {
                          repository: "nhsconnect/prm-deductions",
                          file_path: "src/middleware/auth.ts",
                          match_snippet: "async function authenticateRequest(req: Request): Promise<User> {\n  const authHeader = req.headers.get('Authorization');\n  const token = extractToken(authHeader);\n  return await verifyJWT(token);\n}",
                          relevance_score: 0.84,
                          metadata: {
                            language: "TypeScript",
                            stars: 450,
                            last_updated: "2025-11-08T16:45:00Z",
                            github_url: "https://github.com/nhsconnect/prm-deductions"
                          }
                        },
                        {
                          repository: "defra/water-abstraction-service",
                          file_path: "server/auth/jwt-strategy.js",
                          match_snippet: "const JWTStrategy = require('passport-jwt').Strategy;\nconst opts = {\n  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),\n  secretOrKey: config.jwt.secret\n};",
                          relevance_score: 0.79,
                          metadata: {
                            language: "JavaScript",
                            stars: 320,
                            last_updated: "2025-11-07T12:00:00Z",
                            github_url: "https://github.com/defra/water-abstraction-service"
                          }
                        },
                        {
                          repository: "DFE-Digital/login.dfe.public-api",
                          file_path: "src/app/utils/jwtAuth.js",
                          match_snippet: "const validateJwtToken = (token) => {\n  try {\n    const decoded = jwt.verify(token, config.auth.jwtSecret);\n    return { valid: true, userId: decoded.sub };\n  } catch (err) {\n    return { valid: false, error: err.message };\n  }\n};",
                          relevance_score: 0.75,
                          metadata: {
                            language: "JavaScript",
                            stars: 180,
                            last_updated: "2025-11-06T09:30:00Z",
                            github_url: "https://github.com/DFE-Digital/login.dfe.public-api"
                          }
                        }
                      ],
                      took_ms: 245
                    }
                  },
                  no_results: {
                    summary: "Successful search with no results",
                    value: {
                      results: [],
                      took_ms: 120
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Bad request - invalid query parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                },
                examples: {
                  query_too_short: {
                    summary: "Query below minimum length",
                    value: {
                      error: {
                        code: "INVALID_QUERY",
                        message: "Query must be at least 3 characters"
                      }
                    }
                  },
                  query_too_long: {
                    summary: "Query exceeds maximum length",
                    value: {
                      error: {
                        code: "INVALID_QUERY",
                        message: "Query must be at most 500 characters"
                      }
                    }
                  },
                  invalid_limit: {
                    summary: "Limit out of range",
                    value: {
                      error: {
                        code: "INVALID_LIMIT",
                        message: "Limit must be between 1 and 20"
                      }
                    }
                  },
                  invalid_content_type: {
                    summary: "Wrong Content-Type header",
                    value: {
                      error: {
                        code: "INVALID_CONTENT_TYPE",
                        message: "Content-Type must be application/json"
                      }
                    }
                  },
                  malformed_json: {
                    summary: "Invalid JSON in request body",
                    value: {
                      error: {
                        code: "MALFORMED_JSON",
                        message: "Request body must be valid JSON"
                      }
                    }
                  }
                }
              }
            }
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                },
                examples: {
                  internal_error: {
                    summary: "Unexpected internal error",
                    value: {
                      error: {
                        code: "INTERNAL_ERROR",
                        message: "An unexpected error occurred"
                      }
                    }
                  }
                }
              }
            }
          },
          "503": {
            description: "Service unavailable - search service temporarily unavailable",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                },
                examples: {
                  search_service_down: {
                    summary: "AI Search service unavailable",
                    value: {
                      error: {
                        code: "SEARCH_ERROR",
                        message: "Search service is temporarily unavailable",
                        retry_after: 60
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/mcp/health": {
      get: {
        summary: "Health check",
        description: "Check the health status of all service dependencies (KV, R2, Vectorize, D1, AI Search). Returns 200 OK when all services are accessible, 503 Service Unavailable when any service fails.",
        operationId: "checkHealth",
        tags: ["MCP API"],
        responses: {
          "200": {
            description: "All services healthy",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthCheckResponse"
                },
                examples: {
                  all_healthy: {
                    summary: "All services operational",
                    value: {
                      status: "healthy",
                      services: {
                        kv: {
                          name: "KV Namespace",
                          status: "ok"
                        },
                        r2: {
                          name: "R2 Bucket",
                          status: "ok"
                        },
                        vectorize: {
                          name: "Vectorize Index",
                          status: "ok"
                        },
                        d1: {
                          name: "D1 Database",
                          status: "ok"
                        },
                        ai_search: {
                          name: "AI Search",
                          status: "ok"
                        }
                      },
                      timestamp: "2025-11-14T10:30:00.000Z"
                    }
                  }
                }
              }
            }
          },
          "503": {
            description: "One or more services unhealthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: {
                      type: "object",
                      properties: {
                        code: {
                          type: "string",
                          example: "SERVICE_UNAVAILABLE"
                        },
                        message: {
                          type: "string",
                          example: "One or more services are unavailable"
                        }
                      },
                      required: ["code", "message"]
                    },
                    details: {
                      $ref: "#/components/schemas/HealthCheckResponse"
                    }
                  },
                  required: ["error", "details"]
                },
                examples: {
                  ai_search_down: {
                    summary: "AI Search service failure",
                    value: {
                      error: {
                        code: "SERVICE_UNAVAILABLE",
                        message: "One or more services are unavailable"
                      },
                      details: {
                        status: "unhealthy",
                        services: {
                          kv: {
                            name: "KV Namespace",
                            status: "ok"
                          },
                          r2: {
                            name: "R2 Bucket",
                            status: "ok"
                          },
                          vectorize: {
                            name: "Vectorize Index",
                            status: "ok"
                          },
                          d1: {
                            name: "D1 Database",
                            status: "ok"
                          },
                          ai_search: {
                            name: "AI Search",
                            status: "failed",
                            error: "Connection timeout"
                          }
                        },
                        timestamp: "2025-11-14T10:30:00.000Z"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      MCPRequest: {
        type: "object",
        description: "MCP v2 search request payload",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "Natural language search query (3-500 characters). Use descriptive phrases to find relevant code patterns, implementations, or examples.",
            minLength: 3,
            maxLength: 500,
            example: "authentication middleware JWT token validation"
          },
          limit: {
            type: "integer",
            description: "Maximum number of results to return (1-20). Defaults to 5 if not specified.",
            minimum: 1,
            maximum: 20,
            default: 5,
            example: 10
          }
        }
      },
      MCPResponse: {
        type: "object",
        description: "MCP v2 search response with results and performance metrics",
        required: ["results", "took_ms"],
        properties: {
          results: {
            type: "array",
            description: "Array of search results ranked by relevance score (highest first). May be empty if no matches found.",
            items: {
              $ref: "#/components/schemas/SearchResult"
            }
          },
          took_ms: {
            type: "number",
            description: "Query execution time in milliseconds",
            example: 245
          }
        }
      },
      SearchResult: {
        type: "object",
        description: "A single search result with code snippet and repository metadata",
        required: [
          "repository",
          "file_path",
          "match_snippet",
          "relevance_score",
          "metadata"
        ],
        properties: {
          repository: {
            type: "string",
            description: "Repository identifier in 'org/repo' format",
            example: "alphagov/govuk-frontend"
          },
          file_path: {
            type: "string",
            description: "Path to the file within the repository",
            example: "src/auth/middleware/jwt-validator.ts"
          },
          match_snippet: {
            type: "string",
            description: "Code snippet matching the search query (may be truncated for brevity)",
            example: "export function validateJWT(token: string): boolean {\n  const decoded = jwt.verify(token, process.env.JWT_SECRET);\n  return decoded.exp > Date.now();\n}"
          },
          relevance_score: {
            type: "number",
            description: "Semantic similarity score (0.0-1.0) indicating relevance to query. Higher scores indicate better matches.",
            minimum: 0,
            maximum: 1,
            example: 0.92
          },
          metadata: {
            type: "object",
            description: "Additional repository and result metadata",
            required: ["language", "stars", "last_updated", "github_url"],
            properties: {
              language: {
                type: "string",
                description: "Primary programming language of the file",
                example: "TypeScript"
              },
              stars: {
                type: "integer",
                description: "GitHub star count for the repository",
                example: 1250
              },
              last_updated: {
                type: "string",
                format: "date-time",
                description: "Last update timestamp (ISO 8601 format)",
                example: "2025-11-10T14:30:00Z"
              },
              github_url: {
                type: "string",
                format: "uri",
                description: "Direct link to the GitHub repository",
                example: "https://github.com/alphagov/govuk-frontend"
              }
            }
          }
        }
      },
      HealthCheckResponse: {
        type: "object",
        description: "Health check response showing status of all service dependencies",
        required: ["status", "services", "timestamp"],
        properties: {
          status: {
            type: "string",
            description: "Overall health status: 'healthy' when all services ok, 'unhealthy' when any service fails",
            enum: ["healthy", "unhealthy"],
            example: "healthy"
          },
          services: {
            type: "object",
            description: "Individual service health statuses",
            additionalProperties: {
              $ref: "#/components/schemas/ServiceStatus"
            },
            example: {
              kv: {
                name: "KV Namespace",
                status: "ok"
              },
              r2: {
                name: "R2 Bucket",
                status: "ok"
              },
              vectorize: {
                name: "Vectorize Index",
                status: "ok"
              },
              d1: {
                name: "D1 Database",
                status: "ok"
              },
              ai_search: {
                name: "AI Search",
                status: "ok"
              }
            }
          },
          timestamp: {
            type: "string",
            format: "date-time",
            description: "Health check execution time (ISO 8601 format)",
            example: "2025-11-14T10:30:00.000Z"
          }
        }
      },
      ServiceStatus: {
        type: "object",
        description: "Health status for a single service",
        required: ["name", "status"],
        properties: {
          name: {
            type: "string",
            description: "Human-readable service name",
            example: "AI Search"
          },
          status: {
            type: "string",
            description: "Service connection status",
            enum: ["ok", "failed"],
            example: "ok"
          },
          error: {
            type: "string",
            description: "Error message if service status is 'failed' (optional)",
            example: "Connection timeout"
          }
        }
      },
      ErrorResponse: {
        type: "object",
        description: "Structured error response for all API errors",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            description: "Error details with machine-readable code and human-readable message",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                description: "Machine-readable error code for programmatic handling",
                enum: [
                  "INVALID_QUERY",
                  "INVALID_LIMIT",
                  "INVALID_CONTENT_TYPE",
                  "MALFORMED_JSON",
                  "PAYLOAD_TOO_LARGE",
                  "SEARCH_ERROR",
                  "INTERNAL_ERROR",
                  "SERVICE_UNAVAILABLE"
                ],
                example: "INVALID_QUERY"
              },
              message: {
                type: "string",
                description: "Human-readable error message explaining what went wrong",
                example: "Query must be at least 3 characters"
              },
              retry_after: {
                type: "integer",
                description: "Suggested retry delay in seconds (optional, for rate limiting or service unavailable errors)",
                example: 60
              }
            }
          }
        }
      }
    },
    securitySchemes: {}
  },
  tags: [
    {
      name: "MCP API",
      description: "MCP v2 protocol endpoints for semantic code search and health monitoring"
    }
  ],
  externalDocs: {
    description: "Integration guides and documentation",
    url: "https://github.com/chrisns/govreposcrape/blob/main/README.md"
  }
};

// src/index.ts
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    const logLevel = env.LOG_LEVEL || "debug";
    const logger5 = createLogger({ operation: "fetch", requestId }, logLevel);
    logger5.info("Request received", {
      method: request.method,
      path: url.pathname
    });
    try {
      let response;
      if (request.method === "OPTIONS") {
        response = handleOPTIONS();
      } else if (request.method === "POST" && url.pathname === "/mcp/search") {
        response = await handleMCPSearch(request, env);
      } else if ((url.pathname === "/health" || url.pathname === "/mcp/health") && request.method === "GET") {
        response = await checkHealth(env, requestId);
      } else if (url.pathname === "/openapi.json" && request.method === "GET") {
        response = new Response(JSON.stringify(openapi_default), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        });
        logger5.info("OpenAPI spec served", { requestId });
      } else if (url.pathname === "/cache/stats" && request.method === "GET") {
        response = await getCacheStatistics(requestId);
      } else if (url.pathname.startsWith("/cache/") && url.pathname !== "/cache/stats") {
        if (request.method === "GET") {
          response = await getCacheEntry(url, env, requestId);
        } else if (request.method === "PUT") {
          response = await putCacheEntry(url, request, env, requestId);
        } else {
          response = new Response(
            JSON.stringify({
              error: {
                code: "METHOD_NOT_ALLOWED",
                message: "Method not allowed for cache endpoints"
              }
            }),
            {
              status: 405,
              headers: {
                "Content-Type": "application/json",
                Allow: "GET, PUT"
              }
            }
          );
        }
      } else if (url.pathname === "/" && request.method === "GET") {
        response = new Response(
          JSON.stringify({
            name: "govreposcrape",
            version: "1.0.0",
            status: "running",
            message: "UK Government Code Repository Search - Cloudflare Workers",
            endpoints: {
              mcp_search: "/mcp/search",
              health: "/health",
              mcp_health: "/mcp/health",
              openapi_spec: "/openapi.json",
              cache_get: "/cache/:org/:repo?pushedAt=<timestamp>",
              cache_put: "/cache/:org/:repo",
              cache_stats: "/cache/stats"
            }
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      } else {
        response = new Response(
          JSON.stringify({
            error: {
              code: "NOT_FOUND",
              message: "Route not found"
            }
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
        logger5.warn("Route not found", {
          path: url.pathname
        });
      }
      const duration = Date.now() - startTime;
      if (duration > 2e3) {
        logger5.warn("Slow request detected", {
          duration,
          statusCode: response.status,
          path: url.pathname,
          threshold: "2000ms (NFR-1.1)"
        });
      }
      logger5.info("Request completed", {
        duration,
        statusCode: response.status,
        path: url.pathname
      });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger5.error("Request failed with unhandled error", {
        duration,
        path: url.pathname,
        method: request.method,
        error: error instanceof Error ? error.message : "Unknown error",
        errorName: error instanceof Error ? error.name : void 0,
        // Stack trace filtered in production to avoid exposing internal implementation details
        ...env.ENVIRONMENT !== "production" && error instanceof Error && { stack: error.stack }
      });
      const errorResponse = formatErrorResponse(error);
      logger5.info("Request completed with error", {
        duration,
        statusCode: errorResponse.status
      });
      return errorResponse;
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-NTKv1p/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-NTKv1p/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
