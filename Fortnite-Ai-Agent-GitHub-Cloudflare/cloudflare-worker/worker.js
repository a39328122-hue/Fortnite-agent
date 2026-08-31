const CHAT_MODEL = "openai/gpt-oss-120b";
const FAST_RESEARCH_MODEL = "groq/compound-mini";
const DEEP_RESEARCH_MODEL = "groq/compound";
const DILLY_EXPORT_BASE = "https://export-service-new.dillyapis.com/v1/export";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const RATE_BUCKETS = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 20;

const SYSTEM_PROMPT = `
You are Fortnite Ai Agent, developed by YT @27lf.

SPECIALTY
- Fortnite files, FModel, UEFN, Verse, Creative, Unreal assets, meshes, materials,
  textures, sounds, devices, playsets, plugins, GameFeatures, STW, Athena and cooked data.
- Do not restrict file reasoning to Creative unless the user explicitly asks for Creative only.
- Think across FortniteGame/Content, /Game, Plugins, GameFeatures, Athena, STW,
  CR_Legacy, DelMar, Creative and mounted plugin content when relevant.

ACCURACY
- Never invent a Fortnite asset path and present it as confirmed.
- Separate confirmed facts, direct file evidence, reporting, datamining, rumor and speculation.
- A path/string does not prove an asset is spawnable or usable.
- Distinguish: present in files, loadable, spawnable, usable, replicated, released.
- Preserve exact capitalization/slashes/object names in supplied paths.
- For Verse/UEFN, do not fabricate APIs or syntax.

STYLE
- Match the user's language.
- If they use Iraqi Arabic, reply naturally in Iraqi Arabic.
- Be direct, clear and modern.
- Use Markdown naturally.
- Put standalone paths/code in fenced code blocks.

CURRENT INFO
- If current web research is available, use it for latest/current/leak/rumor questions.
- Treat leaks as unverified unless supported by stronger evidence.
- Prefer direct sources and multiple independent sources when possible.

IDENTITY
- Your name is Fortnite Ai Agent.
- Do not claim to literally be ChatGPT.
`;

const RESEARCH_PROMPT = `
You are Fortnite Ai Agent in research mode.

For current Fortnite rumors, leaks, announcements or technical claims:
1. Search multiple relevant web sources when possible.
2. Cross-check the claim.
3. Clearly label each important point as one of:
   Official / Strong evidence / Datamined / Reported / Rumor / Speculation.
4. Do not convert rumor into fact.
5. If sources conflict, say so.
6. Prefer Epic/Fortnite official sources for confirmation, then direct technical evidence,
   then reputable reporting, then community/datamining sources.
7. Keep Fortnite file/path claims separate from web rumors.
`;

function getAllowedOrigins(env) {
  const set = new Set([
    "https://a39328122-hue.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]);

  if (env.ALLOWED_ORIGINS) {
    for (const origin of env.ALLOWED_ORIGINS.split(",")) {
      const clean = origin.trim();
      if (clean) set.add(clean);
    }
  }

  return set;
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  return !!origin && getAllowedOrigins(env).has(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = getAllowedOrigins(env);
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-FNAA-Client",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
  if (allowed.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function allowBySoftRateLimit(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(ip);

  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    RATE_BUCKETS.set(ip, { startedAt: now, count: 1 });
    return true;
  }

  bucket.count += 1;
  if (RATE_BUCKETS.size > 4000) {
    for (const [key, value] of RATE_BUCKETS) {
      if (now - value.startedAt >= RATE_WINDOW_MS) RATE_BUCKETS.delete(key);
    }
  }
  return bucket.count <= RATE_MAX_PER_WINDOW;
}

function json(request, env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request, env), ...extra }
  });
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 6000)
    }))
    .filter((m) => m.content)
    .slice(-12);
}

