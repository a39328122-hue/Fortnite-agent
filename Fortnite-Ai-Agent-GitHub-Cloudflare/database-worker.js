let cache = {
  manifest: null,
  indexes: new Map()
};

const resultCache = new Map();
const RESULT_CACHE_LIMIT = 24;

function rememberSearch(key, value) {
  if (resultCache.has(key)) resultCache.delete(key);
  resultCache.set(key, value);

  while (resultCache.size > RESULT_CACHE_LIMIT) {
    const oldest = resultCache.keys().next().value;
    resultCache.delete(oldest);
  }
}

self.addEventListener("message", async (event) => {
  const msg = event.data || {};
  if (msg.type !== "search") return;

  try {
    const data = await search(msg.scope, msg.query, msg.config || {});
    self.postMessage({ id: msg.id, ok: true, data });
  } catch (error) {
    self.postMessage({ id: msg.id, ok: false, error: String(error?.message || error) });
  }
});

async function search(scope, query, config) {
  const tokens = tokenize(query);
  if (!tokens.length) {
    return { total: 0, results: [], allResults: [], makeFile: false };
  }

  const scopeKey = normalizeScope(scope);
  const cacheKey = `${scopeKey}|${tokens.join("\u001f")}`;
  const cached = resultCache.get(cacheKey);

  if (cached) {
    resultCache.delete(cacheKey);
    resultCache.set(cacheKey, cached);
    return cached;
  }

  const index = await loadIndex(scopeKey, config);
  const jsonIndex = scopeKey === "meshes" || scopeKey === "all"
    ? await loadOptionalIndex("json", config)
    : [];

  const scored = [];
  for (const path of index) {
    const score = scorePath(path, tokens, scopeKey);
    if (score.matched > 0) {
      scored.push({
        path,
        score: score.score,
        matched: score.matched,
        source: "assets"
      });
    }
  }

  for (const path of jsonIndex) {
    const score = scorePath(path, tokens, scopeKey);
    if (score.matched > 0) {
      scored.push({
        path,
        score: score.score + 40,
        matched: score.matched,
        source: "json"
      });
    }
  }

  scored.sort((a, b) =>
    b.matched - a.matched ||
    b.score - a.score ||
    a.path.length - b.path.length
  );

  const exact = scored.filter((x) => x.matched === tokens.length);
  const chosen = exact.length ? exact : scored;

  const unique = [];
  const seen = new Set();

  for (const item of chosen) {
    const key = `${item.source}:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      path: item.path,
      source: item.source,
      match: item.matched === tokens.length ? "exact" : "related"
    });
    if (unique.length >= 1200) break;
  }

  const payload = {
    total: unique.length,
    results: unique.slice(0, 80),
    allResults: unique,
    makeFile: unique.length >= 120
  };

  rememberSearch(cacheKey, payload);
  return payload;
}

function normalizeScope(scope) {
  return ["all", "sm", "m", "meshes", "new"].includes(scope) ? scope : "all";
}

function tokenize(value) {
  const stop = new Set([
    "the","a","an","for","from","of","to","in","on","with","and","or","find","search",
    "asset","assets","path","paths","file","files","fortnite","please","pls","show","give","me",
    "اريد","أريد","دور","ابحث","أبحث","عن","على","في","من",
    "مال","مالت","بحث","مسار","ملف","ملفات","فورتنايت"
  ]);

  return [...new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[\\`*_~()[\]{}<>|:;,.!?'"=+]/g, " ")
      .split(/\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2 && !stop.has(x))
  )].slice(0, 8);
}

function scorePath(path, tokens, scope) {
  const lower = path.toLowerCase();

  let matched = 0;
  for (const token of tokens) {
    if (lower.includes(token)) matched++;
  }

  if (matched === 0) {
    return { matched: 0, score: 0 };
  }

  const file = lower.slice(lower.lastIndexOf("/") + 1);
  const normalizedFile = file
    .replace(/\.(uasset|uexp|ubulk)$/i, "")
    .replace(/^(sm_|sk_|m_|mi_)/i, "")
    .replace(/[_\-.]+/g, " ");

  let score = scopeBonus(file, lower, scope);

  for (const token of tokens) {
    const inPath = lower.includes(token);
    const inFile = file.includes(token);
    const inNormalized = normalizedFile.includes(token);

    if (inPath) score += token.length * 5;
    if (inFile) score += token.length * 12;
    if (inNormalized) score += token.length * 14;

    if (file === token || normalizedFile === token) score += 1200;
    else if (file.startsWith(token) || normalizedFile.startsWith(token)) score += 500;
  }

  if (tokens.every((t) => file.includes(t))) score += 800;
  if (tokens.every((t) => lower.includes(t))) score += 300;

  return { matched, score };
}

function scopeBonus(file, path, scope) {
  if (scope === "sm") {
    if (file.startsWith("sm_")) return 1000;
    if (path.includes("/staticmesh") || path.includes("/staticmeshes/")) return 400;
    return -200;
  }

  if (scope === "m") {
    if (file.startsWith("m_")) return 1000;
    if (file.startsWith("mi_")) return 900;
    if (path.includes("/material")) return 300;
    return -200;
  }

  if (scope === "meshes") {
    if (file.startsWith("sm_")) return 1000;
    if (file.startsWith("sk_")) return 950;
    if (path.includes("/meshes/") || path.includes("/mesh/")) return 500;
  }

  return 0;
}

async function loadIndex(scope, config) {
  if (cache.indexes.has(scope)) return cache.indexes.get(scope);

  const urls = {
    all: config.all || "./database/index/all.txt.gz",
    sm: config.sm || "./database/index/sm.txt.gz",
    m: config.m || "./database/index/m.txt.gz",
    meshes: config.meshes || "./database/index/meshes.txt.gz",
    new: config.new || "./database/index/new.txt.gz"
  };

  let list;

  try {
    list = await fetchGzipLines(urls[scope]);
  } catch {
    if (scope === "new") {
      try {
        list = await fetchGzipLines(config.newRaw || "./database/fortnite_assets_new.gz");
      } catch {
        list = [];
      }
    } else if (scope !== "all") {
      list = await loadIndex("all", config);
      list = filterScope(list, scope);
    } else {
      const fallback = config.raw || "./database/fortnite_assets.gz";
      list = await fetchGzipLines(fallback);
    }
  }

  cache.indexes.set(scope, list);
  return list;
}

async function loadOptionalIndex(type, config) {
  const key = `optional:${type}`;
  if (cache.indexes.has(key)) return cache.indexes.get(key);

  try {
    const url = type === "json"
      ? (config.json || "./database/index/json-references.txt.gz")
      : "";
    const list = url ? await fetchGzipLines(url) : [];
    cache.indexes.set(key, list);
    return list;
  } catch {
    cache.indexes.set(key, []);
    return [];
  }
}

function filterScope(list, scope) {
  if (scope === "sm") return list.filter((p) => basename(p).startsWith("sm_"));
  if (scope === "m") return list.filter((p) => basename(p).startsWith("m_") || basename(p).startsWith("mi_"));
  if (scope === "meshes") return list.filter((p) => {
    const file = basename(p);
    const lower = p.toLowerCase();
    return file.startsWith("sm_") || file.startsWith("sk_") || lower.includes("/mesh");
  });
  return list;
}

function basename(path) {
  const lower = String(path || "").toLowerCase();
  return lower.slice(lower.lastIndexOf("/") + 1);
}

async function fetchGzipLines(url) {
  if (!url) throw new Error("Missing database URL.");

  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);

  const buffer = await response.arrayBuffer();

  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser doesn't support gzip decompression.");
  }

  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();

  return text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}
