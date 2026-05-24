// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // --- Bonus: Idempotency ---
    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      const cached = await redis.get<string>(`idem:confirm:${idempotencyKey}`);
      if (cached === id) {
        const existing = await prisma.reservation.findUnique({
          where: { id },
          include: { product: true, warehouse: true },
        });
        if (existing) {
          return NextResponse.json(existing, {
            headers: { "Idempotency-Replayed": "true" },
          });
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });

      if (!reservation) throw new Error("NOT_FOUND");

      if (reservation.status === "CONFIRMED") {
        // Already confirmed — idempotent
        return reservation;
      }

      if (reservation.status === "RELEASED") {
        throw new Error("ALREADY_RELEASED");
      }

      // Check expiry
      if (new Date() > reservation.expiresAt) {
        // Auto-release on expired reservation
        await tx.stock.updateMany({
          where: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
          data: { reserved: { decrement: reservation.quantity } },
        });
        await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        throw new Error("EXPIRED");
      }

      // Confirm: decrement total stock (the units are now sold)
      await tx.stock.updateMany({
        where: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
        data: {
          total: { decrement: reservation.quantity },
          reserved: { decrement: reservation.quantity },
        },
      });

      return tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
        include: { product: true, warehouse: true },
      });
    });

    if (idempotencyKey) {
      await redis.set(`idem:confirm:${idempotencyKey}`, id, { ex: 86400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      }
      if (error.message === "EXPIRED") {
        return NextResponse.json(
          { error: "Reservation has expired" },
          { status: 410 }
        );
      }
      if (error.message === "ALREADY_RELEASED") {
        return NextResponse.json(
          { error: "Reservation was already released" },
          { status: 409 }
        );
      }
    }
    console.error("[POST /api/reservations/[id]/confirm]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
