(() => {
  "use strict";

  const API_ENDPOINT = window.FORTNITE_AI_API_ENDPOINT || "";
  const DISCORD_USERNAME = "@its.swag";
  const DISCORD_PROFILE_URL = null;

  const STORAGE_KEY = "fortniteAiAgent.chats.v1";
  const ACTIVE_KEY = "fortniteAiAgent.active.v1";

  injectMarkdownStyles();

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
      bubble.className = "user-bubble";
      bubble.textContent = message.content;
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
        const language = line.replace(/^```/, "").trim() || "code";
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
        body: JSON.stringify({ messages: chat.messages })
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

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("error", isError);
    els.toast.classList.add("show");

    toastTimer = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2800);
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