function isCurrentInfoQuery(messages) {
  const text = messages.map((m) => m.content).join(" ").toLowerCase();

  return /\b(latest|today|current|new update|leak|leaks|rumor|rumour|recent|this season|patch notes|just added)\b|تسريب|تسريبات|شائعة|اشاعة|إشاعة|حديث|اخر تحديث|آخر تحديث|حاليا|حالياً/.test(text);
}

async function groqFetch(apiKey, body, timeoutMs = 42000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Groq-Model-Version": "latest"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function callChat(apiKey, messages, researchMode) {
  if (researchMode === "deep") {
    return groqFetch(apiKey, {
      model: DEEP_RESEARCH_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: RESEARCH_PROMPT },
        ...messages
      ],
      temperature: 0.2,
      max_tokens: 3000
    }, 55000);
  }

  if (researchMode === "fast") {
    return groqFetch(apiKey, {
      model: FAST_RESEARCH_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: RESEARCH_PROMPT },
        ...messages
      ],
      temperature: 0.2,
      max_tokens: 2200
    }, 45000);
  }

  return groqFetch(apiKey, {
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
    ],
    temperature: 0.35,
    max_tokens: 2200
  });
}


function imageCorsHeaders(request, env, contentType="application/json; charset=utf-8", publicImage=false) {
  const origin = request.headers.get("Origin") || "";
  const allowed = getAllowedOrigins(env);
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin"
  };

  if (publicImage) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else {
    headers["Vary"] = "Origin";
    if (allowed.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function cleanAssetInput(value) {
  let text = String(value || "").trim().replace(/\\/g, "/");
  if (!text || /^https?:\/\//i.test(text)) return "";
  if (/[\u0000-\u001f\u007f]/.test(text) || text.includes("..")) return "";

  const wrapped = text.match(/^(?:Texture2D|Texture|Object|StaticMesh|SkeletalMesh|Blueprint|MaterialInstanceConstant|Material)?'?(.+?)'?$/i);
  if (wrapped?.[1]) text = wrapped[1];

  text = text.replace(/^["']|["']$/g, "");

  if (!/\.(?:uasset|uexp|ubulk)$/i.test(text)) {
    const slash = text.lastIndexOf("/");
    const dot = text.lastIndexOf(".");
    if (dot > slash) {
      const left = text.slice(0, dot);
      const objectName = text.slice(dot + 1).replace(/_C$/i, "");
      const assetName = left.slice(left.lastIndexOf("/") + 1);
      if (objectName.toLowerCase() === assetName.toLowerCase()) text = left;
    }
  }

  return text;
}

function assetName(path) {
  return String(path || "").replace(/\.(?:uasset|uexp|ubulk)$/i, "").split("/").pop() || "";
}

function addUnique(list, seen, value) {
  const v = String(value || "").trim().replace(/\\/g, "/");
  if (!v || v.length > 2400) return;
  const key = v.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  list.push(v);
}

function dillyPathCandidates(rawValue) {
  const raw = cleanAssetInput(rawValue);
  if (!raw) return [];

  const out = [];
  const seen = new Set();
  const clean = raw.replace(/\.(?:uasset|uexp|ubulk)$/i, "");

  const pushForms = (base) => {
    addUnique(out, seen, base);
    if (/\.uasset$/i.test(base)) addUnique(out, seen, base.replace(/\.uasset$/i, ""));
    else if (!/\.(?:uexp|ubulk)$/i.test(base)) addUnique(out, seen, `${base}.uasset`);
  };

  const pushObjectForms = (objBase) => {
    addUnique(out, seen, objBase);
    const name = assetName(objBase);
    if (name) addUnique(out, seen, `${objBase}.${name}`);
  };

  // Exact user input first.
  addUnique(out, seen, raw);

  if (/^\/Game\//i.test(clean)) {
    pushObjectForms(clean);
    pushForms(`FortniteGame/Content/${clean.slice(6)}`);
  } else if (/^FortniteGame\/Content\//i.test(clean)) {
    pushForms(clean);
    const obj = `/Game/${clean.slice("FortniteGame/Content/".length)}`;
    pushObjectForms(obj);
  } else {
    const fsPlugin = clean.match(/^FortniteGame\/Plugins\/GameFeatures\/([^/]+)\/Content\/(.+)$/i)
      || clean.match(/^(?:FortniteGame\/)?Plugins\/(?:GameFeatures\/)?([^/]+)\/Content\/(.+)$/i);

    if (fsPlugin) {
      const canonicalFs = `FortniteGame/Plugins/GameFeatures/${fsPlugin[1]}/Content/${fsPlugin[2]}`;
      pushForms(canonicalFs);
      pushObjectForms(`/${fsPlugin[1]}/${fsPlugin[2]}`);
    } else {
      const objPlugin = clean.match(/^\/([^/]+)\/(.+)$/);
      if (objPlugin && objPlugin[1].toLowerCase() !== "game") {
        pushObjectForms(clean);
        pushForms(`FortniteGame/Plugins/GameFeatures/${objPlugin[1]}/Content/${objPlugin[2]}`);
      } else {
        pushForms(clean);
      }
    }
  }

  return out.slice(0, 8);
}

function isLikelySurfaceTexture(path) {
  const name = assetName(path).toLowerCase();
  if (/(?:icon|thumbnail|preview|display|gallery|prefab|portrait|keyart)/i.test(name)) return false;

  return /(?:^|[_-])(?:n|normal|d|diff|diffuse|albedo|basecolor|s|spec|specular|r|rough|roughness|m|metal|metallic|orm|mra|mask|opacity|ao|emissive|height)(?:$|[_-])/i.test(name)
    || /(?:lightmap|noise|detail|gradient|lut|lookup|mask|normal|roughness|specular|basecolor)/i.test(name);
}

function normalizeRefString(value) {
  if (typeof value !== "string") return "";
  let text = value.trim();
  if (!text) return "";

  const wrapped = text.match(/(?:Texture2D|Texture|Object|StaticMesh|SkeletalMesh|Blueprint|MaterialInstanceConstant|Material)?'?((?:\/|FortniteGame\/)[^'"]+)'?/i);
  if (wrapped?.[1]) text = wrapped[1];

  text = text.replace(/^["']|["']$/g, "");
  if (!/^(?:\/|FortniteGame\/)/i.test(text)) return "";
  return cleanAssetInput(text);
}

function extractImageCandidates(data, contextPath="") {
  const found = new Map();

  const keyPattern = /(?:displayassetpath|displayasset|galleryart|galleryimage|prefabicon|largeicon|smallicon|icon|previewimage|smallpreviewimage|largepreviewimage|thumbnailimage|thumbnailtexture|previewtexture|displayimage|featuredimage|portrait|keyart|image|brush)/i;
  const namePattern = /(?:t[-_]?icon|thumbnail|preview|display.?image|gallery.?art|prefab.?icon|featured.?image|ui[-_]?icon|portrait|keyart)/i;

  const add = (value, key="", bonus=0) => {
    const refs = [];

    if (typeof value === "string") refs.push(value);
    else if (value && typeof value === "object") {
      for (const k of ["AssetPathName","ObjectPath","Path","ResourceObject","AssetPath","SoftObjectPath","ObjectPathName","PackageName"]) {
        if (typeof value[k] === "string") refs.push(value[k]);
      }
    }

    for (const raw of refs) {
      const ref = normalizeRefString(raw);
      if (!ref || isLikelySurfaceTexture(ref)) continue;

      let score = bonus;
      if (keyPattern.test(key)) score += 120;
      if (namePattern.test(ref)) score += 150;
      if (/Texture2D/i.test(String(raw))) score += 25;

      const low = ref.toLowerCase();
      const old = found.get(low);
      if (!old || old.score < score) found.set(low, { ref, score });
    }
  };

  const scan = (node, parentKey="") => {
    if (node == null) return;

    if (typeof node === "string") {
      if (keyPattern.test(parentKey) || namePattern.test(node)) add(node, parentKey, keyPattern.test(parentKey) ? 80 : 0);
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) scan(item, parentKey);
      return;
    }

    if (typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (keyPattern.test(key)) add(value, key, 100);
        scan(value, key);
      }
    }
  };

  scan(data);

  return [...found.values()]
    .sort((a,b) => b.score - a.score)
    .map(x => x.ref)
    .filter(ref => ref.toLowerCase() !== String(contextPath || "").toLowerCase())
    .slice(0, 8);
}

async function fetchWithTimeout(url, options={}, timeoutMs=6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDillyImage(path) {
  const upstream = new URL(DILLY_EXPORT_BASE);
  upstream.searchParams.set("Path", path);
  upstream.searchParams.set("ForceImage", "true");

  return fetchWithTimeout(upstream.toString(), {
    method: "GET",
    headers: {
      "Accept": "image/png,image/webp,image/*;q=0.9,application/json;q=0.3,*/*;q=0.1"
    }
  }, 7000);
}

async function fetchDillyJson(path) {
  const attempts = [
    { pathKey: "Path", rawKey: "Raw" },
    { pathKey: "path", rawKey: "raw" }
  ];

  for (const variant of attempts) {
    const upstream = new URL(DILLY_EXPORT_BASE);
    upstream.searchParams.set(variant.pathKey, path);
    upstream.searchParams.set(variant.rawKey, "false");

    let response;
    try {
      response = await fetchWithTimeout(upstream.toString(), {
        method: "GET",
        headers: { "Accept": "application/json,text/plain;q=0.9,*/*;q=0.1" }
      }, 6500);
    } catch (error) {
      if (error?.name === "AbortError") continue;
      continue;
    }

    if (!response.ok) {
      try { await response.body?.cancel(); } catch {}
      continue;
    }

    const type = String(response.headers.get("content-type") || "").toLowerCase();

    try {
      if (type.includes("application/json")) return await response.json();
      const text = await response.text();
      if (!text || text.length > 8_000_000) continue;
      return JSON.parse(text);
    } catch {}
  }

  return null;
}

async function tryImageCandidates(rawCandidates, attemptsLog=[]) {
  for (const raw of rawCandidates) {
    const variants = dillyPathCandidates(raw);

    for (const candidate of variants) {
      let response;
      try {
        response = await fetchDillyImage(candidate);
      } catch (error) {
        attemptsLog.push({ path: candidate, status: 0, contentType: "", error: error?.name || "fetch" });
        continue;
      }

      const type = String(response.headers.get("content-type") || "").toLowerCase();
      attemptsLog.push({ path: candidate, status: response.status, contentType: type.split(";")[0] || "" });

      if (response.ok && type.startsWith("image/")) {
        const length = Number(response.headers.get("content-length") || "0");
        if (length > MAX_IMAGE_BYTES) {
          try { await response.body?.cancel(); } catch {}
          return { state: "error", status: 413, error: "Image is too large for mobile preview.", attempts: attemptsLog };
        }

        return { state: "ready", status: 200, path: candidate, contentType: type, response, attempts: attemptsLog };
      }

      // 200 non-image is NOT a real 404. Keep looking and preserve diagnostics.
      try { await response.body?.cancel(); } catch {}
    }
  }

  return null;
}

async function resolveDillyImage(rawPath, statusOnly=false) {
  const clean = cleanAssetInput(rawPath);
  if (!clean) return { state: "invalid", status: 400, error: "Invalid asset path.", attempts: [] };

  const attempts = [];

  // Stage 1: ask Dilly for an image of the requested asset using normalized path variants.
  let direct = await tryImageCandidates([clean], attempts);
  if (direct?.state === "ready") {
    if (statusOnly) {
      try { await direct.response.body?.cancel(); } catch {}
      return { ...direct, response: undefined };
    }
    return direct;
  }
  if (direct?.state === "error") return direct;

  // Stage 2: export JSON for the requested asset and look ONLY for explicit UI/thumbnail/preview image refs.
  // This is forward-reference resolution, not a guessy material-texture fallback.
  const requestVariants = dillyPathCandidates(clean).slice(0, 3);
  let jsonData = null;

  for (const candidate of requestVariants) {
    jsonData = await fetchDillyJson(candidate);
    if (jsonData) break;
  }

  if (jsonData) {
    const refs = extractImageCandidates(jsonData, clean);
    if (refs.length) {
      const viaJson = await tryImageCandidates(refs, attempts);
      if (viaJson?.state === "ready") {
        if (statusOnly) {
          try { await viaJson.response.body?.cancel(); } catch {}
          return {
            ...viaJson,
            response: undefined,
            source: "json-image-reference",
            resolvedAsset: refs.find(r => dillyPathCandidates(r).some(v => v === viaJson.path)) || ""
          };
        }
        return { ...viaJson, source: "json-image-reference" };
      }
      if (viaJson?.state === "error") return viaJson;
    }
  }

  // Do not lie: a clean miss after all supported stages is a real resolver miss.
  return { state: "missing", status: 404, attempts };
}

function limitReadableStream(body, maxBytes) {
  if (!body) return body;
  const reader = body.getReader();
  let total = 0;

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel("image-too-large"); } catch {}
          controller.error(new Error("Image stream exceeded mobile preview limit."));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
}

async function handleImageRequest(request, env, url, statusOnly=false) {
  const rawPath = String(url.searchParams.get("path") || "").trim();

  if (!rawPath || rawPath.length > 2400) {
    return new Response(JSON.stringify({ state: "invalid", error: "Invalid asset path." }), {
      status: 400,
      headers: imageCorsHeaders(request, env)
    });
  }

  const origin = request.headers.get("Origin") || "";
  if (statusOnly && origin && !getAllowedOrigins(env).has(origin)) {
    return new Response(JSON.stringify({ state: "error", error: "Origin not allowed." }), {
      status: 403,
      headers: imageCorsHeaders(request, env)
    });
  }

  try {
    const result = await resolveDillyImage(rawPath, statusOnly);

    if (statusOnly) {
      const status = result.state === "ready" ? 200 : result.state === "missing" ? 404 : result.status || 502;
      return new Response(JSON.stringify({
        state: result.state,
        status,
        ...(result.path ? { resolvedPath: result.path } : {}),
        ...(result.source ? { source: result.source } : {}),
        ...(result.resolvedAsset ? { resolvedAsset: result.resolvedAsset } : {}),
        ...(result.error ? { error: result.error } : {}),
        attempts: (result.attempts || []).slice(0, 16)
      }), {
        status,
        headers: { ...imageCorsHeaders(request, env), "Cache-Control": "no-store" }
      });
    }

    if (result.state === "missing") {
      return new Response("Image Not found error #404", {
        status: 404,
        headers: {
          ...imageCorsHeaders(request, env, "text/plain; charset=utf-8", true),
          "Cache-Control": "public, max-age=120"
        }
      });
    }

    if (result.state !== "ready" || !result.response) {
      return new Response(JSON.stringify({ error: result.error || "Image service failed." }), {
        status: result.status || 502,
        headers: { ...imageCorsHeaders(request, env, "application/json; charset=utf-8", true), "Cache-Control": "no-store" }
      });
    }

    const upstream = result.response;
    const length = Number(upstream.headers.get("content-length") || "0");
    if (length > MAX_IMAGE_BYTES) {
      try { await upstream.body?.cancel(); } catch {}
      return new Response(JSON.stringify({ error: "Image is too large for mobile preview." }), {
        status: 413,
        headers: { ...imageCorsHeaders(request, env, "application/json; charset=utf-8", true), "Cache-Control": "no-store" }
      });
    }

    const headers = {
      ...imageCorsHeaders(request, env, result.contentType || "image/png", true),
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Disposition": "inline",
      "X-FNAA-Image-Source": result.source || "direct-forceimage"
    };

    const upstreamLength = upstream.headers.get("content-length");
    if (upstreamLength) headers["Content-Length"] = upstreamLength;

    const etag = upstream.headers.get("etag");
    if (etag) headers["ETag"] = etag;

    const body = upstreamLength ? upstream.body : limitReadableStream(upstream.body, MAX_IMAGE_BYTES);
    return new Response(body, { status: 200, headers });
  } catch (error) {
    const message = error?.name === "AbortError" ? "Image request timed out." : "Couldn't reach the image upstream.";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...imageCorsHeaders(request, env, "application/json; charset=utf-8", true), "Cache-Control": "no-store" }
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (url.pathname === "/image" || url.pathname === "/image-status") {
        const origin = request.headers.get("Origin") || "";
        if (origin && !getAllowedOrigins(env).has(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: imageCorsHeaders(request, env) });
      }
      if (!isAllowedOrigin(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method === "GET" && url.pathname === "/image") {
      return handleImageRequest(request, env, url, false);
    }

    if (request.method === "GET" && url.pathname === "/image-status") {
      return handleImageRequest(request, env, url, true);
    }

    if (request.method !== "POST") {
      return json(request, env, { error: "Use POST." }, 405);
    }

    if (!isAllowedOrigin(request, env)) {
      return json(request, env, { error: "Origin not allowed." }, 403);
    }

    if (request.headers.get("X-FNAA-Client") !== "web-v1") {
      return json(request, env, { error: "Invalid client." }, 403);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json(request, env, { error: "Content-Type must be application/json." }, 415);
    }

    if (!allowBySoftRateLimit(request)) {
      return json(request, env, { error: "Too many requests. Try again in a minute." }, 429, { "Retry-After": "60" });
    }

    const length = Number(request.headers.get("Content-Length") || "0");
    if (length > 120000) {
      return json(request, env, { error: "Request is too large." }, 413);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(request, env, { error: "Invalid request." }, 400);
    }

    const apiKey = env.GROQ_API_KEY;

    if (!apiKey) {
      return json(request, env, { error: "AI backend is not configured." }, 500);
    }

    const messages = cleanMessages(body?.messages);
    if (!messages.length) {
      return json(request, env, { error: "Message is required." }, 400);
    }

    const totalChars = messages.reduce((n, m) => n + m.content.length, 0);
    if (totalChars > 24000) {
      return json(request, env, { error: "This chat is getting too long. Start a new chat." }, 413);
    }

    const requestedMode = body?.mode === "deep-research" ? "deep" : null;
    const inferredMode = requestedMode || (isCurrentInfoQuery(messages) ? "fast" : "chat");

    try {
      let response = await callChat(apiKey, messages, inferredMode);
      let data = await response.json().catch(() => ({}));

      if (!response.ok && ["deep", "fast"].includes(inferredMode) && response.status === 400) {
        response = await callChat(apiKey, messages, "chat");
        data = await response.json().catch(() => ({}));
      }

      if (!response.ok) {
        if (response.status === 401) {
          return json(
            request,
            env,
            { error: "AI backend authentication failed." },
            502
          );
        }

        if (response.status === 429) {
          const retryAfter =
            response.headers.get("retry-after") ||
            response.headers.get("x-ratelimit-reset-requests") ||
            "30";

          return json(
            request,
            env,
            { error: "Fortnite Ai Agent is busy right now. Try again in a moment." },
            429,
            { "Retry-After": retryAfter }
          );
        }

        return json(
          request,
          env,
          { error: data?.error?.message || `AI request failed (${response.status}).` },
          502
        );
      }

      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        return json(request, env, { error: "The AI returned an empty response." }, 502);
      }

      return json(request, env, { reply });
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "The AI request timed out. Try again."
        : "Couldn't reach the AI backend. Try again shortly.";

      return json(request, env, { error: message }, 502);
    }
  }
};
