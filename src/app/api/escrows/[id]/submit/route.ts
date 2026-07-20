import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
import { getWorkerContract } from "@/lib/contract";

const prisma = new PrismaClient();

// POST /api/escrows/[id]/submit — Agent B submits completed work
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { content, evidenceUrl } = await req.json();
    if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

    const escrow = await prisma.escrow.findUnique({ where: { id } });
    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    if (escrow.status !== "ACCEPTED") {
      return NextResponse.json({ error: `Escrow is in ${escrow.status} state, not ACCEPTED` }, { status: 400 });
    }

    const submission = await prisma.submission.create({
      data: { escrowId: id, content, evidenceUrl: evidenceUrl || null },
    });

    // Store a short pointer on-chain (full content lives in Postgres) to save gas.
    const workerContract = getWorkerContract();
    const tx = await workerContract.submitResult(escrow.chainEscrowId, `db:${submission.id}`);
    const receipt = await tx.wait();

    const updatedEscrow = await prisma.escrow.update({
      where: { id },
      data: { status: "SUBMITTED" },
    });

    await prisma.auditLog.create({
      data: {
        escrowId: id,
        action: "RESULT_SUBMITTED",
        actor: (workerContract.runner as ethers.Wallet).address,
        details: `Submission ${submission.id}, tx ${receipt.hash}`,
      },
    });

    return NextResponse.json({ escrow: updatedEscrow, submission });
  } catch (err) {
    console.error("Submit result error:", err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : "Internal error") }, { status: 500 });
  }
}
