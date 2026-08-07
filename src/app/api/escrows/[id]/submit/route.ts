import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// POST /api/escrows/[id]/submit
// Browser already signed submitResult. This only records content + tx.
// Does NOT use WORKER_PRIVATE_KEY.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const content = body?.content;
    const evidenceUrl = body?.evidenceUrl;
    const walletAddress = body?.walletAddress;
    const txHash = body?.txHash;

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }
    if (!walletAddress || !txHash) {
      return NextResponse.json(
        { error: "walletAddress and txHash are required" },
        { status: 400 }
      );
    }

    const escrow = await prisma.escrow.findUnique({ where: { id } });
    if (!escrow) {
      return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    }
    if (escrow.status !== "ACCEPTED") {
      return NextResponse.json(
        { error: `Escrow is in ${escrow.status} state, not ACCEPTED` },
        { status: 400 }
      );
    }

    const submission = await prisma.submission.create({
      data: {
        escrowId: id,
        content,
        evidenceUrl: evidenceUrl || null,
      },
    });

    const updatedEscrow = await prisma.escrow.update({
      where: { id },
      data: { status: "SUBMITTED" },
    });

    await prisma.auditLog.create({
      data: {
        escrowId: id,
        action: "RESULT_SUBMITTED",
        actor: walletAddress.toLowerCase(),
        details: `Submission ${submission.id}, tx ${txHash}`,
      },
    });

    return NextResponse.json({ escrow: updatedEscrow, submission });
  } catch (err) {
    console.error("Submit result error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
