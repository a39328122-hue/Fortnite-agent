let manifestCache = null;
const textCache = new Map();
const resultCache = new Map();

const RESULT_CACHE_LIMIT = 40;
const TEXT_CACHE_LIMIT = 48;
const DEFAULT_LIMIT = 80;
const MAX_RESULT_SET = 1200;

self.addEventListener("message", async (event) => {
  const msg = event.data || {};

  if (msg.type !== "search") return;

  try {
    const data = await search(
      String(msg.scope || "all"),
      String(msg.query || ""),
      msg.config || {}
    );

    self.postMessage({
      id: msg.id,
      ok: true,
      data
    });
  } catch (error) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: String(error?.message || error)
    });
  }
});

async function search(scope, query, config) {
  const cleanScope = normalizeScope(scope);
  const tokens = tokenize(query);

  if (!tokens.length) {
    return {
      total: 0,
      results: [],
      allResults: [],
      makeFile: false,
      source: "none"
    };
  }

  const cacheKey =
    `${cleanScope}|${tokens.join("\u001f")}`;

  const cached = resultCache.get(cacheKey);

  if (cached) {
    touchMap(resultCache, cacheKey, cached);
    return cached;
  }

  const manifest = await loadManifest(config);
  const primaryKey = shardKey(tokens[0]);

  const candidates = [];
  let source = "shard";

  const scopeManifest =
    manifest?.scopes?.[cleanScope] || null;

  if (scopeManifest?.shards?.[primaryKey]?.path) {
    const shardPath =
      resolveDatabasePath(
        config,
        scopeManifest.shards[primaryKey].path
      );

    candidates.push(
      ...(await loadGzipLines(shardPath))
    );
  }

  // If the first token lands in an empty or overly narrow shard, use a full
  // scope fallback. This keeps multi-token/path-fragment searches reliable.
  if (candidates.length < 24) {
    const fullPath =
      scopeManifest?.full?.path
        ? resolveDatabasePath(
            config,
            scopeManifest.full.path
          )
        : legacyScopeUrl(cleanScope, config);

    if (fullPath) {
      source = "full";
      candidates.push(
        ...(await loadGzipLines(fullPath))
      );
    }
  }

  // JSON references are useful for meshes/materials, but should not outrank a
  // direct asset hit unless their textual match is genuinely stronger.
  const jsonCandidates = [];

  if (
    cleanScope === "all" ||
    cleanScope === "meshes" ||
    cleanScope === "m"
  ) {
    const jsonPath =
      manifest?.jsonReferences?.path
        ? resolveDatabasePath(
            config,
            manifest.jsonReferences.path
          )
        : config.json ||
          "./database/index/json-references.txt.gz";

    try {
      jsonCandidates.push(
        ...(await loadGzipLines(jsonPath))
      );
    } catch {
      // Optional evidence only.
    }
  }

  const ranked = rankCandidates(
    candidates,
    jsonCandidates,
    tokens,
    cleanScope
  );

  const allResults = ranked
    .slice(0, MAX_RESULT_SET)
    .map((item) => ({
      path: item.path,
      source: item.source,
      match: item.match,
      score: item.score
    }));

  const payload = {
    total: allResults.length,
    results: allResults.slice(0, DEFAULT_LIMIT),
    allResults,
    makeFile: allResults.length >= 120,
    source,
    scope: cleanScope,
    shard: primaryKey
  };

  rememberResult(cacheKey, payload);
  return payload;
}

function rankCandidates(
  assetCandidates,
  jsonCandidates,
  tokens,
  scope
) {
  const bestByPath = new Map();

  scoreCollection(
    assetCandidates,
    "assets",
    tokens,
    scope,
    0,
    bestByPath
  );

  scoreCollection(
    jsonCandidates,
    "json",
    tokens,
    scope,
    -15,
    bestByPath
  );

  return [...bestByPath.values()]
    .filter((item) => item.matched > 0)
    .sort((a, b) =>
      b.matched - a.matched ||
      b.score - a.score ||
      a.path.length - b.path.length ||
      a.path.localeCompare(b.path)
    );
}

