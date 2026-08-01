import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@okxweb3/x402-next";
import { x402Server, X402_NETWORK, ensureX402Initialized } from "@/lib/x402Server";
import { TOOLS, callFundEscrowTask, callAiVerificationSettlement } from "@/lib/mcpTools";

const PAY_TO = process.env.PAY_TO_ADDRESS as `0x${string}` | undefined;
const PRICE = process.env.MCP_CALL_PRICE || "$0.01";

if (!PAY_TO) {
  throw new Error(
    "PAY_TO_ADDRESS env var is required — this is the wallet that receives x402 payments for MCP tool calls."
  );
}

type RpcId = string | number | null;

function rpcResult(id: RpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: RpcId, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status: 200 }
  );
}

// Free handler for initialize / tools/list / notifications / unknown methods
async function freeMcpHandler(request: NextRequest) {
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
        // Should never reach here when called from free path,
        // but keep a safe fallback.
        return rpcError(id, -32000, "tools/call must go through paid path");
      }

      default:
        return rpcError(id, -32601, `Unknown method: ${method}`);
    }
  } catch (err) {
    console.error("MCP free error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return rpcError(id, -32000, message);
  }
}

// Paid handler — only tools/call reaches here
async function paidToolsCallHandler(request: NextRequest) {
  let body: { id?: RpcId; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id = null, method, params } = body || {};

  if (method !== "tools/call") {
    return rpcError(id, -32601, `Expected tools/call, got: ${method}`);
  }

  try {
    const { name, arguments: args } = (params || {}) as {
      name?: string;
      arguments?: Record<string, unknown>;
    };

    let output: unknown;

    if (name === "fund_escrow_task") {
      output = await callFundEscrowTask(
        args as {
          taskDescription: string;
          successCriteria: string;
          amountOkb: string;
        }
      );
    } else if (name === "ai_verification_settlement") {
      output = await callAiVerificationSettlement(
        args as { escrowId: string }
      );
    } else {
      return rpcError(id, -32601, `Unknown tool: ${name}`);
    }

    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(output) }],
      isError: !!(output as { error?: unknown } | undefined)?.error,
    });
  } catch (err) {
    console.error("MCP tools/call error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return rpcError(id, -32000, message);
  }
}

// Wrap ONLY the tools/call logic with x402
const paidHandler = withX402(
  paidToolsCallHandler,
  {
    accepts: {
      scheme: "exact",
      network: X402_NETWORK,
      payTo: PAY_TO,
      price: PRICE,
    },
    description:
      "Docket Arbiter — escrow funding and AI-verified settlement, pay-per-call",
    mimeType: "application/json",
  },
  x402Server
);

// Main POST entry: route by method so only tools/call is paid
export async function POST(request: NextRequest) {
  // Peek at the body to decide free vs paid (clone so body can be read again)
  const cloned = request.clone();
  let method: string | undefined;

  try {
    const body = await cloned.json();
    method = body?.method;
  } catch {
    // Let the free handler return a proper JSON-RPC parse error
    return freeMcpHandler(request);
  }

  if (method === "tools/call") {
    // Paid path — withX402 will return 402 if no valid payment
    return paidHandler(request);
  }

  // Free path for initialize, tools/list, notifications, etc.
  return freeMcpHandler(request);
}

// GET — free discovery (unchanged)
export async function GET() {
  await ensureX402Initialized().catch((err) => {
    console.error("x402 facilitator init failed:", err);
  });

  return NextResponse.json({
    name: "docket-arbiter",
    version: "1.0.0",
    protocol: "mcp",
    protocolVersion: "2024-11-05",
    payment: {
      required: true,
      scheme: "exact",
      network: X402_NETWORK,
      note: "Payment required only on tools/call",
    },
    tools: TOOLS.map((t) => t.name),
  });
}
