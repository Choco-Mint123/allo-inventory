// src/app/api/cron/expire-reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// This route is called by Vercel Cron every minute.
// It finds all PENDING reservations past their expiresAt and releases them.
export async function GET(req: NextRequest) {
  // Protect this route in production — Vercel sends a secret header
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Find expired pending reservations
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
    });

    let released = 0;

    for (const reservation of expired) {
      await prisma.$transaction(async (tx) => {
        // Re-check status inside transaction to avoid races
        const current = await tx.reservation.findUnique({
          where: { id: reservation.id },
        });
        if (!current || current.status !== "PENDING") return;

        await tx.stock.updateMany({
          where: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
          data: { reserved: { decrement: reservation.quantity } },
        });

        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "RELEASED", releasedAt: now },
        });

        released++;
      });
    }

    return NextResponse.json({
      ok: true,
      checked: expired.length,
      released,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[cron/expire-reservations]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
