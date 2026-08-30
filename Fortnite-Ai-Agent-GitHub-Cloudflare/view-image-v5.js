(() => {
  "use strict";

  const API_ENDPOINT = String(window.FORTNITE_AI_API_ENDPOINT || "")
    .trim()
    .replace(/\/+$/, "");

  const t = (key, fallback = "") =>
    window.FortniteI18n?.t?.(key) || fallback || key;

  function imageUrl(path, retry = false) {
    if (!API_ENDPOINT) return "";
    const url = `${API_ENDPOINT}/image?path=${encodeURIComponent(String(path || "").trim())}`;
    return retry ? `${url}&retry=${Date.now()}` : url;
  }

  function statusUrl(path) {
    if (!API_ENDPOINT) return "";
    return `${API_ENDPOINT}/image-status?path=${encodeURIComponent(String(path || "").trim())}`;
  }

  function loadNativeImage(img, url, timeoutMs = 18000) {
    return new Promise((resolve) => {
      let done = false;

      const finish = (ok, reason = "") => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve({ ok, reason });
      };

      const timer = setTimeout(() => finish(false, "timeout"), timeoutMs);

      img.onload = () =>
        finish(img.naturalWidth > 0 && img.naturalHeight > 0, "load");

      img.onerror = () => finish(false, "error");

      // Native browser streaming/decode. No fetch/blob/objectURL.
      img.src = url;
    });
  }

  async function probeStatus(path) {
    const url = statusUrl(path);
    if (!url) {
      return {
        state: "error",
        status: 0,
        error: "FNAA image Worker is not configured."
      };
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });

      let data = {};
      try {
        data = await response.json();
      } catch {}

      if (response.status === 404 || data?.state === "missing") {
        return { state: "missing", status: 404, ...data };
      }

      if (response.ok && data?.state === "ready") {
        return { state: "ready", status: 200, ...data };
      }

      return {
        state: "error",
        status: response.status || data?.status || 0,
        error:
          data?.error ||
          `Image service returned HTTP ${response.status || "error"}.`,
        ...data
      };
    } catch (error) {
      return {
        state: "error",
        status: 0,
        error: error?.message || "Couldn't reach the image service."
      };
    }
  }

  function closePanel(button, panel) {
    panel.hidden = true;
    button.textContent = t("viewImage", "View Image");
  }

  async function handle(button) {
    const card = button.closest(".tool-card");
    const panel = card?.querySelector(".mesh-image-panel");
    const status = panel?.querySelector(".mesh-image-status");
    const meta = panel?.querySelector(".mesh-image-meta");
    const img = panel?.querySelector(".mesh-preview-image");
    const path = String(button.dataset.imagePath || "").trim();

    if (!card || !panel || !status || !img || !path) return;

    if (!panel.hidden) {
      closePanel(button, panel);
      return;
    }

    const jsonPanel = card.querySelector(".json-panel");
    if (jsonPanel) jsonPanel.hidden = true;

    panel.hidden = false;
    button.textContent = t("hideImage", "Hide Image");
    button.disabled = true;

    img.hidden = true;
    img.removeAttribute("src");

    status.hidden = false;
    status.textContent = t("loadingImage", "Searching Epic images...");

    if (meta) {
      meta.hidden = true;
      meta.textContent = "";
    }

    try {
      const url = imageUrl(path);
      if (!url) throw new Error("FNAA image Worker is not configured.");

      let loaded = await loadNativeImage(img, url);

      if (!loaded.ok) {
        const check = await probeStatus(path);

        if (check.state === "missing") {
          button.dataset.imageState = "missing";
          img.removeAttribute("src");
          img.hidden = true;
          status.hidden = false;
          status.textContent = t(
            "imageUnavailable",
            "No Image found\nError 404"
          );
          return;
        }

        if (check.state === "ready") {
          // The Worker can resolve it, so retry the stream once with cache-busting.
          loaded = await loadNativeImage(img, imageUrl(path, true), 18000);

          if (!loaded.ok) {
            const error = new Error(
              "Image exists but the browser failed to display the stream."
            );
            error.code = "BROWSER_STREAM_FAILED";
            throw error;
          }

          if (meta) {
            const source = check.source || "FNAA Worker";
            const resolved = check.resolvedPath
              ? ` • ${check.resolvedPath}`
              : "";
            meta.textContent = `${source}${resolved}`;
          }
        } else {
          const code = check.status ? `\nError ${check.status}` : "";
          throw new Error(
            `${check.error || "Preview temporarily unavailable."}${code}`
          );
        }
      }

      button.dataset.imageState = "ready";
      status.hidden = true;
      img.hidden = false;

      if (meta) {
        if (!meta.textContent) meta.textContent = "Epic image via FNAA Worker";
        meta.hidden = false;
      }
    } catch (error) {
      button.dataset.imageState = "";
      img.removeAttribute("src");
      img.hidden = true;
      status.hidden = false;

      if (error?.code === "BROWSER_STREAM_FAILED") {
        status.textContent =
          "Image resolved, but the browser blocked/failed to display it.\nCheck CSP / browser cache.";
      } else {
        status.textContent =
          error?.message ||
          t("imageError", "Preview temporarily unavailable.");
      }

      if (meta) {
        meta.hidden = true;
        meta.textContent = "";
      }

      console.warn("FNAA View Image V5:", error);
    } finally {
      button.disabled = false;
      if (!panel.hidden) {
        button.textContent = t("hideImage", "Hide Image");
      }
    }
  }

  // Capture phase intentionally overrides the old tools.js click handler
  // without replacing the large tools.js file.
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest(
        ".mesh-image-view-button[data-image-path]"
      );

      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      handle(button);
    },
    true
  );

  console.info("FNAA View Image V5 loaded.");
})();
