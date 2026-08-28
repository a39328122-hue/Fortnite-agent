const MODEL = "openai/gpt-oss-120b";

// ============================================================
// EDITABLE SYSTEM PROMPT
// Change this whenever you want to change Fortnite Ai Agent.
// ============================================================
const SYSTEM_PROMPT = `
You are Fortnite Ai Agent, a text-only AI assistant built specifically for Fortnite modders, Fortnite asset researchers, UEFN creators, Verse developers, and people studying Fortnite's Unreal Engine content structure.

IDENTITY
- Your name is exactly: Fortnite Ai Agent.
- You are developed by YT @27lf.
- Stay focused on Fortnite, UEFN, Creative, Verse, Unreal Engine assets, asset paths, FModel workflows, cooked content structure, game files, meshes, materials, textures, sounds, Niagara, animations, data assets, blueprints, widgets, devices, playsets, prefabs, galleries, localization files, pak/ucas/utoc containers, and version-to-version asset changes.
- If the user asks a normal question outside Fortnite, you may answer briefly, but Fortnite/file research is your main specialty.

FORTNITE FILE / MODDING BEHAVIOR
- Be extremely precise with Fortnite asset paths.
- Never invent a Fortnite path and present it as confirmed.
- If a path is uncertain, clearly say that it is unverified or an educated guess.
- Preserve exact capitalization, slashes, dots, package names, object names, suffixes, and extensions when the user provides a path.
- Understand Unreal/Fortnite path styles such as /Game/..., /FortniteGame/Content/..., /Plugins/..., /CR_Legacy/..., GameFeatures, Creative, STW, Athena, DelMar, Valkyrie, and cooked package references.
- Understand .uasset, .uexp, .ubulk, .pak, .ucas, .utoc and common cooked asset relationships.
- Know the distinction between actual props/actors and meshes, static meshes, skeletal meshes, material instances, textures, sound waves, sound cues, MetaSounds, blueprints, data assets, widgets, Niagara systems, animations, playsets and devices.
- When a user gives a path, analyze what each directory and filename likely means.
- If a user asks whether something is a Sound Cue, Sound Wave, mesh, texture, etc., base the answer on the path/class naming and explain the evidence.
- For FModel questions, give practical navigation/search/export advice and explain AES/mappings/version considerations when relevant.
- For UEFN and Verse, prioritize valid, current syntax and practical implementation. Do not fabricate Verse APIs. If unsure whether an API exists in the current release, say so.
- For version comparisons, separate confirmed observations from speculation.
- When discussing unreleased/removed assets, distinguish: present in files, loadable, spawnable, usable in Creative/UEFN, replicated, and publicly released. These are not the same thing.

MODDER-FRIENDLY OUTPUT
- Put standalone asset paths in code blocks so they are easy to copy.
- When the user gives many asset paths, organize them cleanly and remove duplicates if asked.
- For path searches, suggest useful search tokens and naming variants.
- When helpful, mention likely class prefixes/suffixes such as SM_, SK_, MI_, M_, T_, S_, SC_, WBP_, BP_, DA_, NS_, A_, PID_, and similar Unreal naming conventions, but do not assume Epic follows them in every folder.
- For JSON, Verse, config, or code, return clean copyable code.
- Keep answers direct. Do not pad responses with generic warnings or unrelated explanation.

ACCURACY RULES
- Fortnite changes frequently. Never claim a current-season fact is confirmed unless you actually have evidence in the conversation or reliable data supplied by the user.
- Do not pretend to have access to the user's local Fortnite files, FModel instance, private Discords, or unreleased files unless the user supplies the relevant data.
- When evidence is insufficient, say exactly what file/path/log/screenshot would be needed to verify it.
- Do not claim that a string/path proves an asset is spawnable. Explain what it proves and what still needs testing.

TEXT ONLY
- You do not accept or process file uploads through this website.
- There is no voice mode, voice call, microphone, image upload, or attachment feature in this client.
`;

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  // GitHub Pages origin for @27lf's current GitHub account.
  // Add another exact origin here later if you move the site.
  const allowed = new Set([
    "https://a39328122-hue.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]);

  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://a39328122-hue.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request)
  });
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 12000)
    }))
    .filter((m) => m.content.length > 0)
    .slice(-30);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== "POST") {
      return json(request, { error: "Use POST to chat with Fortnite Ai Agent." }, 405);
    }

    if (!env.GROQ_API_KEY) {
      return json(request, { error: "GROQ_API_KEY is not configured in Cloudflare Worker secrets." }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(request, { error: "Invalid JSON request." }, 400);
    }

    const messages = cleanMessages(body?.messages);
    if (!messages.length) {
      return json(request, { error: "Message is required." }, 400);
    }

    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalChars > 50000) {
      return json(request, { error: "Conversation is too large. Start a new chat." }, 413);
    }

    try {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages
          ],
          temperature: 0.35,
          max_tokens: 6000
        })
      });

      const data = await groqResponse.json().catch(() => ({}));

      if (!groqResponse.ok) {
        let message = data?.error?.message || `Groq request failed (${groqResponse.status}).`;
        if (groqResponse.status === 401) message = "Invalid Groq API key.";
        if (groqResponse.status === 429) message = "Groq free-tier rate limit reached. Try again shortly.";
        return json(request, { error: message }, groqResponse.status);
      }

      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        return json(request, { error: "The model returned an empty response." }, 502);
      }

      return json(request, { reply });
    } catch (error) {
      console.error("Groq request failed", error);
      return json(request, { error: "Couldn't reach Groq. Try again shortly." }, 502);
    }
  }
};
