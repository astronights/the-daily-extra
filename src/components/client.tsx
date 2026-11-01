"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatCountdown, msUntilNextDay } from "@/lib/dates";
import { IDLE, type FormState } from "@/lib/form-state";
import { LIMITS, splitLines } from "@/lib/validation";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

/**
 * Submits through the action without React's automatic form reset, so
 * people keep what they typed when the server says something is wrong.
 */
function keepValues(dispatch: (form: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
}

/** "13:42:08" until midnight UTC. Refreshes the page when the day turns. */
export function Countdown() {
  const router = useRouter();
  const [ms, setMs] = useState(() => msUntilNextDay());
  useEffect(() => {
    const t = setInterval(() => {
      const left = msUntilNextDay();
      setMs(left);
      if (left < 1000) router.refresh();
    }, 1000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <strong style={{ color: "var(--accent-text)" }} suppressHydrationWarning>
      {formatCountdown(ms)}
    </strong>
  );
}

export function CopyShare({ text, title }: { text: string; title: string }) {
  const [copied, setCopied] = useState<"" | "line" | "link">("");

  async function copy(value: string, kind: "line" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(""), 2500);
    } catch {
      window.prompt("Copy this:", value);
    }
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // Cancelled: fall through to copying the link.
      }
    }
    await copy(url, "link");
  }

  return (
    <div className="form" style={{ gap: 10 }}>
      <div className="grid-2">
        <button type="button" className={copied === "line" ? "btn btn-ink" : "btn btn-accent"} onClick={() => copy(text, "line")}>
          {copied === "line" ? "Copied!" : "Copy & send"}
        </button>
        <button type="button" className="btn" onClick={share}>
          {copied === "link" ? "Link copied!" : "Share"}
        </button>
      </div>
      <p className="mono" aria-live="polite" style={{ margin: 0, minHeight: 14 }}>
        {copied === "line" ? "Now go send it. Then come back and report." : ""}
      </p>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="error" role="alert">
      {message}
    </p>
  );
}

function Message({ state }: { state: FormState }) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <p className="notice" role="alert">
      {state.message}
    </p>
  );
}

function SubmitButton({ pending, children, className = "btn btn-ink btn-block", disabled }: { pending: boolean; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? "Sending…" : children}
    </button>
  );
}

function Honeypot() {
  return (
    <div className="honeypot" aria-hidden="true">
      <label>
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function ReviewForm({ action, slug, day }: { action: Action; slug: string; day: string }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  if (state.status === "ok") {
    return (
      <div className="card" role="status">
        <span className="sticker" style={{ position: "static", alignSelf: "flex-start" }}>
          Filed
        </span>
        <h2 className="h2" style={{ fontSize: 30 }}>
          Report received.
        </h2>
        <p className="lede">{state.message}</p>
      </div>
    );
  }
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(formAction)} className="card form" id="review">
      <h2 className="h2" style={{ fontSize: 26 }}>
        How did it land?
      </h2>
      <input type="hidden" name="pack" value={slug} />
      <input type="hidden" name="day" value={day} />
      <Honeypot />
      <fieldset className="scores" aria-describedby={e.score ? "err-score" : undefined}>
        <legend className="mono">Score it 1 to 5</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <span className="score" key={n}>
            <input type="radio" id={`score-${n}`} name="score" value={n} required />
            <label htmlFor={`score-${n}`}>
              {n}
              <span className="sr-only"> out of 5</span>
            </label>
          </span>
        ))}
      </fieldset>
      <FieldError id="err-score" message={e.score} />
      <label className="field">
        What happened? (optional)
        <textarea name="body" rows={3} maxLength={LIMITS.review} className="textarea" placeholder="Tell us how it went…" aria-invalid={Boolean(e.body)} />
      </label>
      <FieldError id="err-body" message={e.body} />
      <label className="field">
        Your name (optional)
        <input name="name" maxLength={LIMITS.name} className="input" placeholder="anonymous" autoComplete="nickname" />
      </label>
      <Message state={state} />
      <SubmitButton pending={pending} className="btn btn-plain btn-block" >
        Post review
      </SubmitButton>
    </form>
  );
}

export function LineForm({ action, slug }: { action: Action; slug: string }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  // Remembers which success the person dismissed with "Submit another".
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  if (state.status === "ok" && dismissed !== state) {
    return (
      <section className="yellow" role="status">
        <h2 className="display">
          It&apos;s in
          <br />
          the pile.
        </h2>
        <p className="lede">We read every line before it goes live. If it makes the cut, it could be someone&apos;s daily soon.</p>
        <button type="button" className="btn btn-plain" style={{ alignSelf: "flex-start" }} onClick={() => setDismissed(state)}>
          Submit another
        </button>
      </section>
    );
  }
  const e = state.status === "error" ? state.errors ?? {} : {};
  return (
    <form onSubmit={keepValues(formAction)} className="yellow" id="submit">
      <h2 className="display">Got a better one?</h2>
      <p className="lede">Submit a line for /{slug}. Good ones become someone&apos;s daily.</p>
      <input type="hidden" name="pack" value={slug} />
      <Honeypot />
      <label className="field">
        Your line
        <textarea name="body" rows={3} required minLength={LIMITS.lineMin} maxLength={LIMITS.lineMax} className="textarea" aria-invalid={Boolean(e.body)} aria-describedby={e.body ? "err-line" : undefined} />
      </label>
      <FieldError id="err-line" message={e.body} />
      <label className="field">
        Credit me as (optional)
        <input name="credit" maxLength={LIMITS.name} className="input" placeholder="@yourhandle" />
      </label>
      <FieldError id="err-credit" message={e.credit} />
      <Message state={state} />
      <SubmitButton pending={pending}>Throw it in the pile</SubmitButton>
    </form>
  );
}

