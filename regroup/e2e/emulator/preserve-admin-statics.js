/**
 * Test-only. Loaded into the functions emulator through NODE_OPTIONS.
 *
 * firebase-tools wraps firebase-admin in the emulator and returns admin.firestore
 * through .bind(), and a bound function has none of the original's properties. So
 * admin.firestore.FieldValue and .Timestamp are undefined there, and every webhook
 * handler throws. Production has no such wrapper. This keeps the properties when
 * the Firestore namespace function is bound, and changes nothing else.
 */
const originalBind = Function.prototype.bind;

Function.prototype.bind = function bindKeepingFirestoreStatics(...args) {
  const bound = originalBind.apply(this, args);
  if (typeof this === 'function' && Object.prototype.hasOwnProperty.call(this, 'FieldValue')) {
    Object.assign(bound, this);
  }
  return bound;
};