function scoreCollection(
  paths,
  source,
  tokens,
  scope,
  sourceBias,
  bestByPath
) {
  for (const rawPath of paths) {
    const path = String(rawPath || "").trim();
    if (!path) continue;

    const scored = scorePath(
      path,
      tokens,
      scope
    );

    if (!scored.matched) continue;

    const item = {
      path,
      source,
      matched: scored.matched,
      score: scored.score + sourceBias,
      match: scored.match
    };

    const key = path.toLowerCase();
    const previous = bestByPath.get(key);

    if (
      !previous ||
      item.matched > previous.matched ||
      (
        item.matched === previous.matched &&
        item.score > previous.score
      )
    ) {
      bestByPath.set(key, item);
    }
  }
}

function scorePath(path, tokens, scope) {
  const lower = path.toLowerCase();
  const file = basename(lower);
  const logical = logicalName(file);
  const words = wordify(logical);

  let score = scopeBonus(
    file,
    lower,
    scope
  );

  let matched = 0;
  let exactTokenMatches = 0;

  for (const token of tokens) {
    const tokenLower = token.toLowerCase();

    const inPath =
      lower.includes(tokenLower);

    const inFile =
      file.includes(tokenLower);

    const inLogical =
      logical.includes(tokenLower);

    const inWords =
      words.includes(tokenLower);

    if (!inPath) continue;

    matched++;

    if (inPath) score += tokenLower.length * 4;
    if (inFile) score += tokenLower.length * 12;
    if (inLogical) score += tokenLower.length * 16;
    if (inWords) score += tokenLower.length * 18;

    if (
      file === tokenLower ||
      logical === tokenLower ||
      words === tokenLower
    ) {
      score += 2200;
      exactTokenMatches++;
    } else if (
      file.startsWith(tokenLower) ||
      logical.startsWith(tokenLower)
    ) {
      score += 850;
    } else if (
      wordStartsWith(words, tokenLower)
    ) {
      score += 500;
    }
  }

  if (!matched) {
    // Tiny fuzzy pass for typos on a single reasonably long token.
    if (tokens.length === 1 && tokens[0].length >= 4) {
      const distance =
        boundedLevenshtein(
          logical,
          tokens[0].toLowerCase(),
          2
        );

      if (distance <= 2) {
        return {
          matched: 1,
          score: 280 - distance * 80,
          match: "fuzzy"
        };
      }
    }

    return {
      matched: 0,
      score: 0,
      match: "none"
    };
  }

  if (tokens.every((token) =>
    file.includes(token)
  )) {
    score += 1000;
  }

  if (tokens.every((token) =>
    lower.includes(token)
  )) {
    score += 450;
  }

  if (
    matched === tokens.length &&
    exactTokenMatches > 0
  ) {
    score += 600;
  }

  const match =
    exactTokenMatches > 0
      ? "exact"
      : matched === tokens.length
        ? "full"
        : "related";

  return {
    matched,
    score,
    match
  };
}

function scopeBonus(file, path, scope) {
  if (scope === "sm") {
    if (file.startsWith("sm_")) return 1200;
    if (
      path.includes("/staticmesh/") ||
      path.includes("/staticmeshes/")
    ) {
      return 450;
    }

    return -250;
  }

  if (scope === "m") {
    if (file.startsWith("mi_")) return 1200;
    if (file.startsWith("m_")) return 1150;
    if (path.includes("/material")) return 400;
    return -250;
  }

  if (scope === "meshes") {
    if (file.startsWith("sm_")) return 1200;
    if (file.startsWith("sk_")) return 1150;

    if (
      path.includes("/mesh/") ||
      path.includes("/meshes/") ||
      path.includes("/staticmesh") ||
      path.includes("/skeletalmesh")
    ) {
      return 500;
    }
  }

  return 0;
}

function normalizeScope(scope) {
  return [
    "all",
    "sm",
    "m",
    "meshes",
    "new"
  ].includes(scope)
    ? scope
    : "all";
}

