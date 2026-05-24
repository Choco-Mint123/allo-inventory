// src/app/api/reservations/[id]/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });

      if (!reservation) throw new Error("NOT_FOUND");

      // Idempotent: if already released, return as-is
      if (reservation.status === "RELEASED") {
        return reservation;
      }

      if (reservation.status === "CONFIRMED") {
        throw new Error("ALREADY_CONFIRMED");
      }

      // Release the held units back to available
      await tx.stock.updateMany({
        where: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
        data: { reserved: { decrement: reservation.quantity } },
      });

      return tx.reservation.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: new Date() },
        include: { product: true, warehouse: true },
      });
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      }
      if (error.message === "ALREADY_CONFIRMED") {
        return NextResponse.json(
          { error: "Cannot release a confirmed reservation" },
          { status: 409 }
        );
      }
    }
    console.error("[POST /api/reservations/[id]/release]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
