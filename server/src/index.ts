import "~/lib/tls-setup";
import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "~/app";
import * as findboligService from "~/findbolig-service";

const app = createApp({ findbolig: findboligService });

// Static client build, then SPA fallback for anything the API did not answer
app.get("/*", serveStatic({ root: "../client/dist" }));
app.get(
  "*",
  serveStatic({
    root: "../client/dist",
    rewriteRequestPath: () => "/index.html",
  })
);

const server = serve({ ...app, hostname: "0.0.0.0" }, (info) => {
  console.log(`Server is running on ${info.address}:${info.port}`);
});

process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.close((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
});
