"use server";

import { revalidatePath } from "next/cache";
import { utcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { RATE_LIMITS, SLOW_DOWN, type FormState } from "@/lib/form-state";
import * as repo from "@/lib/repo";
import { currentIpHash, ensureVoterId } from "@/lib/session";
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
  if (!(await repo.getPack(db, slug))) return { status: "error", message: "That pack doesn't exist." };
  const ipHash = await currentIpHash();
  if (await tooMany("reviews", ipHash)) return { status: "error", message: SLOW_DOWN };

  await repo.getDaily(db, slug, utcDay());
  await repo.addReview(db, { slug, day: utcDay(), ...parsed.value, ipHash });
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
  if (!(await repo.getPack(db, slug))) return { status: "error", message: "That pack doesn't exist." };
  const ipHash = await currentIpHash();
  if (await tooMany("entries", ipHash)) return { status: "error", message: SLOW_DOWN };

  const result = await repo.addLine(db, { slug, ...parsed.value, ipHash });
  if (result === "duplicate") return { status: "error", errors: { body: "Someone beat you to that one." } };
  return { status: "ok" };
}

export async function pitchPack(_prev: FormState, form: FormData): Promise<FormState> {
  if (isBot(form)) return { status: "ok" };
  const parsed = parsePitch(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const ipHash = await currentIpHash();
  if (await tooMany("pitches", ipHash)) return { status: "error", message: SLOW_DOWN };
  const result = await repo.addPitch(await getDb(), { ...parsed.value, ipHash });
  if (result === "taken") return { status: "error", errors: { slug: `/${parsed.value.slug} is already a live pack.` } };
  if (result === "duplicate") {
    return { status: "error", errors: { slug: `Someone already pitched /${parsed.value.slug}. Find it in Explore and upvote it.` } };
  }
  return { status: "ok" };
}

/** Follow / unfollow. `path` is the page to refresh. */
export async function followAction(slug: string, path: string): Promise<void> {
  const voter = await ensureVoterId();
  await repo.toggleFollow(await getDb(), voter, slug);
  revalidatePath(path);
  revalidatePath("/");
}

export async function voteAction(pitchId: number, path: string): Promise<void> {
  const voter = await ensureVoterId();
  await repo.toggleVote(await getDb(), pitchId, voter);
  revalidatePath(path);
  revalidatePath("/");
}
