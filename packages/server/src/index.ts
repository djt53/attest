import { Hono } from "hono";
import { logger } from "hono/logger";
import { verifyRoute } from "./routes/verify.js";
import { runtimesRoute } from "./routes/runtimes.js";
import { healthRoute } from "./routes/health.js";

const app = new Hono();

app.use("*", logger());

app.route("/health", healthRoute);
app.route("/v0/verify", verifyRoute);
app.route("/v0/runtimes", runtimesRoute);

const port = parseInt(process.env.PORT || "3000");
console.log(`Attest server listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
