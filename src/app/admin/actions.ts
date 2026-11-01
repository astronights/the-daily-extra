"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { utcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { PALETTE, type Tone } from "@/lib/palette";
import * as repo from "@/lib/repo";
import { isAdmin, signIn, signOut } from "@/lib/session";
import { intIn, parseLineEdit, parsePackEdit, parsePitch } from "@/lib/validation";

async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin");
}

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

/** The colour picked in the form, or undefined for "next in the cycle". */
function toneFrom(form: FormData): Tone | undefined {
  const i = intIn(field(form, "color"), 0, PALETTE.length - 1);
  return i === null ? undefined : PALETTE[i];
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  if (!(await signIn(field(form, "password")))) return { status: "error", message: "Nope. Try again." };
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await signOut();
  redirect("/admin");
}

export async function moderateLineAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = intIn(field(form, "id"), 1, 2 ** 31 - 1);
  const body = field(form, "body").replace(/\s+/g, " ").trim();
  const db = await getDb();
  if (id) {
    if (field(form, "decision") === "approve") await repo.approveLine(db, id, body && body.length <= 200 ? body : undefined);
    else await repo.rejectLine(db, id);
  }
  revalidatePath("/admin");
}

/** Fix a pack's description, words or credit. */
export async function updatePackAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parsePackEdit(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  if (!(await repo.updatePack(await getDb(), slug, parsed.value))) return { status: "error", message: "That pack no longer exists." };
  revalidatePath("/", "layout");
  return { status: "ok", message: "Saved." };
}

/** Fix a line's text. */
export async function updateLineAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = intIn(field(form, "id"), 1, 2 ** 31 - 1);
  const parsed = parseLineEdit(form);
  if (!id) return { status: "error", message: "Unknown line." };
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const result = await repo.updateLine(await getDb(), id, parsed.value);
  if (result === "duplicate") return { status: "error", errors: { body: "This pack already has that line." } };
  if (result === "missing") return { status: "error", message: "That line no longer exists." };
  revalidatePath("/", "layout");
  return { status: "ok", message: "Saved." };
}

export async function pitchDecisionAction(form: FormData): Promise<void> {
  await requireAdmin();
  const slug = field(form, "slug");
  const db = await getDb();
  if (field(form, "decision") === "pile") await repo.moveToPile(db, slug);
  else await repo.rejectPitch(db, slug);
  revalidatePath("/", "layout");
}

export async function launchAction(form: FormData): Promise<void> {
  await requireAdmin();
  await repo.launchPack(await getDb(), field(form, "slug"), { day: utcDay(), tone: toneFrom(form) });
  revalidatePath("/", "layout");
}

export async function createPackAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parsePitch(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const { credit, ...rest } = parsed.value;
  const result = await repo.createPack(await getDb(), { ...rest, author: credit, day: utcDay(), tone: toneFrom(form) });
  if (result === "taken") return { status: "error", errors: { slug: `/${parsed.value.slug} already exists.` } };
  revalidatePath("/", "layout");
  return { status: "ok", message: `/${parsed.value.slug} is live with ${parsed.value.lines.length} lines.` };
}
