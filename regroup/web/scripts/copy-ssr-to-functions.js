#!/usr/bin/env node
/**
 * Stages the Angular Universal build output inside the SSR function.
 *
 * The function resolves its bundle and shell against its own working directory
 * (see functions/src/index.ts), so both must sit under functions/dist/sapp:
 *
 *   dist/sapp/server/main.js        the SSR bundle
 *   dist/sapp/browser/index.html    the shell, used when a render fails
 *
 * That the working directory is the function's source root is Cloud Functions
 * runtime behaviour; it is not demonstrable from this repo. The function has
 * always depended on it.
 *
 * THE BUNDLE IS NOT SELF-CONTAINED. angular.json marks @firebase/firestore as
 * an external, so requiring main.js resolves it from functions/node_modules,
 * supplied transitively by `firebase` in functions/package.json. Dropping or
 * bumping that dependency breaks SSR on the first request, and no build step
 * catches it — copying dist is necessary but not sufficient.
 *
 * This replaces `cp -r ../dist .`, which copied an incomplete build as happily
 * as a complete one. web/dist holds only sapp, so narrowing the copy to
 * dist/sapp drops nothing.
 *
 * It never builds. functions/package.json runs it after tsc, so building here
 * would recurse back through build:functions.
 */
const fs = require("fs");
const path = require("path");

/** Overridable so tests can drive a fixture tree. */
const webRoot = process.env.SSR_WEB_ROOT
  ? path.resolve(process.env.SSR_WEB_ROOT)
  : path.resolve(__dirname, "..");

const source = path.join(webRoot, "dist", "sapp");
const functionsDist = path.join(webRoot, "functions", "dist");
const target = path.join(functionsDist, "sapp");
/** Copied here first, then renamed over `target`, so a failure cannot leave a
 *  half-populated tree that a direct `firebase deploy` would ship. */
const staging = path.join(functionsDist, ".sapp.staging");

/**
 * A smoke floor, not a specification. The real bundle is megabytes; this only
 * has to separate "built" from "truncated to a stub", and a tighter number
 * would go stale with every Angular upgrade.
 */
const MIN_BUNDLE_BYTES = 50 * 1024;

const rel = (p) => path.relative(webRoot, p) || ".";

/** Returns the reasons `root` is not a usable build, or [] if it is. */
function problems(root) {
  const found = [];
  const bundle = path.join(root, "server", "main.js");
  const shell = path.join(root, "browser", "index.html");

  for (const f of [bundle, shell]) {
    if (!fs.existsSync(f)) {
      found.push(`missing: ${rel(f)}`);
    } else if (fs.statSync(f).size === 0) {
      found.push(`empty: ${rel(f)}`);
    }
  }

  if (fs.existsSync(bundle) && fs.statSync(bundle).size < MIN_BUNDLE_BYTES) {
    found.push(
      `suspiciously small: ${rel(bundle)} is ${fs.statSync(bundle).size} bytes`,
    );
  }

  // A shell with no script to load renders nothing. Catches a browser build
  // that produced index.html and then failed.
  const browser = path.join(root, "browser");
  if (fs.existsSync(browser)) {
    const chunks = fs.readdirSync(browser).filter((f) => f.endsWith(".js"));
    if (chunks.length === 0) found.push(`no .js chunks in ${rel(browser)}`);
  }

  return found;
}

const sourceProblems = problems(source);
if (sourceProblems.length > 0) {
  console.error(
    "copy-ssr-to-functions: the Angular build output is not usable.\n" +
      sourceProblems.map((p) => `  ${p}`).join("\n") +
      "\n\nRun `npm run build:ssr` to build, or `npm run build` to build and copy.",
  );
  process.exit(1);
}

fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(functionsDist, { recursive: true });
// dereference: true because the deployed function gets a copy, not a view of
// this machine. Angular emits no symlinks today, so this is belt and braces.
fs.cpSync(source, staging, { recursive: true, dereference: true });

// Verify what was actually written, not what was read. The pre-flight check
// above says the build was good; this says the copy was.
const copyProblems = problems(staging);
if (copyProblems.length > 0) {
  fs.rmSync(staging, { recursive: true, force: true });
  console.error(
    "copy-ssr-to-functions: the copy is incomplete and has been discarded.\n" +
      copyProblems.map((p) => `  ${p}`).join("\n"),
  );
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.renameSync(staging, target);

console.log(`copy-ssr-to-functions: ${rel(source)} -> ${rel(target)}`);
for (const dir of ["browser", "server"]) {
  console.log(`  ${dir}: ${fs.readdirSync(path.join(target, dir)).length} entries`);
}
