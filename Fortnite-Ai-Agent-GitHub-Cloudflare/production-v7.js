(() => {
  "use strict";

  const VERSION = "7.2";
  const CURRENT_FN_VERSION = "42.00";
  const API_ENDPOINT = String(window.FORTNITE_AI_API_ENDPOINT || "").trim().replace(/\/+$/, "");
  const LOGIN_MODE_KEY = "fortniteAiAgent.loginMode.session";
  const GUEST_ID_KEY = "fortniteAiAgent.guestId.v6";
  const GUEST_NEXT_AT = "fortniteAiAgent.guestNextAt.v7";
  const GUEST_SLOWMODE_MS = 15000;
  let guestSlowmodeTimer = null;
  const originalFetch = window.fetch.bind(window);

  let latestAuthState = { user: null, profile: null };
  let dbWorker = null;
  let dbSeq = 0;
  const dbPending = new Map();

  function uid() {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
    const value = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "_");
    localStorage.setItem(GUEST_ID_KEY, value);
    return value;
  }


  function isLocalDatabaseCommand(text) {
    return /^\s*@(SearchForSM_|SearchForM_|SearchForMeshes|SearchFortniteFiles)\b/i.test(String(text || ""));
  }

  function ensureGuestSlowmodeBanner() {
    let banner = document.getElementById("fnaaGuestSlowmodeBanner");
    if (banner) return banner;
    const composer = document.getElementById("composer");
    const inner = composer?.querySelector(".composer-inner");
    if (!composer || !inner) return null;
    banner = document.createElement("div");
    banner.id = "fnaaGuestSlowmodeBanner";
    banner.className = "fnaa-guest-slowmode-banner";
    banner.hidden = true;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    composer.insertBefore(banner, inner);
    return banner;
  }

  function guestSlowmodeRemainingMs() {
    if (getPublicAuthState()?.user) return 0;
    return Math.max(0, Number(localStorage.getItem(GUEST_NEXT_AT) || 0) - Date.now());
  }

  function syncGuestSlowmodeUI() {
    const input = document.getElementById("messageInput");
    const send = document.getElementById("sendButton");
    const banner = ensureGuestSlowmodeBanner();
    if (!input || !send) return;

    const loggedIn = !!getPublicAuthState()?.user;
    const remaining = loggedIn ? 0 : guestSlowmodeRemainingMs();

    if (remaining > 0) {
      const seconds = Math.max(1, Math.ceil(remaining / 1000));
      // Slow mode only blocks sending another AI message.
      // Typing, Settings, sidebar and all Fortnite tools remain usable.
      send.disabled = true;
      send.dataset.fnaaSlowmode = "1";
      document.documentElement.classList.add("fnaa-guest-slowmode-active");
      if (banner) {
        banner.hidden = false;
        banner.textContent = `Slow mode enabled • ${seconds}s`;
      }
      if (!guestSlowmodeTimer) guestSlowmodeTimer = setInterval(syncGuestSlowmodeUI, 200);
      return;
    }

    if (guestSlowmodeTimer) {
      clearInterval(guestSlowmodeTimer);
      guestSlowmodeTimer = null;
    }

    document.documentElement.classList.remove("fnaa-guest-slowmode-active");
    if (banner) {
      banner.hidden = true;
      banner.textContent = "";
    }

    if (send.dataset.fnaaSlowmode === "1") {
      delete send.dataset.fnaaSlowmode;
      // app.js owns the normal busy/empty send-button state.
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function startGuestSlowmode() {
    if (getPublicAuthState()?.user) return;
    localStorage.setItem(GUEST_NEXT_AT, String(Date.now() + GUEST_SLOWMODE_MS));
    syncGuestSlowmodeUI();
  }

  function getPublicAuthState() {
    return window.FortniteAuth?.getState?.() || latestAuthState || {};
  }

  async function getFirebaseUserAndToken() {
    const state = getPublicAuthState();
    return {
      user: state?.user || null,
      token: String(window.FortniteAuth?.getSessionToken?.() || "")
    };
  }

  function apiIsConnected() {
    return !!getPublicAuthState()?.user && !!window.FortniteAuth?.getSessionToken?.();
  }

  function setApiVaultState() {
    syncSettingsApiCard();
  }

  async function checkStoredApi() {
    return apiIsConnected();
  }

  function syncAuthoritativeLoginState(detail = null) {
    if (detail) latestAuthState = detail;
    const state = detail || getPublicAuthState();
    if (state?.user) {
      sessionStorage.setItem(LOGIN_MODE_KEY, "openrouter");
    } else {
      if (sessionStorage.getItem(LOGIN_MODE_KEY) === "openrouter") sessionStorage.removeItem(LOGIN_MODE_KEY);
    }
    syncGuestUI();
    syncGuestSlowmodeUI();
    syncSettingsApiCard();
  }

  function showToast(text, error = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = text;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function ensureGuestLoginButton() {
    let button = document.getElementById("fnaaGuestQuickLogin");
    if (button) return button;
    const topbar = document.querySelector(".topbar");
    if (!topbar) return null;
    button = document.createElement("button");
    button.id = "fnaaGuestQuickLogin";
    button.type = "button";
    button.className = "fnaa-guest-login";
    button.textContent = "Log in";
    button.addEventListener("click", () => {
      const account = document.getElementById("accountActionButton");
      if (account) account.click();
    });
    topbar.appendChild(button);
    return button;
  }

  function syncGuestUI() {
    const state = getPublicAuthState();
    const loggedIn = !!state?.user;
    const quick = ensureGuestLoginButton();
    if (quick) quick.hidden = loggedIn;

    const banner = document.getElementById("guestLoginBanner");
    if (banner && loggedIn) banner.hidden = true;
  }

  function copyText(en, fr, ar) {
    const lang = window.FortniteI18n?.getLanguage?.() || "en";
    return lang === "ar" ? ar : lang === "fr" ? fr : en;
  }

  async function startOpenRouterConnect() {
    return window.FortniteAuth?.signInDefault?.();
  }

  async function finishOpenRouterCallback() {
    return false;
  }

  async function disconnectOpenRouter() {
    await window.FortniteAuth?.signOut?.();
    ensureApiGate().hidden = true;
  }

  function ensureSettingsApiCard() {
    let card = document.getElementById("fnaaSettingsApiCard");
    if (card) return card;
    const content = document.querySelector(".settings-content");
    if (!content) return null;
    card = document.createElement("section");
    card.id = "fnaaSettingsApiCard";
    card.className = "settings-card settings-stack-card fnaa-api-settings-card";
    const icon = document.createElement("div");
    icon.className = "settings-card-icon";
    icon.textContent = "🔒";
    const main = document.createElement("div");
    main.className = "settings-card-main";
    const title = document.createElement("h2");
    title.textContent = copyText("OpenRouter Account", "Compte OpenRouter", "حساب OpenRouter");
    const state = document.createElement("p");
    state.id = "fnaaSettingsApiState";
    const actions = document.createElement("div");
    actions.className = "fnaa-api-actions";
    const change = document.createElement("button");
    change.id = "fnaaSettingsApiSave";
    change.type = "button";
    change.className = "tool-button primary";
    change.addEventListener("click", () => startOpenRouterConnect().catch((e) => showToast(String(e?.message || e), true)));
    const remove = document.createElement("button");
    remove.id = "fnaaSettingsApiRemove";
    remove.type = "button";
    remove.className = "tool-button";
    remove.textContent = copyText("Disconnect", "Déconnecter", "قطع الربط");
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try { await disconnectOpenRouter(); showToast(copyText("OpenRouter disconnected", "OpenRouter déconnecté", "تم قطع OpenRouter")); }
      catch (e) { showToast(String(e?.message || e), true); }
      finally { syncSettingsApiCard(); }
    });
    actions.append(change, remove);
    main.append(title, state, actions);
    card.append(icon, main);
    const owner = content.querySelector(".owner-settings-card");
    if (owner) content.insertBefore(card, owner); else content.appendChild(card);
    return card;
  }

  function syncSettingsApiCard() {
    const card = ensureSettingsApiCard();
    if (!card) return;
    const loggedIn = !!getPublicAuthState()?.user;
    const state = card.querySelector("#fnaaSettingsApiState");
    const change = card.querySelector("#fnaaSettingsApiSave");
    const remove = card.querySelector("#fnaaSettingsApiRemove");
    if (!loggedIn) {
      state.textContent = copyText(
        "Guest uses FNAA's Groq access + 15s slow mode.",
        "L’invité utilise Groq de FNAA + mode lent 15 s.",
        "الضيف يستخدم Groq مال FNAA + سلو مود 15 ثانية."
      );
      change.textContent = "Continue with OpenRouter";
      change.disabled = false;
      remove.hidden = true;
      return;
    }
    state.textContent = copyText(
      "OpenRouter account connected.",
      "Compte OpenRouter connecté.",
      "حساب OpenRouter مربوط."
    );
    change.textContent = copyText("Reconnect", "Reconnecter", "إعادة الربط");
    change.disabled = false;
    remove.textContent = copyText("Sign out", "Se déconnecter", "تسجيل الخروج");
    remove.hidden = false;
  }

  function dbSearch(scope, query, timeoutMs = 6500) {
    const worker = ensureDbWorker();
    const id = ++dbSeq;
    return new Promise((resolve, reject) => {
      dbPending.set(id, { resolve, reject });
      worker.postMessage({ id, type: "search", scope, query, config: window.FORTNITE_AI_DB || {} });
      setTimeout(() => {
        if (!dbPending.has(id)) return;
        dbPending.delete(id);
        reject(new Error("Database context timed out."));
      }, timeoutMs);
    });
  }

  function looksLikeAssetQuestion(text) {
    return /\b(path|asset path|mesh|staticmesh|static mesh|skeletalmesh|texture|material|icon|uasset|fortnite files|sm_|mi_|m_)\b|مسار|باث|ميش|تكستشر|ماتيريال|ملفات اللعبة|ملفات فورتنايت/i.test(text);
  }

  function extractVersion(text) {
    const match = String(text || "").match(/\bv?(\d{1,2}\.\d{1,2})\b/i);
    return match ? match[1] : "";
  }

  function searchScope(text) {
    const low = String(text || "").toLowerCase();
    if (/(^|[\s/._-])sm_/.test(low) || /static\s*mesh/.test(low)) return "sm";
    if (/(^|[\s/._-])(m_|mi_)/.test(low) || /\bmaterial/.test(low)) return "m";
    if (/\b(mesh|meshes|skeletalmesh)\b|ميش/.test(low)) return "meshes";
    return "all";
  }

  function coreSearchQuery(text) {
    const raw = String(text || "").trim();
    const id = raw.match(/\b(?:SM|SK|M|MI|T|S|A|BP)_[A-Za-z0-9_]+\b/i);
    if (id) return id[0];
    const quoted = raw.match(/["“”']([^"“”']{2,80})["“”']/);
    if (quoted) return quoted[1];

    const cleaned = raw
      .replace(/\bv?\d{1,2}\.\d{1,2}\b/gi, " ")
      .replace(/\b(give|me|the|a|an|for|of|please|find|search|what|whats|what's|is|path|asset|mesh|static|fortnite|files?|current|latest)\b/gi, " ")
      .replace(/(انطيني|اعطيني|اريد|شنو|شسم|مسار|باث|مال|ملفات|فورتنايت|الميش|ميش)/g, " ")
      .replace(/[^A-Za-z0-9_\u0600-\u06FF]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.slice(0, 100) || raw.slice(0, 100);
  }

  async function buildClientContext(body) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const last = [...messages].reverse().find((m) => m?.role === "user" && typeof m.content === "string");
    const text = String(last?.content || "").trim();
    if (!text || !looksLikeAssetQuestion(text)) return null;

    const query = coreSearchQuery(text);
    if (!query) return null;

    try {
      const result = await dbSearch(searchScope(text), query);
      const rows = Array.isArray(result?.results) ? result.results.slice(0, 12) : [];
      return {
        version: CURRENT_FN_VERSION,
        requestedVersion: extractVersion(text),
        query,
        results: rows.map((row) => ({
          path: String(row?.path || "").slice(0, 900),
          match: String(row?.match || "result"),
          source: String(row?.source || "database")
        }))
      };
    } catch (error) {
      console.warn("FNAA v42 context:", error);
      return { version: CURRENT_FN_VERSION, requestedVersion: extractVersion(text), query, results: [] };
    }
  }

  function isWorkerRequest(input) {
    if (!API_ENDPOINT) return null;
    try {
      const url = new URL(typeof input === "string" ? input : input?.url, location.href);
      const api = new URL(API_ENDPOINT);
      return url.origin === api.origin ? url : null;
    } catch { return null; }
  }

  window.fetch = async function fnaaProductionFetch(input, init = {}) {
    const url = isWorkerRequest(input);
    if (!url) return originalFetch(input, init);

    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "POST" || url.pathname !== "/") return originalFetch(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers || {}).forEach((value, key) => headers.set(key, value));
    headers.set("X-FNAA-Client", "web-v3");
    headers.set("X-FNAA-Guest-ID", uid());

    const state = getPublicAuthState();
    const loggedIn = !!state?.user;
    if (loggedIn) {
      const token = String(window.FortniteAuth?.getSessionToken?.() || "");
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    let bodyText = init?.body;
    if (typeof bodyText === "string" && headers.get("Content-Type")?.includes("application/json")) {
      try {
        const body = JSON.parse(bodyText);
        const context = await buildClientContext(body);
        if (context) body.client_context = context;
        bodyText = JSON.stringify(body);
      } catch {}
    }

    const response = await originalFetch(input, { ...init, headers, body: bodyText });

    // Guest slow mode starts only AFTER FNAA has completed a successful AI reply.
    if (!loggedIn && response.ok) startGuestSlowmode();

    if (loggedIn && response.status === 401) {
      try { await window.FortniteAuth?.refresh?.(); } catch {}
    }

    if (!loggedIn && response.status === 429) {
      const retry = Math.max(1, Number(response.headers.get("Retry-After") || 15));
      const serverUntil = Date.now() + retry * 1000;
      const currentUntil = Number(localStorage.getItem(GUEST_NEXT_AT) || 0);
      localStorage.setItem(GUEST_NEXT_AT, String(Math.max(currentUntil, serverUntil)));
      syncGuestSlowmodeUI();
    }

    return response;
  };

  function isMobileComposerDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") || window.matchMedia?.("(pointer: coarse)")?.matches === true;
  }

  // Mobile Enter means newline. Only the visible Send button sends on touch/mobile.
  document.addEventListener("keydown", (event) => {
    if (event.target?.id !== "messageInput" || event.key !== "Enter" || event.isComposing) return;
    if (!isMobileComposerDevice()) return;
    event.stopImmediatePropagation();
    // Intentionally do NOT preventDefault(): the textarea keeps the native newline.
  }, true);

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "composer") return;
    const state = getPublicAuthState();


    if (!state?.user) {
      const input = document.getElementById("messageInput");
      const text = String(input?.value || "").trim();
      const localDatabaseCommand = isLocalDatabaseCommand(text);
      const remaining = guestSlowmodeRemainingMs();

      // Slow mode applies only to AI Agent requests.
      // Local database commands are not AI requests and stay available.
      if (!localDatabaseCommand && remaining > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        syncGuestSlowmodeUI();
        showToast(`Slow mode enabled • ${Math.ceil(remaining / 1000)}s`, true);
        return;
      }
    }
  }, true);


  document.addEventListener("input", (event) => {
    if (event.target?.id !== "messageInput") return;
    if (guestSlowmodeRemainingMs() > 0) queueMicrotask(syncGuestSlowmodeUI);
  }, true);

  window.addEventListener("storage", (event) => {
    if (event.key === GUEST_NEXT_AT) syncGuestSlowmodeUI();
  });

  async function handleLoggedInApiState() {
    if (!getPublicAuthState()?.user) return;
    document.documentElement.classList.remove("fnaa-api-required");
    syncSettingsApiCard();
  }

  window.addEventListener("fortnite-auth-changed", (event) => {
    const detail = event.detail || {};
    syncAuthoritativeLoginState(detail);
    if (detail.user) handleLoggedInApiState(detail);
    else {
      document.documentElement.classList.remove("fnaa-api-required");
    }
  });

  window.addEventListener("fortnite-login-mode-changed", syncGuestUI);
  syncGuestSlowmodeUI();
  ensureSettingsApiCard();
  ensureGuestLoginButton();
  syncAuthoritativeLoginState();
  if (getPublicAuthState()?.user) handleLoggedInApiState(getPublicAuthState());
  console.info(`FNAA Production ${VERSION} loaded.`);
})();
