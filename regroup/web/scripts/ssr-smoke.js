#!/usr/bin/env node
/**
 * Render smoke test for the staged SSR bundle: `npm run test:ssr`.
 *
 * Loads functions/dist/sapp/server/main.js the way the `ssr` function does
 * (working directory = the functions package, externals resolved from
 * functions/node_modules), serves it on a random local port and GETs a few
 * routes. Each must answer 200 with server-rendered content inside <app-root>.
 *
 * Why: the bundle is not self-contained. angular.json externalises
 * @firebase/app and @firebase/firestore, which load at runtime from the
 * functions package's `firebase` dependency. If that version drifts from the
 * one bundled through AngularFire, Firestore registers on a different
 * @firebase/app instance and every route answers 500 (`app.firestore is not a
 * function`). The Universal engine sends that 500 itself, so the function's
 * shell fallback never runs, and no build step notices.
 *
 * Prerequisites, in order:
 *   npm run build:ssr                     # browser + server bundles in dist/sapp
 *   (cd functions && npm ci)              # the runtime externals
 *   npm run build:copy-to-functions       # stage dist/sapp into functions/dist
 *
 * SSR_SMOKE_ROOT overrides the functions directory (it must contain
 * dist/sapp/server/main.js and the node_modules the bundle should resolve).
 *
 * The bundle is the production build, so rendering may make the same Firebase
 * SDK requests a real SSR request would.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROUTES = ['/', '/pricing', '/signup', '/login'];
const ROUTE_TIMEOUT_MS = 15000;
/** <app-root ...> followed by a rendered element, not the empty CSR shell. */
const RENDERED = /<app-root[^>]*>\s*<[a-z]/i;

const functionsDir = process.env.SSR_SMOKE_ROOT
  ? path.resolve(process.env.SSR_SMOKE_ROOT)
  : path.resolve(__dirname, '..', 'functions');
const bundle = path.join(functionsDir, 'dist', 'sapp', 'server', 'main.js');

if (!fs.existsSync(bundle)) {
  console.error(
    `ssr-smoke: ${bundle} not found. Run npm run build:ssr, then ` +
      'npm run build:copy-to-functions, first.',
  );
  process.exit(2);
}

// server.ts resolves the browser dist from the working directory, as in the function.
process.chdir(functionsDir);
const unhandled = [];
process.on('unhandledRejection', (e) => {
  unhandled.push(String((e && e.message) || e).slice(0, 200));
});

function get(port, route) {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ route, error: `no response in ${ROUTE_TIMEOUT_MS}ms` }),
      ROUTE_TIMEOUT_MS,
    );
    http
      .get({ host: '127.0.0.1', port, path: route }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          clearTimeout(timer);
          resolve({
            route,
            status: res.statusCode,
            bytes: body.length,
            rendered: RENDERED.test(body),
          });
        });
      })
      .on('error', (e) => {
        clearTimeout(timer);
        resolve({ route, error: e.message });
      });
  });
}

const app = require(bundle).app();
const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  let failed = 0;
  for (const route of ROUTES) {
    const r = await get(port, route);
    const ok = !r.error && r.status === 200 && r.rendered;
    if (!ok) failed++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${route} ` +
        (r.error ? r.error : `status=${r.status} bytes=${r.bytes} app-root-rendered=${r.rendered}`),
    );
  }
  if (unhandled.length > 0) {
    console.log(`note: ${unhandled.length} unhandled rejection(s) during rendering:`);
    unhandled.forEach((m) => console.log(`  ${m}`));
  }
  console.log(
    failed === 0 ? 'ssr-smoke: all routes rendered' : `ssr-smoke: ${failed} route(s) failed`,
  );
  process.exit(failed === 0 ? 0 : 1);
});
