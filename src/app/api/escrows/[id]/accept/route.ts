import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// POST /api/escrows/[id]/accept
// Browser already signed acceptTask. This only records it.
// Does NOT call the contract or use WORKER_PRIVATE_KEY.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const walletAddress = body?.walletAddress;
    const txHash = body?.txHash;

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

    if (escrow.status !== "FUNDED") {
      return NextResponse.json(
        { error: `Escrow is in ${escrow.status} state, not FUNDED` },
        { status: 400 }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();
    const workerUser = await prisma.user.upsert({
      where: { walletAddress: normalizedAddress },
      update: {},
      create: { walletAddress: normalizedAddress },
    });

    const updated = await prisma.escrow.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        workerId: workerUser.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        escrowId: id,
        action: "TASK_ACCEPTED",
        actor: normalizedAddress,
        details: `tx ${txHash}`,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Accept task error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
