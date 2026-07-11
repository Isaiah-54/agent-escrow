import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const escrow = await prisma.escrow.findUnique({
    where: { id },
    include: {
      creator: true,
      worker: true,
      submissions: true,
      evaluations: true,
      auditLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!escrow) return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
  return NextResponse.json(escrow);
}
