import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
import { getCreatorContract, parseEscrowIdFromReceipt, getVerifierContract } from "@/lib/contract";
import { getOrCreateUser } from "@/lib/users";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildEvaluatorAPrompt, buildEvaluatorBPrompt, VERIFIER_PROMPT_VERSION } from "@/lib/prompts/verifierPromptV1";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const CONFIDENCE_THRESHOLD = 0.75;

// --- Minimal MCP-compliant JSON-RPC 2.0 server, implemented directly ---
// against Next.js Route Handlers (no Node req/res shimming needed).

const TOOLS = [
  {
    name: "fund_escrow_task",
    description:
      "Creates and funds a new task in the on-chain escrow contract on X Layer. Locks a bounty until an AI verdict releases or refunds it.",
    inputSchema: {
      type: "object",
      properties: {
        taskDescription: { type: "string", description: "What the worker agent needs to do" },
        successCriteria: { type: "string", description: "Precise conditions the AI evaluators check the work against" },
        amountOkb: { type: "string", description: 'Bounty amount in OKB, e.g. "0.01"' },
      },
      required: ["taskDescription", "successCriteria", "amountOkb"],
    },
  },
  {
    name: "ai_verification_settlement",
    description:
      "Two independent AI evaluators grade a submitted task against its success criteria in parallel. If they agree with high confidence, payment auto-releases or refunds on-chain. If they disagree, the case escalates to a third arbitrator. Requires an escrowId in SUBMITTED state.",
    inputSchema: {
      type: "object",
      properties: {
        escrowId: { type: "string", description: "The escrow ID returned by fund_escrow_task, after work has been submitted" },
      },
      required: ["escrowId"],
    },
  },
];

async function runGemini(prompt: string) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const rawText = result.response.text();
  return { rawText, parsed: JSON.parse(rawText.trim()) as { verdict: string; confidence: number; reasoning: string } };
}

async function callFundEscrowTask(args: { taskDescription: string; successCriteria: string; amountOkb: string }) {
  const creatorContract = getCreatorContract();
  const creatorAddress = (creatorContract.runner as ethers.Wallet).address;
  const creatorUser = await getOrCreateUser(creatorAddress);

  const value = ethers.parseEther(String(args.amountOkb));
  const tx = await creatorContract.createAndFundEscrow(args.taskDescription, args.successCriteria, { value });
  const receipt = await tx.wait();
  const chainEscrowId = parseEscrowIdFromReceipt(receipt, creatorContract);

  const escrow = await prisma.escrow.create({
    data: {
      taskDescription: args.taskDescription,
      successCriteria: args.successCriteria,
      amount: value.toString(),
      status: "FUNDED",
      creatorId: creatorUser.id,
      chainEscrowId,
      contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
      txHashCreate: receipt.hash,
    },
  });

  return { escrowId: escrow.id, chainEscrowId, txHash: receipt.hash, status: "FUNDED" };
}

async function callAiVerificationSettlement(args: { escrowId: string }) {
  const escrow = await prisma.escrow.findUnique({
    where: { id: args.escrowId },
    include: { submissions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!escrow) return { error: "Escrow not found" };
  if (escrow.status !== "SUBMITTED") return { error: `Escrow is in ${escrow.status}, not SUBMITTED` };
  const submission = escrow.submissions[0];

  const promptArgs = {
    taskDescription: escrow.taskDescription,
    successCriteria: escrow.successCriteria,
    submissionContent: submission.content,
    evidenceUrl: submission.evidenceUrl,
  };

  const [a, b] = await Promise.all([
    runGemini(buildEvaluatorAPrompt(promptArgs)),
    runGemini(buildEvaluatorBPrompt(promptArgs)),
  ]);

  await prisma.aIEvaluation.create({
    data: {
      escrowId: escrow.id,
      submissionId: submission.id,
      verdict: a.parsed.verdict as "PASS" | "FAIL" | "NEEDS_HUMAN_REVIEW",
      confidence: a.parsed.confidence,
      reasoning: `[Evaluator A] ${a.parsed.reasoning}`,
      promptVersion: VERIFIER_PROMPT_VERSION,
      rawModelOutput: a.rawText,
    },
  });
  await prisma.aIEvaluation.create({
    data: {
      escrowId: escrow.id,
      submissionId: submission.id,
      verdict: b.parsed.verdict as "PASS" | "FAIL" | "NEEDS_HUMAN_REVIEW",
      confidence: b.parsed.confidence,
      reasoning: `[Evaluator B] ${b.parsed.reasoning}`,
      promptVersion: VERIFIER_PROMPT_VERSION,
      rawModelOutput: b.rawText,
    },
  });

  const agree = a.parsed.verdict === b.parsed.verdict;
  const bothConfident = a.parsed.confidence >= CONFIDENCE_THRESHOLD && b.parsed.confidence >= CONFIDENCE_THRESHOLD;
  const decisive = agree && (a.parsed.verdict === "PASS" || a.parsed.verdict === "FAIL");

  if (!decisive || !bothConfident) {
    await prisma.escrow.update({ where: { id: escrow.id }, data: { status: "DISPUTED" } });
    return { status: "DISPUTED", evaluatorA: a.parsed, evaluatorB: b.parsed };
  }

  const passed = a.parsed.verdict === "PASS";
  const contract = getVerifierContract();
  const tx = await contract.submitVerdict(escrow.chainEscrowId, passed, `Consensus: ${a.parsed.reasoning.slice(0, 150)}`);
  const receipt = await tx.wait();

  await prisma.escrow.update({
    where: { id: escrow.id },
    data: { status: passed ? "RELEASED" : "REFUNDED", txHashRelease: receipt.hash },
  });

  return { status: passed ? "RELEASED" : "REFUNDED", txHash: receipt.hash, evaluatorA: a.parsed, evaluatorB: b.parsed };
}

function rpcResult(id: any, result: any) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id: any, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = body;

  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "docket-arbiter", version: "1.0.0" },
      });
    }

    if (method === "notifications/initialized") {
      return new NextResponse(null, { status: 202 });
    }

    if (method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params;
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
    console.error("MCP error:", err);
    return rpcError(id, -32000, err.message || "Internal error");
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", protocol: "mcp", tools: TOOLS.map((t) => t.name) });
}
