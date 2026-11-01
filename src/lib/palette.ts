// The pack colour cycle. Each new pack gets the next tone; after 10 it
// starts again. Black, white and the yellow highlight never change.

export type Tone = {
  name: string;
  /** Tags, buttons, meter. White text on it passes contrast. */
  accent: string;
  /** Page background. */
  ground: string;
  /** Accent-coloured text on the ground (darker where needed for contrast). */
  text: string;
};

export const PALETTE: readonly Tone[] = [
  { name: "Hot pink", accent: "#D6114A", ground: "#FFF0F3", text: "#D6114A" },
  { name: "Violet", accent: "#6A2AE0", ground: "#F3EEFF", text: "#6A2AE0" },
  { name: "Cobalt", accent: "#1F4FD8", ground: "#EEF3FF", text: "#1F4FD8" },
  { name: "Teal", accent: "#0B6B6B", ground: "#E8F6F5", text: "#0B6B6B" },
  { name: "Tangerine", accent: "#C2410C", ground: "#FFF2EA", text: "#B23A08" },
  { name: "Forest", accent: "#2B7A2F", ground: "#ECF6EC", text: "#2B7A2F" },
  { name: "Plum", accent: "#9C1F7A", ground: "#FBEEF8", text: "#9C1F7A" },
  { name: "Ochre", accent: "#8A5700", ground: "#FFF6E2", text: "#7A4D00" },
  { name: "Slate", accent: "#3A5679", ground: "#EDF1F7", text: "#3A5679" },
  { name: "Olive", accent: "#566400", ground: "#F4F6E4", text: "#566400" },
];

export function tone(index: number): Tone {
  const n = PALETTE.length;
  return PALETTE[((index % n) + n) % n];
}

/** The colour a new pack gets when this many packs already exist. */
export function nextColor(existingPacks: number): number {
  return existingPacks % PALETTE.length;
}

/** CSS custom properties that theme a pack's page. */
export function toneStyle(index: number): Record<string, string> {
  const t = tone(index);
  return { "--accent": t.accent, "--ground": t.ground, "--accent-text": t.text };
}
