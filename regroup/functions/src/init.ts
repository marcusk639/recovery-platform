import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

if (!admin.apps.length) {
  admin.initializeApp();
}

// Stopgap: project is capped at 20 vCPU "Total CPU allocation" in us-central1
// (Cloud Run Admin API quota, auto-bump rejected — Sales request pending).
// Quota draw = sum(maxInstances * cpu) across all functions. With ~50 funcs:
//   50 * maxInstances:2 * cpu:0.167 ≈ 16.7 vCPU (fits under 20).
// Revert to defaults once Google approves the quota increase.
setGlobalOptions({ cpu: 0.167, maxInstances: 2 });
