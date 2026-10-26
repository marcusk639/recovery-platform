import * as os from "os";
import * as path from "path";
import {
  overlaysFromArgv,
  stagingOverlayWarning,
  writeFunctionsEnvFiles,
} from "../src/launchConfig";

// Usage: npm run e2e:gen-env [-- --staging-env <dotenv fragment, e.g. stripe-e2e-prices.env>]
const functionsDir = path.resolve(__dirname, "..", "..", "functions");
const overlays = overlaysFromArgv(process.argv.slice(2));
for (const file of writeFunctionsEnvFiles(functionsDir, overlays)) {
  console.log(`wrote ${file}`);
}
const defaultFragment = path.join(os.homedir(), ".config", "regroup-e2e", "stripe-e2e-prices.env");
const warning = stagingOverlayWarning(overlays, defaultFragment);
if (warning) console.warn(warning);
