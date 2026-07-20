import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { callFundEscrowTask, callAiVerificationSettlement } from "@/lib/mcpTools";

const prisma = new PrismaClient();

// A minimal A2A (Agent-to-Agent) JSON-RPC surface, per the A2A protocol
// (https://a2a-protocol.org). This implements the two methods this agent can
// actually back with real behavior:
//   - message/send  â€” synchronous task creation/advancement
//   - tasks/get      â€” poll a previously created task's state
//
// NOT implemented, on purpose rather than faked: message/stream (SSE
// streaming), push notifications, and file/artifact parts. Docket Arbiter's
// work items (fund a task, get an AI verdict) are naturally short-lived
// request/response operations already, so synchronous message/send covers
// the real use case. Add streaming later if OKX's review specifically
// requires it â€” wiring up SSE for operations that never actually stream
// would be exactly the "mock implementation" this project was told to avoid.

type RpcId = string | number | null;

function rpcResult(id: RpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: RpcId, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 });
}

function taskState(status: string): "submitted" | "working" | "completed" | "failed" | "canceled" {
  switch (status) {
    case "CREATED":
    case "FUNDED":
    case "ACCEPTED":
      return "submitted";
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "DISPUTED":
      return "working";
    case "RELEASED":
      return "completed";
    case "REFUNDED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "working";
  }
}

async function taskFromEscrowId(escrowId: string) {
  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
  if (!escrow) return null;
  return {
    id: escrow.id,
    contextId: escrow.chainEscrowId ?? escrow.id,
    status: {
      state: taskState(escrow.status),
      message: {
        role: "agent",
        parts: [{ kind: "text", text: `Escrow ${escrow.id} is ${escrow.status}` }],
      },
    },
    metadata: {
      chainEscrowId: escrow.chainEscrowId,
      contractAddress: escrow.contractAddress,
      txHashCreate: escrow.txHashCreate,
      txHashRelease: escrow.txHashRelease,
    },
  };
}

// Extracts a naive intent from a text message part. Real natural-language
// routing belongs in the calling agent's own model â€” this endpoint expects
// the caller to pass structured data in message.parts[].data (DataPart),
// with the text part as a human-readable label only.
async function handleMessageSend(params: Record<string, unknown>) {
  const message = params?.message as
    | { parts?: Array<{ kind: string; data?: Record<string, unknown>; text?: string }> }
    | undefined;
  const dataPart = message?.parts?.find((p) => p.kind === "data")?.data;
  if (!dataPart || typeof dataPart.intent !== "string") {
    return {
      error:
        "message.parts must include a DataPart with { intent: 'fund_escrow_task' | 'ai_verification_settlement', ...args }",
    };
  }

  if (dataPart.intent === "fund_escrow_task") {
    const result = await callFundEscrowTask(
      dataPart as unknown as { taskDescription: string; successCriteria: string; amountOkb: string }
    );
    return taskFromEscrowId(result.escrowId);
  }

  if (dataPart.intent === "ai_verification_settlement") {
    const { escrowId } = dataPart as unknown as { escrowId: string };
    await callAiVerificationSettlement({ escrowId });
    return taskFromEscrowId(escrowId);
  }

  return { error: `Unknown intent: ${dataPart.intent}` };
}

export async function POST(request: NextRequest) {
  let body: { id?: RpcId; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  const { id = null, method, params } = body || {};

  try {
    switch (method) {
      case "message/send": {
        const result = await handleMessageSend(params || {});
        return rpcResult(id, result);
      }
      case "tasks/get": {
        const { id: taskId } = (params || {}) as { id?: string };
        if (!taskId) return rpcError(id, -32602, "params.id (task id / escrow id) is required");
        const task = await taskFromEscrowId(taskId);
        if (!task) return rpcError(id, -32001, "Task not found");
        return rpcResult(id, task);
      }
      default:
        return rpcError(id, -32601, `Unknown method: ${method}`);
    }
  } catch (err) {
    console.error("A2A error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return rpcError(id, -32000, message);
  }
}

// GET â€” capabilities probe, free.
export async function GET() {
  return NextResponse.json({
    protocol: "a2a",
    methods: ["message/send", "tasks/get"],
    streaming: false,
  });
}
