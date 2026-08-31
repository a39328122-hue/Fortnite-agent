(() => {
  "use strict";

  const VERSION = "6.3";
  const CURRENT_FN_VERSION = "42.00";
  const API_ENDPOINT = String(window.FORTNITE_AI_API_ENDPOINT || "").trim().replace(/\/+$/, "");
  const LOGIN_MODE_KEY = "fortniteAiAgent.loginMode.session";
  const GUEST_ID_KEY = "fortniteAiAgent.guestId.v6";
  const GUEST_NEXT_AT = "fortniteAiAgent.guestNextAt.v63";
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
          headers: { "Authorization": `Bearer ${token}`, "X-FNAA-Client": "web-v2" }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `API status failed (${response.status}).`);
        apiVaultCheckedAt = Date.now();
        setApiVaultState(data.connected === true ? "connected" : "missing", data.updatedAt || null);
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
    title.textContent = "Add API";

    const note = document.createElement("p");
    note.textContent = "Connect your Groq API once. FNAA encrypts it and keeps it on your account.";

    const input = document.createElement("input");
    input.id = "fnaaApiGateInput";
    input.type = "password";
    input.placeholder = "Type your api";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = 300;

    const help = document.createElement("div");
    help.className = "fnaa-api-help";
    help.append(document.createTextNode("you dont have api ? get free api from "));
    const link = document.createElement("a");
    link.href = "https://console.groq.com/keys";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Groq Api";
    help.appendChild(link);

    const status = document.createElement("div");
    status.id = "fnaaApiGateStatus";
    status.className = "fnaa-api-status";

    const button = document.createElement("button");
    button.id = "fnaaApiGateSave";
    button.type = "button";
    button.textContent = "Add API";
    button.className = "login-primary";
    button.addEventListener("click", () => validateAndSaveApi(input, button, status, true));

    card.append(title, note, input, help, status, button);
    gate.appendChild(card);
    document.body.appendChild(gate);
    return gate;
  }

  async function validateAndSaveApi(input, button, status, closeAfter) {
    const key = String(input?.value || "").trim();
    if (key.length < 20) {
      status.textContent = "Type a valid Groq API key.";
      status.classList.add("error");
      return false;
    }

    button.disabled = true;
    status.classList.remove("error", "success");
    status.textContent = "Checking & encrypting API...";

    try {
      const { token } = await getFirebaseUserAndToken(true);
      if (!token) throw new Error("Your Google login expired. Log in again.");

      const response = await originalFetch(`${API_ENDPOINT}/api/validate`, {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-FNAA-Client": "web-v2",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ apiKey: key })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.valid !== true || data.stored !== true) {
        throw new Error(data.error || "API validation failed.");
      }

      input.value = "";
      apiVaultCheckedAt = Date.now();
      setApiVaultState("connected", Date.now());
      status.textContent = "API encrypted & saved.";
      status.classList.add("success");
      document.documentElement.classList.remove("fnaa-api-required");

      const state = getPublicAuthState();
      if (state?.profile?.setupComplete === false) {
        try { await window.FortniteAuth?.skipSetup?.(); } catch {}
      }

      if (closeAfter) {
        setTimeout(() => {
          const gate = ensureApiGate();
          gate.hidden = true;
          const oldGate = document.getElementById("loginGate");
          if (oldGate) oldGate.hidden = true;
        }, 350);
      }

      syncSettingsApiCard();
      showToast("API encrypted & saved");
      return true;
    } catch (error) {
      setApiVaultState("missing");
      status.textContent = String(error?.message || error || "API validation failed.");
      status.classList.add("error");
      document.documentElement.classList.add("fnaa-api-required");
      return false;
    } finally {
      button.disabled = false;
    }
  }

  function showApiGate() {
    const gate = ensureApiGate();
    const input = gate.querySelector("#fnaaApiGateInput");
    const status = gate.querySelector("#fnaaApiGateStatus");
    if (status) { status.textContent = ""; status.className = "fnaa-api-status"; }
    gate.hidden = false;
    document.documentElement.classList.add("fnaa-api-required");
    setTimeout(() => input?.focus(), 40);
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
    icon.textContent = "API";

    const main = document.createElement("div");
    main.className = "settings-card-main";

    const title = document.createElement("h2");
    title.textContent = "Groq API";

    const state = document.createElement("p");
    state.id = "fnaaSettingsApiState";

    const input = document.createElement("input");
    input.id = "fnaaSettingsApiInput";
    input.className = "fnaa-api-settings-input";
    input.type = "password";
    input.placeholder = "Type your api";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = 300;

    const help = document.createElement("div");
    help.className = "fnaa-api-help settings-help";
    help.append(document.createTextNode("you dont have api ? get free api from "));
    const link = document.createElement("a");
    link.href = "https://console.groq.com/keys";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Groq Api";
    help.appendChild(link);

    const status = document.createElement("div");
    status.id = "fnaaSettingsApiStatus";
    status.className = "fnaa-api-status";

    const actions = document.createElement("div");
    actions.className = "fnaa-api-actions";

    const save = document.createElement("button");
    save.id = "fnaaSettingsApiSave";
    save.type = "button";
    save.className = "tool-button primary";
    save.textContent = "Add API";
    save.addEventListener("click", () => validateAndSaveApi(input, save, status, false));

    const remove = document.createElement("button");
    remove.id = "fnaaSettingsApiRemove";
    remove.type = "button";
    remove.className = "tool-button";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      status.className = "fnaa-api-status";
      status.textContent = "Removing API...";
      try {
        const { token } = await getFirebaseUserAndToken(true);
        if (!token) throw new Error("Your Google login expired. Log in again.");
        const response = await originalFetch(`${API_ENDPOINT}/api/remove`, {
          method: "POST",
          mode: "cors",
          cache: "no-store",
          headers: { "Authorization": `Bearer ${token}`, "X-FNAA-Client": "web-v2", "Content-Type": "application/json" },
          body: "{}"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.removed !== true) throw new Error(data.error || "Couldn't remove API.");
        setApiVaultState("missing");
        status.textContent = "API removed.";
        showApiGate();
      } catch (error) {
        status.textContent = String(error?.message || error || "Couldn't remove API.");
        status.classList.add("error");
      } finally {
        syncSettingsApiCard();
      }
    });

    actions.append(save, remove);
    main.append(title, state, input, help, status, actions);
    card.append(icon, main);

    const owner = content.querySelector(".owner-settings-card");
    if (owner) content.insertBefore(card, owner);
    else content.appendChild(card);
    return card;
  }

  function syncSettingsApiCard() {
    const card = ensureSettingsApiCard();
    if (!card) return;
    const loggedIn = !!getPublicAuthState()?.user;
    const connected = apiIsConnected();
    const state = card.querySelector("#fnaaSettingsApiState");
    const input = card.querySelector("#fnaaSettingsApiInput");
    const save = card.querySelector("#fnaaSettingsApiSave");
    const remove = card.querySelector("#fnaaSettingsApiRemove");

    if (!loggedIn) {
      state.textContent = "Guest mode uses FNAA shared API + 15s slowmode.";
      input.disabled = true;
      save.disabled = true;
      remove.disabled = true;
      return;
    }

    if (apiVaultState === "checking" || apiVaultState === "unknown") {
      state.textContent = "Checking encrypted API...";
    } else if (connected) {
      state.textContent = "Encrypted & saved to your FNAA account.";
    } else if (apiVaultState === "error") {
      state.textContent = "Couldn't check encrypted API right now.";
    } else {
      state.textContent = "Required for logged-in AI chat.";
    }

    input.disabled = false;
    save.disabled = false;
    remove.disabled = !connected;
    save.textContent = connected ? "Update API" : "Add API";
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

    // Start guest slow mode only when an actual request is sent to the AI backend.
    // Local database commands and the separate Tools UI do not trigger it.
    if (!loggedIn) startGuestSlowmode();

    const response = await originalFetch(input, { ...init, headers, body: bodyText });

    if (loggedIn && (response.status === 428 || response.status === 401)) {
      try {
        const errorData = await response.clone().json();
        if (errorData?.code === "API_REQUIRED" || errorData?.code === "API_INVALID") {
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
      handleLoggedInApiState(detail);
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
  if (getPublicAuthState()?.user) handleLoggedInApiState(getPublicAuthState());
  console.info(`FNAA Production ${VERSION} loaded.`);
})();
