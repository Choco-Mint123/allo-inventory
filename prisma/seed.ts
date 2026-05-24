// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Clean up
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create warehouses
  const mumbai = await prisma.warehouse.create({
    data: { name: "Mumbai Central", location: "Mumbai, MH" },
  });
  const delhi = await prisma.warehouse.create({
    data: { name: "Delhi North", location: "Delhi, DL" },
  });
  const bangalore = await prisma.warehouse.create({
    data: { name: "Bangalore Hub", location: "Bangalore, KA" },
  });

  // Create products
  const products = [
    {
      name: "Wireless Headphones",
      description: "Premium noise-cancelling over-ear headphones",
      price: 4999,
      imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
    },
    {
      name: "Smart Watch",
      description: "Fitness tracker with AMOLED display",
      price: 8999,
      imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
    },
    {
      name: "Mechanical Keyboard",
      description: "TKL layout with RGB backlighting",
      price: 3499,
      imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400",
    },
    {
      name: "USB-C Hub",
      description: "7-in-1 multiport adapter for laptops",
      price: 1999,
      imageUrl: "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=400",
    },
  ];

  for (const p of products) {
    const product = await prisma.product.create({ data: p });

    // Add stock in each warehouse
    await prisma.stock.createMany({
      data: [
        { productId: product.id, warehouseId: mumbai.id, total: 5, reserved: 0 },
        { productId: product.id, warehouseId: delhi.id, total: 3, reserved: 0 },
        { productId: product.id, warehouseId: bangalore.id, total: 2, reserved: 0 },
      ],
    });
  }

  console.log("✅ Seeded database successfully");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
