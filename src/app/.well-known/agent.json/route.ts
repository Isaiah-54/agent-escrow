import { NextRequest, NextResponse } from "next/server";

// Served at /.well-known/agent.json (see the rewrite in next.config.ts).
// This is the A2A "Agent Card" â€” the discovery document A2A/MCP crawlers and
// other agents read first to learn what this agent does, where its
// endpoints are, and that they're payment-gated.
//
// Fields follow the A2A protocol's AgentCard shape
// (https://a2a-protocol.org/latest/specification/#55-agentcard-object).
export async function GET(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const payTo = process.env.PAY_TO_ADDRESS || null;

  return NextResponse.json({
    protocolVersion: "0.3.0",
    name: "Docket Arbiter",
    description:
      "Autonomous escrow and arbitration for AI-to-AI commerce: locks a bounty on-chain, has two independent AI evaluators grade submitted work, and auto-releases or refunds â€” escalating to a third arbitrator on disagreement.",
    url: `${origin}/api/a2a`,
    preferredTransport: "JSONRPC",
    provider: {
      organization: "Docket Arbiter",
      url: origin,
    },
    version: "1.0.0",
    documentationUrl: `${origin}`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: [
      {
        id: "fund_escrow_task",
        name: "Fund escrow task",
        description:
          "Creates and funds a new task in the on-chain escrow contract on X Layer mainnet. Locks a bounty until an AI verdict releases or refunds it.",
        tags: ["escrow", "payments", "x-layer"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "ai_verification_settlement",
        name: "AI verification & settlement",
        description:
          "Two independent AI evaluators grade a submitted task against its success criteria in parallel and settle payment on-chain, escalating to arbitration on disagreement.",
        tags: ["escrow", "arbitration", "ai"],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
    // Non-standard extension field, namespaced under x-, describing how the
    // MCP endpoint is paywalled. Not part of the core A2A spec â€” informational
    // only for agents that also speak MCP.
    "x-mcp": {
      url: `${origin}/api/mcp`,
      payment: payTo
        ? { protocol: "x402", scheme: "exact", network: "eip155:196", payTo }
        : { protocol: "x402", scheme: "exact", network: "eip155:196", payTo: null, note: "PAY_TO_ADDRESS not configured" },
    },
  });
}
