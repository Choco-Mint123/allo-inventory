// src/app/api/reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, acquireLock, releaseLock } from "@/lib/redis";
import { ReserveSchema } from "@/lib/schemas";

const RESERVATION_TTL_MINUTES = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate input
    const parsed = ReserveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // --- Bonus: Idempotency ---
    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      const cached = await redis.get<string>(`idem:${idempotencyKey}`);
      if (cached) {
        const existing = await prisma.reservation.findUnique({
          where: { id: cached },
          include: { product: true, warehouse: true },
        });
        if (existing) {
          return NextResponse.json(existing, {
            status: 200,
            headers: { "Idempotency-Replayed": "true" },
          });
        }
      }
    }

    // --- Distributed Lock ---
    // Lock key is scoped to product+warehouse to allow parallel reservations
    // across different products/warehouses
    const lockKey = `${productId}:${warehouseId}`;
    const locked = await acquireLock(lockKey, 15);

    if (!locked) {
      // Another request is currently reserving for this product/warehouse
      return NextResponse.json(
        { error: "Too many concurrent requests, please try again" },
        { status: 429 }
      );
    }

    try {
      // --- Core concurrency-safe stock check using a DB transaction ---
      // We use Prisma's $transaction with SELECT FOR UPDATE semantics via raw query
      // This ensures no two concurrent transactions can both see available stock
      // and both succeed — the second will wait for the first to commit, then
      // see the updated reserved count and correctly return 409.
      const reservation = await prisma.$transaction(async (tx) => {
        // Lock the stock row for this update (SELECT FOR UPDATE)
        const stocks = await tx.$queryRaw<
          Array<{ id: string; total: number; reserved: number }>
        >`
          SELECT id, total, reserved
          FROM "Stock"
          WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
          FOR UPDATE
        `;

        const stock = stocks[0];
        if (!stock) {
          throw new Error("STOCK_NOT_FOUND");
        }

        const available = stock.total - stock.reserved;
        if (available < quantity) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        // Increment reserved count
        await tx.stock.updateMany({
          where: { productId, warehouseId },
          data: { reserved: { increment: quantity } },
        });

        // Create reservation expiring in 10 minutes
        const expiresAt = new Date(
          Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
        );

        const newReservation = await tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt,
            idempotencyKey: idempotencyKey ?? undefined,
          },
          include: { product: true, warehouse: true },
        });

        return newReservation;
      });

      // Cache idempotency key → reservation id (TTL = 24h)
      if (idempotencyKey) {
        await redis.set(`idem:${idempotencyKey}`, reservation.id, { ex: 86400 });
      }

      return NextResponse.json(reservation, { status: 201 });
    } catch (txError: unknown) {
      if (txError instanceof Error) {
        if (txError.message === "INSUFFICIENT_STOCK") {
          return NextResponse.json(
            { error: "Not enough stock available" },
            { status: 409 }
          );
        }
        if (txError.message === "STOCK_NOT_FOUND") {
          return NextResponse.json(
            { error: "Product not found in this warehouse" },
            { status: 404 }
          );
        }
      }
      throw txError;
    } finally {
      await releaseLock(lockKey);
    }
  } catch (error) {
    console.error("[POST /api/reservations]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
