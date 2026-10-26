import * as path from "path";
import { overlaysFromArgv, writeFunctionsEnvFiles } from "../src/launchConfig";

// Usage: npm run e2e:gen-env [-- --staging-env <dotenv fragment, e.g. stripe-e2e-prices.env>]
const functionsDir = path.resolve(__dirname, "..", "..", "functions");
for (const file of writeFunctionsEnvFiles(functionsDir, overlaysFromArgv(process.argv.slice(2)))) {
  console.log(`wrote ${file}`);
}
