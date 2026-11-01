// Follows and upvotes are stored as short lists of pack names in cookies.
// Pure helpers, so they can be unit tested.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_LIST = 100;

/** "drama,excuses" -> ["drama", "excuses"], dropping anything malformed. */
export function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const s of raw.split(",")) {
    if (SLUG.test(s) && s.length <= 24 && !out.includes(s)) out.push(s);
  }
  return out.slice(0, MAX_LIST);
}

/** Adds or removes a name. Returns the new list and whether it is now in it. */
export function toggleInList(list: string[], slug: string): { list: string[]; added: boolean } {
  if (list.includes(slug)) return { list: list.filter((s) => s !== slug), added: false };
  return { list: [...list, slug].slice(-MAX_LIST), added: true };
}
