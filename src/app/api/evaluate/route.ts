import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildEvaluatorAPrompt, buildEvaluatorBPrompt, VERIFIER_PROMPT_VERSION } from "@/lib/prompts/verifierPromptV1";
import { getVerifierContract } from "@/lib/contract";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const CONFIDENCE_THRESHOLD = 0.75;

async function runGemini(prompt: string) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const rawText = result.response.text();
  return { rawText, parsed: JSON.parse(rawText.trim()) as { verdict: string; confidence: number; reasoning: string } };
}

export async function POST(req: NextRequest) {
  try {
    const { escrowId } = await req.json();
    if (!escrowId) return NextResponse.json({ error: "escrowId is required" }, { status: 400 });

    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { submissions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    if (escrow.status !== "SUBMITTED") {
      return NextResponse.json({ error: `Escrow is in ${escrow.status} state, not SUBMITTED` }, { status: 400 });
    }
    const submission = escrow.submissions[0];
    if (!submission) return NextResponse.json({ error: "No submission found for this escrow" }, { status: 400 });

    const promptArgs = {
      taskDescription: escrow.taskDescription,
      successCriteria: escrow.successCriteria,
      submissionContent: submission.content,
      evidenceUrl: submission.evidenceUrl,
    };

    // --- Two independent agents evaluate the same submission in parallel ---
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
    const decisiveVerdict = agree && (a.parsed.verdict === "PASS" || a.parsed.verdict === "FAIL");

    await prisma.auditLog.create({
      data: {
        escrowId: escrow.id,
        action: "MULTI_AGENT_EVALUATION",
        actor: "system",
        details: `Evaluator A: ${a.parsed.verdict} (${a.parsed.confidence}) · Evaluator B: ${b.parsed.verdict} (${b.parsed.confidence}) · agree=${agree}`,
      },
    });

    // --- Evaluators disagree, or agree but lack confidence: escalate to arbitration ---
    if (!decisiveVerdict || !bothConfident) {
      await prisma.escrow.update({ where: { id: escrow.id }, data: { status: "DISPUTED" } });
      return NextResponse.json({
        status: "DISPUTED",
        reason: !agree ? "Evaluators disagreed — escalated to arbitrator." : "Evaluators agreed but confidence too low — escalated to arbitrator.",
        evaluatorA: a.parsed,
        evaluatorB: b.parsed,
      });
    }

    // --- Both evaluators agree with high confidence: settle automatically on-chain ---
    const passed = a.parsed.verdict === "PASS";
    const contract = getVerifierContract();
    const tx = await contract.submitVerdict(
      escrow.chainEscrowId,
      passed,
      `Consensus: ${a.parsed.reasoning.slice(0, 150)}`
    );
    const receipt = await tx.wait();

    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: passed ? "RELEASED" : "REFUNDED", txHashRelease: receipt.hash },
    });

    return NextResponse.json({
      status: passed ? "RELEASED" : "REFUNDED",
      txHash: receipt.hash,
      consensus: true,
      evaluatorA: a.parsed,
      evaluatorB: b.parsed,
    });
  } catch (err: any) {
    console.error("Evaluate error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
