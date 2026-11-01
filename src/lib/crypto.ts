import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** One-way hash of an IP so we can rate-limit without storing addresses. */
export function hashIp(secret: string, ip: string): string {
  return createHash("sha256").update(`${secret}:${ip}`).digest("hex").slice(0, 32);
}

/** Value stored in the admin cookie. Changes if the password or secret changes. */
export function adminToken(secret: string, password: string): string {
  return createHmac("sha256", secret).update(`admin:${password}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
