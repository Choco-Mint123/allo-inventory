// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: { warehouse: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Compute available stock (total - reserved) for each warehouse
    const result = products.map((product) => ({
      ...product,
      stocks: product.stocks.map((stock) => ({
        warehouseId: stock.warehouseId,
        warehouseName: stock.warehouse.name,
        warehouseLocation: stock.warehouse.location,
        total: stock.total,
        reserved: stock.reserved,
        available: stock.total - stock.reserved,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/products]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
