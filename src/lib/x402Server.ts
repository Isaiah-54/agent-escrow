import { x402ResourceServer } from "@okxweb3/x402-core/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
// NOTE: the server-side "exact" scheme lives at this subpath, not the
// package root — the root export (@okxweb3/x402-evm) is the client/buyer
// side (ExactEvmScheme there implements a different, client interface).
// Importing from the root here was the original bug that broke `npm run build`.
import { registerExactEvmScheme } from "@okxweb3/x402-evm/exact/server";

// X Layer mainnet, CAIP-2 format (eip155:<chainId>). Chain ID 196 is X Layer
// mainnet per OKX's own SDK defaults (mppx charge() defaults to chainId 196).
export const X402_NETWORK = "eip155:196" as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it in your deployment environment ` +
        `(OKX Developer Portal → API keys) before the x402-gated endpoints will work.`
    );
  }
  return value;
}

const facilitatorClient = new OKXFacilitatorClient({
  apiKey: requiredEnv("OKX_API_KEY"),
  secretKey: requiredEnv("OKX_SECRET_KEY"),
  passphrase: requiredEnv("OKX_PASSPHRASE"),
});

// Single shared x402ResourceServer instance for the whole app.
// registerExactEvmScheme is OKX's documented helper for wiring the "exact"
// scheme's server-side implementation to a resource server; scoping to
// X402_NETWORK explicitly (rather than leaving config empty, which would
// register the eip155:* wildcard) keeps us from accepting payment schemes
// on networks we haven't actually deployed to or tested.
export const x402Server = registerExactEvmScheme(new x402ResourceServer(facilitatorClient), {
  networks: [X402_NETWORK],
});

// server.initialize() fetches supported kinds (incl. facilitator/Permit2/
// subscription contract addresses, when relevant) from the facilitator at
// startup. We never hardcode those addresses ourselves. Route wrappers pass
// syncFacilitatorOnStart=true by default, which calls this on first request,
// but we also expose it directly for the health check to confirm readiness.
let initPromise: Promise<void> | null = null;
export function ensureX402Initialized(): Promise<void> {
  if (!initPromise) {
    initPromise = x402Server.initialize();
  }
  return initPromise;
}
