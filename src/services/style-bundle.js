"use strict";

const fs = require("fs");
const path = require("path");

const INDEX_STYLE_FILES = [
  "01-foundation.css",
  "02-home.css",
  "03-today-and-news.css",
  "04-spotify-media.css",
  "05-alarms.css",
  "06-camera-and-idle.css",
  "07-assistant.css",
  "08-dynamic-ui.css",
  "09-final-polish.css",
  "10-motion.css",
];

function buildIndexStyleBundle(projectRoot) {
  const directory = path.join(projectRoot, "public", "css", "index");
  return INDEX_STYLE_FILES.map((name) => {
    const content = fs.readFileSync(path.join(directory, name), "utf8");
    return `/* ${name} */\n${content.trim()}\n`;
  }).join("\n");
}

module.exports = { buildIndexStyleBundle, INDEX_STYLE_FILES };
