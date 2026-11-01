import type { FieldErrors } from "./validation.ts";

/** What a form's server action returns to the page. */
export type FormState = {
  status: "idle" | "ok" | "error";
  message?: string;
  errors?: FieldErrors;
};

export const IDLE: FormState = { status: "idle" };

export const SLOW_DOWN = "Easy, menace. You've posted a lot just now. Try again in a few minutes.";

/** Max posts per IP in a window, per kind of post. */
export const RATE_LIMITS = {
  reviews: { max: 5, minutes: 10 },
  entries: { max: 5, minutes: 60 },
  pitches: { max: 3, minutes: 60 },
} as const;
