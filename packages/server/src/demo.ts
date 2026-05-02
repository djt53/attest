/**
 * End-to-end demo: creates a key pair, registers a runtime,
 * mints an attestation, and verifies it — all locally.
 *
 * Run: npx tsx packages/server/src/demo.ts
 */
import { AttestClient } from "../../sdk/src/client.js";
import { registerRuntime, injectJWKS } from "./services/jwks.js";
import { verifyAttestation } from "./services/verification.js";

async function main() {
  console.log("=== Attest End-to-End Demo ===\n");

  // 1. Generate key pair for agent runtime
  console.log("1. Generating ES256 key pair for runtime...");
  const { privateKey, publicJwk } = await AttestClient.generateKeyPair("demo-key-1");
  console.log(`   Public key (kid: ${publicJwk.kid}): ${publicJwk.kty}/${publicJwk.crv}`);

  // 2. Register the runtime
  console.log("\n2. Registering runtime 'demo-runtime'...");
  registerRuntime("demo-runtime", "https://demo-runtime/.well-known/attest-jwks.json");
  injectJWKS("demo-runtime", { keys: [publicJwk] });
  console.log("   Registered and JWKS injected.");

  // 3. Create an attestation token
  console.log("\n3. Creating attestation token...");
  const client = new AttestClient({
    issuer: "demo-runtime",
    privateKey,
    kid: "demo-key-1",
  });

  const { token, expiresAt, jti } = await client.attest({
    agentId: "shopping-agent-v1",
    humanPrincipal: {
      id: "user_alice_123",
      email: "alice@example.com",
    },
    scope: ["browse", "purchase<=500"],
    audience: "cool-store.myshopify.com",
    ttl: 300,
  });

  console.log(`   Token ID: ${jti}`);
  console.log(`   Expires: ${expiresAt.toISOString()}`);
  console.log(`   Token length: ${token.length} chars`);
  console.log(`   Token (truncated): ${token.slice(0, 50)}...`);

  // 4. Verify the token
  console.log("\n4. Verifying attestation...");
  const result = await verifyAttestation(token, "cool-store.myshopify.com");

  if (result.valid) {
    console.log("   VERIFIED!");
    console.log(`   Runtime: ${result.attestation!.runtime}`);
    console.log(`   Agent: ${result.attestation!.agent}`);
    console.log(`   Human: ${result.attestation!.human.id} (${result.attestation!.human.email})`);
    console.log(`   Scope: ${result.attestation!.scope.join(", ")}`);
    console.log(`   Expires: ${result.attestation!.expires_at}`);
  } else {
    console.log(`   FAILED: ${result.error}`);
  }

  // 5. Try replay — should fail
  console.log("\n5. Attempting replay (same token)...");
  const replay = await verifyAttestation(token, "cool-store.myshopify.com");
  console.log(`   Result: ${replay.valid ? "PASSED (bad!)" : `BLOCKED (${replay.error})`}`);

  // 6. Try wrong audience — should fail
  console.log("\n6. Creating new token and verifying against wrong merchant...");
  const { token: token2 } = await client.attest({
    agentId: "shopping-agent-v1",
    humanPrincipal: { id: "user_alice_123" },
    scope: ["browse"],
    audience: "cool-store.myshopify.com",
  });
  const wrongAud = await verifyAttestation(token2, "wrong-store.com");
  console.log(`   Result: ${wrongAud.valid ? "PASSED (bad!)" : `BLOCKED (${wrongAud.error})`}`);

  console.log("\n=== Demo complete ===");
}

main().catch(console.error);
