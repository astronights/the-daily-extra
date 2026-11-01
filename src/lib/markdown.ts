// A small, safe Markdown subset for entries. It parses to plain data that
// React renders as elements, so no HTML from users ever reaches the page.
//
// Inline:  **bold**  _italic_  *highlight*  ~~strike~~  `code`
// Blocks:  # Heading (#, ##, ###)   - bullets   1. numbered   > quote
//          ``` code block ```       other lines: text with line breaks
// Not supported on purpose: links, images, HTML.

export type Inline = { t: "text" | "bold" | "italic" | "mark" | "strike" | "code"; v: string };

export type Block =
  | { kind: "text"; lines: Inline[][] }
  | { kind: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { kind: "bullets"; items: Inline[][] }
  | { kind: "numbers"; start: number; items: Inline[][] }
  | { kind: "quote"; lines: Inline[][] }
  | { kind: "code"; text: string };

const INLINE =
  /\*\*([^*\n]+?)\*\*|~~([^~\n]+?)~~|`([^`\n]+?)`|\*([^*\n]+?)\*|(?<![\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}_])/gu;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "strike", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "code", v: m[3] });
    else if (m[4] !== undefined) out.push({ t: "mark", v: m[4] });
    else if (m[5] !== undefined) out.push({ t: "italic", v: m[5] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-•*]\s+(.*)$/;
const NUMBER = /^(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```/;

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = blocks[blocks.length - 1];

    if (FENCE.test(line.trim())) {
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i].trim()); i++) code.push(lines[i]);
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;

    let m: RegExpExecArray | null;
    if ((m = HEADING.exec(trimmed))) {
      blocks.push({ kind: "heading", level: m[1].length as 1 | 2 | 3, content: parseInline(m[2]) });
    } else if ((m = BULLET.exec(trimmed))) {
      if (prev?.kind === "bullets") prev.items.push(parseInline(m[1]));
      else blocks.push({ kind: "bullets", items: [parseInline(m[1])] });
    } else if ((m = NUMBER.exec(trimmed))) {
      if (prev?.kind === "numbers") prev.items.push(parseInline(m[2]));
      else blocks.push({ kind: "numbers", start: Number(m[1]), items: [parseInline(m[2])] });
    } else if ((m = QUOTE.exec(trimmed))) {
      if (prev?.kind === "quote") prev.lines.push(parseInline(m[1]));
      else blocks.push({ kind: "quote", lines: [parseInline(m[1])] });
    } else if (prev?.kind === "text") {
      prev.lines.push(parseInline(trimmed));
    } else {
      blocks.push({ kind: "text", lines: [parseInline(trimmed)] });
    }
  }
  return blocks;
}

/** True when the entry is a single line of text (shown big, in quote marks). */
export function isSimple(src: string): boolean {
  const blocks = parseMarkdown(src);
  return blocks.length === 1 && blocks[0].kind === "text" && blocks[0].lines.length === 1;
}

function inlineText(parts: Inline[]): string {
  return parts.map((p) => p.v).join("");
}

/**
 * The entry as it should be sent in a chat: formatting marks removed,
 * line breaks, bullets and numbers kept.
 */
export function toPlainText(src: string): string {
  return parseMarkdown(src)
    .map((b) => {
      switch (b.kind) {
        case "text":
          return b.lines.map(inlineText).join("\n");
        case "heading":
          return inlineText(b.content);
        case "bullets":
          return b.items.map((it) => `- ${inlineText(it)}`).join("\n");
        case "numbers":
          return b.items.map((it, i) => `${b.start + i}. ${inlineText(it)}`).join("\n");
        case "quote":
          return b.lines.map((l) => `> ${inlineText(l)}`).join("\n");
        case "code":
          return b.text;
      }
    })
    .join("\n");
}
