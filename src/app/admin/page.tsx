import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm, PackForm } from "@/components/client";
import { Page } from "@/components/ui";
import { timeAgo } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { PALETTE, nextTone } from "@/lib/palette";
import * as repo from "@/lib/repo";
import { adminConfigured, isAdmin } from "@/lib/session";
import { createPackAction, launchAction, login, logout, moderateLineAction, pitchDecisionAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

type Props = { searchParams: Promise<{ tab?: string }> };
type Tab = "lines" | "pitches" | "pile" | "new";

function AdminHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="logo">The Daily</span>
        <span className="tag" style={{ background: "var(--ink)", color: "var(--yellow)" }}>
          /admin
        </span>
      </Link>
      {signedIn ? (
        <form action={logout}>
          <button type="submit" className="chip mono">
            Sign out
          </button>
        </form>
      ) : null}
    </header>
  );
}

function ColorSelect({ next }: { next: string }) {
  return (
    <label className="field">
      Colour
      <select name="color" className="select" defaultValue="auto">
        <option value="auto">Next in cycle · {next}</option>
        {PALETTE.map((t, i) => (
          <option key={t.name} value={i}>
            {i + 1} · {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Empty() {
  return (
    <div className="card card-dashed" style={{ alignItems: "center", textAlign: "center", gap: 6 }}>
      <span className="display" style={{ fontSize: 30 }}>
        Inbox zero.
      </span>
      <span>Nothing waiting. Go touch grass.</span>
    </div>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <details>
      <summary className="mono" style={{ cursor: "pointer", minHeight: 32 }}>
        {lines.length} lines · show all
      </summary>
      <ol style={{ margin: "8px 0 0", padding: "12px 12px 12px 34px", background: "var(--paper)", border: "2px solid var(--ink)", maxHeight: 320, overflow: "auto", fontSize: 15, lineHeight: 1.5 }}>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </details>
  );
}

export default async function AdminPage({ searchParams }: Props) {
  if (!adminConfigured()) {
    return (
      <Page>
        <AdminHeader signedIn={false} />
        <p className="notice">Admin is off. Set ADMIN_PASSWORD (and SESSION_SECRET) in your environment, then redeploy.</p>
      </Page>
    );
  }

  if (!(await isAdmin())) {
    return (
      <div className="page" style={{ background: "var(--ink)", color: "var(--ground)" }}>
        <div className="wrap" style={{ gap: 40 }}>
          <AdminHeader signedIn={false} />
          <div className="form" style={{ gap: 12, marginTop: 24 }}>
            <h1 className="display" style={{ fontSize: 72, lineHeight: 0.9 }}>
              Back&shy;stage.
            </h1>
            <p className="lede" style={{ fontSize: 17, color: "#e7d3da" }}>
              Editors only. This is where lines and pack pitches get the yes or the no.
            </p>
          </div>
          <div style={{ color: "var(--ink)" }}>
            <LoginForm action={login} />
          </div>
        </div>
      </div>
    );
  }

  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "pitches" || rawTab === "pile" || rawTab === "new" ? rawTab : "lines";
  const db = await getDb();
  const [pendingLines, pendingPitches, pile, packs] = await Promise.all([
    repo.listPendingLines(db),
    repo.listPacksByStatus(db, "pending"),
    repo.listPacksByStatus(db, "pile"),
    repo.listLivePacks(db),
  ]);
  const packBySlug = new Map(packs.map((p) => [p.slug, p]));
  const next = nextTone(packs.length).name;
  // Lines are only needed for the tab being shown.
  const shown = tab === "pitches" ? pendingPitches : tab === "pile" ? pile : [];
  const linesBySlug = new Map(await Promise.all(shown.map(async (p) => [p.slug, await repo.packLines(db, p.slug)] as const)));

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "lines", label: `Lines · ${pendingLines.length}` },
    { key: "pitches", label: `Pitches · ${pendingPitches.length}` },
    { key: "pile", label: `Pile · ${pile.length}` },
    { key: "new", label: "New pack" },
  ];

  return (
    <Page>
      <AdminHeader signedIn />
      <h1 className="display" style={{ fontSize: 48 }}>
        The pile
      </h1>
      <nav className="tabs" aria-label="Queue" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {tabs.map((t) => (
          <Link key={t.key} href={`/admin?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "lines" ? (
        pendingLines.length ? (
          pendingLines.map((l) => {
            const pack = packBySlug.get(l.packSlug);
            return (
              <form key={l.id} action={moderateLineAction} className="card" style={{ padding: 18, gap: 14, boxShadow: "5px 5px 0 var(--ink)" }}>
                <input type="hidden" name="id" value={l.id} />
                <div className="meta-row mono">
                  <span>
                    /{l.packSlug} · {l.author ?? "anonymous"}
                  </span>
                  <span className="muted">{timeAgo(l.createdAt)}</span>
                </div>
                <p className="snippet" style={{ fontSize: 21, lineHeight: 1.25 }}>
                  “{l.body}”
                </p>
                <label className="field" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  {pack?.meterLabel ?? "Level"}
                  <select name="level" className="select" defaultValue="3" style={{ width: "auto" }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid-2">
                  <button type="submit" name="decision" value="approve" className="btn btn-accent">
                    Approve
                  </button>
                  <button type="submit" name="decision" value="reject" className="btn btn-plain">
                    Reject
                  </button>
                </div>
              </form>
            );
          })
        ) : (
          <Empty />
        )
      ) : null}

      {tab === "pitches" ? (
        pendingPitches.length ? (
          pendingPitches.map((p) => (
            <form key={p.slug} action={pitchDecisionAction} className="yellow" style={{ boxShadow: "5px 5px 0 var(--ink)", padding: 18, gap: 12 }}>
              <input type="hidden" name="slug" value={p.slug} />
              <div className="meta-row">
                <span style={{ fontFamily: "var(--mono)", fontSize: 20 }}>/{p.slug}</span>
                <span className="mono">
                  {p.author ?? "anonymous"} · {timeAgo(p.createdAt)}
                </span>
              </div>
              <p className="lede">{p.description}</p>
              <p className="mono" style={{ margin: 0 }}>
                Today&apos;s {p.noun} · rated on {p.meterLabel}
              </p>
              <Lines lines={linesBySlug.get(p.slug) ?? []} />
              <div className="grid-2">
                <button type="submit" name="decision" value="pile" className="btn btn-ink btn-plain">
                  Add to the pile
                </button>
                <button type="submit" name="decision" value="reject" className="btn btn-plain">
                  Reject
                </button>
              </div>
            </form>
          ))
        ) : (
          <Empty />
        )
      ) : null}

      {tab === "pile" ? (
        pile.length ? (
          pile.map((p) => (
            <div key={p.slug} className="card" style={{ padding: 18, gap: 12, boxShadow: "5px 5px 0 var(--ink)" }}>
              <div className="meta-row">
                <span style={{ fontFamily: "var(--mono)", fontSize: 20 }}>/{p.slug}</span>
                <span className="mono">{p.votes} votes</span>
              </div>
              <p className="lede">{p.description}</p>
              <Lines lines={linesBySlug.get(p.slug) ?? []} />
              <form action={launchAction} className="form" style={{ gap: 10 }}>
                <input type="hidden" name="slug" value={p.slug} />
                <ColorSelect next={next} />
                <button type="submit" className="btn btn-accent">
                  Launch pack
                </button>
              </form>
              <form action={pitchDecisionAction}>
                <input type="hidden" name="slug" value={p.slug} />
                <button type="submit" name="decision" value="reject" className="btn btn-plain btn-block">
                  Remove from pile
                </button>
              </form>
            </div>
          ))
        ) : (
          <Empty />
        )
      ) : null}

      {tab === "new" ? <PackForm action={createPackAction} mode="create" extra={<ColorSelect next={next} />} /> : null}
    </Page>
  );
}
