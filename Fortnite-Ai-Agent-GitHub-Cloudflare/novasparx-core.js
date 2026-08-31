(() => {
  "use strict";

  const API_ENDPOINT = String(window.FORTNITE_AI_API_ENDPOINT || "")
    .trim()
    .replace(/\/+$/, "");

  const MAX_VERTICES = 700000;
  const MAX_INDICES = 2100000;
  const MAX_MATERIALS = 32;

  function cleanPath(input) {
    let value = String(input || "").trim().replace(/\\/g, "/");
    if (!value) return "";

    const classWrap = value.match(
      /^(?:StaticMesh|SkeletalMesh|Texture2D|Texture|Material|MaterialInstanceConstant|Object|BlueprintGeneratedClass)?'(.+)'$/i
    );
    if (classWrap?.[1]) value = classWrap[1];

    value = value.replace(/^["']|["']$/g, "");
    value = value.replace(/\.(?:uasset|uexp|ubulk)$/i, "");

    const slash = value.lastIndexOf("/");
    const dot = value.lastIndexOf(".");
    if (dot > slash) {
      const left = value.slice(0, dot);
      const objectName = value.slice(dot + 1).replace(/_C$/i, "");
      const packageName = left.slice(left.lastIndexOf("/") + 1);
      if (objectName.toLowerCase() === packageName.toLowerCase()) value = left;
    }

    if (/^FortniteGame\/Content\//i.test(value)) {
      value = "/Game/" + value.slice("FortniteGame/Content/".length);
    } else {
      const plugin = value.match(
        /^(?:FortniteGame\/)?Plugins\/(?:GameFeatures\/)?([^/]+)\/Content\/(.+)$/i
      );
      if (plugin) value = `/${plugin[1]}/${plugin[2]}`;
    }

    if (!value.startsWith("/") && value.includes("/")) value = "/" + value;
    return value.replace(/\/{2,}/g, "/");
  }

  function objectPath(input) {
    const clean = cleanPath(input);
    if (!clean) return "";
    const name = clean.split("/").pop();
    return `${clean}.${name}`;
  }

  function filesystemPath(input) {
    const clean = cleanPath(input);
    if (!clean) return "";

    if (clean.startsWith("/Game/")) {
      return `FortniteGame/Content/${clean.slice(6)}.uasset`;
    }

    const parts = clean.replace(/^\//, "").split("/");
    if (parts.length > 1) {
      return `FortniteGame/Plugins/GameFeatures/${parts[0]}/Content/${parts.slice(1).join("/")}.uasset`;
    }

    return clean + ".uasset";
  }

  function aliases(input) {
    const out = [];
    const seen = new Set();

    const add = (value) => {
      value = String(value || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    };

    const clean = cleanPath(input);
    add(input);
    add(clean);
    add(objectPath(clean));
    add(filesystemPath(clean));

    if (clean) {
      add(`StaticMesh'${objectPath(clean)}'`);
      add(`Object'${objectPath(clean)}'`);
    }

    return out.slice(0, 12);
  }

  function finiteArray(raw, itemSize, maxItems) {
    if (!Array.isArray(raw) && !ArrayBuffer.isView(raw)) return null;
    const arr = ArrayBuffer.isView(raw) ? Array.from(raw) : raw;
    if (!arr.length || arr.length % itemSize !== 0) return null;

    const out = [];
    const limit = Math.min(arr.length, maxItems * itemSize);

    if (typeof arr[0] === "number") {
      for (let i = 0; i < limit; i++) {
        const n = Number(arr[i]);
        if (!Number.isFinite(n)) return null;
        out.push(n);
      }
      return out;
    }

    const names =
      itemSize === 2 ? [["x","X","u","U"],["y","Y","v","V"]] :
      itemSize === 4 ? [["x","X","r","R"],["y","Y","g","G"],["z","Z","b","B"],["w","W","a","A"]] :
      [["x","X"],["y","Y"],["z","Z"]];

    for (const item of arr) {
      if (!item || typeof item !== "object") return null;
      for (let c = 0; c < itemSize; c++) {
        let value;
        if (Array.isArray(item)) value = item[c];
        else {
          for (const name of names[c]) {
            if (item[name] !== undefined) {
              value = item[name];
              break;
            }
          }
        }
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        out.push(n);
      }
      if (out.length / itemSize >= maxItems) break;
    }

    return out;
  }

  function normalizeSections(raw, indexCount) {
    if (!Array.isArray(raw)) return [];
    const out = [];

    for (const item of raw.slice(0, 128)) {
      if (!item || typeof item !== "object") continue;

      const firstIndex = Math.max(
        0,
        Number(item.firstIndex ?? item.FirstIndex ?? item.baseIndex ?? item.BaseIndex ?? 0) || 0
      );

      let count = Number(
        item.indexCount ?? item.IndexCount ?? item.numIndices ?? item.NumIndices ?? 0
      ) || 0;

      if (!count) {
        const faces = Number(item.numFaces ?? item.NumFaces ?? item.triangleCount ?? item.TriangleCount ?? 0) || 0;
        count = faces * 3;
      }

      count = Math.max(0, Math.min(count, indexCount - firstIndex));
      count -= count % 3;
      if (count <= 0) continue;

      out.push({
        firstIndex,
        indexCount: count,
        materialIndex: Math.max(
          0,
          Number(item.materialIndex ?? item.MaterialIndex ?? item.material ?? item.Material ?? 0) || 0
        ),
        name: String(item.name ?? item.Name ?? item.materialName ?? item.MaterialName ?? "")
      });
    }

    return out;
  }

  function normalizeMaterial(item, index) {
    item = item && typeof item === "object" ? item : {};

    const color = item.baseColor ?? item.BaseColor ?? item.color ?? item.Color ?? [1,1,1,1];
    let baseColor = [1,1,1,1];

    if (Array.isArray(color)) {
      baseColor = [
        Number(color[0] ?? 1),
        Number(color[1] ?? 1),
        Number(color[2] ?? 1),
        Number(color[3] ?? 1)
      ];
    } else if (color && typeof color === "object") {
      baseColor = [
        Number(color.r ?? color.R ?? color.x ?? color.X ?? 1),
        Number(color.g ?? color.G ?? color.y ?? color.Y ?? 1),
        Number(color.b ?? color.B ?? color.z ?? color.Z ?? 1),
        Number(color.a ?? color.A ?? color.w ?? color.W ?? 1)
      ];
    }

    baseColor = baseColor.map((v, i) => Number.isFinite(v) ? Math.max(0, Math.min(i === 3 ? 1 : 8, v)) : 1);

    const texture = (name) => {
      const value = item[name];
      return typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
    };

    return {
      index,
      name: String(item.name ?? item.Name ?? `Material_${index}`),
      baseColor,
      baseColorTexture:
        texture("baseColorTexture") ||
        texture("albedoTexture") ||
        texture("diffuseTexture") ||
        texture("colorTexture"),
      normalTexture: texture("normalTexture"),
      emissiveTexture: texture("emissiveTexture"),
      opacityTexture:
        texture("opacityTexture") ||
        texture("maskTexture"),
      roughness: Math.max(0, Math.min(1, Number(item.roughness ?? item.Roughness ?? 0.62) || 0.62)),
      metallic: Math.max(0, Math.min(1, Number(item.metallic ?? item.Metallic ?? 0) || 0)),
      opacity: Math.max(0, Math.min(1, Number(item.opacity ?? item.Opacity ?? baseColor[3] ?? 1) || 1)),
      opacityMode: String(item.opacityMode ?? item.blendMode ?? item.BlendMode ?? "opaque").toLowerCase(),
      opacityCutoff: Math.max(0, Math.min(1, Number(item.opacityCutoff ?? item.maskClip ?? 0.333) || 0.333)),
      twoSided: Boolean(item.twoSided ?? item.TwoSided ?? item.isTwoSided ?? false),
      uvScale: Array.isArray(item.uvScale) ? [
        Number(item.uvScale[0] ?? 1) || 1,
        Number(item.uvScale[1] ?? 1) || 1
      ] : [1,1],
      uvOffset: Array.isArray(item.uvOffset) ? [
        Number(item.uvOffset[0] ?? 0) || 0,
        Number(item.uvOffset[1] ?? 0) || 0
      ] : [0,0]
    };
  }

  function normalizeManifest(data, requestedPath = "") {
    if (!data || typeof data !== "object") throw new Error("NovaSparx returned an empty manifest.");

    const manifest = data.manifest && typeof data.manifest === "object" ? data.manifest : data;
    const geometry = manifest.geometry && typeof manifest.geometry === "object"
      ? manifest.geometry
      : manifest;

    const positions = finiteArray(
      geometry.positions ?? geometry.vertices ?? geometry.Positions ?? geometry.Vertices,
      3,
      MAX_VERTICES
    );

    const indicesRaw = geometry.indices ?? geometry.triangles ?? geometry.Indices ?? geometry.Triangles;
    let indices = null;

    if (Array.isArray(indicesRaw) || ArrayBuffer.isView(indicesRaw)) {
      const flat = ArrayBuffer.isView(indicesRaw) ? Array.from(indicesRaw) : indicesRaw;
      if (flat.length && typeof flat[0] === "number") {
        indices = flat
          .slice(0, MAX_INDICES)
          .map(Number)
          .filter(Number.isInteger);
      } else if (flat.length) {
        indices = [];
        for (const tri of flat) {
          if (Array.isArray(tri) && tri.length >= 3) {
            indices.push(Number(tri[0]), Number(tri[1]), Number(tri[2]));
          } else if (tri && typeof tri === "object") {
            indices.push(
              Number(tri.a ?? tri.A ?? tri.x ?? tri.X ?? tri.i0 ?? tri.I0),
              Number(tri.b ?? tri.B ?? tri.y ?? tri.Y ?? tri.i1 ?? tri.I1),
              Number(tri.c ?? tri.C ?? tri.z ?? tri.Z ?? tri.i2 ?? tri.I2)
            );
          }
          if (indices.length >= MAX_INDICES) break;
        }
        indices = indices.filter(Number.isInteger);
      }
    }

    if (!positions || !indices || positions.length < 9 || indices.length < 3) {
      throw new Error("NovaSparx manifest does not contain usable geometry.");
    }

    indices.length -= indices.length % 3;
    const vertexCount = positions.length / 3;
    if (indices.some((i) => i < 0 || i >= vertexCount)) {
      throw new Error("NovaSparx geometry has invalid indices.");
    }

    const normals = finiteArray(geometry.normals ?? geometry.Normals, 3, MAX_VERTICES);
    const tangents = finiteArray(geometry.tangents ?? geometry.Tangents, 4, MAX_VERTICES);
    const uv0 = finiteArray(
      geometry.uv0 ?? geometry.uvs ?? geometry.UV0 ?? geometry.UVs,
      2,
      MAX_VERTICES
    );
    const colors = finiteArray(
      geometry.colors ?? geometry.vertexColors ?? geometry.Colors ?? geometry.VertexColors,
      4,
      MAX_VERTICES
    );

    const sections = normalizeSections(
      manifest.sections ?? geometry.sections ?? manifest.Sections ?? geometry.Sections,
      indices.length
    );

    const rawMaterials = Array.isArray(manifest.materials)
      ? manifest.materials
      : Array.isArray(geometry.materials)
      ? geometry.materials
      : [];

    const materials = rawMaterials
      .slice(0, MAX_MATERIALS)
      .map(normalizeMaterial);

    if (!materials.length) materials.push(normalizeMaterial({}, 0));

    return {
      schema: "novasparx.preview.v1",
      path: cleanPath(manifest.path ?? data.path ?? requestedPath),
      resolvedPath: String(manifest.resolvedPath ?? data.resolvedPath ?? ""),
      assetType: String(manifest.assetType ?? data.assetType ?? "StaticMesh"),
      source: String(manifest.source ?? data.source ?? "NovaSparx"),
      sourceChain: Array.isArray(data.sourceChain) ? data.sourceChain : [],
      quality: String(manifest.quality ?? data.quality ?? (uv0 ? "textured-capable" : "geometry")),
      geometry: {
        positions,
        indices,
        normals: normals && normals.length === positions.length ? normals : null,
        tangents: tangents && tangents.length / 4 === vertexCount ? tangents : null,
        uv0: uv0 && uv0.length / 2 === vertexCount ? uv0 : null,
        colors: colors && colors.length / 4 === vertexCount ? colors : null
      },
      sections,
      materials,
      metadata: {
        vertexCount,
        triangleCount: indices.length / 3,
        isNanite: Boolean(manifest.isNanite ?? geometry.isNanite ?? false),
        lod: Number(manifest.lod ?? geometry.lod ?? 0) || 0,
        backend: String(data.backend ?? "")
      }
    };
  }

  async function resolve(path, options = {}) {
    if (!API_ENDPOINT) throw new Error("FNAA API endpoint is not configured.");

    const url = new URL(`${API_ENDPOINT}/nova/resolve`);
    url.searchParams.set("path", String(path || "").trim());
    if (options.preferHQ !== false) url.searchParams.set("quality", "hq");

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: options.noCache ? "no-store" : "force-cache",
      headers: { Accept: "application/json" }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.state !== "ready") {
      const error = new Error(
        data?.error ||
        (response.status === 404
          ? "NovaSparx could not resolve renderable geometry for this asset."
          : `NovaSparx resolver returned HTTP ${response.status}.`)
      );
      error.code = data?.code || (response.status === 404 ? "NOVA_MISSING" : "NOVA_ERROR");
      error.details = data;
      throw error;
    }

    return normalizeManifest(data, path);
  }

  window.NovaSparx = Object.freeze({
    version: "0.1.0-alpha",
    resolve,
    normalizeManifest,
    cleanPath,
    objectPath,
    filesystemPath,
    aliases
  });

  console.info("NovaSparx Core 0.1 alpha loaded.");
})();
