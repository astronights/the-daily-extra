// Request-scoped helpers: who is this (anonymously), and are they the admin.
import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { adminToken, hashIp, safeEqual } from "./crypto.ts";

const VOTER_COOKIE = "td_vid";
const ADMIN_COOKIE = "td_admin";
const YEAR = 60 * 60 * 24 * 365;

function secret(): string {
  return process.env.SESSION_SECRET || "local-dev-secret";
}

export async function currentIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return hashIp(secret(), ip);
}

/** Anonymous id kept in a cookie. Used for follows and upvotes. */
export async function readVoterId(): Promise<string | null> {
  return (await cookies()).get(VOTER_COOKIE)?.value ?? null;
}

/** Same, but creates the cookie if missing. Only call from server actions. */
export async function ensureVoterId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VOTER_COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  jar.set(VOTER_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: YEAR, path: "/" });
  return id;
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export async function isAdmin(): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(token) && safeEqual(token!, adminToken(secret(), password));
}

/** Checks the password and sets the admin cookie. */
export async function signIn(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !safeEqual(password, expected)) return false;
  (await cookies()).set(ADMIN_COOKIE, adminToken(secret(), expected), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return true;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
