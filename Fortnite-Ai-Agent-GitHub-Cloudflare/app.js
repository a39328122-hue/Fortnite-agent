(() => {
  "use strict";

  const API_ENDPOINT = window.FORTNITE_AI_API_ENDPOINT || "";
  const USER_API_KEY_SESSION = "fortniteAiAgent.groqKey.session";
  const LOGIN_MODE_SESSION = "fortniteAiAgent.loginMode.session";
  const GROQ_KEYS_URL = "https://console.groq.com/keys";
  const TH3DRY_ASSET_URL = "https://th3dryz69.github.io/FortniteToolsWeb/public/data/fortnite_assets.gz";
  const GENERATED_FILE_NAME = "Subscribe to my YT channel @27lf.txt";
  const PLUGINS = [
    { id: "fortnite-files", label: "Search in Fortnite Files", command: "@Search in Fortnite Files" }
  ];
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

  const pluginMenu = document.createElement("div");
  pluginMenu.id = "pluginMenu";
  pluginMenu.className = "plugin-menu";
  pluginMenu.hidden = true;
  document.body.appendChild(pluginMenu);

  let chats = loadChats();
  let activeId = localStorage.getItem(ACTIVE_KEY) || null;
  let busy = false;
  let toastTimer = null;
  let th3dryAssetsPromise = null;

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
    updatePluginMenu();
  });

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
    if (
      !pluginMenu.hidden &&
      !pluginMenu.contains(event.target) &&
      event.target !== els.input
    ) {
      pluginMenu.hidden = true;
    }
  });

  window.addEventListener("resize", positionPluginMenu);

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

    if (message.attachment && message.attachment.content) {
      appendGeneratedFile(wrap, message.attachment);
    }

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

    const pluginRequest = parsePluginRequest(text);
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

    if (pluginRequest?.id === "fortnite-files") {
      await runFortniteFilesPlugin(chat, pluginRequest.query);
      return;
    }

    try {
      const th3drySearch = await searchTh3dryForMessage(text);

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chat.messages,
          apiKey: sessionStorage.getItem(USER_API_KEY_SESSION) || null,
          th3drySearch: th3drySearch
            ? {
                searched: true,
                queryTokens: th3drySearch.queryTokens,
                total: th3drySearch.total,
                exact: th3drySearch.exact.slice(0, 60),
                related: th3drySearch.related.slice(0, 60),
                largeResultFile: th3drySearch.makeFile,
                unavailable: th3drySearch.unavailable === true
              }
            : null
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      const assistantMessage = {
        role: "assistant",
        content: String(data.reply || "").trim()
      };

      if (th3drySearch?.makeFile && th3drySearch?.allMatches?.length) {
        assistantMessage.attachment = {
          name: GENERATED_FILE_NAME,
          mime: "text/plain;charset=utf-8",
          content: th3drySearch.allMatches.join("\n")
        };
      }

      chat.messages.push(assistantMessage);

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





  function updatePluginMenu() {
    const value = els.input.value;
    const caret = els.input.selectionStart ?? value.length;
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/(^|\s)@([^\s]*)$/);

    if (!match) {
      pluginMenu.hidden = true;
      return;
    }

    const query = String(match[2] || "").toLowerCase();

    const visiblePlugins = PLUGINS.filter((plugin) =>
      !query ||
      plugin.label.toLowerCase().includes(query) ||
      plugin.command.toLowerCase().includes(`@${query}`)
    );

    if (!visiblePlugins.length) {
      pluginMenu.hidden = true;
      return;
    }

    pluginMenu.textContent = "";

    const header = document.createElement("div");
    header.className = "plugin-panel-header";

    const title = document.createElement("strong");
    title.textContent = "Plugins";

    const settings = document.createElement("button");
    settings.type = "button";
    settings.className = "plugin-settings";
    settings.setAttribute("aria-label", "Plugin settings");
    settings.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6m-4 4v6m8-16v6m-4 4v6"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="11" cy="7" r="2" fill="currentColor"/>
        <circle cx="7" cy="17" r="2" fill="currentColor"/>
        <circle cx="15" cy="7" r="2" fill="currentColor"/>
      </svg>
    `;

    header.append(title, settings);
    pluginMenu.appendChild(header);

    visiblePlugins.forEach((plugin, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `plugin-option${index === 0 ? " selected" : ""}`;
      button.dataset.command = plugin.command;

      const icon = document.createElement("span");
      icon.className = "plugin-icon";
      icon.textContent = "ð";

      const title = document.createElement("span");
      title.className = "plugin-title";
      title.textContent = plugin.label;

      button.append(icon, title);

      button.addEventListener("mousedown", (event) => {
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

    const composerRect = els.composer.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(
      520,
      window.innerWidth - margin * 2
    );

    pluginMenu.style.width = `${width}px`;

    const left = Math.max(
      margin,
      Math.min(
        composerRect.left,
        window.innerWidth - width - margin
      )
    );

    const desiredTop =
      composerRect.top - pluginMenu.offsetHeight - 10;

    pluginMenu.style.left = `${left}px`;
    pluginMenu.style.top = `${Math.max(10, desiredTop)}px`;
  }

  function movePluginSelection(direction) {
    const options = [...pluginMenu.querySelectorAll(".plugin-option")];
    if (!options.length) return;

    let index = options.findIndex((item) => item.classList.contains("selected"));
    if (index < 0) index = 0;

    options[index].classList.remove("selected");
    index = (index + direction + options.length) % options.length;
    options[index].classList.add("selected");
  }

  function selectPlugin(command) {
    const value = els.input.value;
    const caret = els.input.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const match = before.match(/(^|\s)@[^\s]*$/);

    if (!match) return;

    const start = match.index + match[1].length;
    const next = `${value.slice(0, start)}${command} ${after}`.replace(/\s+$/, " ");

    els.input.value = next;
    pluginMenu.hidden = true;
    resizeTextarea();
    updateSendState();

    const pos = start + command.length + 1;
    els.input.focus();
    els.input.setSelectionRange(pos, pos);
  }

  function parsePluginRequest(text) {
    const prefix = "@Search in Fortnite Files";
    if (!String(text).toLowerCase().startsWith(prefix.toLowerCase())) return null;

    return {
      id: "fortnite-files",
      query: String(text).slice(prefix.length).trim()
    };
  }

  async function runFortniteFilesPlugin(chat, query) {
    try {
      if (!query) {
        throw new Error("Type what u want to search for after @Search in Fortnite Files.");
      }

      const result = await searchTh3dryForMessage(`asset ${query}`);
      removeTypingIndicator();

      let content = "";
      let attachment = null;

      if (!result || result.unavailable) {
        content = "I couldn't reach the Fortnite files database right now. Try again in a moment.";
      } else if (!result.total) {
        content = `I searched Fortnite files for \`${query}\` but couldn't find anything close.`;
      } else {
        const exact = result.exact || [];
        const related = result.related || [];

        if (exact.length) {
          const shown = exact.slice(0, 20);
          content = `Found **${result.total}** result${result.total === 1 ? "" : "s"} in Fortnite files.\\n\\n`;
          content += shown.map((path) => `\`\`\`text\\n${path}\\n\`\`\``).join("\\n\\n");

          if (related.length) {
            content += "\\n\\n**Related results:**\\n\\n";
            content += related.slice(0, 10).map((path) => `\`\`\`text\\n${path}\\n\`\`\``).join("\\n\\n");
          }
        } else {
          content = `I searched Fortnite files for \`${query}\` and couldn't find an exact match, but i found some related results:\\n\\n`;
          content += related.slice(0, 20).map((path) => `\`\`\`text\\n${path}\\n\`\`\``).join("\\n\\n");
        }

        if (result.makeFile && result.allMatches?.length) {
          content += `\\n\\nThere are too many results to send here, so i put the full list in a TXT file.`;
          attachment = {
            name: GENERATED_FILE_NAME,
            mime: "text/plain;charset=utf-8",
            content: result.allMatches.join("\\n")
          };
        }
      }

      const message = { role: "assistant", content };
      if (attachment) message.attachment = attachment;

      chat.messages.push(message);
      chat.updatedAt = Date.now();
      saveChats();
      renderAll();
    } catch (error) {
      removeTypingIndicator();
      chat.messages.push({
        role: "assistant",
        content: String(error?.message || "Plugin search failed.")
      });
      chat.updatedAt = Date.now();
      saveChats();
      renderAll();
    } finally {
      setBusy(false);
      updateSendState();
      els.input.focus();
    }
  }

  function shouldSearchTh3dry(text) {
    return /(?:asset|path|mesh|material|texture|sound|cue|wave|uasset|uexp|ubulk|pak|ucas|utoc|fmodel|unreleased|removed|files?|folder|plugin|gamefeatures|athena|creative|stw|fortnite|ÙØ³Ø§Ø±|Ø¨Ø§Ø«|ÙÙØ´|ÙØ§ØªÙØ±ÙØ§Ù|ØªÙØ³ØªØ´Ø±|ØµÙØª|ÙÙÙØ§Øª|ÙØ§ÙÙ|Ø§ØµÙ|Ø£ØµÙ|Ø§ØµÙÙ|Ø£ØµÙÙ)/i.test(String(text || ""));
  }

  function extractAssetSearchTokens(text) {
    const stopWords = new Set([
      "the","a","an","is","are","was","were","do","does","did","can","could","would",
      "you","u","me","my","i","we","they","it","this","that","these","those","for","from",
      "of","to","in","on","at","with","and","or","but","about","find","search","look","give",
      "get","show","path","paths","asset","assets","file","files","folder","fortnite","fmodel",
      "please","pls","plz","what","where","which","any","all","new","old",
      "Ø´ÙÙ","Ø´ÙÙÙ","Ø´ÙÙÙ","ÙÙÙ","Ø§ÙÙ","Ø£ÙÙ","Ø§Ø±ÙØ¯","Ø£Ø±ÙØ¯","Ø¯ÙØ±","Ø¯ÙØ±ÙÙ","Ø§Ø¨Ø­Ø«","Ø§Ø¨Ø­Ø«ÙÙ",
      "Ø¹ÙÙ","Ø¹Ù","ÙÙ","ÙÙ","Ø§ÙÙ","Ø¥ÙÙ","ÙØ§Ù","ÙØ§ÙØª","ÙØ§Ø°Ø§","ÙØ°Ø§","ÙØ§Ù","ÙÙ","ÙÙ","Ø§ÙÙ","Ø§ÙÙÙ",
      "Ø¨Ø§Ø«","ÙØ³Ø§Ø±","ÙÙÙ","ÙÙÙØ§Øª","ÙÙØ±ØªÙØ§ÙØª"
    ]);

    return [...new Set(
      String(text || "")
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[\\`*_~()[\]{}<>|:;,.!?'"=+]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !stopWords.has(token))
    )].slice(0, 6);
  }

  async function loadTh3dryAssets() {
    if (th3dryAssetsPromise) return th3dryAssetsPromise;

    th3dryAssetsPromise = (async () => {
      if (typeof DecompressionStream !== "function") {
        throw new Error("Gzip decompression is not supported in this browser.");
      }

      const response = await fetch(TH3DRY_ASSET_URL, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Th3Dry database returned ${response.status}.`);
      }

      const buffer = await response.arrayBuffer();
      const stream = new Blob([buffer])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));

      const text = await new Response(stream).text();

      return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    })().catch((error) => {
      th3dryAssetsPromise = null;
      console.warn("Th3Dry database search unavailable:", error);
      throw error;
    });

    return th3dryAssetsPromise;
  }

  function scoreRelatedPath(path, tokens) {
    const lower = path.toLowerCase();
    const fileName = lower.slice(lower.lastIndexOf("/") + 1);
    let score = 0;

    for (const token of tokens) {
      if (lower.includes(token)) score += Math.max(2, token.length);
      if (fileName.includes(token)) score += token.length * 2;
    }

    return score;
  }

  async function searchTh3dryForMessage(text) {
    if (!shouldSearchTh3dry(text)) return null;

    const queryTokens = extractAssetSearchTokens(text);
    if (!queryTokens.length) return null;

    try {
      const assets = await loadTh3dryAssets();
      const exact = [];
      const relatedScored = [];

      for (const path of assets) {
        const lower = path.toLowerCase();
        let matchedCount = 0;

        for (const token of queryTokens) {
          if (lower.includes(token)) matchedCount++;
        }

        if (matchedCount === queryTokens.length) {
          exact.push(path);
        } else if (matchedCount > 0) {
          relatedScored.push({
            path,
            matchedCount,
            score: scoreRelatedPath(path, queryTokens)
          });
        }
      }

      relatedScored.sort((a, b) =>
        b.matchedCount - a.matchedCount ||
        b.score - a.score ||
        a.path.length - b.path.length
      );

      const related = relatedScored
        .slice(0, 300)
        .map((item) => item.path)
        .filter((path) => !exact.includes(path));

      const allMatches = exact.length ? [...exact, ...related] : related;

      return {
        queryTokens,
        total: allMatches.length,
        exact,
        related,
        allMatches,
        makeFile: allMatches.length >= 120,
        unavailable: false
      };
    } catch {
      return {
        queryTokens,
        total: 0,
        exact: [],
        related: [],
        allMatches: [],
        makeFile: false,
        unavailable: true
      };
    }
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

    meta.append(name, type);

    const download = document.createElement("button");
    download.type = "button";
    download.className = "generated-file-download";
    download.textContent = "Download";

    download.addEventListener("click", () => {
      const blob = new Blob([attachment.content], {
        type: attachment.mime || "text/plain;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = GENERATED_FILE_NAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    });

    card.append(icon, meta, download);
    parent.appendChild(card);
  }

  function maybeShowLoginGate() {
    const mode = sessionStorage.getItem(LOGIN_MODE_SESSION);

    if (mode === "guest") {
      showGuestLoginBanner();
      return;
    }

    if (mode === "api") return;
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
      showGuestLoginBanner();
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
    back.textContent = "â";
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
    help.append("u donât have a api? create one for free from: ");

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
      removeGuestLoginBanner();
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


  function showGuestLoginBanner() {
    if (document.getElementById("guestLoginBanner")) return;

    const banner = document.createElement("button");
    banner.type = "button";
    banner.id = "guestLoginBanner";
    banner.className = "guest-login-banner";
    banner.textContent = "Log in for free";

    banner.addEventListener("click", () => {
      openApiLogin();
    });

    document.body.appendChild(banner);
  }

  function removeGuestLoginBanner() {
    document.getElementById("guestLoginBanner")?.remove();
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


      .guest-login-banner {
        position: fixed;
        top: max(10px, env(safe-area-inset-top));
        left: 50%;
        z-index: 9500;
        transform: translateX(-50%);
        min-height: 38px;
        padding: 0 16px;
        border: 1px solid #3a3a3a;
        border-radius: 999px;
        background: rgba(20, 20, 20, .96);
        color: #f3f3f3;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -.01em;
        box-shadow: 0 8px 28px rgba(0, 0, 0, .28);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        cursor: pointer;
      }

      .guest-login-banner:active {
        transform: translateX(-50%) scale(.98);
      }




      .plugin-menu {
        position: fixed;
        z-index: 9800;
        max-height: min(430px, 55vh);
        overflow-y: auto;
        padding: 10px;
        border: 1px solid #3a3a3a;
        border-radius: 24px;
        background: rgba(12, 12, 12, .985);
        box-shadow: 0 20px 65px rgba(0, 0, 0, .48);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .plugin-menu[hidden] {
        display: none !important;
      }

      .plugin-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 52px;
        padding: 0 10px 2px 12px;
      }

      .plugin-panel-header strong {
        color: #f3f3f3;
        font-size: 17px;
        font-weight: 750;
        letter-spacing: -.02em;
      }

      .plugin-settings {
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: #bcbcbc;
        cursor: default;
      }

      .plugin-settings svg {
        width: 22px;
        height: 22px;
      }

      .plugin-option {
        width: 100%;
        min-height: 66px;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 0 16px;
        border: 0;
        border-radius: 18px;
        background: transparent;
        color: #f3f3f3;
        text-align: left;
        cursor: pointer;
      }

      .plugin-option + .plugin-option {
        margin-top: 2px;
      }

      .plugin-option:hover,
      .plugin-option.selected {
        background: #252525;
      }

      .plugin-icon {
        width: 38px;
        height: 38px;
        flex: 0 0 38px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 10px;
        background: transparent;
        font-size: 24px;
        line-height: 1;
      }

      .plugin-title {
        min-width: 0;
        color: #f3f3f3;
        font-size: 18px;
        font-weight: 700;
        line-height: 1.2;
      }

      @media (max-width: 520px) {
        .plugin-menu {
          width: calc(100vw - 24px) !important;
          max-height: min(420px, 48vh);
          border-radius: 24px;
          padding: 8px;
        }

        .plugin-option {
          min-height: 64px;
          padding: 0 14px;
          border-radius: 17px;
        }

        .plugin-title {
          font-size: 17px;
        }
      }

      .generated-file-card {
        width: min(520px, 100%);
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 14px;
        padding: 12px;
        border: 1px solid #2d2d2d;
        border-radius: 14px;
        background: #171717;
      }

      .generated-file-icon {
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: #242424;
        color: #ededed;
        font-size: 11px;
        font-weight: 800;
      }

      .generated-file-meta {
        min-width: 0;
        flex: 1;
      }

      .generated-file-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #f0f0f0;
        font-size: 13px;
        font-weight: 650;
      }

      .generated-file-type {
        margin-top: 2px;
        color: #777;
        font-size: 11px;
      }

      .generated-file-download {
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid #353535;
        border-radius: 10px;
        background: #222;
        color: #f2f2f2;
        cursor: pointer;
        font-size: 12px;
        font-weight: 650;
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
