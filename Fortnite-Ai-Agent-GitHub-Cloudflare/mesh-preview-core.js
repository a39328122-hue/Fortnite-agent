(() => {
  "use strict";

  const MAX_VERTICES = 250000;
  const MAX_INDICES = 750000;
  const DEFAULT_SIZE = 640;

  function finiteNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizePositions(raw) {
    if (!Array.isArray(raw) && !ArrayBuffer.isView(raw)) {
      throw new Error("Geometry positions are missing.");
    }

    const source = ArrayBuffer.isView(raw) ? Array.from(raw) : raw;
    const out = [];

    if (!source.length) throw new Error("Geometry positions are empty.");

    if (typeof source[0] === "number") {
      for (let i = 0; i + 2 < source.length; i += 3) {
        const x = finiteNumber(source[i]);
        const y = finiteNumber(source[i + 1]);
        const z = finiteNumber(source[i + 2]);
        if (x === null || y === null || z === null) continue;
        out.push(x, y, z);
        if (out.length / 3 > MAX_VERTICES) throw new Error("StaticMesh has too many vertices for mobile preview.");
      }
      return new Float32Array(out);
    }

    for (const item of source) {
      let x, y, z;

      if (Array.isArray(item)) {
        [x, y, z] = item;
      } else if (item && typeof item === "object") {
        const pos = item.position ?? item.Position ?? item.vertex ?? item.Vertex ?? item;
        x = pos.x ?? pos.X ?? pos[0];
        y = pos.y ?? pos.Y ?? pos[1];
        z = pos.z ?? pos.Z ?? pos[2];
      } else {
        continue;
      }

      x = finiteNumber(x);
      y = finiteNumber(y);
      z = finiteNumber(z);
      if (x === null || y === null || z === null) continue;

      out.push(x, y, z);
      if (out.length / 3 > MAX_VERTICES) throw new Error("StaticMesh has too many vertices for mobile preview.");
    }

    if (out.length < 9) throw new Error("Not enough valid vertex data.");
    return new Float32Array(out);
  }

  function normalizeIndices(raw, vertexCount) {
    if (!Array.isArray(raw) && !ArrayBuffer.isView(raw)) {
      // Some geometry providers may send already-expanded triangles.
      if (vertexCount % 3 === 0) {
        const generated = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) generated[i] = i;
        return generated;
      }
      throw new Error("Geometry indices are missing.");
    }

    const source = ArrayBuffer.isView(raw) ? Array.from(raw) : raw;
    const out = [];

    if (!source.length) throw new Error("Geometry indices are empty.");

    if (typeof source[0] === "number") {
      for (const value of source) {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n >= vertexCount) continue;
        out.push(n);
        if (out.length > MAX_INDICES) throw new Error("StaticMesh has too many triangles for mobile preview.");
      }
    } else {
      for (const item of source) {
        let tri = null;

        if (Array.isArray(item) && item.length >= 3) {
          tri = [item[0], item[1], item[2]];
        } else if (item && typeof item === "object") {
          tri = [
            item.a ?? item.A ?? item.i0 ?? item.I0 ?? item.x ?? item.X,
            item.b ?? item.B ?? item.i1 ?? item.I1 ?? item.y ?? item.Y,
            item.c ?? item.C ?? item.i2 ?? item.I2 ?? item.z ?? item.Z,
          ];
        }

        if (!tri) continue;
        const nums = tri.map(Number);
        if (nums.every((n) => Number.isInteger(n) && n >= 0 && n < vertexCount)) {
          out.push(nums[0], nums[1], nums[2]);
          if (out.length > MAX_INDICES) throw new Error("StaticMesh has too many triangles for mobile preview.");
        }
      }
    }

    // Keep only complete triangles.
    out.length -= out.length % 3;
    if (out.length < 3) throw new Error("No valid triangles were found.");
    return new Uint32Array(out);
  }

  function calculateNormals(positions, indices) {
    const normals = new Float32Array(positions.length);

    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i] * 3;
      const ib = indices[i + 1] * 3;
      const ic = indices[i + 2] * 3;

      const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
      const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
      const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
      normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
      normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
    }

    for (let i = 0; i < normals.length; i += 3) {
      const x = normals[i], y = normals[i + 1], z = normals[i + 2];
      const len = Math.hypot(x, y, z) || 1;
      normals[i] = x / len;
      normals[i + 1] = y / len;
      normals[i + 2] = z / len;
    }

    return normals;
  }

  function boundsOf(positions) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const sx = Math.max(1e-6, maxX - minX);
    const sy = Math.max(1e-6, maxY - minY);
    const sz = Math.max(1e-6, maxZ - minZ);
    const radius = Math.max(1e-6, Math.hypot(sx, sy, sz) * 0.5);

    return { minX, minY, minZ, maxX, maxY, maxZ, cx, cy, cz, sx, sy, sz, radius };
  }

  function mat4Identity() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  }

  function mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  function mat4Translation(x, y, z) {
    const m = mat4Identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  }

  function mat4Scale(s) {
    const m = mat4Identity();
    m[0] = m[5] = m[10] = s;
    return m;
  }

  function mat4RotationX(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
  }

  function mat4RotationZ(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]);
  }

  function mat4LookAt(eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1
    ]);
  }

  function mat4Ortho(left, right, bottom, top, near, far) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    return new Float32Array([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, 2 * nf, 0,
      (left + right) * lr,
      (top + bottom) * bt,
      (far + near) * nf,
      1
    ]);
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || "Shader compile failed.";
      gl.deleteShader(shader);
      throw new Error(error);
    }

    return shader;
  }

  function createProgram(gl) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      uniform mat4 uMVP;
      uniform mat4 uModel;
      varying vec3 vNormal;

      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
        vNormal = mat3(uModel) * aNormal;
      }
    `);

    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vNormal;
      uniform vec3 uLightDir;

      void main() {
        vec3 n = normalize(vNormal);
        float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
        float rim = pow(1.0 - abs(n.z), 2.0) * 0.10;
        float light = 0.30 + diffuse * 0.62 + rim;
        vec3 base = vec3(0.72, 0.75, 0.79);
        gl_FragColor = vec4(base * light, 1.0);
      }
    `);

    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program) || "Shader link failed.";
      gl.deleteProgram(program);
      throw new Error(error);
    }

    return program;
  }

  async function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Couldn't create preview image.")), "image/png");
    });
  }

  async function renderToBlob(rawGeometry, options = {}) {
    const positions = normalizePositions(rawGeometry?.positions ?? rawGeometry?.vertices);
    const vertexCount = positions.length / 3;
    const indices = normalizeIndices(rawGeometry?.indices ?? rawGeometry?.triangles, vertexCount);

    let normals = null;
    try {
      if (rawGeometry?.normals) {
        const n = normalizePositions(rawGeometry.normals);
        if (n.length === positions.length) normals = n;
      }
    } catch {}
    if (!normals) normals = calculateNormals(positions, indices);

    const size = Math.max(256, Math.min(1024, Number(options.size) || DEFAULT_SIZE));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      depth: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance"
    }) || canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    });

    if (!gl) throw new Error("WebGL is not available on this device.");

    const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const uint32Ext = isWebGL2 ? true : gl.getExtension("OES_element_index_uint");

    let drawPositions = positions;
    let drawNormals = normals;
    let drawIndices = indices;
    let indexType = gl.UNSIGNED_INT;

    if (!uint32Ext) {
      if (vertexCount <= 65535) {
        drawIndices = new Uint16Array(indices);
        indexType = gl.UNSIGNED_SHORT;
      } else {
        // Expand triangles to avoid requiring 32-bit element indices on old WebGL1 devices.
        const expandedPos = new Float32Array(indices.length * 3);
        const expandedNorm = new Float32Array(indices.length * 3);

        for (let i = 0; i < indices.length; i++) {
          const src = indices[i] * 3;
          const dst = i * 3;
          expandedPos[dst] = positions[src];
          expandedPos[dst + 1] = positions[src + 1];
          expandedPos[dst + 2] = positions[src + 2];
          expandedNorm[dst] = normals[src];
          expandedNorm[dst + 1] = normals[src + 1];
          expandedNorm[dst + 2] = normals[src + 2];
        }

        drawPositions = expandedPos;
        drawNormals = expandedNorm;
        drawIndices = null;
      }
    }

    const bounds = boundsOf(positions);

    // Normalize around origin. Fortnite meshes are typically Z-up, so rotate into a clean icon angle.
    const translate = mat4Translation(-bounds.cx, -bounds.cy, -bounds.cz);
    const scale = mat4Scale(1 / bounds.radius);
    const rotZ = mat4RotationZ(-35 * Math.PI / 180);
    const rotX = mat4RotationX(67 * Math.PI / 180);

    let model = mat4Multiply(scale, translate);
    model = mat4Multiply(rotZ, model);
    model = mat4Multiply(rotX, model);

    const eye = [2.15, 1.55, 2.25];
    const view = mat4LookAt(eye, [0, 0, 0], [0, 0, 1]);
    const projection = mat4Ortho(-1.18, 1.18, -1.18, 1.18, 0.01, 20);
    const mvp = mat4Multiply(projection, mat4Multiply(view, model));

    const program = createProgram(gl);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, drawPositions, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, drawNormals, gl.STATIC_DRAW);

    const aNormal = gl.getAttribLocation(program, "aNormal");
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

    if (drawIndices) {
      const indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, drawIndices, gl.STATIC_DRAW);
    }

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uModel"), false, model);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uMVP"), false, mvp);
    gl.uniform3f(gl.getUniformLocation(program, "uLightDir"), 0.45, -0.35, 0.82);

    gl.viewport(0, 0, size, size);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    // Draw two-sided. Fortnite assets are not guaranteed to use one winding order
    // across every exported geometry source, and a preview must never render blank.
    gl.disable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (drawIndices) {
      gl.drawElements(gl.TRIANGLES, drawIndices.length, indexType, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, drawPositions.length / 3);
    }

    gl.finish();
    const blob = await canvasToBlob(canvas);

    // Release GPU objects immediately after the one-frame render.
    gl.useProgram(null);
    gl.deleteProgram(program);
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(normalBuffer);

    return {
      blob,
      width: size,
      height: size,
      vertexCount,
      triangleCount: indices.length / 3,
      bounds
    };
  }

  window.FNAAMeshPreview = Object.freeze({
    renderToBlob,
    normalizePositions,
    normalizeIndices,
    version: "1.0.0"
  });

  console.info("FNAA StaticMesh 2D Preview Core loaded.");
})();
