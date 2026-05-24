// src/lib/redis.ts
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Distributed lock helpers
export async function acquireLock(
  key: string,
  ttlSeconds = 10
): Promise<boolean> {
  // SET key value NX EX ttl — only sets if key doesn't exist
  const result = await redis.set(`lock:${key}`, "1", {
    nx: true,
    ex: ttlSeconds,
  });
  return result === "OK";
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`);
}
