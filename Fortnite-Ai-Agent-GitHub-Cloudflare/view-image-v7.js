(() => {
  "use strict";

  const API_ENDPOINT = String(window.FORTNITE_AI_API_ENDPOINT || "")
    .trim()
    .replace(/\/+$/, "");

  const objectUrls = new Map();

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

  function loadImage(img, url, timeoutMs = 18000) {
    return new Promise((resolve) => {
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(ok);
      };

      const timer = setTimeout(() => finish(false), timeoutMs);
      img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0);
      img.onerror = () => finish(false);
      img.src = url;
    });
  }

  async function status(path) {
    try {
      const r = await fetch(statusUrl(path), {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      const data = await r.json().catch(() => ({}));
      return { ok:r.ok, status:r.status, ...data };
    } catch (error) {
      return { state:"error", error:error?.message || "Image status failed." };
    }
  }

  function release(path) {
    const old = objectUrls.get(path);
    if (old) {
      URL.revokeObjectURL(old);
      objectUrls.delete(path);
    }
  }

  async function novaPreview(path, img, statusNode, metaNode) {
    if (!window.NovaSparx?.resolve || !window.NovaSparxRenderer?.render) {
      throw new Error("NovaSparx engine did not load.");
    }

    statusNode.textContent = "NovaSparx: resolving mesh + materials...";
    const manifest = await window.NovaSparx.resolve(path);

    statusNode.textContent = manifest.geometry.uv0
      ? "NovaSparx: rendering textured 2D preview..."
      : "NovaSparx: rendering geometry preview...";

    const result = await window.NovaSparxRenderer.render(manifest);

    release(path);
    const url = URL.createObjectURL(result.blob);
    objectUrls.set(path, url);

    img.src = url;
    img.hidden = false;
    statusNode.hidden = true;

    if (metaNode) {
      const quality = result.textured
        ? (result.normalMapped ? "Textured + Normal Map" : "Textured")
        : "Geometry";

      metaNode.textContent =
        `NovaSparx • ${quality} • ${result.width}×${result.height} • ` +
        `${result.vertexCount.toLocaleString()} vertices • ` +
        `${result.triangleCount.toLocaleString()} triangles • ` +
        `${result.materialCount} material(s) • ${manifest.source}`;
      metaNode.hidden = false;
    }
  }

  function close(button, panel) {
    panel.hidden = true;
    button.textContent = t("viewImage", "View Image");
  }

  async function handle(button) {
    const card = button.closest(".tool-card");
    const panel = card?.querySelector(".mesh-image-panel");
    const statusNode = panel?.querySelector(".mesh-image-status");
    const metaNode = panel?.querySelector(".mesh-image-meta");
    const img = panel?.querySelector(".mesh-preview-image");
    const path = String(button.dataset.imagePath || "").trim();

    if (!card || !panel || !statusNode || !img || !path) return;

    if (!panel.hidden) {
      close(button, panel);
      return;
    }

    const jsonPanel = card.querySelector(".json-panel");
    if (jsonPanel) jsonPanel.hidden = true;

    panel.hidden = false;
    button.textContent = t("hideImage", "Hide Image");
    button.disabled = true;

    img.hidden = true;
    img.removeAttribute("src");
    statusNode.hidden = false;
    statusNode.textContent = "Searching image sources...";

    if (metaNode) {
      metaNode.hidden = true;
      metaNode.textContent = "";
    }

    try {
      // Stage 1: existing Epic/Dilly/texture/icon image pipeline.
      let loaded = await loadImage(img, imageUrl(path));

      if (loaded) {
        statusNode.hidden = true;
        img.hidden = false;
        if (metaNode) {
          metaNode.textContent = "Direct image • FNAA image resolver";
          metaNode.hidden = false;
        }
        return;
      }

      const check = await status(path);

      if (check.state === "ready") {
        loaded = await loadImage(img, imageUrl(path, true));
        if (loaded) {
          statusNode.hidden = true;
          img.hidden = false;
          if (metaNode) {
            metaNode.textContent =
              `${check.source || "FNAA image"}${check.resolvedPath ? ` • ${check.resolvedPath}` : ""}`;
            metaNode.hidden = false;
          }
          return;
        }
      }

      // Stage 2: NovaSparx universal mesh resolver.
      const likelyMesh =
        check.assetType === "StaticMesh" ||
        check.assetType === "SkeletalMesh" ||
        /^StaticMesh'/i.test(path) ||
        /^SkeletalMesh'/i.test(path) ||
        /(^|[/._-])(sm_|sk_)/i.test(path) ||
        /\/(meshes?|staticmeshes?|skeletalmeshes?)\//i.test(path);

      if (!likelyMesh && check.state === "missing") {
        statusNode.textContent = t("imageUnavailable", "No Image found\nError 404");
        return;
      }

      await novaPreview(path, img, statusNode, metaNode);
      button.dataset.imageState = "novasparx";
    } catch (error) {
      img.hidden = true;
      img.removeAttribute("src");
      statusNode.hidden = false;

      if (error?.code === "NOVA_MISSING") {
        const chain = Array.isArray(error?.details?.sourceChain)
          ? error.details.sourceChain.join(" → ")
          : "";
        statusNode.textContent =
          "NovaSparx couldn't get renderable mesh data for this asset yet." +
          (chain ? `\nTried: ${chain}` : "");
      } else {
        statusNode.textContent =
          error?.message || "NovaSparx preview failed.";
      }

      if (metaNode) {
        metaNode.hidden = true;
        metaNode.textContent = "";
      }

      console.warn("NovaSparx View Image V7:", error);
    } finally {
      button.disabled = false;
      if (!panel.hidden) button.textContent = t("hideImage", "Hide Image");
    }
  }

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

  window.addEventListener("pagehide", () => {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
  });

  console.info("NovaSparx View Image V7 loaded.");
})();