function tokenize(value) {
  const stop = new Set([
    "the", "a", "an", "for", "from", "of", "to",
    "in", "on", "with", "and", "or", "find",
    "search", "asset", "assets", "path", "paths",
    "file", "files", "fortnite", "please", "pls",
    "show", "give", "me",
    "اريد", "أريد", "دور", "ابحث", "أبحث", "عن",
    "على", "في", "من", "مال", "مالت", "بحث",
    "مسار", "ملف", "ملفات", "فورتنايت"
  ]);

  return [
    ...new Set(
      String(value || "")
        .toLowerCase()
        .replace(
          /[\\`*_~()[\]{}<>|:;,.!?'\"=+]/g,
          " "
        )
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(
          (x) =>
            x.length >= 2 &&
            !stop.has(x)
        )
    )
  ].slice(0, 8);
}

function basename(path) {
  const value =
    String(path || "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");

  return value.slice(
    value.lastIndexOf("/") + 1
  );
}

function logicalName(file) {
  let name =
    String(file || "")
      .toLowerCase()
      .replace(
        /\.(uasset|uexp|ubulk)$/i,
        ""
      );

  const dot = name.indexOf(".");

  if (dot >= 0) {
    const left = name.slice(0, dot);
    const right = name.slice(dot + 1);

    if (
      right === left ||
      right === `${left}_c`
    ) {
      name = left;
    }
  }

  name = name.replace(
    /^(sm_|sk_|mi_|m_|t_|tex_|ns_|ps_|fx_|bp_|w_|s_)/i,
    ""
  );

  return name;
}

function wordify(value) {
  return String(value || "")
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

function wordStartsWith(words, token) {
  return words
    .split(/\s+/)
    .some((word) =>
      word.startsWith(token)
    );
}

function shardKey(queryToken) {
  const logical =
    logicalName(String(queryToken || ""));

  const compact =
    [...logical]
      .filter((ch) =>
        /[a-z0-9]/.test(ch)
      )
      .join("");

  if (!compact) return "__";
  if (compact.length === 1) {
    return `${compact}_`;
  }

  return compact.slice(0, 2);
}

async function loadManifest(config) {
  if (manifestCache) return manifestCache;

  const url =
    config.manifest ||
    "./database/index-v1/manifest.json";

  const response = await fetch(
    url,
    { cache: "force-cache" }
  );

  if (!response.ok) {
    // Index-v1 may not have been generated yet. Search can still fall back to
    // legacy indexes during deployment.
    manifestCache = {};
    return manifestCache;
  }

  manifestCache =
    await response.json();

  return manifestCache;
}

function resolveDatabasePath(config, relative) {
  const value = String(relative || "");

  if (
    /^https?:\/\//i.test(value) ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("/")
  ) {
    return value;
  }

  return `./database/index-v1/${value}`;
}

function legacyScopeUrl(scope, config) {
  const map = {
    all:
      config.all ||
      "./database/index/all.txt.gz",

    sm:
      config.sm ||
      "./database/index/sm.txt.gz",

    m:
      config.m ||
      "./database/index/m.txt.gz",

    meshes:
      config.meshes ||
      "./database/index/meshes.txt.gz",

    new:
      config.new ||
      "./database/index/new.txt.gz"
  };

  return map[scope] || map.all;
}

async function loadGzipLines(url) {
  if (!url) return [];

  if (textCache.has(url)) {
    const cached = textCache.get(url);
    touchMap(textCache, url, cached);
    return cached;
  }

  const response = await fetch(
    url,
    { cache: "force-cache" }
  );

  if (!response.ok) {
    throw new Error(
      `Database request failed (${response.status})`
    );
  }

  const buffer =
    await response.arrayBuffer();

  let text;

  if (typeof DecompressionStream === "function") {
    const stream =
      new Blob([buffer])
        .stream()
        .pipeThrough(
          new DecompressionStream("gzip")
        );

    text =
      await new Response(stream).text();
  } else {
    throw new Error(
      "This browser doesn't support gzip decompression."
    );
  }

  const lines =
    text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

  textCache.set(url, lines);

  while (
    textCache.size > TEXT_CACHE_LIMIT
  ) {
    const oldest =
      textCache.keys().next().value;

    textCache.delete(oldest);
  }

  return lines;
}

function rememberResult(key, value) {
  touchMap(
    resultCache,
    key,
    value
  );

  while (
    resultCache.size > RESULT_CACHE_LIMIT
  ) {
    const oldest =
      resultCache.keys().next().value;

    resultCache.delete(oldest);
  }
}

function touchMap(map, key, value) {
  if (map.has(key)) {
    map.delete(key);
  }

  map.set(key, value);
}

function boundedLevenshtein(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) {
    return maxDistance + 1;
  }

  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous =
    new Array(b.length + 1);

  const current =
    new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;

    let rowMin = current[0];

    for (let j = 1; j <= b.length; j++) {
      const cost =
        a[i - 1] === b[j - 1]
          ? 0
          : 1;

      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );

      rowMin =
        Math.min(
          rowMin,
          current[j]
        );
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let j = 0; j <= b.length; j++) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}
