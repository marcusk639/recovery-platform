/**
 * Jest replacement for `buffer-equal-constant-time` (via firebase-admin →
 * jsonwebtoken → jwa). The real package patches SlowBuffer.prototype at load
 * time and crashes on Node >= 23, where SlowBuffer was removed. Production is
 * unaffected (Cloud Functions runtime is Node 22 per package.json engines);
 * this shim is wired in through the jest moduleNameMapper only.
 */
const crypto = require('crypto');

function bufferEq(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// The real module monkey-patches Buffer.prototype.equal; nothing to do here.
bufferEq.install = function install() {};
bufferEq.restore = function restore() {};

module.exports = bufferEq;
