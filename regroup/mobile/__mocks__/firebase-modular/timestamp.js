/**
 * Timestamp stand-in for the firebase-modular mocks (see log.js).
 */
/** Firestore stores a Date as a Timestamp and reads it back as one. */
class Timestamp {
  constructor(seconds, nanoseconds) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
    Object.defineProperty(this, '__isMockTimestamp', { value: true });
  }

  static fromMillis(ms) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }

  static fromDate(date) {
    return Timestamp.fromMillis(date.getTime());
  }

  static now() {
    return Timestamp.fromMillis(Date.now());
  }

  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }

  toDate() {
    return new Date(this.toMillis());
  }

  isEqual(other) {
    return !!other && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
  }
}

module.exports = { Timestamp };