/** Big scrollable box for 100+ lines, with .txt upload and a live count. */
export function LinesField({ error }: { error?: string }) {
  const [value, setValue] = useState("");
  const count = splitLines(value).length;
  const min = LIMITS.pitchLinesMin;
  const pct = Math.min(100, Math.round((count / min) * 100));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setValue((v) => (v.trim() ? `${v.trimEnd()}\n${text}` : text));
    e.target.value = "";
  }

  return (
    <>
      <label className="field">
        Lines (one per line)
        <textarea
          name="lines"
          className="textarea textarea-lines"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          wrap="off"
          spellCheck
          aria-invalid={Boolean(error)}
          aria-describedby="lines-count"
          placeholder={"Paste your lines here, one per line.\nOr upload a .txt file below."}
        />
      </label>
      <div className="meta-row">
        <label className="chip upload">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
          </svg>
          Upload .txt
          <input type="file" accept=".txt,text/plain" onChange={onFile} />
        </label>
        <span id="lines-count" className="mono" style={{ fontSize: 13, fontWeight: 700 }} aria-live="polite">
          {count} / {min}
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="hint" style={{ fontWeight: 600 }}>
        {count >= min ? "That's enough to pitch." : `${min - count} more to go.`} Blank lines and duplicates don&apos;t count.
      </p>
      <FieldError id="err-lines" message={error} />
      <input type="hidden" name="lineCount" value={count} />
    </>
  );
}

/** The pack details + lines form. Used for public pitches and for admin "New pack". */
export function PackForm({
  action,
  mode,
  defaultSlug = "",
  extra,
}: {
  action: Action;
  mode: "pitch" | "create";
  defaultSlug?: string;
  extra?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  if (state.status === "ok" && mode === "pitch") {
    return (
      <section className="card" role="status">
        <h2 className="display" style={{ fontSize: 44 }}>
          Pitched.
        </h2>
        <p className="lede">We&apos;ll read it soon. If it makes the cut it goes in the pile, where people can upvote it.</p>
      </section>
    );
  }
  const e = state.status === "error" ? state.errors ?? {} : {};
  return (
    <form onSubmit={keepValues(formAction)} className="form" style={{ gap: 22 }}>
      <Honeypot />
      <fieldset className="fieldset">
        <legend>1 · The idea</legend>
        <label className="field">
          Pack name
          <span className="prefix">
            <span>/</span>
            <input name="slug" className="input" defaultValue={defaultSlug} required maxLength={24} placeholder="excuses" autoCapitalize="none" aria-invalid={Boolean(e.slug)} />
          </span>
        </label>
        <FieldError id="err-slug" message={e.slug} />
        <label className="field">
          What does it give you, once a day?
          <input name="description" className="input" required maxLength={LIMITS.descriptionMax} placeholder="A believable excuse to get out of plans" aria-invalid={Boolean(e.description)} />
        </label>
        <FieldError id="err-description" message={e.description} />
        <div className="grid-2">
          <label className="field">
            “Today&apos;s …”
            <input name="noun" className="input" required maxLength={LIMITS.wordMax} placeholder="excuse" aria-invalid={Boolean(e.noun)} />
          </label>
          <label className="field">
            Rated on…
            <input name="meterLabel" className="input" required maxLength={LIMITS.wordMax} placeholder="Believability" aria-invalid={Boolean(e.meterLabel)} />
          </label>
        </div>
        <FieldError id="err-noun" message={e.noun ?? e.meterLabel} />
        <p className="hint">These two words fill in the pack page: “Today&apos;s excuse” and a Believability meter.</p>
      </fieldset>

      <fieldset className="fieldset">
        <legend>2 · The lines</legend>
        <p className="hint" style={{ fontSize: 14 }}>
          At least {LIMITS.pitchLinesMin}, one per line. That&apos;s over three months of dailies. Paste them in or upload a .txt file.
          Wrap words in *asterisks* to highlight them.
        </p>
        <LinesField error={e.lines} />
      </fieldset>

      <fieldset className="fieldset">
        <legend>3 · Credit</legend>
        <label className="field">
          Credit {mode === "pitch" ? "me" : "the pack"} as (optional)
          <input name="credit" className="input" maxLength={LIMITS.name} placeholder="@yourhandle" />
        </label>
        {extra}
      </fieldset>

      {state.status === "ok" ? (
        <p className="notice" role="status">
          {state.message}
        </p>
      ) : null}
      <Message state={state} />
      <SubmitButton pending={pending}>{mode === "pitch" ? "Pitch it" : "Create pack"}</SubmitButton>
    </form>
  );
}

export function LoginForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form onSubmit={keepValues(formAction)} className="card form" style={{ boxShadow: "6px 6px 0 var(--yellow)" }}>
      <label className="field">
        Password
        <input type="password" name="password" className="input" required autoComplete="current-password" />
      </label>
      {state.status === "error" ? (
        <p className="error" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton pending={pending}>Let me in</SubmitButton>
    </form>
  );
}
