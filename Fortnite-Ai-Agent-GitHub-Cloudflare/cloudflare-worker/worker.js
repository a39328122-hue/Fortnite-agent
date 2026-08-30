const CHAT_MODEL = "openai/gpt-oss-120b";
const FAST_RESEARCH_MODEL = "groq/compound-mini";
const DEEP_RESEARCH_MODEL = "groq/compound";
const DILLY_EXPORT_BASE = "https://export-service-new.dillyapis.com/v1/export";

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

async function handleImageRequest(request, env, url) {
  const path = String(url.searchParams.get("path") || "").trim();

  if (!path || path.length > 2400 || /^https?:\/\//i.test(path)) {
    return new Response("Invalid asset path.", {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  const upstream = new URL(DILLY_EXPORT_BASE);
  // Dilly docs use Path + ForceImage.
  upstream.searchParams.set("Path", path);
  upstream.searchParams.set("ForceImage", "true");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(upstream.toString(), {
      method: "GET",
      headers: {
        "Accept": "image/png,image/webp,image/*;q=0.9,*/*;q=0.1"
      },
      signal: controller.signal,
      cf: {
        cacheEverything: false
      }
    });

    if (!response.ok) {
      const status = response.status === 404 ? 404 : 502;
      return new Response(
        status === 404 ? "Image Not found error #404" : "Image upstream unavailable.",
        {
          status,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": status === 404 ? "public, max-age=30" : "no-store",
            "X-Content-Type-Options": "nosniff"
          }
        }
      );
    }

    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("image/")) {
      return new Response("Image Not found error #404", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=30",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    const headers = new Headers();
    headers.set("Content-Type", type.split(";")[0]);
    headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
    headers.set("Content-Disposition", "inline");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");

    const length = response.headers.get("content-length");
    if (length) headers.set("Content-Length", length);

    // Stream the upstream body directly. Do NOT call arrayBuffer(), blob(), or text().
    const output = new Response(response.body, {
      status: 200,
      headers
    });

    return output;
  } catch (error) {
    return new Response(
      error?.name === "AbortError"
        ? "Image request timed out."
        : "Image upstream unavailable.",
      {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method === "GET" && url.pathname === "/image") {
      return handleImageRequest(request, env, url);
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
