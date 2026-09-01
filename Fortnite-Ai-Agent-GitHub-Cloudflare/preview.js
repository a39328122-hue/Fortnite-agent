(() => {
  "use strict";

  const API = String(
    window.FNAA_CONFIG?.apiEndpoint ||
    window.FORTNITE_AI_API_ENDPOINT ||
    ""
  ).trim().replace(/\/+$/, "");

  const objectUrls = new Map();

  const t = (key, fallback = "") =>
    window.FortniteI18n?.t?.(key) ||
    fallback ||
    key;

  function release(path) {
    const key =
      String(path || "").trim();

    if (!key) return;

    const old =
      objectUrls.get(key);

    if (!old) return;

    URL.revokeObjectURL(old);
    objectUrls.delete(key);
  }

  function endpoint(
    route,
    path,
    retry = false
  ) {
    if (!API || !path) {
      return "";
    }

    const url =
      new URL(
        `${API}${route}`
      );

    url.searchParams.set(
      "path",
      String(path).trim()
    );

    if (retry) {
      url.searchParams.set(
        "retry",
        String(Date.now())
      );
    }

    return url.toString();
  }

  function loadImage(
    image,
    url,
    timeoutMs = 18_000
  ) {
    return new Promise(
      (resolve) => {
        if (!url) {
          resolve(false);
          return;
        }

        let finished = false;

        const done = (ok) => {
          if (finished) return;

          finished = true;

          clearTimeout(timer);

          image.onload = null;
          image.onerror = null;

          resolve(Boolean(ok));
        };

        const timer =
          setTimeout(
            () => done(false),
            timeoutMs
          );

        image.onload =
          () =>
            done(
              image.naturalWidth > 0 &&
              image.naturalHeight > 0
            );

        image.onerror =
          () => done(false);

        image.src = url;
      }
    );
  }

  async function inspect(path) {
    try {
      return (
        await window.NovaSparx
          ?.inspect?.(path)
      ) || null;
    } catch {
      return null;
    }
  }

  function assetType(
    info,
    path
  ) {
    const explicit =
      String(
        info?.assetType ||
        info?.type ||
        info?.objectType ||
        info?.className ||
        ""
      ).toLowerCase();

    if (explicit) {
      return explicit;
    }

    const name =
      String(path || "")
        .split("/")
        .pop()
        ?.split(".")[0]
        ?.toLowerCase() ||
      "";

    if (
      /^(t_|tex_|icon_|ui_)/.test(
        name
      )
    ) {
      return "texture2d";
    }

    if (
      /^(mi_|m_)/.test(
        name
      )
    ) {
      return "material";
    }

    if (
      /^(ns_|ps_|vfx_|fx_)/.test(
        name
      )
    ) {
      return "niagara";
    }

    if (
      /^sm_/.test(name)
    ) {
      return "staticmesh";
    }

    if (
      /^sk_/.test(name)
    ) {
      return "skeletalmesh";
    }

    return "";
  }

  function firstMaterial(
    info
  ) {
    if (
      info?.material &&
      typeof info.material ===
      "object"
    ) {
      return info.material;
    }

    if (
      Array.isArray(
        info?.materials
      ) &&
      info.materials.length
    ) {
      return info.materials[0];
    }

    if (
      Array.isArray(
        info?.Materials
      ) &&
      info.Materials.length
    ) {
      return info.Materials[0];
    }

    return null;
  }

  function firstMaterialTexture(
    info
  ) {
    const material =
      firstMaterial(info);

    if (!material) {
      return "";
    }

    for (
      const key of [
        "baseColorTexture",
        "BaseColorTexture",

        "diffuseTexture",
        "DiffuseTexture",

        "emissiveTexture",
        "EmissiveTexture",

        "normalTexture",
        "NormalTexture",

        "opacityTexture",
        "OpacityTexture",

        "packedTexture",
        "PackedTexture"
      ]
    ) {
      const value =
        material[key];

      if (
        typeof value ===
          "string" &&
        value.trim()
      ) {
        return value.trim();
      }
    }

    return "";
  }

  function materialFidelity(
    info
  ) {
    return String(
      info?.materialFidelity ||
      info?.MaterialFidelity ||
      firstMaterial(info)
        ?.fidelity ||
      firstMaterial(info)
        ?.Fidelity ||
      "unknown"
    ).toLowerCase();
  }

  function setMeta(
    meta,
    text,
    fidelity = ""
  ) {
    if (!meta) return;

    meta.textContent =
      text || "";

    meta.hidden =
      !text;

    if (fidelity) {
      meta.dataset.level =
        fidelity;
    } else {
      delete meta.dataset.level;
    }
  }

  function setStatus(
    status,
    text,
    state = ""
  ) {
    status.hidden =
      false;

    status.textContent =
      String(text || "");

    if (state) {
      status.dataset.state =
        state;
    } else {
      delete status.dataset.state;
    }
  }

  function createHostUi(
    host
  ) {
    host.innerHTML = `
      <div class="mesh-image-panel fnaa-preview-panel">
        <div class="mesh-image-panel-head">
          <span>PREVIEW</span>
          <span class="fnaa-preview-engine">
            NovaSparx 1.0
          </span>
        </div>

        <div class="mesh-image-stage">
          <div
            class="mesh-image-status"
            aria-live="polite"
          ></div>

          <img
            class="mesh-preview-image"
            alt=""
            decoding="async"
            hidden
          />
        </div>

        <div
          class="mesh-image-meta"
          hidden
        ></div>
      </div>`;

    return {
      hostMode: true,
      panel:
        host.querySelector(
          ".mesh-image-panel"
        ),

      stage:
        host.querySelector(
          ".mesh-image-stage"
        ),

      status:
        host.querySelector(
          ".mesh-image-status"
        ),

      meta:
        host.querySelector(
          ".mesh-image-meta"
        ),

      image:
        host.querySelector(
          ".mesh-preview-image"
        )
    };
  }

  function resolveUi(
    target
  ) {
    if (!target) {
      return null;
    }

    const existingPanel =
      target.matches?.(
        ".mesh-image-panel"
      )
        ? target
        : target.querySelector?.(
            ".mesh-image-panel"
          );

    if (existingPanel) {
      return {
        hostMode: false,
        panel:
          existingPanel,

        stage:
          existingPanel.querySelector(
            ".mesh-image-stage"
          ),

        status:
          existingPanel.querySelector(
            ".mesh-image-status"
          ),

        meta:
          existingPanel.querySelector(
            ".mesh-image-meta"
          ),

        image:
          existingPanel.querySelector(
            ".mesh-preview-image"
          )
      };
    }

    return createHostUi(
      target
    );
  }

  function resetUi(
    ui
  ) {
    if (
      !ui?.panel ||
      !ui?.status ||
      !ui?.image
    ) {
      return;
    }

    ui.panel.hidden = false;

    ui.image.hidden = true;

    ui.image.removeAttribute(
      "src"
    );

    setStatus(
      ui.status,
      "Finding the best verified preview…"
    );

    setMeta(
      ui.meta,
      ""
    );
  }

  async function renderNovaMesh(
    path,
    image,
    status,
    meta
  ) {
    if (
      !window.NovaSparx
        ?.resolve
    ) {
      throw new Error(
        "NovaSparx resolver is not loaded."
      );
    }

    if (
      !window.NovaSparxRenderer
        ?.render
    ) {
      throw new Error(
        "NovaSparx renderer is not loaded."
      );
    }

    setStatus(
      status,
      "NovaSparx: resolving geometry and verified materials…"
    );

    const manifest =
      await window.NovaSparx
        .resolve(
          path,
          {
            preferHQ: true
          }
        );

    setStatus(
      status,
      "NovaSparx: rendering preview…"
    );

    const result =
      await window.NovaSparxRenderer
        .render(manifest);

    release(path);

    const url =
      URL.createObjectURL(
        result.blob
      );

    objectUrls.set(
      path,
      url
    );

    image.src = url;
    image.hidden = false;

    status.hidden = true;

    const fidelity =
      String(
        manifest?.metadata
          ?.materialFidelity ||
        "unknown"
      ).toLowerCase();

    const quality =
      result.textured
        ? (
            result.normalMapped
              ? "Textured + normal map"
              : "Textured"
          )
        : "Geometry";

    setMeta(
      meta,
      (
        `NovaSparx 1.0 • ${quality} • ` +
        `material fidelity: ${fidelity} • ` +
        `${result.width}×${result.height} • ` +
        `${Number(
          result.vertexCount || 0
        ).toLocaleString()} vertices • ` +
        `${Number(
          result.triangleCount || 0
        ).toLocaleString()} triangles`
      ),
      fidelity
    );
  }

  async function tryDirectAssetImage(
    path,
    ui
  ) {
    setStatus(
      ui.status,
      "Checking verified asset image…"
    );

    const ok =
      await loadImage(
        ui.image,
        endpoint(
          "/image",
          path
        ),
        14_000
      );

    if (!ok) {
      ui.image
        .removeAttribute(
          "src"
        );

      return false;
    }

    ui.image.hidden = false;
    ui.status.hidden = true;

    setMeta(
      ui.meta,
      "Direct verified asset image • FNAA resolver",
      "high"
    );

    return true;
  }

  async function tryTextureDecode(
    path,
    ui,
    label =
      "Decoded Fortnite texture • NovaSparx 1.0"
  ) {
    setStatus(
      ui.status,
      "NovaSparx: decoding texture…"
    );

    const ok =
      await loadImage(
        ui.image,
        endpoint(
          "/nova/texture",
          path
        ),
        26_000
      );

    if (!ok) {
      ui.image
        .removeAttribute(
          "src"
        );

      return false;
    }

    ui.image.hidden = false;
    ui.status.hidden = true;

    setMeta(
      ui.meta,
      label,
      "high"
    );

    return true;
  }

  async function renderMaterial(
    path,
    info,
    ui
  ) {
    const texturePath =
      firstMaterialTexture(
        info
      );

    const fidelity =
      materialFidelity(
        info
      );

    if (
      texturePath &&
      await tryTextureDecode(
        texturePath,
        ui,
        `Material preview from verified texture • fidelity: ${fidelity}`
      )
    ) {
      setMeta(
        ui.meta,
        `Material preview from verified texture • fidelity: ${fidelity}`,
        fidelity
      );

      return true;
    }

    setStatus(
      ui.status,
      (
        "This material does not have a deterministic 2D texture preview yet. " +
        "Use Description or References for its verified material data."
      ),
      "partial"
    );

    setMeta(
      ui.meta,
      fidelity !== "unknown"
        ? `Material fidelity: ${fidelity}`
        : "",
      fidelity
    );

    return true;
  }

  function renderVfxInfo(
    info,
    ui
  ) {
    const refs =
      Array.isArray(
        info?.references
      )
        ? info.references.length
        : Array.isArray(
            info?.References
          )
          ? info.References.length
          : 0;

    setStatus(
      ui.status,
      (
        "This VFX asset does not have a deterministic still-image renderer yet. " +
        "Use Description to inspect verified emitters, materials and references."
      ),
      "metadata"
    );

    if (refs) {
      setMeta(
        ui.meta,
        `${refs} verified reference${refs === 1 ? "" : "s"} available`,
        "partial"
      );
    }

    return true;
  }

  async function renderPreview(
    target,
    path,
    button
  ) {
    const clean =
      String(path || "")
        .trim();

    if (!target || !clean) {
      return {
        state: "error",
        error:
          "Missing preview target or asset path."
      };
    }

    const ui =
      resolveUi(target);

    if (
      !ui?.panel ||
      !ui?.stage ||
      !ui?.status ||
      !ui?.image
    ) {
      return {
        state: "error",
        error:
          "Preview UI could not be created."
      };
    }

    // Legacy card mode can still behave as a toggle. New FNAA 1.0 host mode
    // always renders because tools.js owns the outer panel visibility.
    if (
      !ui.hostMode &&
      !ui.panel.hidden
    ) {
      ui.panel.hidden = true;

      if (button) {
        button.textContent =
          t(
            "viewImage",
            "Preview"
          );
      }

      return {
        state: "hidden"
      };
    }

    resetUi(ui);

    if (button) {
      button.disabled = true;
      button.textContent =
        t(
          "hideImage",
          "Hide Preview"
        );
    }

    try {
      // 1) Existing direct image resolver: icons/UI/known deterministic images.
      if (
        await tryDirectAssetImage(
          clean,
          ui
        )
      ) {
        return {
          state: "ready",
          kind: "image"
        };
      }

      // 2) The asset itself may be a real UTexture.
      if (
        await tryTextureDecode(
          clean,
          ui
        )
      ) {
        return {
          state: "ready",
          kind: "texture"
        };
      }

      // 3) Inspect before deciding what preview is technically honest.
      const info =
        await inspect(clean);

      const type =
        assetType(
          info,
          clean
        );

      if (
        type.includes(
          "material"
        )
      ) {
        await renderMaterial(
          clean,
          info,
          ui
        );

        return {
          state: "ready",
          kind: "material",
          inspection: info
        };
      }

      if (
        /(niagara|particle|effect|vfx)/i
          .test(type)
      ) {
        renderVfxInfo(
          info,
          ui
        );

        return {
          state: "ready",
          kind: "vfx",
          inspection: info
        };
      }

      if (
        /(staticmesh|skeletalmesh|mesh)/i
          .test(type) ||
        /^s[mk]_?/i.test(
          clean
            .split("/")
            .pop() ||
          ""
        )
      ) {
        await renderNovaMesh(
          clean,
          ui.image,
          ui.status,
          ui.meta
        );

        return {
          state: "ready",
          kind: "mesh",
          inspection: info
        };
      }

      // 4) Unknown type: make one geometry attempt. If NovaSparx says the asset
      // is not renderable, we fall back to honest metadata-only text.
      try {
        await renderNovaMesh(
          clean,
          ui.image,
          ui.status,
          ui.meta
        );

        return {
          state: "ready",
          kind: "mesh",
          inspection: info
        };
      } catch (error) {
        if (
          error?.code !==
            "NOVA_MISSING" &&
          !/geometry|renderable|mesh/i
            .test(
              String(
                error?.message ||
                ""
              )
            )
        ) {
          throw error;
        }
      }

      setStatus(
        ui.status,
        (
          "No deterministic visual preview is available for this asset yet. " +
          "Use Description or References for verified data."
        ),
        "metadata"
      );

      return {
        state: "metadata",
        kind:
          type || "unknown",
        inspection: info
      };
    } catch (error) {
      ui.image.hidden = true;

      ui.image
        .removeAttribute(
          "src"
        );

      if (
        error?.code ===
        "NOVA_MISSING"
      ) {
        setStatus(
          ui.status,
          (
            "NovaSparx could not get a deterministic renderable preview for this asset yet. " +
            "Use Description for verified data."
          ),
          "missing"
        );
      } else if (
        error?.name ===
        "AbortError"
      ) {
        setStatus(
          ui.status,
          "Preview timed out. Try again.",
          "error"
        );
      } else {
        setStatus(
          ui.status,
          error?.message ||
          t(
            "imageUnavailable",
            "Preview unavailable."
          ),
          "error"
        );
      }

      setMeta(
        ui.meta,
        ""
      );

      console.warn(
        "FNAA preview:",
        error
      );

      return {
        state: "error",
        error:
          error?.message ||
          String(error)
      };
    } finally {
      if (button) {
        button.disabled = false;

        if (
          !ui.panel.hidden
        ) {
          button.textContent =
            t(
              "hideImage",
              "Hide Preview"
            );
        }
      }
    }
  }

  async function toggle(
    target,
    path,
    button
  ) {
    return renderPreview(
      target,
      path,
      button
    );
  }

  window.addEventListener(
    "pagehide",
    () => {
      for (
        const url of
        objectUrls.values()
      ) {
        URL.revokeObjectURL(
          url
        );
      }

      objectUrls.clear();
    }
  );

  window.FortnitePreview =
    Object.freeze({
      version: "1.0.1",
      toggle,
      render: renderPreview,
      release
    });
})();
