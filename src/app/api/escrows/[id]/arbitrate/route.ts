import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildArbitratorPrompt, VERIFIER_PROMPT_VERSION } from "@/lib/prompts/verifierPromptV1";
import { getVerifierContract } from "@/lib/contract";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function runGemini(prompt: string) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const rawText = result.response.text();
  return {
    rawText,
    parsed: JSON.parse(rawText.trim()) as { verdict: string; confidence: number; reasoning: string },
  };
}

// POST /api/escrows/[id]/arbitrate — resolves a DISPUTED case with a
// binding third-agent ruling, then settles on-chain.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        submissions: { orderBy: { createdAt: "desc" }, take: 1 },
        evaluations: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    if (escrow.status !== "DISPUTED") {
      return NextResponse.json(
        { error: `Escrow is in ${escrow.status} state, not DISPUTED` },
        { status: 400 }
      );
    }

    const submission = escrow.submissions[0];
    if (!submission) {
      return NextResponse.json({ error: "No submission found for this escrow" }, { status: 400 });
    }

    // Pull only the two evaluations attached to THIS submission, so a
    // second dispute cycle (if one ever happens) can't accidentally mix
    // in stale evaluations from an earlier submission on the same escrow.
    const thisSubmissionEvals = escrow.evaluations.filter(
      (e) => e.submissionId === submission.id
    );
    if (thisSubmissionEvals.length < 2) {
      return NextResponse.json(
        { error: "Expected two prior evaluations (Evaluator A and B) for this submission, found fewer" },
        { status: 400 }
      );
    }

    // Evaluations are tagged in their reasoning text at creation time —
    // recover A/B by that tag rather than by array order/insertion timing,
    // which is not guaranteed under Promise.all.
    const evalARecord = thisSubmissionEvals.find((e) => e.reasoning.startsWith("[Evaluator A]"));
    const evalBRecord = thisSubmissionEvals.find((e) => e.reasoning.startsWith("[Evaluator B]"));
    if (!evalARecord || !evalBRecord) {
      return NextResponse.json(
        { error: "Could not identify Evaluator A and Evaluator B records among prior evaluations" },
        { status: 400 }
      );
    }

    const evalA = {
      verdict: evalARecord.verdict,
      confidence: evalARecord.confidence,
      reasoning: evalARecord.reasoning.replace(/^\[Evaluator A\]\s*/, ""),
    };
    const evalB = {
      verdict: evalBRecord.verdict,
      confidence: evalBRecord.confidence,
      reasoning: evalBRecord.reasoning.replace(/^\[Evaluator B\]\s*/, ""),
    };

    const prompt = buildArbitratorPrompt({
      taskDescription: escrow.taskDescription,
      successCriteria: escrow.successCriteria,
      submissionContent: submission.content,
      evidenceUrl: submission.evidenceUrl,
      evalA,
      evalB,
    });

    const result = await runGemini(prompt);

    // Arbitrator prompt explicitly forbids NEEDS_HUMAN_REVIEW, but guard
    // against a model deviating from instructions rather than trusting it.
    if (result.parsed.verdict !== "PASS" && result.parsed.verdict !== "FAIL") {
      return NextResponse.json(
        {
          error: `Arbitrator returned an invalid terminal verdict: ${result.parsed.verdict}. Escrow remains DISPUTED.`,
          raw: result.parsed,
        },
        { status: 502 }
      );
    }

    await prisma.aIEvaluation.create({
      data: {
        escrowId: escrow.id,
        submissionId: submission.id,
        verdict: result.parsed.verdict as "PASS" | "FAIL",
        confidence: result.parsed.confidence,
        reasoning: `[Arbitrator] ${result.parsed.reasoning}`,
        promptVersion: VERIFIER_PROMPT_VERSION,
        rawModelOutput: result.rawText,
      },
    });

    await prisma.auditLog.create({
      data: {
        escrowId: escrow.id,
        action: "ARBITRATION_RULING",
        actor: "system",
        details: `Arbitrator ruled ${result.parsed.verdict} (confidence ${result.parsed.confidence}) after Evaluator A/B disagreement.`,
      },
    });

    const passed = result.parsed.verdict === "PASS";
    const contract = getVerifierContract();
    const tx = await contract.submitVerdict(
      escrow.chainEscrowId,
      passed,
      `Arbitration: ${result.parsed.reasoning.slice(0, 150)}`
    );
    const receipt = await tx.wait();

    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: passed ? "RELEASED" : "REFUNDED", txHashRelease: receipt.hash },
    });

    return NextResponse.json({
      status: passed ? "RELEASED" : "REFUNDED",
      txHash: receipt.hash,
      arbitration: true,
      evaluatorA: evalA,
      evaluatorB: evalB,
      arbitrator: result.parsed,
    });
  } catch (err: any) {
    console.error("Arbitrate error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
