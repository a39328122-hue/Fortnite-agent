(() => {
  "use strict";

  const API =
    "https://fortnite-ai-agent-api.a39328122.workers.dev";

  const SITE =
    "https://a39328122-hue.github.io/Fortnite-agent/";

  const BASE =
    "/Fortnite-agent/";

  // A <base> keeps every relative asset/database URL stable even after
  // history.pushState moves the SPA to /Main/Chat, /Settings, etc.
  let base =
    document.head.querySelector(
      "base[data-fnaa-base]"
    );

  if (!base) {
    base =
      document.createElement("base");

    base.dataset.fnaaBase = "1";

    document.head.insertBefore(
      base,
      document.head.firstChild
    );
  }

  base.href = BASE;

  const database = Object.freeze({
    manifest:
      `${BASE}database/index-v1/manifest.json`,

    raw:
      `${BASE}database/fortnite_assets.gz`,

    newRaw:
      `${BASE}database/fortnite_assets_new.gz`,

    all:
      `${BASE}database/index/all.txt.gz`,

    sm:
      `${BASE}database/index/sm.txt.gz`,

    m:
      `${BASE}database/index/m.txt.gz`,

    meshes:
      `${BASE}database/index/meshes.txt.gz`,

    new:
      `${BASE}database/index/new.txt.gz`,

    json:
      `${BASE}database/index/json-references.txt.gz`,

    ids:
      `${BASE}database/id.json`,

    devices:
      `${BASE}database/devicemeshs.json`
  });

  const routes = Object.freeze({
    chat: "/Main/Chat",
    paths: "/ManualSearch/Paths",
    assets: "/ManualSearch/Assets",
    settings: "/Settings"
  });

  window.FNAA_CONFIG = Object.freeze({
    version: "1.0.1",
    fortniteVersion: "42.00",
    apiEndpoint: API,
    siteUrl: SITE,
    siteBasePath: BASE,
    routes,
    database
  });

  window.FORTNITE_AI_API_ENDPOINT =
    API;

  window.FORTNITE_AI_DB =
    database;

  // Load the 1.0.1 reliability/polish layer without requiring another
  // large app.js/tools.js replacement.
  const cssId =
    "fnaa-v101-css";

  if (
    !document.getElementById(
      cssId
    )
  ) {
    const link =
      document.createElement(
        "link"
      );

    link.id = cssId;
    link.rel =
      "stylesheet";
    link.href =
      `${BASE}fnaa-v101.css?v=101`;

    document.head.appendChild(
      link
    );
  }

  const scriptId =
    "fnaa-v101-js";

  if (
    !document.getElementById(
      scriptId
    )
  ) {
    const script =
      document.createElement(
        "script"
      );

    script.id =
      scriptId;

    script.src =
      `${BASE}fnaa-v101.js?v=101`;

    script.async = false;

    document.head.appendChild(
      script
    );
  }
})();
