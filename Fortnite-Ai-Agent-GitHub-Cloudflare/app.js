(() => {
  "use strict";

  const API_ENDPOINT = window.FORTNITE_AI_API_ENDPOINT || "";
  const DB_CONFIG = window.FORTNITE_AI_DB || {};
  const USER_API_KEY_SESSION = "fortniteAiAgent.groqKey.session";
  const LOGIN_MODE_SESSION = "fortniteAiAgent.loginMode.session";
  const GROQ_KEYS_URL = "https://console.groq.com/keys";
  const STORAGE_KEY = "fortniteAiAgent.chats.v2";
  const ACTIVE_KEY = "fortniteAiAgent.active.v2";
  const GENERATED_FILE_NAME = "Subscribe to my YT channel @27lf.txt";

  const PLUGINS = [
    { id: "deep", label: "DeepResearch", command: "@DeepResearch", description: "Multi-step current web research" },
    { id: "sm", label: "SearchForSM_", command: "@SearchForSM_", description: "Search Static Mesh paths" },
    { id: "m", label: "SearchForM_", command: "@SearchForM_", description: "Search Materials / Material Instances" },
    { id: "meshes", label: "SearchForMeshes", command: "@SearchForMeshes", description: "Search mesh paths + JSON references" },
    { id: "all", label: "SearchFortniteFiles", command: "@SearchFortniteFiles", description: "Search the full Fortnite database" }
  ];

  const els = {
    sidebar: document.getElementById("sidebar"),
    scrim: document.getElementById("scrim"),
    openSidebar: document.getElementById("openSidebar"),
    closeSidebar: document.getElementById("closeSidebar"),
    newChatBtn: document.getElementById("newChatBtn"),
    moreToolsBtn: document.getElementById("moreToolsBtn"),
    discordTop: document.getElementById("discordTop"),
    recentList: document.getElementById("recentList"),
    chat: document.getElementById("chat"),
    welcome: document.getElementById("welcome"),
    messages: document.getElementById("messages"),
    composer: document.getElementById("composer"),
    input: document.getElementById("messageInput"),
    send: document.getElementById("sendButton"),
    toast: document.getElementById("toast")
  };

  const pluginMenu = document.createElement("div");
  pluginMenu.className = "plugin-menu";
  pluginMenu.hidden = true;
  document.body.appendChild(pluginMenu);

  let chats = loadChats();
  let activeId = localStorage.getItem(ACTIVE_KEY) || null;
  let busy = false;
  let toastTimer = null;
  let dbWorker = null;
  let dbPending = new Map();
  let dbSeq = 0;

  if (!activeId || !chats[activeId]) activeId = createChat(false);

  renderAll();
  setupEvents();
  maybeShowLoginGate();

  function setupEvents() {
    els.openSidebar.addEventListener("click", openSidebar);
    els.closeSidebar.addEventListener("click", closeSidebar);
    els.scrim.addEventListener("click", closeSidebar);

    els.newChatBtn.addEventListener("click", () => {
      activeId = createChat(true);
      renderAll();
      closeSidebar();
    });

    els.moreToolsBtn.addEventListener("click", () => {
      closeSidebar();
      window.FortniteTools?.open();
    });

    els.discordTop.addEventListener("click", () => {
      navigator.clipboard?.writeText("@its.swag").then(
        () => showToast("Copied @its.swag"),
        () => showToast("@its.swag")
      );
    });

    els.input.addEventListener("input", () => {
      resizeTextarea();
      updateSendState();
      updatePluginMenu();
    });

    els.input.addEventListener("keyup", (event) => {
      if (event.key === "@" || event.key === "Backspace" || event.key.length === 1) {
        updatePluginMenu();
      }
    });

    els.input.addEventListener("focus", updatePluginMenu);
    els.input.addEventListener("click", updatePluginMenu);

    els.input.addEventListener("keydown", (event) => {
      if (!pluginMenu.hidden) {
        if (event.key === "Escape") {
          pluginMenu.hidden = true;
          return;
        }

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          movePluginSelection(event.key === "ArrowDown" ? 1 : -1);
          return;
        }

        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          const selected = pluginMenu.querySelector(".plugin-option.selected");
          if (selected) {
            event.preventDefault();
            selectPlugin(selected.dataset.command || "");
            return;
          }
        }
      }

      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!els.send.disabled) els.composer.requestSubmit();
      }
    });

    els.composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendMessage();
    });

    document.addEventListener("click", (event) => {
      if (!pluginMenu.hidden && !pluginMenu.contains(event.target) && event.target !== els.input) {
        pluginMenu.hidden = true;
      }
    });

    window.addEventListener("resize", positionPluginMenu);

    if (window.visualViewport) {
      visualViewport.addEventListener("resize", positionPluginMenu);
      visualViewport.addEventListener("scroll", positionPluginMenu);
    }
  }

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
    return clean.length > 42 ? `${clean.slice(0, 42)}â¦` : clean || "New chat";
  }

  function renderAll() {
    renderMessages();
    renderRecents();
    updateSendState();
  }

  function renderRecents() {
    els.recentList.replaceChildren();
    const list = Object.values(chats)
      .filter((c) => c.messages.length)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 30);

    for (const chat of list) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `recent-item${chat.id === activeId ? " current" : ""}`;
      button.textContent = chat.title;
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
    els.messages.replaceChildren();
    const has = chat?.messages?.length > 0;
    els.welcome.hidden = has;
    if (!has) return;

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
    content.className = "assistant-content";
    renderMarkdown(content, message.content);

    wrap.append(name, content);

    if (message.attachment?.content) {
      appendGeneratedFile(wrap, message.attachment);
    }

    outer.appendChild(wrap);
    return outer;
  }

  function renderMarkdown(container, source) {
    container.replaceChildren();
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (/^```/.test(line)) {
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
          codeLines.push(lines[i++]);
        }
        appendCodeBlock(container, codeLines.join("\n"), language);
        if (i < lines.length) i++;
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const h = document.createElement(`h${heading[1].length}`);
        appendInline(h, heading[2]);
        container.appendChild(h);
        i++;
        continue;
      }

      if (/^\s*[-+*]\s+/.test(line)) {
        const ul = document.createElement("ul");
        while (i < lines.length && /^\s*[-+*]\s+/.test(lines[i])) {
          const li = document.createElement("li");
          appendInline(li, lines[i].replace(/^\s*[-+*]\s+/, ""));
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
          appendInline(li, lines[i].replace(/^\s*\d+[.)]\s+/, ""));
          ol.appendChild(li);
          i++;
        }
        container.appendChild(ol);
        continue;
      }

      const p = document.createElement("p");
      appendInline(p, line);
      container.appendChild(p);
      i++;
    }
  }

  function appendInline(parent, text) {
    const regex = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
    let last = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      const token = match[0];

      if (token.startsWith("`")) {
        const el = document.createElement("code");
        el.className = "inline-code";
        el.textContent = token.slice(1, -1);
        parent.appendChild(el);
      } else if (token.startsWith("**")) {
        const el = document.createElement("strong");
        el.textContent = token.slice(2, -2);
        parent.appendChild(el);
      } else if (token.startsWith("~~")) {
        const el = document.createElement("del");
        el.textContent = token.slice(2, -2);
        parent.appendChild(el);
      } else if (token.startsWith("*")) {
        const el = document.createElement("em");
        el.textContent = token.slice(1, -1);
        parent.appendChild(el);
      } else {
        const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
        if (link) {
          const a = document.createElement("a");
          a.textContent = link[1];
          a.href = link[2];
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          parent.appendChild(a);
        }
      }
      last = regex.lastIndex;
    }

    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function appendCodeBlock(container, code, language) {
    const box = document.createElement("div");
    box.className = "code-block";

    const head = document.createElement("div");
    head.className = "code-head";

    const lang = document.createElement("span");
    lang.textContent = language || "Plain text";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = "Copied";
        setTimeout(() => copy.textContent = "Copy", 1100);
      } catch {
        showToast("Couldn't copy automatically.", true);
      }
    });

    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    head.append(lang, copy);
    box.append(head, pre);
    container.appendChild(box);
  }

  function appendGeneratedFile(parent, attachment) {
    const card = document.createElement("div");
    card.className = "generated-file-card";

    const icon = document.createElement("div");
    icon.className = "generated-file-icon";
    icon.textContent = "TXT";

    const meta = document.createElement("div");
    meta.className = "generated-file-meta";

    const name = document.createElement("div");
    name.className = "generated-file-name";
    name.textContent = GENERATED_FILE_NAME;

    const type = document.createElement("div");
    type.className = "generated-file-type";
    type.textContent = "Text file";

    const download = document.createElement("button");
    download.className = "generated-file-download";
    download.type = "button";
    download.textContent = "Download";
    download.addEventListener("click", () => {
      const blob = new Blob([attachment.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = GENERATED_FILE_NAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    });

    meta.append(name, type);
    card.append(icon, meta, download);
    parent.appendChild(card);
  }

  async function sendMessage() {
    if (busy) return;

    const text = els.input.value.trim();
    if (!text) return;

    const chat = currentChat();
    if (!chat.messages.length) chat.title = titleFromMessage(text);

    chat.messages.push({ role: "user", content: text });
    chat.updatedAt = Date.now();
    saveChats();

    els.input.value = "";
    resizeTextarea();
    pluginMenu.hidden = true;
    renderAll();
    setBusy(true);
    addTypingIndicator();

    const plugin = parsePlugin(text);

    try {
      if (plugin && ["sm", "m", "meshes", "all"].includes(plugin.id)) {
        const result = await searchDatabase(plugin.id, plugin.query);
        removeTypingIndicator();
        const reply = formatDatabaseResult(plugin, result);
        const message = { role: "assistant", content: reply.content };
        if (reply.attachment) message.attachment = reply.attachment;
        chat.messages.push(message);
      } else {
        const mode = plugin?.id === "deep" ? "deep-research" : "chat";
        const response = await fetchWithTimeout(API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            messages: chat.messages.slice(-12),
            apiKey: sessionStorage.getItem(USER_API_KEY_SESSION) || null
          })
        }, 45000);

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);

        removeTypingIndicator();
        chat.messages.push({
          role: "assistant",
          content: String(data.reply || "").trim() || "No response."
        });
      }

      chat.updatedAt = Date.now();
      saveChats();
      renderAll();
    } catch (error) {
      removeTypingIndicator();
      chat.messages.push({
        role: "assistant",
        content: `I couldn't complete that request.\n\n\`${String(error?.message || error)}\``
      });
      chat.updatedAt = Date.now();
      saveChats();
      renderAll();
    } finally {
      setBusy(false);
      els.input.focus();
    }
  }

  function parsePlugin(text) {
    const value = String(text || "").trim();
    for (const plugin of PLUGINS) {
      if (value.toLowerCase().startsWith(plugin.command.toLowerCase())) {
        return {
          id: plugin.id,
          command: plugin.command,
          query: value.slice(plugin.command.length).trim()
        };
      }
    }
    return null;
  }

  function formatDatabaseResult(plugin, result) {
    if (!plugin.query) {
      return { content: `Type what u want to search after \`${plugin.command}\`.` };
    }

    if (!result?.results?.length) {
      return {
        content: `I searched the full Fortnite database for \`${plugin.query}\` and couldn't find anything close.`
      };
    }

    const exactCount = result.results.filter((r) => r.match === "exact").length;
    let content = exactCount
      ? `Found **${result.total}** result${result.total === 1 ? "" : "s"} in Fortnite files.\n\n`
      : `I couldn't find an exact match for \`${plugin.query}\`, but i found close results:\n\n`;

    content += result.results.slice(0, 22)
      .map((r) => `${r.source === "json" ? "**JSON reference**\n" : ""}\`\`\`text\n${r.path}\n\`\`\``)
      .join("\n\n");

    let attachment = null;
    if (result.makeFile && result.allResults?.length) {
      content += "\n\nThere are too many results to send here, so i put the full list in a TXT file.";
      attachment = {
        name: GENERATED_FILE_NAME,
        content: result.allResults
          .map((r, i) => `${i + 1}. [${r.match.toUpperCase()}] [${r.source}] ${r.path}`)
          .join("\n")
      };
    }

    return { content, attachment };
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

  function searchDatabase(scope, query) {
    const worker = ensureDbWorker();
    const id = ++dbSeq;

    return new Promise((resolve, reject) => {
      dbPending.set(id, { resolve, reject });
      worker.postMessage({
        id,
        type: "search",
        scope,
        query,
        config: DB_CONFIG
      });

      setTimeout(() => {
        if (!dbPending.has(id)) return;
        dbPending.delete(id);
        reject(new Error("Database search timed out."));
      }, 30000);
    });
  }

  function updatePluginMenu() {
    const value = String(els.input.value || "");
    const caret = els.input.selectionStart ?? value.length;
    const beforeCaret = value.slice(0, caret);
    const at = beforeCaret.lastIndexOf("@");

    if (at < 0) {
      pluginMenu.hidden = true;
      return;
    }

    const between = beforeCaret.slice(at + 1);
    if (/\s/.test(between)) {
      pluginMenu.hidden = true;
      return;
    }

    const query = between.toLowerCase();
    const visible = PLUGINS.filter((p) => !query || `${p.label} ${p.command} ${p.description}`.toLowerCase().includes(query));

    if (!visible.length) {
      pluginMenu.hidden = true;
      return;
    }

    pluginMenu.replaceChildren();

    const header = document.createElement("div");
    header.className = "plugin-panel-header";

    const title = document.createElement("strong");
    title.textContent = "Plugins";

    const badge = document.createElement("span");
    badge.className = "plugin-panel-badge";
    badge.textContent = "Fortnite";

    header.append(title, badge);
    pluginMenu.appendChild(header);

    visible.forEach((plugin, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `plugin-option${index === 0 ? " selected" : ""}`;
      button.dataset.command = plugin.command;

      const icon = document.createElement("span");
      icon.className = "plugin-icon";
      icon.textContent = plugin.id === "deep" ? "ð­" :
        plugin.id === "sm" ? "â¼" :
        plugin.id === "m" ? "â" :
        plugin.id === "meshes" ? "â" : "ð";

      const info = document.createElement("span");
      info.className = "plugin-info";

      const optionTitle = document.createElement("span");
      optionTitle.className = "plugin-title";
      optionTitle.textContent = `@${plugin.label}`;

      const desc = document.createElement("small");
      desc.textContent = plugin.description;

      info.append(optionTitle, desc);
      button.append(icon, info);

      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        selectPlugin(plugin.command);
      });

      pluginMenu.appendChild(button);
    });

    pluginMenu.hidden = false;
    requestAnimationFrame(positionPluginMenu);
  }

  function positionPluginMenu() {
    if (pluginMenu.hidden) return;
    const rect = els.composer.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(520, window.innerWidth - margin * 2);
    pluginMenu.style.width = `${width}px`;
    pluginMenu.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
    pluginMenu.style.top = `${Math.max(10, rect.top - pluginMenu.offsetHeight - 10)}px`;
  }

  function movePluginSelection(direction) {
    const options = [...pluginMenu.querySelectorAll(".plugin-option")];
    if (!options.length) return;
    let index = options.findIndex((x) => x.classList.contains("selected"));
    if (index < 0) index = 0;
    options[index].classList.remove("selected");
    index = (index + direction + options.length) % options.length;
    options[index].classList.add("selected");
  }

  function selectPlugin(command) {
    const value = String(els.input.value || "");
    const caret = els.input.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const at = before.lastIndexOf("@");
    if (at < 0) return;

    const next = `${value.slice(0, at)}${command} ${after}`;
    els.input.value = next;
    pluginMenu.hidden = true;
    resizeTextarea();
    updateSendState();

    const pos = at + command.length + 1;
    els.input.focus();
    els.input.setSelectionRange(pos, pos);
  }

  function maybeShowLoginGate() {
    const mode = sessionStorage.getItem(LOGIN_MODE_SESSION);
    if (mode === "guest" || mode === "api") return;
    showWelcomeLogin();
  }

  function showWelcomeLogin() {
    const gate = document.getElementById("loginGate");
    gate.hidden = false;
    gate.innerHTML = `
      <section class="login-card">
        <h1>Welcome to Fortnite Ai Agent</h1>
        <p>Choose how you want to use the agent.</p>
        <button id="loginWithApi" class="login-primary" type="button">Log in</button>
        <button id="continueGuest" class="login-secondary" type="button">Guest</button>
        <p>Guest uses the public API limit. It can run out quickly and the AI may not reply.</p>
      </section>
    `;

    gate.querySelector("#loginWithApi").addEventListener("click", showApiLogin);
    gate.querySelector("#continueGuest").addEventListener("click", () => {
      sessionStorage.setItem(LOGIN_MODE_SESSION, "guest");
      sessionStorage.removeItem(USER_API_KEY_SESSION);
      gate.hidden = true;
      window.dispatchEvent(new CustomEvent("fortnite-login-mode-changed"));
    });
  }

  function showApiLogin() {
    const gate = document.getElementById("loginGate");
    gate.hidden = false;
    gate.innerHTML = `
      <section class="login-card">
        <button class="login-back" type="button" aria-label="Back">â</button>
        <h1>Type ur API</h1>
        <div class="api-input-wrap">
          <input id="apiKeyInput" type="password" placeholder="gsk_..." autocomplete="off" />
          <button id="toggleApi" class="api-toggle" type="button">Show</button>
        </div>
        <button id="continueApi" class="login-primary" type="button">Continue</button>
        <p>u donât have a api? create one for free from:
          <a href="${GROQ_KEYS_URL}" target="_blank" rel="noopener noreferrer">Groq API</a>
        </p>
        <p>Your key stays in this browser session only.</p>
      </section>
    `;

    gate.querySelector(".login-back").addEventListener("click", showWelcomeLogin);
    const input = gate.querySelector("#apiKeyInput");
    const toggle = gate.querySelector("#toggleApi");

    toggle.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      toggle.textContent = hidden ? "Hide" : "Show";
    });

    gate.querySelector("#continueApi").addEventListener("click", () => {
      const key = input.value.trim();
      if (!key.startsWith("gsk_")) {
        showToast("That doesn't look like a Groq API key.", true);
        return;
      }
      sessionStorage.setItem(USER_API_KEY_SESSION, key);
      sessionStorage.setItem(LOGIN_MODE_SESSION, "api");
      gate.hidden = true;
      window.dispatchEvent(new CustomEvent("fortnite-login-mode-changed"));
    });

    setTimeout(() => input.focus(), 50);
  }

  function openSidebar() {
    els.sidebar.classList.add("open");
    els.sidebar.setAttribute("aria-hidden", "false");
    els.scrim.classList.add("show");
  }

  function closeSidebar() {
    els.sidebar.classList.remove("open");
    els.sidebar.setAttribute("aria-hidden", "true");
    els.scrim.classList.remove("show");
  }

  function resizeTextarea() {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(els.input.scrollHeight, 180)}px`;
    els.input.style.overflowY = els.input.scrollHeight > 180 ? "auto" : "hidden";
  }

  function updateSendState() {
    els.send.disabled = busy || !els.input.value.trim();
  }

  function setBusy(value) {
    busy = value;
    updateSendState();
  }

  function addTypingIndicator() {
    removeTypingIndicator();
    const node = document.createElement("article");
    node.className = "message assistant";
    node.id = "typingIndicator";
    node.innerHTML = `<div class="assistant-wrap"><div class="assistant-name">Fortnite Ai Agent</div><div class="assistant-content">Thinkingâ¦</div></div>`;
    els.messages.appendChild(node);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    document.getElementById("typingIndicator")?.remove();
  }

  function scrollToBottom() {
    els.chat.scrollTop = els.chat.scrollHeight;
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("error", isError);
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  async function fetchWithTimeout(url, options, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  window.FortniteAgent = {
    showApiLogin,
    loginMode() {
      return sessionStorage.getItem(LOGIN_MODE_SESSION) || "unknown";
    },
    searchDatabase
  };
})();
