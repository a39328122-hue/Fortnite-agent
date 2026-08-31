(() => {
  "use strict";

  const VERSION = "7.0";
  const CURRENT_FN_VERSION = "42.00";
  const API_ENDPOINT = String(window.FORTNITE_AI_API_ENDPOINT || "").trim().replace(/\/+$/, "");
  const LOGIN_MODE_KEY = "fortniteAiAgent.loginMode.session";
  const GUEST_ID_KEY = "fortniteAiAgent.guestId.v6";
  const GUEST_NEXT_AT = "fortniteAiAgent.guestNextAt.v7";
  const OR_PKCE_VERIFIER = "fortniteAiAgent.openrouter.pkceVerifier.v7";
  const OR_OAUTH_STARTED = "fortniteAiAgent.openrouter.oauthStartedAt.v7";
  const GUEST_SLOWMODE_MS = 15000;
  let guestSlowmodeTimer = null;
  const originalFetch = window.fetch.bind(window);

  let latestAuthState = { user: null, profile: null };
  let dbWorker = null;
  let dbSeq = 0;
  const dbPending = new Map();
  let firebaseModulesPromise = null;
  let apiVaultState = "unknown";
  let apiVaultUpdatedAt = null;
  let apiVaultCheckedAt = 0;
  let apiVaultCheckPromise = null;

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

  async function getFirebaseUserAndToken(forceRefresh = false) {
    const publicState = getPublicAuthState();
    if (!publicState?.user) return { user: null, token: "" };

    try {
      await Promise.race([
        window.FORTNITE_AUTH_READY || Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]);

      if (!firebaseModulesPromise) {
        firebaseModulesPromise = Promise.all([
          import("https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js")
        ]);
      }

      const [appMod, authMod] = await firebaseModulesPromise;
      const apps = appMod.getApps();
      if (!apps.length) return { user: null, token: "" };
      const auth = authMod.getAuth(apps[0]);
      const user = auth.currentUser;
      if (!user) return { user: null, token: "" };
      const token = await user.getIdToken(forceRefresh);
      return { user, token };
    } catch (error) {
      console.warn("FNAA auth token:", error);
      return { user: null, token: "" };
    }
  }


  function apiIsConnected() {
    return apiVaultState === "connected";
  }

  function setApiVaultState(state, updatedAt = null) {
    apiVaultState = state;
    apiVaultUpdatedAt = updatedAt || null;
    syncSettingsApiCard();
  }

  async function checkStoredApi(force = false) {
    const state = getPublicAuthState();
    if (!state?.user) {
      setApiVaultState("unknown");
      return false;
    }

    if (!force && apiVaultCheckPromise) return apiVaultCheckPromise;
    if (!force && apiVaultState !== "unknown" && Date.now() - apiVaultCheckedAt < 30000) {
      return apiIsConnected();
    }

    apiVaultState = "checking";
    syncSettingsApiCard();

    apiVaultCheckPromise = (async () => {
      try {
        const { token } = await getFirebaseUserAndToken(force);
        if (!token) throw new Error("Your Google login expired. Log in again.");
        const response = await originalFetch(`${API_ENDPOINT}/api/status`, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          headers: { "Authorization": `Bearer ${token}`, "X-FNAA-Client": "web-v3" }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `API status failed (${response.status}).`);
        apiVaultCheckedAt = Date.now();
        setApiVaultState(data.connected === true && data.provider === "openrouter" ? "connected" : "missing", data.updatedAt || null);
        return data.connected === true;
      } catch (error) {
        apiVaultCheckedAt = Date.now();
        apiVaultState = "error";
        syncSettingsApiCard();
        console.warn("FNAA encrypted API status:", error);
        return false;
      } finally {
        apiVaultCheckPromise = null;
      }
    })();

    return apiVaultCheckPromise;
  }

  function syncAuthoritativeLoginState(detail = null) {
    if (detail) latestAuthState = detail;
    const state = detail || getPublicAuthState();
    if (state?.user) {
      sessionStorage.setItem(LOGIN_MODE_KEY, "google");
    } else {
      if (sessionStorage.getItem(LOGIN_MODE_KEY) === "google") sessionStorage.removeItem(LOGIN_MODE_KEY);
      apiVaultState = "unknown";
      apiVaultUpdatedAt = null;
      apiVaultCheckedAt = 0;
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

  function base64Url(bytes) {
    let raw = "";
    for (const b of bytes) raw += String.fromCharCode(b);
    return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function randomVerifier() {
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    return base64Url(bytes);
  }

  async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64Url(new Uint8Array(digest));
  }

  function oauthCallbackUrl() {
    return `${location.origin}${location.pathname}`;
  }

  async function startOpenRouterConnect() {
    if (!getPublicAuthState()?.user) {
      showToast(copyText("Log in with Google first.", "Connecte-toi d’abord avec Google.", "سجّل دخول بـ Google أولاً."), true);
      return;
    }
    const verifier = randomVerifier();
    const challenge = await pkceChallenge(verifier);
    sessionStorage.setItem(OR_PKCE_VERIFIER, verifier);
    sessionStorage.setItem(OR_OAUTH_STARTED, String(Date.now()));
    const auth = new URL("https://openrouter.ai/auth");
    auth.searchParams.set("callback_url", oauthCallbackUrl());
    auth.searchParams.set("code_challenge", challenge);
    auth.searchParams.set("code_challenge_method", "S256");
    location.assign(auth.toString());
  }

  function clearOauthQuery() {
    const url = new URL(location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function finishOpenRouterCallback() {
    const url = new URL(location.href);
    const code = String(url.searchParams.get("code") || "").trim();
    if (!code) return false;
    const verifier = String(sessionStorage.getItem(OR_PKCE_VERIFIER) || "");
    const started = Number(sessionStorage.getItem(OR_OAUTH_STARTED) || 0);
    if (!verifier || verifier.length < 43 || Date.now() - started > 12 * 60 * 1000) {
      sessionStorage.removeItem(OR_PKCE_VERIFIER);
      sessionStorage.removeItem(OR_OAUTH_STARTED);
      clearOauthQuery();
      showToast(copyText("OpenRouter login expired. Try again.", "La connexion OpenRouter a expiré. Réessaie.", "انتهت محاولة OpenRouter. جرّب مرة ثانية."), true);
      return false;
    }
    const { token } = await getFirebaseUserAndToken(true);
    if (!token) return false;
    const gate = ensureApiGate();
    const status = gate.querySelector("#fnaaApiGateStatus");
    const connect = gate.querySelector("#fnaaApiGateConnect");
    gate.hidden = false;
    if (connect) connect.disabled = true;
    if (status) {
      status.className = "fnaa-api-status";
      status.textContent = copyText("Connecting OpenRouter...", "Connexion à OpenRouter...", "جاري ربط OpenRouter...");
    }
    try {
      const response = await originalFetch(`${API_ENDPOINT}/openrouter/exchange`, {
        method: "POST", mode: "cors", cache: "no-store",
        headers: { "Authorization": `Bearer ${token}`, "X-FNAA-Client": "web-v3", "Content-Type": "application/json" },
        body: JSON.stringify({ code, codeVerifier: verifier })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.connected !== true) throw new Error(data.error || "OpenRouter connection failed.");
      sessionStorage.removeItem(OR_PKCE_VERIFIER);
      sessionStorage.removeItem(OR_OAUTH_STARTED);
      clearOauthQuery();
      apiVaultCheckedAt = Date.now();
      setApiVaultState("connected", data.updatedAt || Date.now());
      document.documentElement.classList.remove("fnaa-api-required");
      gate.hidden = true;
      const oldGate = document.getElementById("loginGate");
      if (oldGate) oldGate.hidden = true;
      showToast(copyText("OpenRouter connected", "OpenRouter connecté", "تم ربط OpenRouter"));
      return true;
    } catch (error) {
      clearOauthQuery();
      setApiVaultState("missing");
      if (status) {
        status.classList.add("error");
        status.textContent = String(error?.message || error || "OpenRouter connection failed.");
      }
      return false;
    } finally {
      if (connect) connect.disabled = false;
    }
  }

  function ensureApiGate() {
    let gate = document.getElementById("fnaaApiGate");
    if (gate) return gate;
    gate = document.createElement("section");
    gate.id = "fnaaApiGate";
    gate.className = "fnaa-api-gate";
    gate.hidden = true;
    const card = document.createElement("div");
    card.className = "fnaa-api-gate-card";
    const title = document.createElement("h1");
    title.textContent = copyText("Connect OpenRouter", "Connecter OpenRouter", "ربط OpenRouter");
    const note = document.createElement("p");
    note.textContent = copyText(
      "One authorization, then FNAA is ready. No API key copy/paste.",
      "Une autorisation, puis FNAA est prêt. Aucun copier/coller de clé API.",
      "موافقة وحدة وبعدها FNAA يصير جاهز. بدون نسخ ولصق API key."
    );
    const status = document.createElement("div");
    status.id = "fnaaApiGateStatus";
    status.className = "fnaa-api-status";
    const button = document.createElement("button");
    button.id = "fnaaApiGateConnect";
    button.type = "button";
    button.className = "login-primary";
    button.textContent = copyText("Continue with OpenRouter", "Continuer avec OpenRouter", "المتابعة عبر OpenRouter");
    button.addEventListener("click", () => startOpenRouterConnect().catch((e) => showToast(String(e?.message || e), true)));
    const guest = document.createElement("button");
    guest.type = "button";
    guest.className = "login-secondary";
    guest.textContent = copyText("Sign out", "Se déconnecter", "تسجيل الخروج");
    guest.addEventListener("click", () => window.FortniteAuth?.signOut?.());
    card.append(title, note, status, button, guest);
    gate.appendChild(card);
    document.body.appendChild(gate);
    return gate;
  }

  function showApiGate() {
    const gate = ensureApiGate();
    const status = gate.querySelector("#fnaaApiGateStatus");
    if (status) { status.textContent = ""; status.className = "fnaa-api-status"; }
    gate.hidden = false;
    document.documentElement.classList.add("fnaa-api-required");
  }

  async function disconnectOpenRouter() {
    const { token } = await getFirebaseUserAndToken(true);
    if (!token) throw new Error("Your Google login expired. Log in again.");
    const response = await originalFetch(`${API_ENDPOINT}/api/remove`, {
      method: "POST", mode: "cors", cache: "no-store",
      headers: { "Authorization": `Bearer ${token}`, "X-FNAA-Client": "web-v3", "Content-Type": "application/json" },
      body: "{}"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.removed !== true) throw new Error(data.error || "Couldn't disconnect OpenRouter.");
    setApiVaultState("missing");
    showApiGate();
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
    title.textContent = copyText("Security & Privacy", "Sécurité et confidentialité", "الأمان والخصوصية");
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
    const connected = apiIsConnected();
    const state = card.querySelector("#fnaaSettingsApiState");
    const change = card.querySelector("#fnaaSettingsApiSave");
    const remove = card.querySelector("#fnaaSettingsApiRemove");
    if (!loggedIn) {
      state.textContent = copyText("Guest uses FNAA's Groq access + 15s slow mode.", "L’invité utilise Groq de FNAA + mode lent 15 s.", "الضيف يستخدم Groq مال FNAA + سلو مود 15 ثانية.");
      change.textContent = copyText("Log in first", "Se connecter d’abord", "سجّل دخول أولاً");
      change.disabled = true;
      remove.disabled = true;
      return;
    }
    change.disabled = apiVaultState === "checking";
    if (apiVaultState === "checking" || apiVaultState === "unknown") {
      state.textContent = copyText("Checking OpenRouter...", "Vérification d’OpenRouter...", "جاري التحقق من OpenRouter...");
    } else if (connected) {
      state.textContent = copyText("OpenRouter connected securely.", "OpenRouter est connecté en toute sécurité.", "OpenRouter مربوط بأمان.");
    } else if (apiVaultState === "error") {
      state.textContent = copyText("Couldn't check OpenRouter right now.", "Impossible de vérifier OpenRouter maintenant.", "ما كدرنا نتحقق من OpenRouter هسه.");
    } else {
      state.textContent = copyText("Connect OpenRouter to use the full account AI.", "Connecte OpenRouter pour utiliser l’IA du compte.", "اربط OpenRouter حتى تستخدم AI الحساب الكامل.");
    }
    change.textContent = connected
      ? copyText("Change OpenRouter account", "Changer de compte OpenRouter", "تغيير حساب OpenRouter")
      : copyText("Connect OpenRouter", "Connecter OpenRouter", "ربط OpenRouter");
    remove.disabled = !connected;
  }

  function ensureDbWorker() {
    if (dbWorker) return dbWorker;
    dbWorker = new Worker("./database-worker.js");
    dbWorker.addEventListener("message", (event) => {
      const { id, ok, data, error } = event.data || {};
      const pending = dbPending.get(id);
      if (!pending) return;
      dbPending.delete(id);
      ok ? pending.resolve(data) : pending.reject(new Error(error || "Database worker error"));
    });
    dbWorker.addEventListener("error", (event) => {
      for (const pending of dbPending.values()) pending.reject(new Error(event.message || "Database worker crashed"));
      dbPending.clear();
      dbWorker?.terminate();
      dbWorker = null;
    });
    return dbWorker;
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
    headers.set("X-FNAA-Client", "web-v2");
    headers.set("X-FNAA-Guest-ID", uid());

    const state = getPublicAuthState();
    const loggedIn = !!state?.user;
    if (loggedIn) {
      const { token } = await getFirebaseUserAndToken(false);
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

    if (loggedIn && (response.status === 428 || response.status === 401)) {
      try {
        const errorData = await response.clone().json();
        if (errorData?.code === "OPENROUTER_REQUIRED" || errorData?.code === "OPENROUTER_INVALID") {
          setApiVaultState("missing");
          queueMicrotask(showApiGate);
        }
      } catch {}
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

    if (state?.user && !apiIsConnected()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showApiGate();
      if (apiVaultState === "unknown" || apiVaultState === "error") checkStoredApi(true);
      return;
    }

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

  async function handleLoggedInApiState(detail) {
    document.documentElement.classList.add("fnaa-api-required");
    const connected = await checkStoredApi(true);
    if (!getPublicAuthState()?.user) return;

    if (!connected) {
      showApiGate();
      return;
    }

    document.documentElement.classList.remove("fnaa-api-required");
    ensureApiGate().hidden = true;
    if (detail?.profile?.setupComplete === false) {
      window.FortniteAuth?.skipSetup?.().catch(() => {});
    }
    const oldGate = document.getElementById("loginGate");
    if (oldGate) oldGate.hidden = true;
  }

  window.addEventListener("fortnite-auth-changed", (event) => {
    const detail = event.detail || {};
    syncAuthoritativeLoginState(detail);

    if (detail.user) {
      if (new URL(location.href).searchParams.has("code")) {
        finishOpenRouterCallback().then((done) => { if (!done) handleLoggedInApiState(detail); });
      } else {
        handleLoggedInApiState(detail);
      }
    } else {
      ensureApiGate().hidden = true;
      document.documentElement.classList.remove("fnaa-api-required");
    }
  });

  window.addEventListener("fortnite-login-mode-changed", syncGuestUI);

  const observer = new MutationObserver(() => {
    syncGuestUI();
    syncSettingsApiCard();
    const state = getPublicAuthState();
    if (state?.user && apiIsConnected()) {
      const oldGate = document.getElementById("loginGate");
      if (oldGate && oldGate.querySelector("#setupSure,#setupUsername")) oldGate.hidden = true;
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-theme"] });
  syncGuestSlowmodeUI();

  ensureApiGate();
  ensureSettingsApiCard();
  ensureGuestLoginButton();
  syncAuthoritativeLoginState();
  if (getPublicAuthState()?.user) {
    if (new URL(location.href).searchParams.has("code")) finishOpenRouterCallback().then((done) => { if (!done) handleLoggedInApiState(getPublicAuthState()); });
    else handleLoggedInApiState(getPublicAuthState());
  }
  console.info(`FNAA Production ${VERSION} loaded.`);
})();
