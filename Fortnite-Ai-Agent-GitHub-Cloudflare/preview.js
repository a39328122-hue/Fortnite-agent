(() => {
  "use strict";

  const API = String(window.FORTNITE_AI_API_ENDPOINT || "").trim().replace(/\/+$/, "");
  const objectUrls = new Map();

  const t = (key, fallback = "") => window.FortniteI18n?.t?.(key) || fallback || key;

  function release(path) {
    const old = objectUrls.get(path);
    if (!old) return;
    URL.revokeObjectURL(old);
    objectUrls.delete(path);
  }

  function endpoint(route, path, retry = false) {
    if (!API || !path) return "";
    const url = new URL(`${API}${route}`);
    url.searchParams.set("path", String(path).trim());
    if (retry) url.searchParams.set("retry", String(Date.now()));
    return url.toString();
  }

  function loadImage(img, url, timeoutMs = 18000) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);

      let finished = false;
      const done = (ok) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(ok);
      };

      const timer = setTimeout(() => done(false), timeoutMs);
      img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0);
      img.onerror = () => done(false);
      img.src = url;
    });
  }

  async function inspect(path) {
    try {
      return await window.NovaSparx?.inspect?.(path);
    } catch {
      return null;
    }
  }

  function assetType(info, path) {
    const explicit = String(info?.assetType || info?.type || "").toLowerCase();
    if (explicit) return explicit;

    const name = String(path || "").split("/").pop().toLowerCase();
    if (/^(t_|icon_|ui_)/.test(name)) return "texture2d";
    if (/^(mi_|m_)/.test(name)) return "material";
    if (/^(ns_|ps_|vfx_)/.test(name)) return "niagara";
    if (/^sm_/.test(name)) return "staticmesh";
    if (/^sk_/.test(name)) return "skeletalmesh";
    return "";
  }

  function firstMaterialTexture(info) {
    const material = info?.material || info?.materials?.[0];
    if (!material) return "";

    return String(
      material.baseColorTexture || material.BaseColorTexture ||
      material.emissiveTexture || material.EmissiveTexture ||
      material.normalTexture || material.NormalTexture ||
      material.opacityTexture || material.OpacityTexture ||
      ""
    ).trim();
  }

  function setMeta(meta, text, fidelity = "") {
    if (!meta) return;
    meta.textContent = text || "";
    meta.hidden = !text;
    if (fidelity) meta.dataset.level = fidelity;
    else delete meta.dataset.level;
  }

  async function renderNovaMesh(path, img, status, meta) {
    if (!window.NovaSparx?.resolve) throw new Error("NovaSparx resolver is not loaded.");
    if (!window.NovaSparxRenderer?.render) throw new Error("NovaSparx renderer is not loaded.");

    status.textContent = "NovaSparx: resolving geometry and verified materials…";
    const manifest = await window.NovaSparx.resolve(path, { preferHQ: true });

    status.textContent = "NovaSparx: rendering preview…";
    const result = await window.NovaSparxRenderer.render(manifest);

    release(path);
    const url = URL.createObjectURL(result.blob);
    objectUrls.set(path, url);

    img.src = url;
    img.hidden = false;
    status.hidden = true;

    const fidelity = String(manifest?.metadata?.materialFidelity || "unknown");
    const quality = result.textured
      ? (result.normalMapped ? "Textured + normal map" : "Textured")
      : "Geometry";

    setMeta(
      meta,
      `NovaSparx 1.0 • ${quality} • material fidelity: ${fidelity} • ` +
      `${result.width}×${result.height} • ` +
      `${Number(result.vertexCount || 0).toLocaleString()} vertices • ` +
      `${Number(result.triangleCount || 0).toLocaleString()} triangles`,
      fidelity
    );
  }

  async function toggle(card, path, button) {
    path = String(path || "").trim();
    if (!card || !path) return;

    const panel = card.querySelector(".mesh-image-panel");
    const stage = panel?.querySelector(".mesh-image-stage");
    const status = panel?.querySelector(".mesh-image-status");
    const meta = panel?.querySelector(".mesh-image-meta");
    const img = panel?.querySelector(".mesh-preview-image");

    if (!panel || !stage || !status || !img) return;

    if (!panel.hidden) {
      panel.hidden = true;
      if (button) button.textContent = t("viewImage", "View Image");
      return;
    }

    card.querySelector(".json-panel")?.setAttribute("hidden", "");
    card.querySelector(".references-panel")?.setAttribute("hidden", "");

    panel.hidden = false;
    img.hidden = true;
    img.removeAttribute("src");
    status.hidden = false;
    status.textContent = "Finding the best verified preview…";
    setMeta(meta, "");

    if (button) {
      button.disabled = true;
      button.textContent = t("hideImage", "Hide Image");
    }

    try {
      // 1. Existing image resolver first: icons, thumbnails, UI and known rendered assets.
      if (await loadImage(img, endpoint("/image", path), 14000)) {
        img.hidden = false;
        status.hidden = true;
        setMeta(meta, "Direct asset image • FNAA resolver", "high");
        return;
      }

      // 2. Decode the asset itself as a Fortnite texture when possible.
      if (await loadImage(img, endpoint("/nova/texture", path), 26000)) {
        img.hidden = false;
        status.hidden = true;
        setMeta(meta, "Decoded Fortnite texture • NovaSparx 1.0", "high");
        return;
      }

      // 3. Inspect before deciding what fallback is technically honest.
      const info = await inspect(path);
      const type = assetType(info, path);

      if (type.includes("material")) {
        const texturePath = firstMaterialTexture(info);

        if (texturePath && await loadImage(img, endpoint("/nova/texture", texturePath), 26000)) {
          img.hidden = false;
          status.hidden = true;
          const fidelity = String(info?.materialFidelity || "partial");
          setMeta(meta, `Material preview from verified texture • fidelity: ${fidelity}`, fidelity);
          return;
        }

        status.textContent =
          "This material has no deterministic 2D texture preview yet. " +
          "Use Description or References for its verified material data.";
        setMeta(
          meta,
          info?.materialFidelity ? `Material fidelity: ${info.materialFidelity}` : "",
          String(info?.materialFidelity || "partial")
        );
        return;
      }

      if (/(niagara|particle|effect|vfx)/i.test(type)) {
        status.textContent =
          "This VFX asset does not have a deterministic still-image renderer yet. " +
          "Use Description to inspect verified emitters, materials and references.";
        return;
      }

      // 4. Mesh path: use NovaSparx geometry + real material evidence.
      await renderNovaMesh(path, img, status, meta);
    } catch (error) {
      img.hidden = true;
      img.removeAttribute("src");
      status.hidden = false;

      if (error?.code === "NOVA_MISSING") {
        status.textContent =
          "NovaSparx could not get a deterministic renderable preview for this asset yet. " +
          "Use Description for verified JSON/path analysis.";
      } else if (error?.name === "AbortError") {
        status.textContent = "Preview timed out. Try again.";
      } else {
        status.textContent = error?.message || t("imageUnavailable", "Preview unavailable.");
      }

      setMeta(meta, "");
      console.warn("FNAA preview:", error);
    } finally {
      if (button) {
        button.disabled = false;
        if (!panel.hidden) button.textContent = t("hideImage", "Hide Image");
      }
    }
  }

  window.addEventListener("pagehide", () => {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
  });

  window.FortnitePreview = Object.freeze({
    version: "1.0.0",
    toggle,
    release
  });
})();
