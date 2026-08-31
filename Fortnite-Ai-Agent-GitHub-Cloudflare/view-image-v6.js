(() => {
  "use strict";

  const API_ENDPOINT = String(window.FORTNITE_AI_API_ENDPOINT || "")
    .trim()
    .replace(/\/+$/, "");

  const previewUrlCache = new Map();
  const MAX_GEOMETRY_JSON_BYTES = 12 * 1024 * 1024;

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

  function geometryUrl(path) {
    if (!API_ENDPOINT) return "";
    return `${API_ENDPOINT}/mesh-geometry?path=${encodeURIComponent(String(path || "").trim())}`;
  }

  function assetName(path) {
    const clean = String(path || "").trim().split(".")[0];
    return clean.split("/").pop() || "";
  }

  function isLikelyStaticMesh(path) {
    const value = String(path || "").trim();
    if (!value) return false;

    if (/^\s*StaticMesh'/i.test(value)) return true;
    if (/^\s*SkeletalMesh'/i.test(value)) return false;

    const clean = value.split(".")[0];
    const name = assetName(clean).toLowerCase();
    const low = clean.toLowerCase();

    return (
      name.startsWith("sm_") ||
      low.includes("/staticmesh/") ||
      low.includes("/staticmeshes/") ||
      (low.includes("/meshes/") && !name.startsWith("sk_"))
    );
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
      img.src = url;
    });
  }

  async function probeStatus(path) {
    const url = statusUrl(path);
    if (!url) return { state: "error", status: 0, error: "FNAA image Worker is not configured." };

    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });

      let data = {};
      try { data = await response.json(); } catch {}

      if (response.status === 404 || data?.state === "missing") {
        return { state: "missing", status: 404, ...data };
      }

      if (response.ok && data?.state === "ready") {
        return { state: "ready", status: 200, ...data };
      }

      return {
        state: "error",
        status: response.status || data?.status || 0,
        error: data?.error || `Image service returned HTTP ${response.status || "error"}.`,
        ...data
      };
    } catch (error) {
      return { state: "error", status: 0, error: error?.message || "Couldn't reach the image service." };
    }
  }

  async function fetchGeometry(path) {
    const url = geometryUrl(path);
    if (!url) throw new Error("FNAA mesh geometry endpoint is not configured.");

    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "force-cache",
      headers: { Accept: "application/json" }
    });

    const length = Number(response.headers.get("content-length") || "0");
    if (length > MAX_GEOMETRY_JSON_BYTES) {
      throw new Error("StaticMesh geometry is too large for mobile preview.");
    }

    let data = {};
    try { data = await response.json(); } catch {}

    if (response.status === 404 || data?.state === "missing") {
      const err = new Error(data?.error || "StaticMesh geometry is not available from the current backend.");
      err.code = "GEOMETRY_MISSING";
      err.details = data;
      throw err;
    }

    if (!response.ok || data?.state !== "ready") {
      throw new Error(data?.error || `Mesh geometry service returned HTTP ${response.status}.`);
    }

    if (!data.geometry?.positions || !data.geometry?.indices) {
      throw new Error("Mesh geometry response is incomplete.");
    }

    return data;
  }

  function revokeCachedUrl(path) {
    const old = previewUrlCache.get(path);
    if (old) {
      URL.revokeObjectURL(old);
      previewUrlCache.delete(path);
    }
  }

  async function renderStaticMesh(path, img, status, meta) {
    if (!window.FNAAMeshPreview?.renderToBlob) {
      throw new Error("FNAA 2D StaticMesh renderer failed to load.");
    }

    status.hidden = false;
    status.textContent = "Building 2D StaticMesh preview...";

    const data = await fetchGeometry(path);

    status.textContent = "Rendering 2D preview...";

    const rendered = await window.FNAAMeshPreview.renderToBlob(data.geometry, {
      size: 640
    });

    revokeCachedUrl(path);
    const objectUrl = URL.createObjectURL(rendered.blob);
    previewUrlCache.set(path, objectUrl);

    img.src = objectUrl;
    img.classList.add("generated-staticmesh-preview");
    img.hidden = false;
    status.hidden = true;

    if (meta) {
      const source = data.source || "mesh geometry";
      meta.textContent =
        `StaticMesh • 2D generated preview • ${rendered.vertexCount.toLocaleString()} vertices • ${rendered.triangleCount.toLocaleString()} triangles • ${source}`;
      meta.hidden = false;
    }

    return true;
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
    img.classList.remove("generated-staticmesh-preview");
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

        if (check.state === "ready") {
          loaded = await loadNativeImage(img, imageUrl(path, true), 18000);

          if (!loaded.ok) {
            const error = new Error("Image exists but the browser failed to display the stream.");
            error.code = "BROWSER_STREAM_FAILED";
            throw error;
          }

          button.dataset.imageState = "ready";
          status.hidden = true;
          img.hidden = false;

          if (meta) {
            const source = check.source || "FNAA Worker";
            const resolved = check.resolvedPath ? ` • ${check.resolvedPath}` : "";
            meta.textContent = `${source}${resolved}`;
            meta.hidden = false;
          }
          return;
        }

        if (check.state === "missing" && (check.assetType === "StaticMesh" || isLikelyStaticMesh(path))) {
          await renderStaticMesh(path, img, status, meta);
          button.dataset.imageState = "mesh-2d";
          return;
        }

        if (check.state === "missing") {
          button.dataset.imageState = "missing";
          img.hidden = true;
          status.hidden = false;
          status.textContent = t("imageUnavailable", "No Image found\nError 404");
          return;
        }

        throw new Error(check.error || "Preview temporarily unavailable.");
      }

      button.dataset.imageState = "ready";
      status.hidden = true;
      img.hidden = false;

      if (meta) {
        meta.textContent = "Epic image via FNAA Worker";
        meta.hidden = false;
      }
    } catch (error) {
      button.dataset.imageState = "";
      img.removeAttribute("src");
      img.hidden = true;
      status.hidden = false;

      if (error?.code === "GEOMETRY_MISSING") {
        const backendConfigured = Boolean(error?.details?.backendConfigured);
        status.textContent = backendConfigured
          ? "StaticMesh found, but no vertex/index geometry was returned for this asset."
          : "StaticMesh 2D preview needs a geometry source.\nConfigure MESH_GEOMETRY_API or use an upstream that exposes vertices + indices.";
      } else if (error?.code === "BROWSER_STREAM_FAILED") {
        status.textContent =
          "Image resolved, but the browser blocked/failed to display it.\nCheck CSP / browser cache.";
      } else {
        status.textContent = error?.message || t("imageError", "Preview temporarily unavailable.");
      }

      if (meta) {
        meta.hidden = true;
        meta.textContent = "";
      }

      console.warn("FNAA View Image V6:", error);
    } finally {
      button.disabled = false;
      if (!panel.hidden) button.textContent = t("hideImage", "Hide Image");
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest(".mesh-image-view-button[data-image-path]");
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      handle(button);
    },
    true
  );

  window.addEventListener("pagehide", () => {
    for (const url of previewUrlCache.values()) URL.revokeObjectURL(url);
    previewUrlCache.clear();
  });

  console.info("FNAA View Image V6 loaded — 2D StaticMesh preview enabled.");
})();
