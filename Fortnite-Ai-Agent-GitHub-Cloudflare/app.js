(() => {
  "use strict";

  const API_ENDPOINT = window.FORTNITE_AI_API_ENDPOINT || "";
  const DISCORD_USERNAME = "@its.swag";

  // Discord requires a numeric user ID for a guaranteed direct profile URL.
  // Replace null with: "https://discord.com/users/YOUR_NUMERIC_USER_ID"
  const DISCORD_PROFILE_URL = null;

  const STORAGE_KEY = "fortniteAiAgent.chats.v1";
  const ACTIVE_KEY = "fortniteAiAgent.active.v1";

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
    content.className = "assistant-content";
    renderRichText(content, message.content);

    wrap.append(name, content);
    outer.appendChild(wrap);
    return outer;
  }

  function renderRichText(container, text) {
    const fenceRegex = /```([^\n`]*)\n?([\s\S]*?)```/g;
    let last = 0;
    let match;

    while ((match = fenceRegex.exec(text)) !== null) {
      if (match.index > last) appendTextBlocks(container, text.slice(last, match.index));
      appendCodeBlock(container, match[2].replace(/\n$/, ""), match[1].trim() || "code");
      last = fenceRegex.lastIndex;
    }

    if (last < text.length) appendTextBlocks(container, text.slice(last));
  }

  function appendTextBlocks(container, text) {
    const parts = text.split(/\n{2,}/).filter(Boolean);
    for (const part of parts) {
      const p = document.createElement("p");
      appendInline(p, part);
      container.appendChild(p);
    }
  }

  function appendInline(parent, text) {
    const regex = /`([^`]+)`/g;
    let last = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      parent.append(document.createTextNode(text.slice(last, match.index)));
      const code = document.createElement("code");
      code.className = "inline-code";
      code.textContent = match[1];
      parent.append(code);
      last = regex.lastIndex;
    }
    parent.append(document.createTextNode(text.slice(last)));
  }

  function appendCodeBlock(container, code, language) {
    const box = document.createElement("div");
    box.className = "code-block";

    const head = document.createElement("div");
    head.className = "code-head";
    const lang = document.createElement("span");
    lang.textContent = language;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = "Copied";
        setTimeout(() => { copy.textContent = "Copy"; }, 1200);
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

  async function sendMessage() {
    if (busy) return;
    if (!API_ENDPOINT || API_ENDPOINT.includes("PASTE-YOUR-WORKER")) {
      showToast("Cloudflare Worker URL is not configured yet. Edit config.js.", true);
      return;
    }
    const text = els.input.value.trim();
    if (!text) return;

    const chat = currentChat();
    if (!chat.messages.length) chat.title = titleFromMessage(text);
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
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);

      chat.messages.push({ role: "assistant", content: String(data.reply || "").trim() });
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
      showToast(`${DISCORD_USERNAME} copied — add the numeric Discord user ID in app.js for a direct profile link.`);
    } catch {
      showToast(`Discord: ${DISCORD_USERNAME}`);
    }
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("error", isError);
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800);
  }
})();
