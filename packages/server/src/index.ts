import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { verifyRoute } from "./routes/verify.js";
import { runtimesRoute } from "./routes/runtimes.js";
import { merchantsRoute } from "./routes/merchants.js";
import { consentRoute } from "./routes/consent.js";
import { healthRoute } from "./routes/health.js";
import { onboardRoute } from "./routes/onboard.js";
import { authRoute } from "./routes/auth.js";
import { analyticsRoute } from "./routes/analytics.js";
import { apiKeyAuth } from "./middleware/api-key.js";
import { rateLimit } from "./middleware/rate-limit.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

// Public routes
app.route("/health", healthRoute);

// Rate-limited verification endpoint
const verifyLimiter = rateLimit({
  max: 1000,
  windowMs: 60_000, // 1000 req/min per merchant
});

app.use("/v0/verify/*", apiKeyAuth, verifyLimiter);
app.route("/v0/verify", verifyRoute);

// Authenticated merchant routes
app.use("/v0/merchants/*", apiKeyAuth);
app.route("/v0/merchants", merchantsRoute);

// Analytics (merchant-authenticated)
app.use("/v0/merchants/*/analytics*", apiKeyAuth);
app.route("/v0/merchants", analyticsRoute);

// Public self-serve onboarding
app.route("/v0/onboard", onboardRoute);

// Runtime registration (separate auth — TODO: admin key)
app.route("/v0/runtimes", runtimesRoute);

// Auth (magic link for consent portal)
app.route("/v0/auth", authRoute);

// Consent routes (consumer-facing)
app.route("/v0/consent", consentRoute);

const port = parseInt(process.env.PORT || "3000");
console.log(`Attest server listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
