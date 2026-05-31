// This file previously contained a one-time demo-data seeding script.
// It has been removed because it used `this` in a plain module context
// (not valid TypeScript/JavaScript outside a class), depended on hardcoded
// credentials, and is no longer needed for any production or test workflow.
// The supporting imports (House, Admin, Guest, lodash, uuid, firestore, logger)
// can be found in their respective source files if the seeding capability
// is needed again.

export {};
