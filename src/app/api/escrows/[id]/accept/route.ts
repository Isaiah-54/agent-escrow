import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
import { getWorkerContract } from "@/lib/contract";
import { getOrCreateUser } from "@/lib/users";

const prisma = new PrismaClient();

// POST /api/escrows/[id]/accept — Agent B accepts an open, funded task
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const escrow = await prisma.escrow.findUnique({ where: { id } });
    if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
    if (escrow.status !== "FUNDED") {
      return NextResponse.json({ error: `Escrow is in ${escrow.status} state, not FUNDED` }, { status: 400 });
    }

    const workerContract = getWorkerContract();
    const workerAddress = (workerContract.runner as ethers.Wallet).address;
    const workerUser = await getOrCreateUser(workerAddress);

    const tx = await workerContract.acceptTask(escrow.chainEscrowId);
    const receipt = await tx.wait();

    const updated = await prisma.escrow.update({
      where: { id },
      data: { status: "ACCEPTED", workerId: workerUser.id },
    });

    await prisma.auditLog.create({
      data: {
        escrowId: id,
        action: "TASK_ACCEPTED",
        actor: workerAddress,
        details: `tx ${receipt.hash}`,
      },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("Accept task error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
