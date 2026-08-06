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


// POST /api/escrows
// - If txHashCreate + walletAddress are provided: RECORD ONLY (UI path; user already paid on-chain).
// - Otherwise: server creates+funds with CREATOR_PRIVATE_KEY (MCP / agent path).

// POST /api/escrows
// - If txHashCreate + walletAddress: RECORD ONLY (parse chainEscrowId from receipt).
// - Else: server creates+funds with CREATOR_PRIVATE_KEY (MCP path).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      taskDescription,
      successCriteria,
      amountOkb,
      walletAddress,
      txHashCreate,
    } = body;

    if (!taskDescription || !successCriteria || !amountOkb) {
      return NextResponse.json(
        { error: "taskDescription, successCriteria, and amountOkb are required" },
        { status: 400 }
      );
    }

    // UI path: client already signed & paid
    if (txHashCreate && walletAddress) {
      const creatorUser = await getOrCreateUser(walletAddress);
      const value = ethers.parseEther(String(amountOkb));

      // Parse on-chain escrow id from the client's tx receipt
      let chainEscrowId: string | null = null;
      try {
        const provider = new ethers.JsonRpcProvider("https://rpc.xlayer.tech");
        const receipt = await provider.getTransactionReceipt(txHashCreate);
        if (!receipt) {
          return NextResponse.json(
            { error: "Transaction receipt not found yet. Wait a few seconds and retry." },
            { status: 400 }
          );
        }
        if (Number(receipt.status) !== 1) {
          return NextResponse.json(
            { error: "Transaction failed on-chain; cannot record escrow." },
            { status: 400 }
          );
        }
        // Reuse the same ABI parser as server path
        const creatorContract = getCreatorContract();
        chainEscrowId = parseEscrowIdFromReceipt(
          receipt as unknown as ethers.ContractTransactionReceipt,
          creatorContract
        );
      } catch (parseErr) {
        console.error("Failed to parse chainEscrowId from client tx:", parseErr);
        return NextResponse.json(
          {
            error:
              parseErr instanceof Error
                ? parseErr.message
                : "Could not parse EscrowCreated event from tx",
          },
          { status: 400 }
        );
      }

      const escrow = await prisma.escrow.create({
        data: {
          taskDescription,
          successCriteria,
          amount: value.toString(),
          status: "FUNDED",
          creatorId: creatorUser.id,
          chainEscrowId,
          contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
          txHashCreate,
        },
      });

      await prisma.auditLog.create({
        data: {
          escrowId: escrow.id,
          action: "ESCROW_CREATED",
          actor: walletAddress,
          details: `Client-funded ${amountOkb} OKB, chain escrow #${chainEscrowId}, tx ${txHashCreate}`,
        },
      });

      return NextResponse.json(escrow, { status: 201 });
    }

    // MCP / server path
    const creatorContract = getCreatorContract();
    const creatorAddress = (creatorContract.runner as ethers.Wallet).address;
    const creatorUser = await getOrCreateUser(creatorAddress);
    const value = ethers.parseEther(String(amountOkb));

    const tx = await creatorContract.createAndFundEscrow(
      taskDescription,
      successCriteria,
      { value }
    );
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
        details: `Server-funded ${amountOkb} OKB, chain escrow #${chainEscrowId}, tx ${receipt.hash}`,
      },
    });

    return NextResponse.json(escrow, { status: 201 });
  } catch (err) {
    console.error("Create escrow error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}


