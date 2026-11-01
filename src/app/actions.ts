"use server";

import { revalidatePath } from "next/cache";
import { utcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { RATE_LIMITS, SLOW_DOWN, type FormState } from "@/lib/form-state";
import * as repo from "@/lib/repo";
import { currentIpHash, toggleList } from "@/lib/session";
import { isBot, parseLine, parsePitch, parseReview } from "@/lib/validation";

async function tooMany(kind: keyof typeof RATE_LIMITS, ipHash: string): Promise<boolean> {
  const { max, minutes } = RATE_LIMITS[kind];
  return (await repo.recentCount(await getDb(), kind, ipHash, minutes)) >= max;
}

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export async function postReview(_prev: FormState, form: FormData): Promise<FormState> {
  const slug = field(form, "pack");
  if (isBot(form)) return { status: "ok", message: "Thanks!" };
  if (field(form, "day") !== utcDay()) {
    return { status: "error", message: "That daily has ended. Refresh for today's." };
  }
  const parsed = parseReview(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const db = await getDb();
  if (!(await repo.getLivePack(db, slug))) return { status: "error", message: "That pack doesn't exist." };
  const ipHash = await currentIpHash();
  if (await tooMany("reviews", ipHash)) return { status: "error", message: SLOW_DOWN };

  const daily = await repo.getDaily(db, slug, utcDay());
  if (!daily) return { status: "error", message: "There's no line to rate today." };
  await repo.addReview(db, { slug, day: utcDay(), entryId: daily.entryId, ...parsed.value, ipHash });
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/reports`);
  return {
    status: "ok",
    message: parsed.value.body
      ? `You gave it a ${parsed.value.score}/5. Your report is live in Field reports.`
      : `You gave it a ${parsed.value.score}/5.`,
  };
}

export async function submitLine(_prev: FormState, form: FormData): Promise<FormState> {
  const slug = field(form, "pack");
  if (isBot(form)) return { status: "ok" };
  const parsed = parseLine(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const db = await getDb();
  const pack = await repo.getLivePack(db, slug);
  if (!pack) return { status: "error", message: "That pack doesn't exist." };
  if (pack.kind === "cards" && !parsed.value.back) return { status: "error", errors: { back: "Add the back of the card." } };
  const ipHash = await currentIpHash();
  if (await tooMany("entries", ipHash)) return { status: "error", message: SLOW_DOWN };
  const back = pack.kind === "cards" ? parsed.value.back : null;
  const result = await repo.addLine(db, { slug, body: parsed.value.body, back, author: parsed.value.credit, ipHash });
  if (result === "missing") return { status: "error", message: "That pack doesn't exist." };
  if (result === "duplicate") return { status: "error", errors: { body: "Someone beat you to that one." } };
  return { status: "ok" };
}

export async function pitchPack(_prev: FormState, form: FormData): Promise<FormState> {
  if (isBot(form)) return { status: "ok" };
  const parsed = parsePitch(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const ipHash = await currentIpHash();
  if (await tooMany("packs", ipHash)) return { status: "error", message: SLOW_DOWN };
  const { credit, ...rest } = parsed.value;
  const result = await repo.addPitch(await getDb(), { ...rest, author: credit, ipHash });
  const name = `/${parsed.value.slug}`;
  if (result === "taken") return { status: "error", errors: { slug: `${name} is already a live pack.` } };
  if (result === "unavailable") return { status: "error", errors: { slug: `${name} isn't available. Try another name.` } };
  if (result === "duplicate") {
    return { status: "error", errors: { slug: `Someone already pitched ${name}. Find it in Explore and upvote it.` } };
  }
  return { status: "ok" };
}

/** Follow / unfollow: the list lives in a cookie, the count in the database. */
export async function followAction(slug: string, path: string): Promise<void> {
  const db = await getDb();
  if (!(await repo.getLivePack(db, slug))) return;
  const added = await toggleList("follows", slug);
  await repo.changeFollowers(db, slug, added ? 1 : -1);
  revalidatePath(path);
  revalidatePath("/");
}

/** Upvote / remove upvote on a pitch in the pile. Same idea as follows. */
export async function voteAction(slug: string, path: string): Promise<void> {
  const db = await getDb();
  if ((await repo.getPack(db, slug))?.status !== "pile") return;
  const added = await toggleList("votes", slug);
  await repo.changeVotes(db, slug, added ? 1 : -1);
  revalidatePath(path);
  revalidatePath("/");
}
