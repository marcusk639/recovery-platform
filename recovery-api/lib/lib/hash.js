"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashUid = hashUid;
const crypto_1 = require("crypto");
/**
 * One-way hash of a user uid for attribution-only audit rows. The raw uid is
 * NEVER stored alongside directory reads — only this hex digest. sha256 (not the
 * 24-char sha1 directory-id recipe in lib/meetings/identity.ts) so the two
 * concerns never share a recipe: identity.ts hashes meeting identity, this
 * hashes a user for non-reversible attribution.
 */
function hashUid(uid) {
    return (0, crypto_1.createHash)('sha256').update(uid).digest('hex');
}
