import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
import { getCreatorContract, parseEscrowIdFromReceipt } from "@/lib/contract";
import { getOrCreateUser } from "@/lib/users";

const prisma = new PrismaClient();

// GET /api/escrows — list all escrows, newest first (for the dashboard)
export async function GET() {
  const escrows = await prisma.escrow.findMany({
    orderBy: { createdAt: "desc" },
    include: { creator: true, worker: true, submissions: true, evaluations: true },
  });
  return NextResponse.json(escrows);
}

// POST /api/escrows — Agent A creates and funds a new task
export async function POST(req: NextRequest) {
  try {
    const { taskDescription, successCriteria, amountOkb } = await req.json();
    if (!taskDescription || !successCriteria || !amountOkb) {
      return NextResponse.json(
        { error: "taskDescription, successCriteria, and amountOkb are required" },
        { status: 400 }
      );
    }

    const creatorContract = getCreatorContract();
    const creatorAddress = (creatorContract.runner as ethers.Wallet).address;
    const creatorUser = await getOrCreateUser(creatorAddress);

    const value = ethers.parseEther(String(amountOkb));
    const tx = await creatorContract.createAndFundEscrow(taskDescription, successCriteria, { value });
    const receipt = await tx.wait();
    const chainEscrowId = parseEscrowIdFromReceipt(receipt, creatorContract);

    const escrow = await prisma.escrow.create({
      data: {
        taskDescription,
        successCriteria,
        amount: value.toString(),
        status: "FUNDED",
        creatorId: creatorUser.id,
        chainEscrowId,
        contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
        txHashCreate: receipt.hash,
      },
    });

    await prisma.auditLog.create({
      data: {
        escrowId: escrow.id,
        action: "ESCROW_CREATED",
        actor: creatorAddress,
        details: `Funded ${amountOkb} OKB, chain escrow #${chainEscrowId}, tx ${receipt.hash}`,
      },
    });

    return NextResponse.json(escrow, { status: 201 });
  } catch (err: any) {
    console.error("Create escrow error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
