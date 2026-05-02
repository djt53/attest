import { Hono } from "hono";

export const discoveryRoute = new Hono();

/**
 * GET /.well-known/attest.json — Discovery endpoint
 *
 * Allows agent runtimes to discover attestation support and
 * understand what benefits are available before browsing.
 *
 * In production, merchants serve this from their own domain.
 * This route is a reference implementation / hosted version.
 */
discoveryRoute.get("/", async (c) => {
  const merchantId = c.req.query("realm");
  if (!merchantId) {
    return c.json({ error: "realm query parameter required" }, 400);
  }

  // TODO: Load merchant-specific benefits from database
  return c.json({
    version: "0",
    realm: merchantId,
    verify_url: `${process.env.APP_URL || "https://api.attest.dev"}/v0/verify`,
    benefits: {
      loyalty_pricing: {
        description: "Customer's loyalty tier pricing applied",
        scope_required: ["browse"],
      },
      real_time_inventory: {
        description: "Live inventory data instead of cached",
        scope_required: ["browse"],
      },
      skip_captcha: {
        description: "No CAPTCHA or bot challenges",
        scope_required: ["browse"],
      },
      full_catalog: {
        description: "Access to member-only and restricted products",
        scope_required: ["browse"],
      },
      relaxed_rate_limit: {
        description: "Higher request rate allowance (600/min vs 60/min)",
        scope_required: ["browse"],
      },
      personalization: {
        description: "Recommendations based on customer purchase history",
        scope_required: ["browse"],
      },
      express_checkout: {
        description: "Streamlined checkout without step-up authentication",
        scope_required: ["purchase"],
      },
    },
    supported_runtimes: ["*"],
    max_ttl: 3600,
    spec_url: "https://github.com/djt53/attest/blob/main/packages/spec/challenge-v0.md",
  });
});
