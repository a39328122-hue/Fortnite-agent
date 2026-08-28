(() => {
  "use strict";

  const API_ENDPOINT = window.FORTNITE_AI_API_ENDPOINT || "";
  const USER_API_KEY_SESSION = "fortniteAiAgent.groqKey.session";
  const LOGIN_MODE_SESSION = "fortniteAiAgent.loginMode.session";
  const GROQ_KEYS_URL = "https://console.groq.com/keys";
  const DISCORD_USERNAME = "@its.swag";
  const DISCORD_PROFILE_URL = null;

  const STORAGE_KEY = "fortniteAiAgent.chats.v1";
  const ACTIVE_KEY = "fortniteAiAgent.active.v1";

  injectMarkdownStyles();
  injectLoginStyles();

  const els = {
    sidebar: document.getElementById("sidebar"),
    scrim: document.getElementById("scrim"),
    openSidebar: document.getElementById("openSidebar"),
    closeSidebar: document.getElementById("closeSidebar"),
    newChatBtn: document.getElementById("newChatBtn"),
    discordTop: document.getElementById("discordTop"),
    discordSidebar: document.getElementById("discordSidebar"),
    recentList: document.getElementById("recentList"),
    chat: document.getElementById("chat"),
    welcome: document.getElementById("welcome"),
    messages: document.getElementById("messages"),
    composer: document.getElementById("composer"),
    input: document.getElementById("messageInput"),
    send: document.getElementById("sendButton"),
    toast: document.getElementById("toast")
  };

  let chats = loadChats();
  let activeId = localStorage.getItem(ACTIVE_KEY) || null;
  let busy = false;
  let toastTimer = null;

  if (!activeId || !chats[activeId]) activeId = createChat(false);
  renderAll();
  maybeShowLoginGate();

  els.openSidebar.addEventListener("click", openSidebar);
  els.closeSidebar.addEventListener("click", closeSidebar);
  els.scrim.addEventListener("click", closeSidebar);

  els.newChatBtn.addEventListener("click", () => {
    activeId = createChat(true);
    renderAll();
    closeSidebar();
    els.input.focus();
  });

  els.discordTop.addEventListener("click", openDiscord);
  els.discordSidebar.addEventListener("click", openDiscord);

  els.input.addEventListener("input", () => {
    resizeTextarea();
    updateSendState();
  });

  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!els.send.disabled) els.composer.requestSubmit();
    }
  });

  els.composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendMessage();
  });

  function loadChats() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveChats() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    localStorage.setItem(ACTIVE_KEY, activeId);
  }

  function createChat(focus = true) {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    chats[id] = {
      id,
      title: "New chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };

    activeId = id;
    saveChats();

    if (focus) setTimeout(() => els.input.focus(), 0);
    return id;
  }

  function currentChat() {
    return chats[activeId];
  }

  function titleFromMessage(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean || "New chat";
  }

  function renderAll() {
    renderMessages();
    renderRecents();
    updateSendState();
  }

  function renderRecents() {
    els.recentList.textContent = "";

    const list = Object.values(chats)
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 30);

    for (const chat of list) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `recent-item${chat.id === activeId ? " current" : ""}`;
      button.textContent = chat.title;
      button.title = chat.title;

      button.addEventListener("click", () => {
        activeId = chat.id;
        saveChats();
        renderAll();
        closeSidebar();
        scrollToBottom();
      });

      els.recentList.appendChild(button);
    }
  }

  function renderMessages() {
    const chat = currentChat();
    els.messages.textContent = "";

    const hasMessages = chat?.messages?.length > 0;
    els.welcome.hidden = hasMessages;

    if (!hasMessages) return;

    for (const message of chat.messages) {
      els.messages.appendChild(createMessageNode(message));
    }

    requestAnimationFrame(scrollToBottom);
  }

  function createMessageNode(message) {
    const outer = document.createElement("article");
    outer.className = `message ${message.role}`;

    if (message.role === "user") {
      const bubble = document.createElement("div");
      bubble.className = "user-bubble markdown-body user-markdown";
      renderMarkdown(bubble, message.content);
      outer.appendChild(bubble);
      return outer;
    }

    const wrap = document.createElement("div");
    wrap.className = "assistant-wrap";

    const name = document.createElement("div");
    name.className = "assistant-name";
    name.textContent = "Fortnite Ai Agent";

    const content = document.createElement("div");
    content.className = "assistant-content markdown-body";
    renderMarkdown(content, message.content);

    wrap.append(name, content);
    outer.appendChild(wrap);
    return outer;
  }

  // ---------------------------------------------------------
  // CHATGPT-LIKE MARKDOWN RENDERER
  // Supports:
  // # headings
  // **bold**
  // *italic*
  // ~~strike~~
  // `inline code`
  // ```code blocks```
  // > quotes
  // - bullets
  // 1. numbered lists
  // [links](https://...)
  // ---
  // ---------------------------------------------------------

  function renderMarkdown(container, source) {
    container.textContent = "";

    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (/^```/.test(line)) {
        // Supports both:
        // ```js
        // code
        // ```
        // and: ```code```
        const sameLine = line.match(/^```([^`\n]*)```$/);

        if (sameLine) {
          appendCodeBlock(container, sameLine[1], "Plain text");
          i++;
          continue;
        }

        const language = line.replace(/^```/, "").trim() || "Plain text";
        const codeLines = [];
        i++;

        while (i < lines.length && !/^```/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }

        appendCodeBlock(container, codeLines.join("\n"), language);
        if (i < lines.length) i++;
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(heading[1].length, 4);
        const h = document.createElement(`h${level}`);
        appendInlineMarkdown(h, heading[2]);
        container.appendChild(h);
        i++;
        continue;
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        container.appendChild(document.createElement("hr"));
        i++;
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        const quote = document.createElement("blockquote");
        const quoteLines = [];

        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }

        appendInlineMarkdown(quote, quoteLines.join("\n"));
        container.appendChild(quote);
        continue;
      }

      if (/^\s*[-+*]\s+/.test(line)) {
        const ul = document.createElement("ul");

        while (i < lines.length && /^\s*[-+*]\s+/.test(lines[i])) {
          const li = document.createElement("li");
          appendInlineMarkdown(li, lines[i].replace(/^\s*[-+*]\s+/, ""));
          ul.appendChild(li);
          i++;
        }

        container.appendChild(ul);
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const ol = document.createElement("ol");

        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          const li = document.createElement("li");
          appendInlineMarkdown(li, lines[i].replace(/^\s*\d+[.)]\s+/, ""));
          ol.appendChild(li);
          i++;
        }

        container.appendChild(ol);
        continue;
      }

      const paragraphLines = [line];
      i++;

      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^```/.test(lines[i]) &&
        !/^(#{1,6})\s+/.test(lines[i]) &&
        !/^\s*>\s?/.test(lines[i]) &&
        !/^\s*[-+*]\s+/.test(lines[i]) &&
        !/^\s*\d+[.)]\s+/.test(lines[i]) &&
        !/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[i])
      ) {
        paragraphLines.push(lines[i]);
        i++;
      }

      const p = document.createElement("p");
      appendInlineMarkdown(p, paragraphLines.join("\n"));
      container.appendChild(p);
    }
  }

  function appendInlineMarkdown(parent, text) {
    const tokenRegex =
      /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;

    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
      appendTextWithBreaks(parent, text.slice(lastIndex, match.index));

      const token = match[0];

      if (token.startsWith("`")) {
        const code = document.createElement("code");
        code.className = "inline-code";
        code.textContent = token.slice(1, -1);
        parent.appendChild(code);
      } else if (
        (token.startsWith("**") && token.endsWith("**")) ||
        (token.startsWith("__") && token.endsWith("__"))
      ) {
        const strong = document.createElement("strong");
        strong.textContent = token.slice(2, -2);
        parent.appendChild(strong);
      } else if (token.startsWith("~~") && token.endsWith("~~")) {
        const del = document.createElement("del");
        del.textContent = token.slice(2, -2);
        parent.appendChild(del);
      } else if (
        (token.startsWith("*") && token.endsWith("*")) ||
        (token.startsWith("_") && token.endsWith("_"))
      ) {
        const em = document.createElement("em");
        em.textContent = token.slice(1, -1);
        parent.appendChild(em);
      } else if (token.startsWith("[")) {
        const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (linkMatch) {
          const a = document.createElement("a");
          a.textContent = linkMatch[1];
          a.href = linkMatch[2];
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          parent.appendChild(a);
        } else {
          appendTextWithBreaks(parent, token);
        }
      }

      lastIndex = tokenRegex.lastIndex;
    }

    appendTextWithBreaks(parent, text.slice(lastIndex));
  }

  function appendTextWithBreaks(parent, text) {
    const parts = String(text).split("\n");

    parts.forEach((part, index) => {
      if (part) parent.appendChild(document.createTextNode(part));
      if (index < parts.length - 1) parent.appendChild(document.createElement("br"));
    });
  }

  function appendCodeBlock(container, code, language) {
    const box = document.createElement("div");
    box.className = "code-block chatgpt-code-block";

    const head = document.createElement("div");
    head.className = "code-head";

    const lang = document.createElement("span");
    lang.textContent = prettyLanguage(language);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-button";
    copy.setAttribute("aria-label", "Copy code");
    copy.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 7V5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-2v2a4 4 0 0 1-4 4H5a3 3 0 0 1-3-3v-8a4 4 0 0 1 4-4h2Zm3-3a1 1 0 0 0-1 1v2h3a4 4 0 0 1 4 4v3h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-8Zm2 5H6a2 2 0 0 0-2 2v8a1 1 0 0 0 1 1h8a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Z"/>
      </svg>
      <span>Copy</span>
    `;

    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        const label = copy.querySelector("span");
        label.textContent = "Copied";
        setTimeout(() => {
          label.textContent = "Copy";
        }, 1200);
      } catch {
        showToast("Couldn't copy automatically.", true);
      }
    });

    head.append(lang, copy);

    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.textContent = code;

    pre.appendChild(codeEl);
    box.append(head, pre);
    container.appendChild(box);
  }

  function prettyLanguage(language) {
    const clean = String(language || "").trim();
    if (!clean) return "Plain text";

    const names = {
      txt: "Plain text",
      text: "Plain text",
      plaintext: "Plain text",
      plain: "Plain text",
      js: "JavaScript",
      javascript: "JavaScript",
      ts: "TypeScript",
      typescript: "TypeScript",
      html: "HTML",
      css: "CSS",
      json: "JSON",
      verse: "Verse",
      cpp: "C++",
      c: "C",
      python: "Python",
      py: "Python",
      bash: "Bash",
      sh: "Shell",
      powershell: "PowerShell",
      yaml: "YAML",
      yml: "YAML"
    };

    return names[clean.toLowerCase()] || clean;
  }

  async function sendMessage() {
    if (busy) return;

    if (!API_ENDPOINT || API_ENDPOINT.includes("PASTE-YOUR-WORKER")) {
      showToast("Cloudflare Worker URL is not configured yet. Edit config.js.", true);
      return;
    }

    const text = els.input.value.trim();
    if (!text) return;

    const chat = currentChat();

    if (!chat.messages.length) {
      chat.title = titleFromMessage(text);
    }

    chat.messages.push({ role: "user", content: text });
    chat.updatedAt = Date.now();
    saveChats();

    els.input.value = "";
    resizeTextarea();
    renderAll();
    setBusy(true);
    addTypingIndicator();
    scrollToBottom();

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chat.messages,
          apiKey: sessionStorage.getItem(USER_API_KEY_SESSION) || null
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      chat.messages.push({
        role: "assistant",
        content: String(data.reply || "").trim()
      });

      chat.updatedAt = Date.now();
      saveChats();
      renderAll();
    } catch (error) {
      removeTypingIndicator();
      showToast(error.message || "AI request failed.", true);
      renderAll();
    } finally {
      setBusy(false);
      els.input.focus();
    }
  }

  function addTypingIndicator() {
    removeTypingIndicator();

    const outer = document.createElement("article");
    outer.className = "message assistant";
    outer.id = "typingMessage";

    const wrap = document.createElement("div");
    wrap.className = "assistant-wrap";

    const name = document.createElement("div");
    name.className = "assistant-name";
    name.textContent = "Fortnite Ai Agent";

    const dots = document.createElement("div");
    dots.className = "typing";
    dots.innerHTML = "<span></span><span></span><span></span>";

    wrap.append(name, dots);
    outer.appendChild(wrap);
    els.messages.appendChild(outer);
  }

  function removeTypingIndicator() {
    document.getElementById("typingMessage")?.remove();
  }

  function setBusy(value) {
    busy = value;
    els.input.disabled = value;
    updateSendState();
  }

  function updateSendState() {
    els.send.disabled = busy || !els.input.value.trim();
  }

  function resizeTextarea() {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(els.input.scrollHeight, 180)}px`;
    els.input.style.overflowY = els.input.scrollHeight > 180 ? "auto" : "hidden";
  }

  function scrollToBottom() {
    els.chat.scrollTop = els.chat.scrollHeight;
  }

  function openSidebar() {
    els.sidebar.classList.add("open");
    els.scrim.hidden = false;
  }

  function closeSidebar() {
    els.sidebar.classList.remove("open");
    els.scrim.hidden = true;
  }

  async function openDiscord() {
    if (DISCORD_PROFILE_URL) {
      window.open(DISCORD_PROFILE_URL, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      await navigator.clipboard.writeText(DISCORD_USERNAME);
      showToast(`${DISCORD_USERNAME} copied`);
    } catch {
      showToast(`Discord: ${DISCORD_USERNAME}`);
    }
  }


  function maybeShowLoginGate() {
    const mode = sessionStorage.getItem(LOGIN_MODE_SESSION);
    if (mode === "guest" || mode === "api") return;
    openWelcomeGate();
  }

  function openWelcomeGate() {
    removeLoginGate();

    const overlay = document.createElement("div");
    overlay.className = "login-gate";
    overlay.id = "loginGate";

    const card = document.createElement("section");
    card.className = "login-card login-card-welcome";

    const title = document.createElement("h1");
    title.textContent = "Welcome to Fortnite Ai Agent";

    const sub = document.createElement("p");
    sub.className = "login-sub";
    sub.textContent = "Choose how you want to use the agent.";

    const loginBtn = document.createElement("button");
    loginBtn.type = "button";
    loginBtn.className = "login-primary";
    loginBtn.textContent = "Log in";
    loginBtn.addEventListener("click", openApiLogin);

    const guestBtn = document.createElement("button");
    guestBtn.type = "button";
    guestBtn.className = "login-secondary";
    guestBtn.textContent = "Guest";
    guestBtn.addEventListener("click", () => {
      sessionStorage.removeItem(USER_API_KEY_SESSION);
      sessionStorage.setItem(LOGIN_MODE_SESSION, "guest");
      removeLoginGate();
    });

    const guestInfo = document.createElement("p");
    guestInfo.className = "guest-info";
    guestInfo.textContent =
      "Guest uses the public API limit. It can run out quickly and may already be unavailable, so the AI might not reply.";

    card.append(title, sub, loginBtn, guestBtn, guestInfo);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function openApiLogin() {
    removeLoginGate();

    const overlay = document.createElement("div");
    overlay.className = "login-gate";
    overlay.id = "loginGate";

    const card = document.createElement("section");
    card.className = "login-card";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "login-back";
    back.textContent = "←";
    back.setAttribute("aria-label", "Back");
    back.addEventListener("click", openWelcomeGate);

    const title = document.createElement("h1");
    title.textContent = "Type ur API";

    const inputWrap = document.createElement("div");
    inputWrap.className = "api-input-wrap";

    const input = document.createElement("input");
    input.type = "password";
    input.inputMode = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.placeholder = "gsk_...";
    input.setAttribute("aria-label", "Groq API key");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "api-toggle";
    toggle.textContent = "Show";
    toggle.addEventListener("click", () => {
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      toggle.textContent = isHidden ? "Hide" : "Show";
    });

    inputWrap.append(input, toggle);

    const continueBtn = document.createElement("button");
    continueBtn.type = "button";
    continueBtn.className = "login-primary";
    continueBtn.textContent = "Continue";

    const help = document.createElement("p");
    help.className = "api-help";
    help.append("u don’t have a api? create one for free from: ");

    const link = document.createElement("a");
    link.href = GROQ_KEYS_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Groq API";
    help.appendChild(link);

    const privacy = document.createElement("p");
    privacy.className = "api-privacy";
    privacy.textContent =
      "Your key is kept only for this browser session and is not saved to your chat history.";

    function submitKey() {
      const key = input.value.trim();

      if (!key) {
        input.focus();
        showToast("Type your Groq API key first.", true);
        return;
      }

      if (!key.startsWith("gsk_")) {
        showToast("That doesn't look like a Groq API key.", true);
        input.focus();
        return;
      }

      sessionStorage.setItem(USER_API_KEY_SESSION, key);
      sessionStorage.setItem(LOGIN_MODE_SESSION, "api");
      removeLoginGate();
      showToast("Logged in with your Groq API key.");
      els.input.focus();
    }

    continueBtn.addEventListener("click", submitKey);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitKey();
    });

    card.append(back, title, inputWrap, continueBtn, help, privacy);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => input.focus(), 50);
  }

  function removeLoginGate() {
    document.getElementById("loginGate")?.remove();
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("error", isError);
    els.toast.classList.add("show");

    toastTimer = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2800);
  }


  function injectLoginStyles() {
    if (document.getElementById("fortnite-ai-login-styles")) return;

    const style = document.createElement("style");
    style.id = "fortnite-ai-login-styles";
    style.textContent = `
      .login-gate {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        place-items: center;
        padding:
          max(22px, env(safe-area-inset-top))
          max(18px, env(safe-area-inset-right))
          max(22px, env(safe-area-inset-bottom))
          max(18px, env(safe-area-inset-left));
        background: rgba(5, 5, 5, .98);
        overflow-y: auto;
      }

      .login-card {
        position: relative;
        width: min(420px, 100%);
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 28px 22px 24px;
        border: 1px solid #272727;
        border-radius: 24px;
        background: #101010;
        box-shadow: 0 24px 80px rgba(0,0,0,.34);
      }

      .login-card-welcome {
        text-align: center;
      }

      .login-card h1 {
        margin: 0 0 2px;
        font-size: clamp(25px, 7vw, 34px);
        line-height: 1.12;
        letter-spacing: -.03em;
      }

      .login-sub {
        margin: 0 0 12px;
        color: #999;
        line-height: 1.45;
      }

      .login-primary,
      .login-secondary {
        width: 100%;
        min-height: 50px;
        border-radius: 14px;
        font-weight: 700;
        cursor: pointer;
      }

      .login-primary {
        border: 0;
        background: #f2f2f2;
        color: #0b0b0b;
      }

      .login-primary:active {
        transform: scale(.99);
      }

      .login-secondary {
        border: 1px solid #343434;
        background: #181818;
        color: #f1f1f1;
      }

      .guest-info,
      .api-help,
      .api-privacy {
        margin: 2px 2px 0;
        color: #8c8c8c;
        font-size: 12.5px;
        line-height: 1.5;
      }

      .guest-info {
        text-align: left;
      }

      .login-back {
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        margin: -6px 0 2px -6px;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: #f2f2f2;
        font-size: 24px;
        cursor: pointer;
      }

      .login-back:hover {
        background: #191919;
      }

      .api-input-wrap {
        min-height: 54px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 8px 0 15px;
        border: 1px solid #343434;
        border-radius: 15px;
        background: #181818;
      }

      .api-input-wrap:focus-within {
        border-color: #555;
      }

      .api-input-wrap input {
        min-width: 0;
        flex: 1;
        border: 0;
        outline: 0;
        background: transparent;
        color: #f4f4f4;
        font: 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      .api-input-wrap input::placeholder {
        color: #6f6f6f;
      }

      .api-toggle {
        min-width: 50px;
        height: 36px;
        border: 0;
        border-radius: 9px;
        background: #242424;
        color: #d8d8d8;
        cursor: pointer;
        font-size: 12px;
      }

      .api-help a {
        color: #e9e9e9;
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .api-privacy {
        color: #686868;
      }

      @media (max-width: 520px) {
        .login-gate {
          align-items: end;
          padding-left: 10px;
          padding-right: 10px;
          padding-bottom: max(10px, env(safe-area-inset-bottom));
        }

        .login-card {
          width: 100%;
          border-radius: 24px 24px 18px 18px;
          padding: 26px 18px 22px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function injectMarkdownStyles() {
    if (document.getElementById("fortnite-ai-markdown-styles")) return;

    const style = document.createElement("style");
    style.id = "fortnite-ai-markdown-styles";
    style.textContent = `
      .markdown-body {
        color: inherit;
        line-height: 1.65;
        word-break: normal;
        overflow-wrap: anywhere;
      }

      .markdown-body > :first-child { margin-top: 0 !important; }
      .markdown-body > :last-child { margin-bottom: 0 !important; }

      .markdown-body p {
        margin: 0 0 14px;
      }

      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3,
      .markdown-body h4 {
        margin: 22px 0 10px;
        line-height: 1.24;
        letter-spacing: -0.018em;
        color: #f4f4f4;
      }

      .markdown-body h1 { font-size: 1.55rem; }
      .markdown-body h2 { font-size: 1.32rem; }
      .markdown-body h3 { font-size: 1.13rem; }
      .markdown-body h4 { font-size: 1rem; }

      .markdown-body strong {
        font-weight: 750;
        color: #fafafa;
      }

      .markdown-body em {
        color: #e7e7e7;
      }

      .markdown-body del {
        color: #9a9a9a;
      }

      .markdown-body ul,
      .markdown-body ol {
        margin: 8px 0 16px;
        padding-left: 25px;
      }

      .markdown-body li {
        margin: 5px 0;
        padding-left: 3px;
      }

      .markdown-body blockquote {
        margin: 12px 0 16px;
        padding: 2px 0 2px 14px;
        border-left: 3px solid #4a4a4a;
        color: #c5c5c5;
      }

      .markdown-body hr {
        height: 1px;
        border: 0;
        background: #292929;
        margin: 22px 0;
      }

      .markdown-body a {
        color: #d8e7ff;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .user-markdown p {
        margin: 0;
      }

      .user-markdown .chatgpt-code-block {
        margin: 6px 0;
        background: #202020;
      }

      .user-markdown .chatgpt-code-block pre {
        background: #202020;
      }

      .markdown-body .inline-code {
        display: inline;
        padding: 2px 6px;
        margin: 0 1px;
        border: 1px solid #303030;
        border-radius: 6px;
        background: #1d1d1d;
        color: #f1f1f1;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: .91em;
        white-space: break-spaces;
      }

      .chatgpt-code-block {
        margin: 14px 0 18px;
        border: 1px solid #353535;
        border-radius: 16px;
        background: #1d1d1d;
        overflow: hidden;
      }

      .chatgpt-code-block .code-head {
        min-height: 48px;
        padding: 0 14px 0 16px;
        border-bottom: 0;
        background: #222;
        color: #f1f1f1;
        font-size: 13px;
        font-weight: 650;
      }

      .chatgpt-code-block .copy-button {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 7px 8px;
        color: #f4f4f4;
      }

      .chatgpt-code-block .copy-button svg {
        width: 19px;
        height: 19px;
        fill: currentColor;
      }

      .chatgpt-code-block pre {
        margin: 0;
        padding: 17px 16px 19px;
        overflow-x: auto;
        background: #1d1d1d;
        color: #c9c9d1;
        font: 13.5px/1.65 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        white-space: pre;
      }

      @media (max-width: 520px) {
        .markdown-body h1 { font-size: 1.38rem; }
        .markdown-body h2 { font-size: 1.22rem; }

        .chatgpt-code-block {
          border-radius: 15px;
        }

        .chatgpt-code-block .code-head {
          min-height: 46px;
        }

        .chatgpt-code-block pre {
          font-size: 13px;
        }
      }
    `;

    document.head.appendChild(style);
  }
})();
