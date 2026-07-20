import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET /api/health â€” unauthenticated liveness check. Verifies the process is
// up and the database is reachable. Does NOT touch the x402 facilitator or
// on-chain RPC on purpose: those are external dependencies with their own
// latency/rate limits, and a health check that calls out to a third party on
// every hit is a good way to get rate-limited or to report "unhealthy" for
// reasons that have nothing to do with this service being up.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "docket-arbiter", db: "ok" });
  } catch (err) {
    console.error("Health check DB failure:", err);
    return NextResponse.json(
      { status: "degraded", service: "docket-arbiter", db: "unreachable" },
      { status: 503 }
    );
  }
}
