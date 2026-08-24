"use strict";

// Compatibility shim: the canonical configuration module lives in src/.
// This also lets a mistakenly copied src/server.js resolve "./config" when it
// is placed at the project root.
module.exports = require("./src/config");
