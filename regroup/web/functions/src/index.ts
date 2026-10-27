/**
 * Cloud Functions for the Regroup web app.
 *
 * This package exists to serve Angular Universal server-side rendering. The
 * Angular server bundle is not imported from source: `npm run build` compiles
 * this package and then stages ../dist/sapp into ./dist/sapp (see
 * ../scripts/copy-ssr-to-functions.js), so the built bundle ships inside the
 * deployed function at dist/sapp/server/main.js.
 *
 * The bundle is not self-contained — angular.json externalises @firebase/app
 * and @firebase/firestore, which resolve from this package's node_modules via
 * its `firebase` dependency. That pin must match the firebase version in
 * ../package.json: a mismatch makes Firestore register on a second
 * @firebase/app, so every render throws and the Universal engine answers 500
 * itself (sendShell below never runs). Removing or bumping the dependency
 * alone breaks SSR at the first request; `npm run test:ssr` in ../ catches it.
 *
 * Deployed under the `web` codebase (see ../firebase.json), deliberately
 * separate from the `default` codebase that ../../functions owns. Firebase
 * deletes any function absent from the codebase being deployed, so sharing one
 * codebase between these two packages would make either deploy destroy the
 * other's functions.
 */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as fs from "fs";
import * as path from "path";
import { CONTENT_SECURITY_POLICY, CSP_HEADER_NAME } from "./csp";

/**
 * Minimal structural types covering only the members used here. Deliberately not
 * `@types/express`: firebase-functions bundles its own copy of those types, and a
 * second top-level copy produces "Property 'sendfile' is missing" style mismatches
 * between two structurally different Response types.
 */
interface ResponseLike {
  headersSent: boolean;
  setHeader(name: string, value: string): unknown;
  status(code: number): ResponseLike;
  type(contentType: string): ResponseLike;
  send(body: string): unknown;
  on(event: string, listener: () => void): unknown;
}
interface RequestLike {
  originalUrl: string;
}

type ExpressApp = (req: unknown, res: unknown) => void;

let cachedApp: ExpressApp | undefined;
let cachedShell: string | undefined;

/** Hard deadline for a render. Kept well under the function timeout so the
 *  fallback still has time to write a response. */
const RENDER_DEADLINE_MS = 8_000;

/**
 * Loads the Angular Universal Express app lazily and caches it for the life of
 * the instance. Requiring a ~5MB bundle at module scope would pay that cost on
 * every cold start even for requests that fail earlier; caching after the first
 * request keeps warm invocations free.
 */
function getApp(): ExpressApp {
  if (!cachedApp) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bundle = require(`${process.cwd()}/dist/sapp/server/main`);
    cachedApp = bundle.app() as ExpressApp;
  }
  return cachedApp;
}

/**
 * The un-rendered client bundle shell, used as the fallback below. Hosting does
 * not upload this file (firebase.json ignores index.html so that `/` reaches
 * this function rather than being served statically), but the function's own
 * copy of dist still contains it.
 */
function getShell(): string {
  if (cachedShell === undefined) {
    cachedShell = fs.readFileSync(
      path.join(process.cwd(), "dist/sapp/browser/index.html"),
      "utf8",
    );
  }
  return cachedShell;
}

/**
 * Serves the shell so the client can render the route itself. Degrades SSR to
 * CSR rather than failing the request.
 */
function sendShell(res: ResponseLike, reason: string, url: string): void {
  if (res.headersSent) return;
  logger.warn("ssr: falling back to client rendering", { reason, url });
  res.setHeader(CSP_HEADER_NAME, CONTENT_SECURITY_POLICY);
  res.status(200).type("html").send(getShell());
}

export const ssr = onRequest(
  {
    region: "us-central1",
    // The SSR bundle renders the whole Angular app per request; 256MiB (the
    // previous deployed setting) leaves no headroom above the 5MB bundle.
    memory: "512MiB",
    // Replaces the former `warmWebsite` cron, which only logged and made no
    // request, so it never warmed anything. minInstances is the supported
    // mechanism and actually holds an instance ready. This carries a standing
    // cost — set to 0 to trade cold starts for a lower bill.
    minInstances: 1,
    concurrency: 80,
    timeoutSeconds: 30,
  },
  (req, res) => {
    // A render that never completes must not hold the instance open. An Angular
    // router error escapes the Universal handler without responding: verified in
    // the emulator, an unrouted URL produced no response and the function timed
    // out after ~60s. The catch-all `**` route now prevents that specific case,
    // but any future render throw would do the same, so the deadline stays.
    const response = res as unknown as ResponseLike;
    const request = req as unknown as RequestLike;
    const deadline = setTimeout(
      () => sendShell(response, "render-deadline-exceeded", request.originalUrl),
      RENDER_DEADLINE_MS,
    );
    response.on("close", () => clearTimeout(deadline));

    // Set before the render so it covers the Universal response; sendShell sets it
    // again for the fallback path. Static assets are served by Hosting, not here.
    response.setHeader(CSP_HEADER_NAME, CONTENT_SECURITY_POLICY);

    try {
      getApp()(req, res);
    } catch (err) {
      clearTimeout(deadline);
      logger.error("ssr: render threw", {
        url: request.originalUrl,
        message: err instanceof Error ? err.message : String(err),
      });
      sendShell(response, "render-threw", request.originalUrl);
    }
  },
);
