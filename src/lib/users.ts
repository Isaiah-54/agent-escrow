import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getOrCreateUser(walletAddress: string) {
  const normalized = walletAddress.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { walletAddress: normalized } });
  if (existing) return existing;
  return prisma.user.create({ data: { walletAddress: normalized } });
}
