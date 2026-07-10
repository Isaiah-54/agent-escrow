import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildVerifierPrompt, VERIFIER_PROMPT_VERSION } from "@/lib/prompts/verifierPromptV1";
import { getVerifierContract } from "@/lib/contract";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Below this confidence, we never auto-release funds — flagged for human review instead.
const CONFIDENCE_THRESHOLD = 0.75;

export async function POST(req: NextRequest) {
  try {
    const { escrowId } = await req.json();
    if (!escrowId) {
      return NextResponse.json({ error: "escrowId is required" }, { status: 400 });
    }

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

    // --- Call Gemini to grade the submission ---
    const prompt = buildVerifierPrompt({
      taskDescription: escrow.taskDescription,
      successCriteria: escrow.successCriteria,
      submissionContent: submission.content,
      evidenceUrl: submission.evidenceUrl,
    });

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    let parsed: { verdict: string; confidence: number; reasoning: string };
    try {
      parsed = JSON.parse(rawText.trim());
    } catch {
      return NextResponse.json({ error: "AI response was not valid JSON", raw: rawText }, { status: 502 });
    }

    // --- Save the evaluation for audit purposes, regardless of outcome ---
    await prisma.aIEvaluation.create({
      data: {
        escrowId: escrow.id,
        submissionId: submission.id,
        verdict: parsed.verdict as "PASS" | "FAIL" | "NEEDS_HUMAN_REVIEW",
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        promptVersion: VERIFIER_PROMPT_VERSION,
        rawModelOutput: rawText,
      },
    });

    await prisma.auditLog.create({
      data: {
        escrowId: escrow.id,
        action: "AI_EVALUATION",
        actor: "system",
        details: `Verdict: ${parsed.verdict}, confidence: ${parsed.confidence}`,
      },
    });

    // --- Low confidence or explicit human-review verdict: stop here, don't touch the contract ---
    if (parsed.verdict === "NEEDS_HUMAN_REVIEW" || parsed.confidence < CONFIDENCE_THRESHOLD) {
      await prisma.escrow.update({ where: { id: escrow.id }, data: { status: "UNDER_REVIEW" } });
      return NextResponse.json({ status: "UNDER_REVIEW", ...parsed });
    }

    // --- High-confidence PASS/FAIL: call the contract to actually move funds ---
    const passed = parsed.verdict === "PASS";
    const contract = getVerifierContract();
    const tx = await contract.submitVerdict(escrow.chainEscrowId, passed, parsed.reasoning.slice(0, 200));
    const receipt = await tx.wait();

    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: passed ? "RELEASED" : "REFUNDED",
        txHashRelease: receipt.hash,
      },
    });

    return NextResponse.json({ status: passed ? "RELEASED" : "REFUNDED", txHash: receipt.hash, ...parsed });
  } catch (err: any) {
    console.error("Evaluate error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
