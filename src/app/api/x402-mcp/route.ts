import { NextRequest, NextResponse } from "next/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { TOOLS, callFundEscrowTask, callAiVerificationSettlement } from "@/lib/mcpTools";

const NETWORK = "eip155:196";
const PAY_TO = process.env.PAY_TO_ADDRESS || "";
const ENDPOINT = "https://agent-escrow.vercel.app/api/x402-mcp";
const PRICE = "10000"; // 0.01 USDT in base units (6 decimals)
const ASSET = "0x779ded0c9e1022225f8e0630b35a9b54be713736"; // USDT on X Layer

const facilitatorClient = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY || "",
  secretKey: process.env.OKX_SECRET_KEY || "",
  passphrase: process.env.OKX_PASSPHRASE || "",
});


function paymentChallenge() {
  const challenge = {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: ENDPOINT,
      description: "Docket Arbiter — escrow funding and AI-verified settlement, pay-per-call",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        amount: PRICE,
        asset: ASSET,
        payTo: PAY_TO,
        maxTimeoutSeconds: 300,
        extra: { name: "USD\u20ae0", version: "1" },
      },
    ],
  };
  const encoded = Buffer.from(JSON.stringify(challenge)).toString("base64");
  return new NextResponse("{}", {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "payment-required": encoded,
    },
  });
}

async function verifyPayment(request: NextRequest): Promise<boolean> {
  const paymentHeader =
    request.headers.get("x-payment") ||
    request.headers.get("payment");

  if (!paymentHeader) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString()
    );

    const result = await facilitatorClient.verify(
      payload,
      {
        scheme: "exact",
        network: NETWORK,
        amount: PRICE,
        asset: ASSET,
        payTo: PAY_TO as `0x${string}`,
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD₮0",
          version: "1",
        },
      }
    );

    return result.isValid;
  } catch (err) {
    console.error(err);
    return false;
  }
}


function rpcResult(id: any, result: any) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: any, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

// GET — payment-gated liveness/capabilities check (satisfies OKX x402-check)
export async function GET(request: NextRequest) {
  const paid = await verifyPayment(request);
  if (!paid) return paymentChallenge();
  return NextResponse.json({
    name: "docket-arbiter-paid",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
    status: "ok",
  });
}

// POST — payment-gated MCP JSON-RPC handler
export async function POST(request: NextRequest) {
  const paid = await verifyPayment(request);
  if (!paid) return paymentChallenge();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = body || {};

  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "docket-arbiter-paid", version: "1.0.0" },
      });
    }
    if (method === "notifications/initialized") {
      return new NextResponse(null, { status: 202 });
    }
    if (method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      let output: any;
      if (name === "fund_escrow_task") {
        output = await callFundEscrowTask(args);
      } else if (name === "ai_verification_settlement") {
        output = await callAiVerificationSettlement(args);
      } else {
        return rpcError(id, -32601, `Unknown tool: ${name}`);
      }
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(output) }],
        isError: !!output?.error,
      });
    }
    return rpcError(id, -32601, `Unknown method: ${method}`);
  } catch (err: any) {
    console.error("x402 MCP error:", err);
    return rpcError(id, -32000, err.message || "Internal error");
  }
}
