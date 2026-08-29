(() => {
  "use strict";

  const overlay = document.getElementById("toolsOverlay");
  const back = document.getElementById("toolsBackBtn");
  const tabs = document.getElementById("toolsTabs");
  const content = document.getElementById("toolsContent");
  const guestBanner = document.getElementById("guestLoginBanner");
  const guestLoginBtn = document.getElementById("guestLoginBtn");

  const DB = window.FORTNITE_AI_DB || {};
  const TH3DRY = {
    convert: "https://th3dryz69.github.io/FortniteToolsWeb/public/html/convert.html",
    cosmetic: "https://th3dryz69.github.io/FortniteToolsWeb/public/html/cosmetic.html"
  };

  let active = "assets";
  let idData = null;
  let deviceData = null;

  back.addEventListener("click", close);
  guestLoginBtn.addEventListener("click", () => {
    window.FortniteAgent?.showApiLogin();
  });

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest(".tools-tab");
    if (!button) return;
    active = button.dataset.tool;
    for (const tab of tabs.querySelectorAll(".tools-tab")) {
      tab.classList.toggle("active", tab === button);
    }
    render();
  });

  window.addEventListener("fortnite-login-mode-changed", updateGuestBanner);

  function open() {
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    updateGuestBanner();
    render();
  }

  function close() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function updateGuestBanner() {
    guestBanner.hidden = sessionStorage.getItem("fortniteAiAgent.loginMode.session") !== "guest";
  }

  async function render() {
    content.innerHTML = `<div class="tool-section"><div class="tool-empty">Loadingâ¦</div></div>`;

    try {
      if (active === "assets") return renderAssets();
      if (active === "ids") return renderIds();
      if (active === "devices") return renderDevices();
      if (active === "convert") return renderLaunchers("Convert", [
        ["Emote â Animation", TH3DRY.convert],
        ["Emote â Sequence Animation", TH3DRY.convert],
        ["Emote â Audio", TH3DRY.convert],
        ["Aura â VFX", TH3DRY.convert],
        ["MusicPack â Audio", TH3DRY.convert]
      ]);
      if (active === "path") return renderPathModifier();
      if (active === "cosmetic") return renderLaunchers("Cosmetic", [
        ["Open Th3Dry Cosmetic", TH3DRY.cosmetic]
      ]);
    } catch (error) {
      content.innerHTML = `<div class="tool-section"><div class="tool-empty">${escapeHtml(error.message || String(error))}</div></div>`;
    }
  }

  function renderAssets() {
    content.innerHTML = `
      <div class="tool-section">
        <h2>Fortnite Files</h2>
        <div class="tool-searchbar">
          <input id="assetQuery" placeholder="Search the full Fortnite database" />
          <button id="assetSearch" class="tool-button primary" type="button">Search</button>
        </div>
        <div class="tool-subtabs">
          <button class="tool-subtab active" data-scope="all">All</button>
          <button class="tool-subtab" data-scope="sm">SM_</button>
          <button class="tool-subtab" data-scope="m">M_</button>
          <button class="tool-subtab" data-scope="meshes">Meshes</button>
          <button class="tool-subtab" data-scope="new">New</button>
        </div>
        <div id="assetResults" class="tool-empty">Type something to search.</div>
      </div>
    `;

    let scope = "all";
    const input = content.querySelector("#assetQuery");
    const results = content.querySelector("#assetResults");

    content.querySelector(".tool-subtabs").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-scope]");
      if (!btn) return;
      scope = btn.dataset.scope;
      for (const item of content.querySelectorAll(".tool-subtab")) item.classList.toggle("active", item === btn);
    });

    async function run() {
      const query = input.value.trim();
      if (!query) return;
      results.className = "tool-empty";
      results.textContent = "Searchingâ¦";

      try {
        const data = await window.FortniteAgent.searchDatabase(scope, query);
        if (!data.results?.length) {
          results.className = "tool-empty";
          results.textContent = "No close results found.";
          return;
        }

        results.className = "";
        results.innerHTML = data.results.slice(0, 60).map((item) => pathCard(item.path, item.source)).join("");
        bindCopyButtons(results);
      } catch (error) {
        results.className = "tool-empty";
        results.textContent = error.message || "Search failed.";
      }
    }

    content.querySelector("#assetSearch").addEventListener("click", run);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") run();
    });
  }

  async function renderIds() {
    if (!idData) idData = await fetchJson(DB.ids || "./database/id.json");

    const cards = [];
    walkIdData(idData, cards);

    content.innerHTML = `
      <div class="tool-section">
        <h2>Islands & IDs</h2>
        <div class="tool-searchbar">
          <input id="idSearch" placeholder="Search islands / IDs" />
        </div>
        <div id="idResults">${cards.slice(0, 100).map(idCard).join("")}</div>
      </div>
    `;

    const input = content.querySelector("#idSearch");
    const results = content.querySelector("#idResults");

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const filtered = !q ? cards : cards.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
      results.innerHTML = filtered.slice(0, 150).map(idCard).join("") || `<div class="tool-empty">No results.</div>`;
      bindCopyButtons(results);
    });

    bindCopyButtons(results);
  }

  async function renderDevices() {
    if (!deviceData) deviceData = await fetchJson(DB.devices || "./database/devicemeshs.json");
    const list = Array.isArray(deviceData) ? deviceData : Object.values(deviceData || {}).flatMap((x) => Array.isArray(x) ? x : [x]);

    content.innerHTML = `
      <div class="tool-section">
        <h2>DeviceMeshes</h2>
        <div class="tool-searchbar"><input id="deviceSearch" placeholder="Search device..." /></div>
        <div id="deviceResults">${list.slice(0, 80).map(deviceCard).join("")}</div>
      </div>
    `;

    const input = content.querySelector("#deviceSearch");
    const results = content.querySelector("#deviceResults");

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const filtered = !q ? list : list.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
      results.innerHTML = filtered.slice(0, 120).map(deviceCard).join("") || `<div class="tool-empty">No results.</div>`;
      bindCopyButtons(results);
    });

    bindCopyButtons(results);
  }

  function renderLaunchers(title, items) {
    content.innerHTML = `
      <div class="tool-section">
        <h2>${escapeHtml(title)}</h2>
        <p class="tool-note">These open the current Th3Dry implementation so your copy doesn't break if their converter logic changes.</p>
        <div class="launch-grid">
          ${items.map(([name, url]) => `
            <a class="launch-card" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(name)}</strong>
              <span>Open tool â</span>
            </a>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderPathModifier() {
    content.innerHTML = `
      <div class="tool-section">
        <h2>Path Modifier</h2>
        <textarea id="pathInput" class="tool-textarea" placeholder="FortniteGame/Content/.../Asset.uasset"></textarea>
        <label class="tool-note"><input id="addClass" type="checkbox" /> Add _C</label>
        <div style="height:10px"></div>
        <button id="convertPathBtn" class="tool-button primary" type="button">Convert</button>
        <div style="height:10px"></div>
        <textarea id="pathOutput" class="tool-textarea" readonly></textarea>
        <button id="copyPathOutput" class="tool-button" type="button">Copy</button>
      </div>
    `;

    const input = content.querySelector("#pathInput");
    const output = content.querySelector("#pathOutput");

    content.querySelector("#convertPathBtn").addEventListener("click", () => {
      output.value = modifyPath(input.value, content.querySelector("#addClass").checked);
    });

    content.querySelector("#copyPathOutput").addEventListener("click", () => copy(output.value));
  }

  function modifyPath(raw, addClass) {
    let path = String(raw || "").trim().replace(/^\.?\//, "");
    if (!path) return "";

    if (path.startsWith("FortniteGame/Content/")) {
      path = "/Game/" + path.slice("FortniteGame/Content/".length);
    } else {
      const match = path.match(/(?:FortniteGame\/)?Plugins\/(?:GameFeatures\/)?([^/]+)\/Content\/(.+)/i);
      if (match) path = `/${match[1]}/${match[2]}`;
      else if (!path.startsWith("/")) path = "/" + path;
    }

    path = path.replace(/\.uasset$/i, "");
    const last = path.slice(path.lastIndexOf("/") + 1);
    if (last && !path.includes(`.${last}`)) path += `.${last}`;
    if (addClass && !path.endsWith("_C")) path += "_C";
    return path;
  }

  function pathCard(path, source) {
    return `
      <div class="tool-card">
        <div class="tool-card-head">
          <div class="tool-card-title">${escapeHtml(source === "json" ? "JSON reference" : "Asset path")}</div>
        </div>
        ${pathRow(source === "json" ? "JSON" : "PATH", path)}
      </div>
    `;
  }

  function idCard(item) {
    return `
      <div class="tool-card">
        <div class="tool-card-head">
          ${item.image ? `<img class="tool-card-image" src="${escapeAttr(item.image)}" alt="" loading="lazy" />` : `<div class="tool-card-image"></div>`}
          <div class="tool-card-title">${escapeHtml(item.name || item.title || "Unknown")}</div>
        </div>
        ${item.playset ? pathRow("PLAYSET", item.playset) : ""}
        ${item.plot ? pathRow("PLOT", item.plot) : ""}
        ${item.path ? pathRow("PATH", item.path) : ""}
      </div>
    `;
  }

  function deviceCard(item) {
    const title = item.name || item.title || item.device || item.id || "Device";
    const badges = [
      item.important ? "important" : "",
      item.dispo === false ? "unavailable" : ""
    ].filter(Boolean);

    return `
      <div class="tool-card">
        <div class="tool-card-head">
          ${item.image ? `<img class="tool-card-image" src="${escapeAttr(item.image)}" alt="" loading="lazy" />` : `<div class="tool-card-image"></div>`}
          <div style="min-width:0;flex:1">
            <div class="tool-card-title">${escapeHtml(title)}</div>
            ${badges.length ? `<div class="device-badges">${badges.map((b) => `<span class="device-badge">${escapeHtml(b)}</span>`).join("")}</div>` : ""}
          </div>
        </div>
        ${item.path ? pathRow("PATH", item.path) : ""}
        ${item.playset ? pathRow("PLAYSET", item.playset) : ""}
      </div>
    `;
  }

  function pathRow(label, value) {
    return `
      <div class="path-row">
        <div class="path-label">${escapeHtml(label)}</div>
        <div class="path-value" title="${escapeAttr(value)}">${escapeHtml(value)}</div>
        <button class="path-copy" type="button" data-copy="${escapeAttr(value)}">ð</button>
      </div>
    `;
  }

  function bindCopyButtons(root) {
    for (const button of root.querySelectorAll("[data-copy]")) {
      button.addEventListener("click", () => copy(button.dataset.copy || ""));
    }
  }

  async function copy(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  function walkIdData(value, out, key = "") {
    if (!value || typeof value !== "object") return;

    if (!Array.isArray(value) && ("playset" in value || "plot" in value || "path" in value)) {
      out.push({ name: value.name || value.title || key, ...value });
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walkIdData(item, out, String(index)));
    } else {
      for (const [k, v] of Object.entries(value)) walkIdData(v, out, k);
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Couldn't load ${url} (${response.status})`);
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  window.FortniteTools = { open, close };
})();
