import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@okxweb3/x402-next";
import { x402Server, X402_NETWORK, ensureX402Initialized } from "@/lib/x402Server";
import { TOOLS, callFundEscrowTask, callAiVerificationSettlement } from "@/lib/mcpTools";

// This is now the ONE canonical MCP endpoint. The old /api/x402-mcp route is
// deleted â€” it duplicated this logic and hand-rolled a 402 response that
// didn't match the x402 wire format (challenge belongs in the response body,
// per PaymentRequired in the SDK, not a custom header), and it only ever
// called facilitator.verify() and never .settle(), so a valid payment never
// actually got captured on-chain. Both bugs are fixed by using the real
// @okxweb3/x402-next middleware below, which handles verify AND settle.

const PAY_TO = process.env.PAY_TO_ADDRESS as `0x${string}` | undefined;
// Price is USD-denominated via the SDK's Money type ("$0.01" == 1 cent of the
// network's default stablecoin); override with MCP_CALL_PRICE if you want a
// different per-call price without a code change.
const PRICE = process.env.MCP_CALL_PRICE || "$0.01";

if (!PAY_TO) {
  throw new Error(
    "PAY_TO_ADDRESS env var is required â€” this is the wallet that receives x402 payments for MCP tool calls."
  );
}

type RpcId = string | number | null;

function rpcResult(id: RpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: RpcId, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 });
}

async function mcpHandler(request: NextRequest) {
  let body: { id?: RpcId; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  const { id = null, method, params } = body || {};

  try {
    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "docket-arbiter", version: "1.0.0" },
        });

      case "notifications/initialized":
        return new NextResponse(null, { status: 202 });

      case "tools/list":
        return rpcResult(id, { tools: TOOLS });

      case "tools/call": {
        const { name, arguments: args } = (params || {}) as {
          name?: string;
          arguments?: Record<string, unknown>;
        };
        let output: unknown;
        if (name === "fund_escrow_task") {
          output = await callFundEscrowTask(
            args as { taskDescription: string; successCriteria: string; amountOkb: string }
          );
        } else if (name === "ai_verification_settlement") {
          output = await callAiVerificationSettlement(args as { escrowId: string });
        } else {
          return rpcError(id, -32601, `Unknown tool: ${name}`);
        }
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(output) }],
          isError: !!(output as { error?: unknown } | undefined)?.error,
        });
      }

      default:
        return rpcError(id, -32601, `Unknown method: ${method}`);
    }
  } catch (err) {
    console.error("MCP error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return rpcError(id, -32000, message);
  }
}

// POST â€” the priced MCP JSON-RPC resource. withX402 handles the full x402
// lifecycle: unpaid request -> spec-correct 402 with PaymentRequired body ->
// client retries with signed payment -> verify -> settle on-chain -> handler
// runs -> PAYMENT-RESPONSE header with the receipt.
export const POST = withX402(
  mcpHandler,
  {
    accepts: {
      scheme: "exact",
      network: X402_NETWORK,
      payTo: PAY_TO,
      price: PRICE,
    },
    description: "Docket Arbiter â€” escrow funding and AI-verified settlement, pay-per-call",
    mimeType: "application/json",
  },
  x402Server
);

// GET â€” free discovery/capabilities probe. Tool discovery (what this agent
// can do) is intentionally NOT paywalled so MCP clients and reviewers can
// inspect capabilities before deciding to pay; the priced resource is the
// JSON-RPC POST above (tools/call specifically incurs the charge).
export async function GET() {
  await ensureX402Initialized().catch((err) => {
    console.error("x402 facilitator init failed:", err);
  });
  return NextResponse.json({
    name: "docket-arbiter",
    version: "1.0.0",
    protocol: "mcp",
    protocolVersion: "2024-11-05",
    payment: { required: true, scheme: "exact", network: X402_NETWORK },
    tools: TOOLS.map((t) => t.name),
  });
}
