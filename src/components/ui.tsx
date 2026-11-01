// Small shared pieces used across pages. Server components.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { toneStyle } from "@/lib/palette";
import { isSimple, parseMarkdown, type Inline } from "@/lib/markdown";

export const GITHUB_URL = "https://github.com/astronights";

/** Page shell. Pass a pack to theme the page in its colours. */
export function Page({ pack, children }: { pack?: { accent: string | null; background: string | null }; children: ReactNode }) {
  const style = (pack ? toneStyle(pack.accent, pack.background) : undefined) as CSSProperties | undefined;
  return (
    <div className="page" style={style}>
      <div className="wrap">{children}</div>
    </div>
  );
}

export function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

export function UpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Header({ slug, right }: { slug?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="logo">Extra</span>
        {slug ? <span className="tag">/{slug}</span> : null}
      </Link>
      {right ?? (
        <Link href="/explore" className="icon-btn" aria-label="Search packs">
          <SearchIcon />
        </Link>
      )}
    </header>
  );
}

export function BackHeader({ href = "/", label = "← Home" }: { href?: string; label?: string }) {
  return (
    <Header
      right={
        <Link href={href} className="back">
          {label}
        </Link>
      }
    />
  );
}

export function Footer() {
  return (
    <footer className="footer mono">
      <span>
        Extra · one a day · <Link href="/colours">colours</Link>
      </span>
      <a href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
        GitHub · @astronights
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </a>
    </footer>
  );
}

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.t) {
          case "bold":
            return <strong key={i}>{p.v}</strong>;
          case "italic":
            return <em key={i}>{p.v}</em>;
          case "mark":
            return <mark key={i}>{p.v}</mark>;
          case "strike":
            return <s key={i}>{p.v}</s>;
          case "code":
            return <code key={i}>{p.v}</code>;
          default:
            return <span key={i}>{p.v}</span>;
        }
      })}
    </>
  );
}

/**
 * Renders an entry's Markdown (see lib/markdown.ts). A single line of
 * text gets quote marks; anything with structure is shown as written.
 */
export function EntryBody({ body, quoted = true }: { body: string; quoted?: boolean }) {
  const blocks = parseMarkdown(body);
  if (isSimple(body) && blocks[0].kind === "text") {
    const parts = blocks[0].lines[0];
    return quoted ? (
      <>
        “<InlineText parts={parts} />”
      </>
    ) : (
      <InlineText parts={parts} />
    );
  }
  return (
    <span className="entry">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading":
            return (
              <span key={i} className={`entry-h entry-h${b.level}`} role="heading" aria-level={b.level + 2}>
                <InlineText parts={b.content} />
              </span>
            );
          case "bullets":
            return (
              <ul key={i} className="entry-list">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineText parts={item} />
                  </li>
                ))}
              </ul>
            );
          case "numbers":
            return (
              <ol key={i} className="entry-list" start={b.start}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineText parts={item} />
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <span key={i} className="entry-quote">
                {b.lines.map((l, j) => (
                  <span key={j} className="entry-line">
                    <InlineText parts={l} />
                  </span>
                ))}
              </span>
            );
          case "code":
            return (
              <code key={i} className="entry-code">
                {b.text}
              </code>
            );
          default:
            return (
              <span key={i} className="entry-text">
                {b.lines.map((l, j) => (
                  <span key={j} className="entry-line">
                    <InlineText parts={l} />
                  </span>
                ))}
              </span>
            );
        }
      })}
    </span>
  );
}

/** Extra class for today's card when the entry is long or multi-line, so it shrinks to fit. */
export function quoteSize(body: string): string {
  return !isSimple(body) || body.length > 140 ? "quote quote-long" : "quote";
}

/** Where the meter starts for a line nobody has rated yet. */
export const DEFAULT_METER = 3;

/** The pack's meter (e.g. Toxicity), filled from readers' average rating of this line. */
export function Meter({ score, ratings, label }: { score: number | null; ratings: number; label: string }) {
  const unrated = score === null;
  const filled = unrated ? DEFAULT_METER : Math.round(score);
  const ratingsText = `${ratings} ${ratings === 1 ? "rating" : "ratings"}`;
  return (
    <span className="row mono" style={{ gap: 10 }}>
      <span>{label}</span>
      <span
        className="meter"
        role="img"
        aria-label={unrated ? `${DEFAULT_METER} out of 5, not rated yet` : `${score} out of 5 from ${ratingsText}`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= filled ? "on" : undefined} />
        ))}
      </span>
      <span className="muted">{unrated ? "new" : ratingsText}</span>
    </span>
  );
}

export function Honeypot() {
  return (
    <div className="honeypot" aria-hidden="true">
      <label>
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
