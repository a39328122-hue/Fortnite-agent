(() => {
  "use strict";

  const overlay = document.getElementById("toolsOverlay");
  const back = document.getElementById("toolsBackBtn");
  const tabs = document.getElementById("toolsTabs");
  const content = document.getElementById("toolsContent");
  const guestBanner = document.getElementById("guestLoginBanner");
  const guestLoginBtn = document.getElementById("guestLoginBtn");

  if (!overlay || !back || !tabs || !content) {
    console.warn("FNAA tools: required UI nodes are missing.");
    return;
  }

  const CONFIG = window.FNAA_CONFIG || {};
  const DB = CONFIG.database || window.FORTNITE_AI_DB || {};
  const API_ENDPOINT = String(
    CONFIG.apiEndpoint ||
    window.FORTNITE_AI_API_ENDPOINT ||
    ""
  ).trim().replace(/\/+$/, "");

  const EXPORT_BASE =
    "https://export-service-new.dillyapis.com/v1/export";

  const FORTNITE_API =
    "https://fortnite-api.com/v2/cosmetics/br";

  const COSMETIC_PAGE = 40;
  const SEARCH_DEBOUNCE_MS = 320;

  const t = (key, fallback = "") =>
    window.FortniteI18n?.t?.(key) ||
    fallback ||
    key;

  let active = "assets";
  let idData = null;
  let deviceData = null;
  let cosmeticResults = [];
  let cosmeticShown = 0;

  const exportJsonCache = new Map();

  back.addEventListener("click", close);

  guestLoginBtn?.addEventListener(
    "click",
    () => window.FortniteAgent?.showApiLogin?.()
  );

  window.addEventListener(
    "fortnite-login-mode-changed",
    updateGuestBanner
  );

  window.addEventListener(
    "fortnite-language-changed",
    () => {
      if (!overlay.hidden) render();
    }
  );

  tabs.addEventListener("click", (event) => {
    const button =
      event.target.closest(".tools-tab");

    if (!button) return;

    active = button.dataset.tool || "assets";

    for (const item of tabs.querySelectorAll(".tools-tab")) {
      item.classList.toggle(
        "active",
        item === button
      );
    }

    render();
  });

  function open(tool = "assets") {
    active = tool;

    for (const button of tabs.querySelectorAll(".tools-tab")) {
      button.classList.toggle(
        "active",
        button.dataset.tool === active
      );
    }

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");

    updateGuestBanner();
    render();
  }

  function close() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }

  function updateGuestBanner() {
    if (!guestBanner) return;

    guestBanner.hidden =
      sessionStorage.getItem(
        "fortniteAiAgent.loginMode.session"
      ) !== "guest";
  }

  async function render() {
    content.innerHTML =
      '<div class="tool-section"><div class="tool-empty">Loading...</div></div>';

    try {
      if (active === "assets") return renderAssets();
      if (active === "ids") return renderIds();
      if (active === "devices") return renderDevices();
      if (active === "convert") return renderConverters();
      if (active === "path") return renderPathModifier();
      if (active === "cosmetic") return renderCosmetics();

      return renderAssets();
    } catch (error) {
      content.innerHTML = `
        <div class="tool-section">
          <div class="tool-empty">
            ${escapeHtml(error?.message || String(error))}
          </div>
        </div>`;
    }
  }

  // ---------------------------------------------------------------------------
  // Manual asset search
  // ---------------------------------------------------------------------------

  function renderAssets() {
    content.innerHTML = `
      <div class="tool-section fnaa-manual-search">
        <div class="tool-section-head">
          <div>
            <h2>${escapeHtml(t("manualSearch", "Manual Search"))}</h2>
            <p class="tool-note">
              ${escapeHtml(
                t(
                  "manualNote",
                  "Search the Fortnite asset database without sending the query to the AI."
                )
              )}
            </p>
          </div>
        </div>

        <div class="tool-searchbar">
          <input
            id="assetQuery"
            autocomplete="off"
            spellcheck="false"
            placeholder="${escapeAttr(
              t(
                "searchPlaceholder",
                "Search a path, asset, SM_, M_, MI_..."
              )
            )}"
          />
          <button
            id="assetSearch"
            class="tool-button primary"
            type="button"
          >${escapeHtml(t("search", "Search"))}</button>
        </div>

        <div class="asset-search-options" role="group" aria-label="Path format">
          <label class="tool-check">
            <input id="assetFormatted" type="checkbox" />
            <span>Formatted</span>
          </label>

          <label class="tool-check">
            <input id="assetAddClass" type="checkbox" />
            <span>Add _C</span>
          </label>
        </div>

        <div class="tool-subtabs asset-scope-tabs" role="tablist">
          <button
            class="tool-subtab active"
            data-scope="all"
            type="button"
          >All</button>

          <button
            class="tool-subtab"
            data-scope="sm"
            type="button"
          >SM_</button>

          <button
            class="tool-subtab"
            data-scope="m"
            type="button"
          >MI_ / M_</button>

          <button
            class="tool-subtab"
            data-scope="new"
            type="button"
          >New</button>
        </div>

        <div
          id="assetResults"
          class="tool-empty"
          aria-live="polite"
        >Type something to search.</div>
      </div>`;

    const input =
      content.querySelector("#assetQuery");

    const results =
      content.querySelector("#assetResults");

    const formattedToggle =
      content.querySelector("#assetFormatted");

    const classToggle =
      content.querySelector("#assetAddClass");

    const scopeRoot =
      content.querySelector(".asset-scope-tabs");

    let scope = routeScope() || "all";
    let latestRun = 0;
    let debounceTimer = 0;

    for (const button of scopeRoot.querySelectorAll("[data-scope]")) {
      button.classList.toggle(
        "active",
        button.dataset.scope === scope
      );
    }

    const initialQuery =
      new URL(location.href)
        .searchParams
        .get("q") || "";

    if (initialQuery) {
      input.value = initialQuery;
    }

    const schedule = () => {
      clearTimeout(debounceTimer);

      debounceTimer =
        setTimeout(
          () => run(),
          SEARCH_DEBOUNCE_MS
        );
    };

    const run = async () => {
      const query =
        input.value.trim();

      const thisRun = ++latestRun;

      updateManualSearchRoute(
        query,
        scope
      );

      if (!query) {
        results.className = "tool-empty";
        results.textContent =
          "Type something to search.";
        return;
      }

      results.className = "tool-empty";

      const stopSearching =
        startSearchingAnimation(results);

      try {
        const effectiveScope =
          smartSearchScope(
            scope,
            query
          );

        const data =
          await window.FortniteAgent
            ?.searchDatabase?.(
              effectiveScope,
              query
            );

        if (thisRun !== latestRun) {
          stopSearching();
          return;
        }

        stopSearching();

        const rows =
          Array.isArray(data?.results)
            ? data.results
            : [];

        if (!rows.length) {
          results.textContent =
            "No close results found.";
          return;
        }

        results.className = "";

        const formatted =
          formattedToggle.checked;

        const addClass =
          classToggle.checked;

        results.innerHTML =
          rows
            .slice(0, 80)
            .map((item) =>
              pathCard(
                item,
                formatted,
                addClass
              )
            )
            .join("");

        bindAssetResultActions(results);

        const meta =
          document.createElement("div");

        meta.className =
          "tool-note asset-search-meta";

        meta.textContent =
          `${data.total ?? rows.length} result${(data.total ?? rows.length) === 1 ? "" : "s"} · ${data.source || "database"}`;

        results.prepend(meta);
      } catch (error) {
        if (thisRun !== latestRun) return;

        stopSearching();

        results.className = "tool-empty";
        results.textContent =
          error?.message ||
          "Search failed.";
      }
    };

    scopeRoot.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest("[data-scope]");

        if (!button) return;

        scope =
          button.dataset.scope || "all";

        for (const item of scopeRoot.querySelectorAll("[data-scope]")) {
          item.classList.toggle(
            "active",
            item === button
          );
        }

        schedule();
      }
    );

    formattedToggle.addEventListener(
      "change",
      schedule
    );

    classToggle.addEventListener(
      "change",
      schedule
    );

    input.addEventListener(
      "input",
      schedule
    );

    input.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter") return;

        event.preventDefault();

        clearTimeout(debounceTimer);
        run();
      }
    );

    content
      .querySelector("#assetSearch")
      .addEventListener(
        "click",
        () => {
          clearTimeout(debounceTimer);
          run();
        }
      );

    if (initialQuery) run();
  }

  function pathCard(
    item,
    formatted,
    addClass
  ) {
    const rawPath =
      String(item?.path || "").trim();

    const classCompatible =
      isClassCompatibleAsset(rawPath);

    const displayPath =
      formatted
        ? formatAssetPath(
            rawPath,
            addClass &&
            classCompatible
          )
        : (
            addClass &&
            classCompatible
              ? addClassSuffix(rawPath)
              : rawPath
          );

    const source =
      String(item?.source || "assets");

    const match =
      String(item?.match || "result");

    const classNote =
      addClass &&
      !classCompatible
        ? `<div class="tool-note asset-class-note">_C skipped: this asset does not look class-compatible.</div>`
        : "";

    return `
      <article
        class="tool-card asset-result-card"
        data-asset-path="${escapeAttr(rawPath)}"
      >
        <div class="tool-card-head">
          <div style="min-width:0;flex:1">
            <div class="tool-card-title">
              ${escapeHtml(assetTitle(rawPath))}
            </div>

            <div class="asset-result-tags">
              <span>${escapeHtml(match)}</span>
              <span>${escapeHtml(source)}</span>
            </div>
          </div>
        </div>

        ${pathRow("PATH", displayPath)}
        ${classNote}

        <div class="asset-result-actions">
          <button
            class="json-view-button"
            type="button"
            data-asset-action="describe"
          >Description</button>

          <button
            class="json-view-button"
            type="button"
            data-asset-action="preview"
          >Preview</button>

          <button
            class="json-view-button"
            type="button"
            data-asset-action="json"
          >View JSON</button>

          <button
            class="json-view-button"
            type="button"
            data-asset-action="references"
          >References</button>
        </div>

        <div
          class="asset-inline-panel"
          data-asset-panel
          hidden
        ></div>
      </article>`;
  }

  function bindAssetResultActions(root) {
    bindCopyButtons(root);

    root.addEventListener(
      "click",
      async (event) => {
        const button =
          event.target.closest(
            "[data-asset-action]"
          );

        if (!button) return;

        const card =
          button.closest(
            ".asset-result-card"
          );

        if (!card) return;

        const path =
          card.dataset.assetPath || "";

        const action =
          button.dataset.assetAction;

        if (action === "describe") {
          await describePath(
            path,
            button
          );
          return;
        }

        if (action === "preview") {
          await previewPath(
            card,
            path
          );
          return;
        }

        if (action === "json") {
          await showJson(
            card,
            path
          );
          return;
        }

        if (action === "references") {
          await showReferences(
            card,
            path
          );
        }
      }
    );
  }

  async function describePath(
    path,
    button
  ) {
    const remaining =
      Number(
        window.FortniteAgent
          ?.getGuestSlowmodeRemainingSeconds
          ?.() || 0
      );

    if (remaining > 0) {
      flashDescriptionCooldown(
        button,
        remaining
      );

      return;
    }

    if (
      window.FortniteAgent
        ?.describePath
    ) {
      const result =
        await window.FortniteAgent
          .describePath(path);

      // Safety for an edge case where the cooldown starts between the button
      // check and the send attempt. Keep the user in Tools and show the time
      // on the button rather than pretending a request was sent.
      if (
        result?.blocked &&
        result.retryAfterSeconds > 0
      ) {
        flashDescriptionCooldown(
          button,
          result.retryAfterSeconds
        );

        return;
      }

      close();
      return;
    }

    close();

    window.dispatchEvent(
      new CustomEvent(
        "fnaa-describe-path",
        {
          detail: { path }
        }
      )
    );
  }

  function flashDescriptionCooldown(
    button,
    seconds
  ) {
    if (!button) return;

    const safeSeconds =
      Math.max(
        1,
        Math.ceil(
          Number(seconds) || 0
        )
      );

    clearTimeout(
      Number(
        button.dataset
          .descriptionCooldownTimer || 0
      )
    );

    button.dataset
      .descriptionOriginalText =
      button.dataset
        .descriptionOriginalText ||
      button.textContent ||
      "Description";

    button.textContent =
      `${safeSeconds} sec left`;

    button.classList.add(
      "description-cooldown"
    );

    button.disabled = true;

    const timer =
      setTimeout(
        () => {
          button.disabled = false;

          button.classList.remove(
            "description-cooldown"
          );

          button.textContent =
            button.dataset
              .descriptionOriginalText ||
            "Description";

          delete button.dataset
            .descriptionCooldownTimer;
        },
        3000
      );

    button.dataset
      .descriptionCooldownTimer =
      String(timer);
  }

  async function previewPath(
    card,
    path
  ) {
    const panel =
      card.querySelector(
        "[data-asset-panel]"
      );

    panel.hidden = false;

    panel.innerHTML =
      '<div class="tool-empty">Loading preview...</div>';

    try {
      if (
        window.FortnitePreview
          ?.toggle
      ) {
        panel.innerHTML =
          '<div class="preview-host" data-preview-host></div>';

        const host =
          panel.querySelector(
            "[data-preview-host]"
          );

        await window.FortnitePreview
          .toggle(
            host,
            path
          );

        return;
      }

      panel.innerHTML =
        '<div class="tool-empty">Preview module is not loaded yet.</div>';
    } catch (error) {
      panel.innerHTML = `
        <div class="tool-empty">
          ${escapeHtml(
            error?.message ||
            "Preview failed."
          )}
        </div>`;
    }
  }

  async function showJson(
    card,
    path
  ) {
    const panel =
      card.querySelector(
        "[data-asset-panel]"
      );

    panel.hidden = false;
    panel.innerHTML =
      '<div class="tool-empty">Loading JSON...</div>';

    try {
      const data =
        await exportJson(path);

      const text =
        JSON.stringify(
          data,
          null,
          2
        );

      panel.innerHTML = `
        <div class="json-panel asset-json-panel">
          <div class="json-panel-head">
            <span>JSON</span>
            <button
              class="json-view-button"
              type="button"
              data-copy-json
            >Copy JSON</button>
          </div>

          <pre><code>${escapeHtml(text)}</code></pre>
        </div>`;

      panel
        .querySelector("[data-copy-json]")
        .addEventListener(
          "click",
          () => copy(text)
        );
    } catch (error) {
      panel.innerHTML = `
        <div class="tool-empty">
          ${escapeHtml(
            error?.message ||
            "JSON unavailable."
          )}
        </div>`;
    }
  }

  async function showReferences(
    card,
    path
  ) {
    const panel =
      card.querySelector(
        "[data-asset-panel]"
      );

    panel.hidden = false;
    panel.innerHTML =
      '<div class="tool-empty">Resolving references...</div>';

    try {
      let payload = null;

      if (
        window.NovaSparx
          ?.inspect
      ) {
        const inspection =
          await window.NovaSparx
            .inspect(path);

        if (
          Array.isArray(
            inspection?.references
          )
        ) {
          payload = {
            state: "ready",
            references:
              inspection.references
          };
        }
      }

      if (!payload) {
        payload =
          await apiJson(
            "/nova/references",
            path
          );
      }

      const refs =
        Array.isArray(payload?.references)
          ? payload.references
          : [];

      if (!refs.length) {
        panel.innerHTML =
          '<div class="tool-empty">No verified references were returned.</div>';

        return;
      }

      panel.innerHTML = `
        <div class="reference-list">
          ${refs
            .slice(0, 200)
            .map((ref) => {
              const value =
                typeof ref === "string"
                  ? ref
                  : ref?.path || "";

              const kind =
                typeof ref === "object"
                  ? ref?.kind || "reference"
                  : "reference";

              return `
                <div class="reference-row">
                  <span class="device-field-tag">
                    ${escapeHtml(kind)}
                  </span>

                  <code>${escapeHtml(value)}</code>

                  <button
                    class="path-copy"
                    type="button"
                    data-copy="${escapeAttr(value)}"
                  >COPY</button>
                </div>`;
            })
            .join("")}
        </div>`;

      bindCopyButtons(panel);
    } catch (error) {
      panel.innerHTML = `
        <div class="tool-empty">
          ${escapeHtml(
            error?.message ||
            "References unavailable."
          )}
        </div>`;
    }
  }

  function smartSearchScope(
    selectedScope,
    query
  ) {
    if (selectedScope !== "all") {
      return selectedScope;
    }

    const value =
      String(query || "")
        .trim()
        .toLowerCase();

    if (
      /(^|[\/._-])sm_/.test(value)
    ) {
      return "sm";
    }

    if (
      /(^|[\/._-])(m_|mi_)/.test(value)
    ) {
      return "m";
    }

    return "all";
  }

  function routeScope() {
    const value =
      new URL(location.href)
        .searchParams
        .get("scope");

    return [
      "all",
      "sm",
      "m",
      "new"
    ].includes(value)
      ? value
      : null;
  }

  function updateManualSearchRoute(
    query,
    scope
  ) {
    if (
      !window.FortniteAgent
        ?.navigate
    ) {
      return;
    }

    const route =
      CONFIG.routes?.paths ||
      "/ManualSearch/Paths";

    const params =
      new URLSearchParams();

    if (query) {
      params.set("q", query);
    }

    if (scope && scope !== "all") {
      params.set("scope", scope);
    }

    window.FortniteAgent.navigate(
      `${route}${params.size ? `?${params}` : ""}`,
      { replace: true }
    );
  }

  // ---------------------------------------------------------------------------
  // IDs
  // ---------------------------------------------------------------------------

  async function renderIds() {
    if (!idData) {
      idData =
        await fetchJson(
          DB.ids ||
          "./database/id.json"
        );
    }

    if (!deviceData) {
      deviceData =
        await fetchJson(
          DB.devices ||
          "./database/devicemeshs.json"
        );
    }

    const islands = [];

    walkIdData(
      idData,
      islands
    );

    const devices =
      sortDevices(
        cleanDeviceList(
          normalizeDeviceData(
            deviceData
          )
        )
      );

    let showUnavailable = false;

    content.innerHTML = `
      <div class="tool-section ids-combined-section">
        <section class="ids-group">
          <div class="ids-group-head">
            <div>
              <h2>Islands</h2>
              <p class="tool-note">
                Creative islands, playsets and plot IDs.
              </p>
            </div>
          </div>

          <div class="tool-searchbar">
            <input
              id="idSearch"
              placeholder="${escapeAttr(
                t(
                  "searchIslands",
                  "Search islands / IDs"
                )
              )}"
            />
          </div>

          <div id="idResults"></div>
        </section>

        <div class="ids-section-divider"></div>

        <section class="ids-group">
          <div class="ids-group-head">
            <div>
              <h2>${escapeHtml(
                t(
                  "deviceMeshes",
                  "Device Meshes"
                )
              )}</h2>
            </div>

            <button
              id="showAllDevices"
              class="tool-button"
              type="button"
            >Show All</button>
          </div>

          <div class="tool-searchbar">
            <input
              id="deviceSearchInIds"
              placeholder="${escapeAttr(
                t(
                  "searchDevice",
                  "Search device..."
                )
              )}"
            />
          </div>

          <div id="deviceResultsInIds"></div>
        </section>
      </div>`;

    const idInput =
      content.querySelector("#idSearch");

    const idResults =
      content.querySelector("#idResults");

    const deviceInput =
      content.querySelector(
        "#deviceSearchInIds"
      );

    const deviceResults =
      content.querySelector(
        "#deviceResultsInIds"
      );

    const showButton =
      content.querySelector(
        "#showAllDevices"
      );

    const drawIds = () => {
      const query =
        idInput.value
          .trim()
          .toLowerCase();

      const filtered =
        !query
          ? islands
          : islands.filter(
              (item) =>
                JSON.stringify(item)
                  .toLowerCase()
                  .includes(query)
            );

      idResults.innerHTML =
        filtered
          .slice(0, 180)
          .map(idCard)
          .join("") ||
        '<div class="tool-empty">No results.</div>';

      bindCopyButtons(idResults);
    };

    const drawDevices = () => {
      const query =
        deviceInput.value
          .trim()
          .toLowerCase();

      const filtered =
        devices.filter((item) => {
          if (
            !showUnavailable &&
            item.dispo === false
          ) {
            return false;
          }

          if (!query) return true;

          return deviceSearchText(item)
            .includes(query);
        });

      deviceResults.innerHTML =
        filtered
          .slice(0, 220)
          .map(deviceCardSimple)
          .join("") ||
        '<div class="tool-empty">No devices found.</div>';

      bindCopyButtons(deviceResults);
      bindImageFallbacks(deviceResults);
    };

    idInput.addEventListener(
      "input",
      drawIds
    );

    deviceInput.addEventListener(
      "input",
      drawDevices
    );

    showButton.addEventListener(
      "click",
      () => {
        showUnavailable =
          !showUnavailable;

        showButton.textContent =
          showUnavailable
            ? "Hide Unavailable"
            : "Show All";

        drawDevices();
      }
    );

    drawIds();
    drawDevices();
  }

  // ---------------------------------------------------------------------------
  // Devices
  // ---------------------------------------------------------------------------

  async function renderDevices() {
    if (!deviceData) {
      deviceData =
        await fetchJson(
          DB.devices ||
          "./database/devicemeshs.json"
        );
    }

    const devices =
      sortDevices(
        cleanDeviceList(
          normalizeDeviceData(
            deviceData
          )
        )
      );

    let showUnavailable = false;

    content.innerHTML = `
      <div class="tool-section">
        <div class="ids-group-head">
          <div>
            <h2>${escapeHtml(
              t(
                "deviceMeshes",
                "Device Meshes"
              )
            )}</h2>

            <p class="tool-note">
              Device paths, playsets and available option keys.
            </p>
          </div>

          <button
            id="showAllDevicesFull"
            class="tool-button"
            type="button"
          >Show All</button>
        </div>

        <div class="tool-searchbar">
          <input
            id="deviceSearch"
            placeholder="${escapeAttr(
              t(
                "searchDevice",
                "Search device..."
              )
            )}"
          />
        </div>

        <div id="deviceResults"></div>
      </div>`;

    const input =
      content.querySelector(
        "#deviceSearch"
      );

    const results =
      content.querySelector(
        "#deviceResults"
      );

    const showButton =
      content.querySelector(
        "#showAllDevicesFull"
      );

    const draw = () => {
      const query =
        input.value
          .trim()
          .toLowerCase();

      const filtered =
        devices.filter((item) => {
          if (
            !showUnavailable &&
            item.dispo === false
          ) {
            return false;
          }

          if (!query) return true;

          return deviceSearchText(item)
            .includes(query);
        });

      results.innerHTML =
        filtered
          .slice(0, 220)
          .map(deviceCard)
          .join("") ||
        '<div class="tool-empty">No devices found.</div>';

      bindCopyButtons(results);
      bindImageFallbacks(results);
    };

    input.addEventListener(
      "input",
      draw
    );

    showButton.addEventListener(
      "click",
      () => {
        showUnavailable =
          !showUnavailable;

        showButton.textContent =
          showUnavailable
            ? "Hide Unavailable"
            : "Show All";

        draw();
      }
    );

    draw();
  }

  function normalizeDeviceData(data) {
    if (Array.isArray(data)) {
      return data;
    }

    if (!data || typeof data !== "object") {
      return [];
    }

    for (const key of [
      "devices",
      "data",
      "items",
      "result"
    ]) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }

    return Object.entries(data)
      .map(([key, value]) => {
        if (
          value &&
          typeof value === "object"
        ) {
          return {
            name:
              value.name ||
              value.title ||
              key,
            ...value
          };
        }

        return null;
      })
      .filter(Boolean);
  }

  function cleanDeviceList(items) {
    return items.filter((item) => {
      const title =
        String(
          item?.name ||
          item?.title ||
          ""
        );

      return !isJunkDeviceText(
        title
      );
    });
  }

  function isJunkDeviceText(value) {
    const text =
      String(value || "")
        .toLowerCase();

    return (
      text.includes("discord.gg") ||
      text.includes("th3dry") ||
      text.includes("credits") ||
      text.includes("copyright")
    );
  }

  function cleanDeviceText(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    if (
      typeof value === "object"
    ) {
      return JSON.stringify(value);
    }

    const text =
      String(value).trim();

    return isJunkDeviceText(text)
      ? ""
      : text;
  }

  function sortDevices(items) {
    return [...items].sort(
      (a, b) => {
        const aAvailable =
          a.dispo !== false;

        const bAvailable =
          b.dispo !== false;

        if (
          aAvailable !== bAvailable
        ) {
          return aAvailable
            ? -1
            : 1;
        }

        return String(
          a.name ||
          a.title ||
          ""
        ).localeCompare(
          String(
            b.name ||
            b.title ||
            ""
          ),
          undefined,
          {
            numeric: true,
            sensitivity: "base"
          }
        );
      }
    );
  }

  function deviceSearchText(item) {
    const settings =
      Object.entries(
        item.settings || {}
      )
        .map(
          ([name, data]) =>
            [
              name,
              data?.["option key"],
              data?.value
            ]
              .filter(Boolean)
              .join(" ")
        )
        .join(" ");

    return [
      item.name,
      item.title,
      cleanDeviceText(item.path),
      cleanDeviceText(item.playset),
      cleanDeviceText(item.important),
      ...(Array.isArray(item.tag)
        ? item.tag
        : []),
      settings
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function deviceCardSimple(item) {
    const title =
      item.name ||
      item.title ||
      item.device ||
      item.id ||
      "Device";

    const image =
      deviceImageUrl(item);

    const path =
      cleanDeviceText(item.path);

    const playset =
      cleanDeviceText(item.playset);

    return `
      <article class="tool-card th3-device-card">
        <div class="tool-card-head th3-device-head">
          ${image
            ? `<img
                class="tool-card-image device-image"
                src="${escapeAttr(image)}"
                alt=""
                loading="lazy"
              />`
            : ""}

          <div style="min-width:0;flex:1">
            <div class="tool-card-title">
              ${escapeHtml(title)}
            </div>

            ${playset
              ? `<div class="tool-note">
                  ${escapeHtml(shortPath(playset))}
                </div>`
              : ""}
          </div>
        </div>

        ${path
          ? pathRow("PATH", path)
          : ""}

        ${playset
          ? pathRow("PLAYSET", playset)
          : ""}
      </article>`;
  }

  function deviceCard(item) {
    const title =
      item.name ||
      item.title ||
      item.device ||
      item.id ||
      "Device";

    const image =
      deviceImageUrl(item);

    const path =
      cleanDeviceText(item.path);

    const playset =
      cleanDeviceText(item.playset);

    const important =
      cleanDeviceText(
        item.important
      );

    return `
      <article class="tool-card th3-device-card">
        <div class="tool-card-head th3-device-head">
          ${image
            ? `<img
                class="tool-card-image device-image"
                src="${escapeAttr(image)}"
                alt=""
                loading="lazy"
              />`
            : ""}

          <div style="min-width:0;flex:1">
            <div class="tool-card-title">
              ${escapeHtml(title)}
            </div>
          </div>
        </div>

        ${important
          ? `<div class="device-important">
              ${escapeHtml(important)}
            </div>`
          : ""}

        ${path
          ? pathRow("PATH", path)
          : ""}

        ${playset
          ? pathRow("PLAYSET", playset)
          : ""}

        ${deviceSettingsRows(
          item.settings
        )}
      </article>`;
  }

  function deviceSettingsRows(settings) {
    const entries =
      Object.entries(
        settings || {}
      ).filter(
        ([name, data]) =>
          !isJunkDeviceText(name) &&
          !isJunkDeviceText(
            data?.["option key"]
          ) &&
          !isJunkDeviceText(
            data?.value
          )
      );

    if (!entries.length) {
      return "";
    }

    return `
      <div class="device-settings-table">
        ${entries
          .map(([name, data]) => {
            const key =
              cleanDeviceText(
                data?.["option key"]
              );

            const value =
              cleanDeviceText(
                data?.value
              );

            return `
              <div class="device-setting-row">
                <div class="device-setting-name">
                  ${escapeHtml(name)}
                </div>

                <div class="device-setting-fields">
                  ${key
                    ? `
                      <div class="device-setting-field">
                        <span class="device-field-tag">Key</span>
                        <span class="device-field-value">
                          ${escapeHtml(key)}
                        </span>
                        <button
                          class="path-copy"
                          type="button"
                          data-copy="${escapeAttr(key)}"
                        >COPY</button>
                      </div>`
                    : ""}

                  ${value
                    ? `
                      <div class="device-setting-field">
                        <span class="device-field-tag">Val</span>
                        <span class="device-field-value">
                          ${escapeHtml(value)}
                        </span>
                        <button
                          class="path-copy"
                          type="button"
                          data-copy="${escapeAttr(value)}"
                        >COPY</button>
                      </div>`
                    : ""}
                </div>
              </div>`;
          })
          .join("")}
      </div>`;
  }

  function deviceImageUrl(item) {
    const raw =
      String(item?.image || "")
        .trim();

    if (!raw) return "";

    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }

    const filename =
      raw
        .replace(/\\/g, "/")
        .split("/")
        .pop();

    if (!filename) return "";

    return (
      "https://raw.githubusercontent.com/" +
      "Th3DryZ69/FortniteToolsWeb/main/" +
      "public/images/devices/" +
      encodeURIComponent(filename)
    );
  }

  function bindImageFallbacks(root) {
    for (
      const image of root.querySelectorAll(
        "img.device-image"
      )
    ) {
      if (image.dataset.fallbackBound) {
        continue;
      }

      image.dataset.fallbackBound = "1";

      image.addEventListener(
        "error",
        () => image.remove(),
        { once: true }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Converters
  // ---------------------------------------------------------------------------

  function renderConverters() {
    const definitions = [
      [
        "Emote to Animation",
        "EID_DanceMoves",
        "emote-animation"
      ],
      [
        "Emote to Sequence",
        "EID_DanceMoves",
        "emote-sequence"
      ],
      [
        "Emote to Audio",
        "EID_DanceMoves",
        "emote-audio"
      ],
      [
        "Aura to VFX",
        "SparksAura_BoomBox",
        "aura-vfx"
      ],
      [
        "MusicPack to Audio",
        "MusicPack_001_Floss",
        "music-audio"
      ]
    ];

    content.innerHTML = `
      <div class="tool-section">
        <h2>Convert</h2>

        <p class="tool-note">
          Converters use current database paths and exported asset JSON.
        </p>

        <div class="converter-grid">
          ${definitions
            .map(
              ([title, placeholder, type]) => `
                <div class="converter-card">
                  <h3>${escapeHtml(title)}</h3>

                  <input
                    class="tool-input"
                    data-convert-input="${escapeAttr(type)}"
                    placeholder="${escapeAttr(placeholder)}"
                  />

                  <button
                    class="tool-button primary"
                    data-convert="${escapeAttr(type)}"
                    type="button"
                  >Convert</button>

                  <div
                    class="tool-result"
                    data-result="${escapeAttr(type)}"
                  >Ready.</div>
                </div>`
            )
            .join("")}
        </div>
      </div>`;

    for (
      const button of content.querySelectorAll(
        "[data-convert]"
      )
    ) {
      button.addEventListener(
        "click",
        () =>
          runConverter(
            button.dataset.convert
          )
      );
    }

    for (
      const input of content.querySelectorAll(
        "[data-convert-input]"
      )
    ) {
      input.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter") {
            runConverter(
              input.dataset.convertInput
            );
          }
        }
      );
    }
  }

  async function runConverter(type) {
    const input =
      content.querySelector(
        `[data-convert-input="${CSS.escape(type)}"]`
      );

    const result =
      content.querySelector(
        `[data-result="${CSS.escape(type)}"]`
      );

    const value =
      input?.value.trim();

    if (!value) {
      setResult(
        result,
        "Enter an ID or name.",
        "error"
      );

      return;
    }

    setResult(
      result,
      "Working...",
      "loading"
    );

    try {
      let data = null;

      if (type === "emote-animation") {
        data =
          await emoteToAnimation(value);
      }

      if (type === "emote-sequence") {
        data =
          await emoteToSequence(value);
      }

      if (type === "emote-audio") {
        data =
          await emoteToAudio(value);
      }

      if (type === "aura-vfx") {
        data =
          await auraToVfx(value);
      }

      if (type === "music-audio") {
        data =
          await musicToAudio(value);
      }

      if (
        !data ||
        (
          Array.isArray(data) &&
          !data.length
        )
      ) {
        setResult(
          result,
          "No data found.",
          "error"
        );

        return;
      }

      const text =
        Array.isArray(data)
          ? data.join("\n")
          : typeof data === "object"
            ? Object.entries(data)
                .map(
                  ([key, value]) =>
                    `${capitalize(key)}: ${value}`
                )
                .join("\n")
            : String(data);

      setResult(
        result,
        text
      );

      result.onclick =
        () => copy(text);

      result.title =
        "Tap to copy";
    } catch (error) {
      setResult(
        result,
        error?.message ||
        "Converter failed.",
        "error"
      );
    }
  }

  async function resolveLocalAsset(id) {
    const data =
      await window.FortniteAgent
        ?.searchDatabase?.(
          "all",
          id
        );

    const rows =
      Array.isArray(data?.results)
        ? data.results
        : [];

    if (!rows.length) {
      return null;
    }

    const target =
      String(id)
        .toLowerCase();

    const exact =
      rows.find((item) => {
        const name =
          assetTitle(item.path)
            .toLowerCase();

        return name === target;
      });

    return (
      exact ||
      rows[0]
    )?.path || null;
  }

  async function exportJson(path) {
    const key =
      String(path || "").trim();

    if (!key) return null;

    if (
      exportJsonCache.has(key)
    ) {
      return exportJsonCache.get(key);
    }

    const request = (async () => {
      const filePath =
        toFilePath(key);

      const url =
        `${EXPORT_BASE}` +
        `?path=${encodeURIComponent(filePath)}` +
        "&raw=true";

      const response =
        await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Export service returned ${response.status}`
        );
      }

      const payload =
        await response.json();

      return payload?.jsonOutput || [];
    })();

    exportJsonCache.set(
      key,
      request
    );

    try {
      return await request;
    } catch (error) {
      exportJsonCache.delete(key);
      throw error;
    }
  }

  async function emoteToAnimation(id) {
    const asset =
      await resolveLocalAsset(id);

    if (!asset) return null;

    const data =
      await exportJson(asset);

    const properties =
      data?.[0]?.Properties;

    if (!properties) return null;

    return {
      male:
        properties.Animation
          ?.AssetPathName ||
        "None",

      female:
        properties.AnimationFemaleOverride
          ?.AssetPathName ||
        "None"
    };
  }

  async function emoteToSequence(id) {
    const animation =
      await emoteToAnimation(id);

    if (
      !animation ||
      animation.male === "None"
    ) {
      return null;
    }

    const data =
      await exportJson(
        animation.male
      );

    const raw =
      data?.[0]
        ?.Properties
        ?.CompositeSections
        ?.[0]
        ?.LinkedSequence
        ?.ObjectPath;

    return raw
      ? objectPath(raw)
      : null;
  }

  async function emoteToAudio(id) {
    const asset =
      await resolveLocalAsset(id);

    if (!asset) return null;

    const data =
      await exportJson(asset);

    const animation =
      data?.[0]
        ?.Properties
        ?.Animation
        ?.AssetPathName;

    if (!animation) {
      return null;
    }

    const animationData =
      await exportJson(animation);

    const sounds = [];

    walk(
      animationData,
      (node) => {
        if (
          node.Type ===
          "FortAnimNotifyState_EmoteSound"
        ) {
          const sound =
            node.Properties
              ?.EmoteSound1P
              ?.ObjectPath;

          if (sound) {
            sounds.push(sound);
          }
        }
      }
    );

    const output = [];

    for (
      const sound of [
        ...new Set(sounds)
      ]
    ) {
      const audio =
        await exportJson(sound);

      output.push(
        ...soundWaves(audio)
      );
    }

    return [
      ...new Set(output)
    ];
  }

  async function cosmeticApi(
    input,
    backendType = ""
  ) {
    const isId =
      /^[A-Za-z][A-Za-z0-9_-]+$/.test(
        input
      ) &&
      input.includes("_");

    const url =
      isId
        ? `${FORTNITE_API}/${encodeURIComponent(input)}?responseFlags=7`
        : `${FORTNITE_API}/search?name=${encodeURIComponent(input)}${backendType ? `&backendType=${encodeURIComponent(backendType)}` : ""}&responseFlags=7`;

    const response =
      await fetch(url);

    if (!response.ok) {
      return null;
    }

    const payload =
      await response.json();

    return payload?.data || null;
  }

  async function auraToVfx(input) {
    const api =
      await cosmeticApi(input);

    const path =
      api?.path ||
      await resolveLocalAsset(input);

    if (!path) return null;

    const data =
      await exportJson(path);

    const properties =
      data?.[0]?.Properties;

    if (!properties) {
      return null;
    }

    return {
      main:
        properties.SustainSystem
          ?.AssetPathName ||
        "None",

      start:
        properties.StartSystem
          ?.AssetPathName ||
        "None",

      stop:
        properties.StopSystem
          ?.AssetPathName ||
        "None"
    };
  }

  async function musicToAudio(input) {
    const api =
      await cosmeticApi(
        input,
        "AthenaMusicPack"
      );

    const path =
      api?.path ||
      await resolveLocalAsset(input);

    if (!path) return null;

    const data =
      await exportJson(path);

    const music =
      data?.[0]
        ?.Properties
        ?.FrontEndLobbyMusic
        ?.AssetPathName;

    if (!music) {
      return null;
    }

    return soundWaves(
      await exportJson(music)
    );
  }

  function soundWaves(data) {
    const output = [];

    walk(
      data,
      (node) => {
        if (
          String(node.ObjectName || "")
            .includes("SoundWave") &&
          node.ObjectPath
        ) {
          output.push(
            objectPath(
              node.ObjectPath
            )
          );
        }
      }
    );

    return [
      ...new Set(output)
    ];
  }

  // ---------------------------------------------------------------------------
  // Path modifier
  // ---------------------------------------------------------------------------

  function renderPathModifier() {
    content.innerHTML = `
      <div class="tool-section">
        <h2>${escapeHtml(
          t(
            "pathModifier",
            "Path Modifier"
          )
        )}</h2>

        <p class="tool-note">
          ${escapeHtml(
            t(
              "pathNote",
              "Convert Fortnite filesystem paths to mount-aware Unreal object paths."
            )
          )}
        </p>

        <textarea
          id="pathInput"
          class="tool-textarea"
          placeholder="FortniteGame/Content/.../Asset.uasset"
        ></textarea>

        <div class="tool-actions">
          <button
            id="formatPathBtn"
            class="tool-button primary"
            type="button"
          >${escapeHtml(
            t(
              "format",
              "Format"
            )
          )}</button>

          <button
            id="addClassPathBtn"
            class="tool-button"
            type="button"
          >${escapeHtml(
            t(
              "addClassAction",
              "Add _C"
            )
          )}</button>
        </div>

        <textarea
          id="pathOutput"
          class="tool-textarea"
          readonly
          placeholder="${escapeAttr(
            t(
              "convertedPath",
              "Converted path will appear here"
            )
          )}"
        ></textarea>

        <div
          id="pathModifierNote"
          class="tool-note"
        ></div>

        <div class="tool-actions">
          <button
            id="copyPathOutput"
            class="tool-button"
            type="button"
          >${escapeHtml(
            t(
              "copy",
              "Copy"
            )
          )}</button>
        </div>
      </div>`;

    const input =
      content.querySelector(
        "#pathInput"
      );

    const output =
      content.querySelector(
        "#pathOutput"
      );

    const note =
      content.querySelector(
        "#pathModifierNote"
      );

    content
      .querySelector("#formatPathBtn")
      .addEventListener(
        "click",
        () => {
          output.value =
            formatAssetPath(
              input.value,
              false
            );

          note.textContent = "";
        }
      );

    content
      .querySelector("#addClassPathBtn")
      .addEventListener(
        "click",
        () => {
          const compatible =
            isClassCompatibleAsset(
              input.value
            );

          output.value =
            formatAssetPath(
              input.value,
              compatible
            );

          note.textContent =
            compatible
              ? ""
              : "_C was not added because this path does not look class-compatible.";
        }
      );

    content
      .querySelector("#copyPathOutput")
      .addEventListener(
        "click",
        () => copy(output.value)
      );
  }

  function formatAssetPath(
    raw,
    addClass = false
  ) {
    if (
      window.NovaSparx
        ?.objectPath
    ) {
      const canonical =
        window.NovaSparx
          .objectPath(raw);

      if (canonical) {
        return addClass
          ? addClassSuffix(
              canonical
            )
          : canonical;
      }
    }

    let path =
      unwrapAssetPath(raw);

    if (!path) return "";

    path =
      path.replace(/\\/g, "/");

    path =
      path.replace(
        /^\.?\//,
        ""
      );

    path =
      path.replace(
        /\.(uasset|uexp|ubulk)$/i,
        ""
      );

    const objectDot =
      path.lastIndexOf(".");

    if (
      objectDot >
      path.lastIndexOf("/")
    ) {
      path =
        path.slice(
          0,
          objectDot
        );
    }

    if (
      /^FortniteGame\/Content\//i.test(path)
    ) {
      path =
        "/Game/" +
        path.slice(
          "FortniteGame/Content/".length
        );
    } else if (
      /^Engine\/Content\//i.test(path)
    ) {
      path =
        "/Engine/" +
        path.slice(
          "Engine/Content/".length
        );
    } else {
      const plugin =
        path.match(
          /^(?:FortniteGame\/)?Plugins\/(?:GameFeatures\/)?([^/]+)\/Content\/(.+)$/i
        );

      if (plugin) {
        path =
          `/${plugin[1]}/${plugin[2]}`;
      } else {
        const physicalMount =
          path.match(
            /^([^/]+)\/Content\/(.+)$/i
          );

        if (
          physicalMount &&
          physicalMount[1]
            .toLowerCase() !==
            "fortnitegame"
        ) {
          path =
            `/${physicalMount[1]}/${physicalMount[2]}`;
        } else if (
          !path.startsWith("/")
        ) {
          path = "/" + path;
        }
      }
    }

    const name =
      path.slice(
        path.lastIndexOf("/") + 1
      );

    if (!name) return path;

    path =
      `${path}.${name}`;

    return addClass
      ? addClassSuffix(path)
      : path;
  }

  function isClassCompatibleAsset(path) {
    const clean =
      unwrapAssetPath(path)
        .replace(/\\/g, "/");

    if (!clean) return false;

    const lower =
      clean.toLowerCase();

    if (
      /\.(uasset)?$/i.test(lower)
    ) {
      // Extension by itself is not enough to identify a generated class.
    }

    const name =
      clean
        .split("/")
        .pop()
        ?.split(".")[0]
        ?.toLowerCase() ||
      "";

    if (
      /^(sm_|sk_|m_|mi_|t_|tex_|ns_|ps_|fx_|s_|sw_|soundwave_|anim_|a_)/i.test(
        name
      )
    ) {
      return false;
    }

    if (
      lower.includes("/materials/") ||
      lower.includes("/materialinstances/") ||
      lower.includes("/textures/") ||
      lower.includes("/meshes/") ||
      lower.includes("/staticmesh") ||
      lower.includes("/skeletalmesh") ||
      lower.includes("/niagara/") ||
      lower.includes("/sounds/") ||
      lower.includes("/audio/")
    ) {
      return false;
    }

    return (
      /^(bp_|b_|ab_|ga_|gc_|w_|wid_|athena_|creative_|device_)/i.test(name) ||
      lower.includes("/blueprints/") ||
      lower.includes("/blueprint/") ||
      lower.includes("/abilities/") ||
      lower.includes("/gameplayabilities/") ||
      lower.endsWith("_c")
    );
  }

  function addClassSuffix(path) {
    const value =
      String(path || "");

    if (!value) return value;

    if (value.endsWith("_C")) {
      return value;
    }

    return `${value}_C`;
  }

  function unwrapAssetPath(value) {
    let text =
      String(value || "")
        .trim();

    if (!text) return "";

    const wrapped =
      text.match(
        /^(?:[A-Za-z0-9_]+)?['"]([^'"]+)['"]$/
      );

    if (wrapped?.[1]) {
      text = wrapped[1];
    }

    return text;
  }

  function toFilePath(path) {
    let value =
      unwrapAssetPath(path)
        .replace(/\\/g, "/");

    if (!value) return value;

    if (
      /\.uasset$/i.test(value)
    ) {
      return value;
    }

    const dot =
      value.lastIndexOf(".");

    if (
      dot >
      value.lastIndexOf("/")
    ) {
      value =
        value.slice(0, dot);
    }

    if (
      /^FortniteGame\/Content\//i.test(value) ||
      /^FortniteGame\/Plugins\//i.test(value) ||
      /^Engine\/Content\//i.test(value)
    ) {
      return `${value}.uasset`;
    }

    if (
      value.startsWith("/Game/")
    ) {
      return (
        "FortniteGame/Content/" +
        value.slice(6) +
        ".uasset"
      );
    }

    if (
      value.startsWith("/Engine/")
    ) {
      return (
        "Engine/Content/" +
        value.slice(8) +
        ".uasset"
      );
    }

    const mount =
      value.match(
        /^\/([^/]+)\/(.+)$/
      );

    if (mount) {
      return (
        "FortniteGame/Plugins/GameFeatures/" +
        mount[1] +
        "/Content/" +
        mount[2] +
        ".uasset"
      );
    }

    return `${value}.uasset`;
  }

  function objectPath(path) {
    return formatAssetPath(
      path,
      false
    );
  }

  // ---------------------------------------------------------------------------
  // Cosmetic browser
  // ---------------------------------------------------------------------------

  function renderCosmetics() {
    content.innerHTML = `
      <div class="tool-section">
        <h2>${escapeHtml(
          t(
            "cosmeticBrowser",
            "Cosmetic Browser"
          )
        )}</h2>

        <p class="tool-note">
          ${escapeHtml(
            t(
              "cosmeticNote",
              "Search local Fortnite paths for cosmetic assets."
            )
          )}
        </p>

        <div class="tool-searchbar">
          <input
            id="cosmeticSearch"
            placeholder="${escapeAttr(
              t(
                "cosmeticSearch",
                "Skin name, CID, character path..."
              )
            )}"
          />

          <button
            id="cosmeticBtn"
            class="tool-button primary"
            type="button"
          >Search</button>
        </div>

        <div
          id="cosmeticStatus"
          class="tool-empty"
        >Search for a cosmetic.</div>

        <div
          id="cosmeticGrid"
          class="cosmetic-grid"
        ></div>

        <div class="tool-actions">
          <button
            id="cosmeticMore"
            class="tool-button"
            type="button"
            hidden
          >Load more</button>
        </div>
      </div>`;

    const input =
      content.querySelector(
        "#cosmeticSearch"
      );

    const status =
      content.querySelector(
        "#cosmeticStatus"
      );

    const run = async () => {
      const query =
        input.value.trim();

      if (!query) return;

      status.hidden = false;
      status.textContent =
        "Searching...";

      const searches = [query];

      if (
        !query
          .toLowerCase()
          .includes("character")
      ) {
        searches.push(
          `${query} Characters`
        );
      }

      const merged = [];

      for (const search of searches) {
        const data =
          await window.FortniteAgent
            ?.searchDatabase?.(
              "all",
              search
            );

        for (
          const item of data?.results || []
        ) {
          if (
            !/cosmetic|character|cid_|outfit/i.test(
              item.path
            )
          ) {
            continue;
          }

          if (
            merged.some(
              (value) =>
                value.path ===
                item.path
            )
          ) {
            continue;
          }

          merged.push(item);
        }
      }

      cosmeticResults = merged;
      cosmeticShown = 0;

      status.textContent =
        merged.length
          ? `${merged.length} matching path${merged.length === 1 ? "" : "s"} found.`
          : "No matching cosmetic paths.";

      renderCosmeticPage(true);
    };

    content
      .querySelector("#cosmeticBtn")
      .addEventListener(
        "click",
        run
      );

    input.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          run();
        }
      }
    );

    content
      .querySelector("#cosmeticMore")
      .addEventListener(
        "click",
        () =>
          renderCosmeticPage(false)
      );
  }

  function renderCosmeticPage(reset) {
    const grid =
      content.querySelector(
        "#cosmeticGrid"
      );

    const more =
      content.querySelector(
        "#cosmeticMore"
      );

    if (!grid || !more) return;

    if (reset) {
      grid.innerHTML = "";
    }

    const slice =
      cosmeticResults.slice(
        cosmeticShown,
        cosmeticShown +
        COSMETIC_PAGE
      );

    cosmeticShown +=
      slice.length;

    const holder =
      document.createElement("div");

    holder.innerHTML =
      slice
        .map(cosmeticCard)
        .join("");

    while (holder.firstChild) {
      grid.append(
        holder.firstChild
      );
    }

    bindCopyButtons(grid);
    loadCosmeticIcons(grid);

    more.hidden =
      cosmeticShown >=
      cosmeticResults.length;
  }

  function cosmeticCard(item) {
    const path =
      String(item.path || "");

    const name =
      assetTitle(path) ||
      "Cosmetic";

    return `
      <article
        class="tool-card cosmetic-card"
        data-cosmetic-path="${escapeAttr(path)}"
      >
        <div class="tool-card-head">
          <img
            class="tool-card-image cosmetic-img"
            alt=""
            loading="lazy"
            hidden
          />

          <div style="min-width:0;flex:1">
            <div class="tool-card-title">
              ${escapeHtml(name)}
            </div>
          </div>
        </div>

        ${pathRow("PATH", path)}
      </article>`;
  }

  async function loadCosmeticIcons(root) {
    const cards =
      [
        ...root.querySelectorAll(
          ".cosmetic-card:not([data-icon-loaded])"
        )
      ].slice(0, 40);

    await Promise.allSettled(
      cards.map(
        async (card) => {
          card.dataset.iconLoaded = "1";

          try {
            const data =
              await exportJson(
                card.dataset.cosmeticPath
              );

            let icon = null;

            walk(
              data,
              (node) => {
                if (icon) return;

                icon =
                  node.LargeIcon
                    ?.AssetPathName ||
                  node.Icon
                    ?.AssetPathName ||
                  null;
              }
            );

            if (!icon) return;

            const image =
              card.querySelector(
                ".cosmetic-img"
              );

            image.src =
              `${EXPORT_BASE}` +
              `?path=${encodeURIComponent(
                String(icon)
                  .split(".")[0]
              )}` +
              "&raw=false";

            image.hidden = false;

            image.addEventListener(
              "error",
              () => {
                image.hidden = true;
              },
              { once: true }
            );
          } catch {
            // Missing cosmetic icon is non-fatal.
          }
        }
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  function idCard(item) {
    const title =
      item.name ||
      item.title ||
      item.id ||
      "Island";

    const rows = [];

    for (const key of [
      "id",
      "plot",
      "playset",
      "path"
    ]) {
      const value =
        item[key];

      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        continue;
      }

      rows.push(
        pathRow(
          key.toUpperCase(),
          String(value)
        )
      );
    }

    return `
      <article class="tool-card">
        <div class="tool-card-title">
          ${escapeHtml(title)}
        </div>

        ${rows.join("")}
      </article>`;
  }

  function walkIdData(
    value,
    output,
    key = ""
  ) {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }

    if (
      !Array.isArray(value) &&
      (
        "playset" in value ||
        "plot" in value ||
        "path" in value ||
        "id" in value
      )
    ) {
      output.push({
        name:
          value.name ||
          value.title ||
          key,
        ...value
      });
    }

    if (Array.isArray(value)) {
      value.forEach(
        (item, index) =>
          walkIdData(
            item,
            output,
            String(index)
          )
      );

      return;
    }

    for (
      const [childKey, child] of
      Object.entries(value)
    ) {
      walkIdData(
        child,
        output,
        childKey
      );
    }
  }

  function walk(node, callback) {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, callback);
      }

      return;
    }

    if (
      node &&
      typeof node === "object"
    ) {
      callback(node);

      for (
        const value of
        Object.values(node)
      ) {
        walk(
          value,
          callback
        );
      }
    }
  }

  function pathRow(label, value) {
    return `
      <div class="path-row">
        <span class="path-label">
          ${escapeHtml(label)}
        </span>

        <code
          class="path-value"
          title="${escapeAttr(value)}"
        >${escapeHtml(value)}</code>

        <button
          class="path-copy"
          type="button"
          data-copy="${escapeAttr(value)}"
        >COPY</button>
      </div>`;
  }

  function bindCopyButtons(root) {
    if (root.dataset.copyBound) {
      return;
    }

    root.dataset.copyBound = "1";

    root.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            "[data-copy]"
          );

        if (!button) return;

        copy(
          button.dataset.copy || ""
        );
      }
    );
  }

  async function copy(text) {
    const value =
      String(text || "");

    if (!value) return;

    try {
      await navigator.clipboard
        .writeText(value);

      window.FortniteAgent
        ?.toast?.("Copied");

      return;
    } catch {
      const textarea =
        document.createElement(
          "textarea"
        );

      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";

      document.body.append(
        textarea
      );

      textarea.select();

      document.execCommand(
        "copy"
      );

      textarea.remove();

      window.FortniteAgent
        ?.toast?.("Copied");
    }
  }

  function startSearchingAnimation(
    element
  ) {
    const base =
      t(
        "searching",
        "Searching"
      );

    const frames = [
      `${base}.`,
      `${base}..`,
      `${base}…`
    ];

    let index = 0;

    element.textContent =
      frames[0];

    const timer =
      setInterval(
        () => {
          index =
            (index + 1) %
            frames.length;

          element.textContent =
            frames[index];
        },
        350
      );

    return () =>
      clearInterval(timer);
  }

  async function fetchJson(url) {
    const response =
      await fetch(
        url,
        { cache: "force-cache" }
      );

    if (!response.ok) {
      throw new Error(
        `Request failed (${response.status})`
      );
    }

    return response.json();
  }

  async function apiJson(
    route,
    path
  ) {
    if (
      window.FortniteAgent
        ?.apiFetch
    ) {
      const response =
        await window.FortniteAgent
          .apiFetch(
            `${route}?path=${encodeURIComponent(path)}`,
            {
              method: "GET"
            }
          );

      if (!response.ok) {
        throw new Error(
          `FNAA API returned ${response.status}`
        );
      }

      return response.json();
    }

    if (!API_ENDPOINT) {
      throw new Error(
        "FNAA API endpoint is not configured."
      );
    }

    const response =
      await fetch(
        `${API_ENDPOINT}${route}?path=${encodeURIComponent(path)}`,
        {
          headers: {
            "X-FNAA-Client": "web-v1"
          }
        }
      );

    if (!response.ok) {
      let message =
        `FNAA API returned ${response.status}`;

      try {
        const body =
          await response.json();

        if (body?.error) {
          message =
            body.error;
        }
      } catch {
        // Keep status message.
      }

      throw new Error(message);
    }

    return response.json();
  }

  function setResult(
    element,
    text,
    state = ""
  ) {
    if (!element) return;

    element.textContent =
      String(text || "");

    element.dataset.state =
      state;
  }

  function assetTitle(path) {
    const clean =
      unwrapAssetPath(path)
        .replace(/\\/g, "/");

    const file =
      clean
        .split("/")
        .pop() ||
      clean;

    return file
      .replace(
        /\.(uasset|uexp|ubulk)$/i,
        ""
      )
      .split(".")[0];
  }

  function shortPath(value) {
    const text =
      String(value || "");

    if (text.length <= 70) {
      return text;
    }

    return (
      text.slice(0, 32) +
      "…" +
      text.slice(-32)
    );
  }

  function capitalize(value) {
    const text =
      String(value || "");

    return text
      ? text[0].toUpperCase() +
        text.slice(1)
      : "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  window.FortniteTools =
    Object.freeze({
      version: "1.0.0",
      open,
      close,
      formatAssetPath,
      isClassCompatibleAsset,
      toFilePath
    });
})();
