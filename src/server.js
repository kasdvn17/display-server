"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

// The runtime is split by domain but compiled as one CommonJS module. This
// preserves the existing shared caches and service lifecycle without exposing
// them as globals or introducing circular imports between route groups.
const SERVER_PARTS = [
  "runtime-core.js",
  "calendar.js",
  "ambient-context.js",
  "routines-notifications.js",
  "camera.js",
  "alarms.js",
  "remote-control.js",
  "immich-curator.js",
  "spotify.js",
  "lyrics.js",
  "news-static.js",
  "gemini-live.js",
  "dynamic-ui-routes.js",
];

const partsDirectory = path.join(__dirname, "server");
const runtimeSource = SERVER_PARTS.map((filename) =>
  fs.readFileSync(path.join(partsDirectory, filename), "utf8"),
).join("\n");
const runtimeFilename = path.join(__dirname, "server.runtime.js");
const runtimeModule = new Module(runtimeFilename, module);

runtimeModule.filename = runtimeFilename;
runtimeModule.paths = module.paths.slice();
runtimeModule._compile(runtimeSource, runtimeFilename);

module.exports = runtimeModule.exports;
