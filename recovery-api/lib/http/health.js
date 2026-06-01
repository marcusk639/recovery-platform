"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.health = void 0;
exports.healthHandler = healthHandler;
const https_1 = require("firebase-functions/v2/https");
// Exported for testing — call the handler directly without the onRequest wrapper.
function healthHandler(_req, res) {
    res.json({ ok: true, ts: new Date().toISOString() });
}
exports.health = (0, https_1.onRequest)(healthHandler);
