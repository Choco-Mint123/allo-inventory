// src/lib/schemas.ts
import { z } from "zod";

export const ReserveSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
});

export type ReserveInput = z.infer<typeof ReserveSchema>;

export const ReservationStatusEnum = z.enum(["PENDING", "CONFIRMED", "RELEASED"]);
