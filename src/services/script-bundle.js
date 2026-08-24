"use strict";

const fs = require("fs");
const path = require("path");

const INDEX_SCRIPT_FILES = [
  "core.js",
  "today.js",
  "camera.js",
  "photos.js",
  "news.js",
  "clock.js",
  "navigation.js",
  "gestures.js",
  "alarms-remote.js",
  "spotify.js",
  "assistant.js",
  "bootstrap.js",
];

function buildIndexScriptBundle(projectRoot) {
  const directory = path.join(projectRoot, "public", "js", "index");
  return INDEX_SCRIPT_FILES.map((filename) => {
    const source = fs.readFileSync(path.join(directory, filename), "utf8");
    return `/* ${filename} */\n${source.trim()}\n`;
  }).join("\n");
}

module.exports = { buildIndexScriptBundle, INDEX_SCRIPT_FILES };
