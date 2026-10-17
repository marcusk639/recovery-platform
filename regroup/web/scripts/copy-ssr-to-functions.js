#!/usr/bin/env node
/**
 * Copies the Angular Universal build output into the SSR function.
 *
 * The deployed `ssr` function resolves its bundle and shell relative to its own
 * working directory (functions/src/index.ts):
 *
 *   require(`${process.cwd()}/dist/sapp/server/main`)        -> the SSR bundle
 *   readFileSync(join(process.cwd(), 'dist/sapp/browser/index.html'))  -> the shell
 *
 * For a deployed function, `process.cwd()` is the functions root. So both
 * directories must exist INSIDE functions/, as siblings under dist/sapp — not
 * nested. `ng build` writes them to web/dist/sapp instead, one level up and
 * outside the function's upload, hence this copy.
 *
 * The shell matters because firebase.json deliberately leaves index.html out of
 * Hosting's upload so that `/` reaches the function rather than being served
 * statically. The function's own copy of dist is the only one that has it.
 *
 * functions/dist is gitignored, and firebase.json's functions `ignore` excludes
 * only dist/sapp/browser/*.map — so this output is uploaded with the function,
 * which is the point.
 *
 * Fails loudly rather than copying nothing: a silent no-op here deploys a
 * function that throws on its first request, which is a far worse signal than a
 * failed build. This script never builds — functions/package.json's `build`
 * calls it after `tsc`, so building here would recurse.
 */
const fs = require("fs");
const path = require("path");

const webRoot = path.resolve(__dirname, "..");
const source = path.join(webRoot, "dist", "sapp");
const target = path.join(webRoot, "functions", "dist", "sapp");

/** Files whose absence means `ng build` has not produced a usable bundle. */
const REQUIRED = [
  path.join(source, "server", "main.js"),
  path.join(source, "browser", "index.html"),
];

const missing = REQUIRED.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error(
    "copy-ssr-to-functions: the Angular build output is incomplete.\n" +
      missing.map((f) => `  missing: ${path.relative(webRoot, f)}`).join("\n") +
      "\n\nRun `npm run build:ssr` first, or `npm run build`, which does both.",
  );
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });

const rel = (p) => path.relative(webRoot, p);
console.log(`copy-ssr-to-functions: ${rel(source)} -> ${rel(target)}`);
for (const dir of ["browser", "server"]) {
  const n = fs.readdirSync(path.join(target, dir)).length;
  console.log(`  ${dir}: ${n} entries`);
}
