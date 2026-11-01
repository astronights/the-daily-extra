const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar day for a moment, as YYYY-MM-DD. A new daily starts at midnight UTC. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function msUntilNextDay(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

/** 13:42:08 style countdown text. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Issue 1 is the launch day. */
export function issueNumber(launchedOn: string, day: string): number {
  const diff = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${launchedOn}T00:00:00Z`);
  return Math.max(1, Math.floor(diff / DAY_MS) + 1);
}

export function formatIssue(n: number): string {
  return `No. ${String(n).padStart(3, "0")}`;
}

/** "Sun · Nov 1 2026" */
export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday} · ${month} ${d.getUTCDate()} ${d.getUTCFullYear()}`;
}

/** "2h ago" style label. */
export function timeAgo(thenMs: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - thenMs) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
