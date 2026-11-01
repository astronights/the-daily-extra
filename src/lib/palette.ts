// The pack colour cycle. Each new pack gets the next tone; after 10 it
// starts again. The two colours are stored on the pack when it launches.
// Black, white and the yellow highlight never change.

export type Tone = {
  name: string;
  /** Tags, buttons, meter, and accent text. White text on it and it on the background both pass 4.5:1. */
  accent: string;
  /** Page background. */
  background: string;
};

export const PALETTE: readonly Tone[] = [
  { name: "Hot pink", accent: "#D6114A", background: "#FFF0F3" },
  { name: "Violet", accent: "#6A2AE0", background: "#F3EEFF" },
  { name: "Cobalt", accent: "#1F4FD8", background: "#EEF3FF" },
  { name: "Teal", accent: "#0B6B6B", background: "#E8F6F5" },
  { name: "Tangerine", accent: "#C2410C", background: "#FFF2EA" },
  { name: "Forest", accent: "#2B7A2F", background: "#ECF6EC" },
  { name: "Plum", accent: "#9C1F7A", background: "#FBEEF8" },
  { name: "Ochre", accent: "#8A5700", background: "#FFF6E2" },
  { name: "Slate", accent: "#3A5679", background: "#EDF1F7" },
  { name: "Olive", accent: "#566400", background: "#F4F6E4" },
];

export const DEFAULT_TONE = PALETTE[0];

export function tone(index: number): Tone {
  const n = PALETTE.length;
  return PALETTE[((index % n) + n) % n];
}

/** The tone a new pack gets when this many packs are already live. */
export function nextTone(livePacks: number): Tone {
  return tone(livePacks);
}

/** CSS custom properties that theme a pack's page. */
export function toneStyle(accent: string | null, background: string | null): Record<string, string> {
  const a = accent ?? DEFAULT_TONE.accent;
  return { "--accent": a, "--accent-text": a, "--ground": background ?? DEFAULT_TONE.background };
}
