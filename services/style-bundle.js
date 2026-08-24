"use strict";

// Compatibility shim for deployments that place src/server.js at the project
// root. New installations should keep the small root server.js entrypoint.
module.exports = require("../src/services/style-bundle");
