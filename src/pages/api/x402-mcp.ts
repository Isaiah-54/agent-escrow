import express from "express";
import {
  paymentMiddleware,
  x402ResourceServer,
} from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { TOOLS, callFundEscrowTask, callAiVerificationSettlement } from "../../lib/mcpTools";

const app = express();
app.set("trust proxy", true);
app.use(express.json());

const NETWORK = "eip155:196"; // X Layer
const PAY_TO = process.env.PAY_TO_ADDRESS || "";
const ROUTE_PATH = "/api/x402-mcp";

const facilitatorClient = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY || "",
  secretKey: process.env.OKX_SECRET_KEY || "",
  passphrase: process.env.OKX_PASSPHRASE || "",
});

const resourceServer = new x402ResourceServer(facilitatorClient);
resourceServer.register(NETWORK, new ExactEvmScheme());

app.use(
  paymentMiddleware(
    {
      [`POST ${ROUTE_PATH}`]: {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            price: "$0.01",
          },
        ],
        description: "Docket Arbiter — escrow funding and AI-verified settlement, pay-per-call",
        mimeType: "application/json",
      },
      [`GET ${ROUTE_PATH}`]: {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            price: "$0.01",
          },
        ],
        description: "Docket Arbiter — escrow funding and AI-verified settlement, pay-per-call",
        mimeType: "application/json",
      },
    },
    resourceServer
  )
);

function rpcResult(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

app.post(ROUTE_PATH, async (req, res) => {
  const { id, method, params } = req.body || {};

  try {
    if (method === "initialize") {
      return res.json(
        rpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "docket-arbiter-paid", version: "1.0.0" },
        })
      );
    }

    if (method === "notifications/initialized") {
      return res.status(202).end();
    }

    if (method === "tools/list") {
      return res.json(rpcResult(id, { tools: TOOLS }));
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params;
      let output: any;

      if (name === "fund_escrow_task") {
        output = await callFundEscrowTask(args);
      } else if (name === "ai_verification_settlement") {
        output = await callAiVerificationSettlement(args);
      } else {
        return res.json(rpcError(id, -32601, `Unknown tool: ${name}`));
      }

      return res.json(
        rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(output) }],
          isError: !!output?.error,
        })
      );
    }

    return res.json(rpcError(id, -32601, `Unknown method: ${method}`));
  } catch (err: any) {
    console.error("x402 MCP error:", err);
    return res.json(rpcError(id, -32000, err.message || "Internal error"));
  }
});
// Payment-gated GET — matches OKX's own x402 SDK example pattern and satisfies
// x402-check / platform reachability probes, which specifically expect a 402
// challenge (then a 200 once paid) on GET, not just POST.
app.get(ROUTE_PATH, (_req, res) => {
  res.json({
    name: "docket-arbiter-paid",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
    status: "ok",
  });
});

export default app;

export const config = {
  api: {
    bodyParser: false, // Express (via express.json()) handles body parsing itself
  },
};
