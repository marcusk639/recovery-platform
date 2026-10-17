/**
 * Tests for the SSR copy step. Uses SSR_WEB_ROOT to drive a fixture tree, so
 * nothing here touches the real build output.
 *
 * Run: node --test scripts/
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "copy-ssr-to-functions.js");
/** Above the script's own smoke floor. */
const BUNDLE = "x".repeat(60 * 1024);

function fixture({ bundle = BUNDLE, shell = "<html></html>", chunk = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ssrcopy-"));
  const browser = path.join(root, "dist", "sapp", "browser");
  const server = path.join(root, "dist", "sapp", "server");
  fs.mkdirSync(browser, { recursive: true });
  fs.mkdirSync(server, { recursive: true });
  if (bundle !== null) fs.writeFileSync(path.join(server, "main.js"), bundle);
  if (shell !== null) fs.writeFileSync(path.join(browser, "index.html"), shell);
  if (chunk) fs.writeFileSync(path.join(browser, "main.abc.js"), "console.log(1)");
  return root;
}

const run = (root) =>
  execFileSync("node", [SCRIPT], {
    env: { ...process.env, SSR_WEB_ROOT: root },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const runExpectingFailure = (root) => {
  try {
    run(root);
    return null;
  } catch (err) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
};

const target = (root, ...rest) =>
  path.join(root, "functions", "dist", "sapp", ...rest);

test("copies both trees to the paths the function resolves", () => {
  const root = fixture();
  run(root);
  assert.ok(fs.existsSync(target(root, "server", "main.js")));
  assert.ok(fs.existsSync(target(root, "browser", "index.html")));
});

test("fails when the build has not run", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ssrcopy-"));
  const out = runExpectingFailure(root);
  assert.ok(out, "expected a non-zero exit");
  assert.match(out, /missing/);
  assert.ok(!fs.existsSync(target(root)), "must not create a partial target");
});

test("fails on a truncated bundle rather than deploying it", () => {
  // The case the old `cp -r` shipped silently: a file that exists but is a stub.
  const out = runExpectingFailure(fixture({ bundle: "" }));
  assert.ok(out);
  assert.match(out, /empty/);
});

test("fails on a stub bundle above zero bytes but below the floor", () => {
  const out = runExpectingFailure(fixture({ bundle: "stub" }));
  assert.ok(out);
  assert.match(out, /suspiciously small/);
});

test("fails when the shell has no script to load", () => {
  const out = runExpectingFailure(fixture({ chunk: false }));
  assert.ok(out);
  assert.match(out, /no \.js chunks/);
});

test("replaces the target rather than merging into it", () => {
  const root = fixture();
  run(root);
  const orphan = target(root, "browser", "stale.abc.js");
  fs.writeFileSync(orphan, "old");
  run(root);
  assert.ok(!fs.existsSync(orphan), "stale output survived the copy");
});

test("leaves no staging directory behind on success", () => {
  const root = fixture();
  run(root);
  assert.ok(!fs.existsSync(path.join(root, "functions", "dist", ".sapp.staging")));
});

test("keeps the previous target when a new build is unusable", () => {
  // A failed rebuild must not take down what is already staged.
  const root = fixture();
  run(root);
  fs.writeFileSync(path.join(root, "dist", "sapp", "server", "main.js"), "");
  assert.ok(runExpectingFailure(root));
  assert.ok(
    fs.existsSync(target(root, "server", "main.js")),
    "previous good copy was destroyed by a failed rebuild",
  );
});
