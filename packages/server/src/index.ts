import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { verifyRoute } from "./routes/verify.js";
import { runtimesRoute } from "./routes/runtimes.js";
import { merchantsRoute } from "./routes/merchants.js";
import { consentRoute } from "./routes/consent.js";
import { healthRoute } from "./routes/health.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.route("/health", healthRoute);
app.route("/v0/verify", verifyRoute);
app.route("/v0/runtimes", runtimesRoute);
app.route("/v0/merchants", merchantsRoute);
app.route("/v0/consent", consentRoute);

const port = parseInt(process.env.PORT || "3000");
console.log(`Attest server listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
