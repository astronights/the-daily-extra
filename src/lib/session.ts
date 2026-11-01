// Request-scoped helpers: the visitor's cookies, and whether they're the admin.
import { cookies, headers } from "next/headers";
import { parseList, toggleInList } from "./cookie-list.ts";
import { adminToken, hashIp, safeEqual } from "./crypto.ts";

const FOLLOWS_COOKIE = "td_follows";
const VOTES_COOKIE = "td_votes";
const ADMIN_COOKIE = "td_admin";
const YEAR = 60 * 60 * 24 * 365;

export type ListName = "follows" | "votes";
const LIST_COOKIES: Record<ListName, string> = { follows: FOLLOWS_COOKIE, votes: VOTES_COOKIE };

function secret(): string {
  return process.env.SESSION_SECRET || "local-dev-secret";
}

export async function currentIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return hashIp(secret(), ip);
}

/** Packs this visitor follows, or pitches they've upvoted. */
export async function readList(name: ListName): Promise<string[]> {
  return parseList((await cookies()).get(LIST_COOKIES[name])?.value);
}

/** Adds or removes a pack from a list cookie. Only call from server actions. */
export async function toggleList(name: ListName, slug: string): Promise<boolean> {
  const jar = await cookies();
  const { list, added } = toggleInList(parseList(jar.get(LIST_COOKIES[name])?.value), slug);
  jar.set(LIST_COOKIES[name], list.join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: YEAR,
    path: "/",
  });
  return added;
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
