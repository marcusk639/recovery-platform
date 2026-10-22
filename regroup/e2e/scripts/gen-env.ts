import * as path from "path";
import { writeFunctionsEnvFiles } from "../src/launchConfig";

const functionsDir = path.resolve(__dirname, "..", "..", "functions");
for (const file of writeFunctionsEnvFiles(functionsDir)) {
  console.log(`wrote ${file}`);
}
