(() => {
  "use strict";

  const API =
    "https://fortnite-ai-agent-api.a39328122.workers.dev";

  const SITE =
    "https://a39328122-hue.github.io/Fortnite-agent/";

  const database = Object.freeze({
    manifest: "./database/index-v1/manifest.json",

    raw: "./database/fortnite_assets.gz",
    newRaw: "./database/fortnite_assets_new.gz",

    // Legacy indexes stay available while the 1.0 frontend is rolled out.
    all: "./database/index/all.txt.gz",
    sm: "./database/index/sm.txt.gz",
    m: "./database/index/m.txt.gz",
    meshes: "./database/index/meshes.txt.gz",
    new: "./database/index/new.txt.gz",
    json: "./database/index/json-references.txt.gz",

    ids: "./database/id.json",
    devices: "./database/devicemeshs.json"
  });

  const routes = Object.freeze({
    chat: "/Main/Chat",
    paths: "/ManualSearch/Paths",
    assets: "/ManualSearch/Assets",
    settings: "/Settings"
  });

  window.FNAA_CONFIG = Object.freeze({
    version: "1.0.0",
    fortniteVersion: "42.00",
    apiEndpoint: API,
    siteUrl: SITE,
    siteBasePath: "/Fortnite-agent/",
    routes,
    database
  });

  // Compatibility names used by the current frontend during the clean 1.0
  // replacement sequence.
  window.FORTNITE_AI_API_ENDPOINT = API;
  window.FORTNITE_AI_DB = database;
})();
