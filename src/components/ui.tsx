// Small shared pieces used across pages. Server components.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { toneStyle } from "@/lib/palette";
import { highlightParts } from "@/lib/validation";

export const GITHUB_URL = "https://github.com/astronights";

/** Page shell. Pass a pack colour to theme the page. */
export function Page({ color, children }: { color?: number; children: ReactNode }) {
  const style = (color === undefined ? undefined : toneStyle(color)) as CSSProperties | undefined;
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
        <span className="logo">The Daily</span>
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
        The Daily · one a day · <Link href="/colours">colours</Link>
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

/** Renders a line with its *highlighted* words. */
export function Highlighted({ body }: { body: string }) {
  return (
    <>
      {highlightParts(body).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

export function Meter({ level, label }: { level: number; label: string }) {
  return (
    <span className="row mono" style={{ gap: 10 }}>
      <span>{label}</span>
      <span className="meter" role="img" aria-label={`${level} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= level ? "on" : undefined} />
        ))}
      </span>
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
