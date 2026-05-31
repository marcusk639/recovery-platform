import * as functions from "firebase-functions";
import { warmWebServer } from "./util/firebase";

export const universal = functions.https.onRequest(
  (request: any, response: any) => {
    require(`${process.cwd()}/dist/sapp/server/main`).app()(request, response);
  }
);

export const warmWebsite = functions.pubsub
  .schedule("* * * * *")
  .onRun(async (context) => {
    await warmWebServer();
    return;
  });
