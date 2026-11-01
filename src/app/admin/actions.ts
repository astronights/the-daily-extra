"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { utcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { PALETTE } from "@/lib/palette";
import * as repo from "@/lib/repo";
import { isAdmin, signIn, signOut } from "@/lib/session";
import { intIn, parsePitch } from "@/lib/validation";

async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin");
}

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function colorFrom(form: FormData): number | null {
  return intIn(field(form, "color"), 0, PALETTE.length - 1);
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
  const level = intIn(field(form, "level"), 1, 5) ?? 3;
  const decision = field(form, "decision") === "approve" ? "approved" : "rejected";
  if (id) await repo.moderateLine(await getDb(), id, decision, level);
  revalidatePath("/admin");
}

export async function pitchDecisionAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = intIn(field(form, "id"), 1, 2 ** 31 - 1);
  const status = field(form, "decision") === "pile" ? "pile" : "rejected";
  if (id) await repo.setPitchStatus(await getDb(), id, status);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/explore");
}

export async function launchAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = intIn(field(form, "id"), 1, 2 ** 31 - 1);
  if (id) await repo.launchPitch(await getDb(), id, { day: utcDay(), color: colorFrom(form) });
  revalidatePath("/", "layout");
}

export async function createPackAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parsePitch(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const result = await repo.createPack(await getDb(), {
    ...parsed.value,
    color: colorFrom(form),
    launchedOn: utcDay(),
  });
  if (result === "taken") return { status: "error", errors: { slug: `/${parsed.value.slug} already exists.` } };
  revalidatePath("/", "layout");
  return { status: "ok", message: `/${parsed.value.slug} is live with ${parsed.value.lines.length} lines.` };
}
