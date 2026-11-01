import type { Metadata } from "next";
import Link from "next/link";
import { followAction, voteAction } from "@/app/actions";
import { BackHeader, CheckIcon, Footer, Page, PlusIcon, SearchIcon, UpIcon } from "@/components/ui";
import { getDb } from "@/lib/db";
import { tone } from "@/lib/palette";
import * as repo from "@/lib/repo";
import { readVoterId } from "@/lib/session";
import { normalizeSlug } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Find a pack" };

type Props = { searchParams: Promise<{ q?: string; f?: string }> };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "pile", label: "In the pile" },
] as const;

export default async function Explore({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const f = sp.f === "live" || sp.f === "pile" ? sp.f : "all";
  const db = await getDb();
  const voter = await readVoterId();
  const [packs, pile, mine] = await Promise.all([
    f === "pile" ? Promise.resolve([]) : repo.listPacks(db, q),
    f === "live" ? Promise.resolve([]) : repo.listPile(db, voter, { q }),
    voter ? repo.followedPacks(db, voter) : Promise.resolve([]),
  ]);
  const followed = new Set(mine.map((p) => p.slug));
  const path = `/explore?${new URLSearchParams({ ...(q ? { q } : {}), ...(f !== "all" ? { f } : {}) })}`;
  const pitchSlug = normalizeSlug(q);

  return (
    <Page>
      <BackHeader />
      <h1 className="display" style={{ fontSize: 56 }}>
        Find a pack
      </h1>

      <form className="form" role="search" style={{ gap: 12 }}>
        <label className="prefix" style={{ boxShadow: "4px 4px 0 var(--ink)", paddingLeft: 12, gap: 10 }}>
          <SearchIcon />
          <span className="sr-only">Search packs</span>
          <input type="search" name="q" defaultValue={q} className="input" placeholder="excuses, openers…" style={{ fontFamily: "var(--body)", fontSize: 18 }} />
        </label>
        {f !== "all" ? <input type="hidden" name="f" value={f} /> : null}
        <nav className="row" aria-label="Filter">
          {FILTERS.map((x) => (
            <Link
              key={x.key}
              className="chip"
              aria-current={x.key === f ? "page" : undefined}
              href={`/explore?${new URLSearchParams({ ...(q ? { q } : {}), ...(x.key !== "all" ? { f: x.key } : {}) })}`}
            >
              {x.label}
            </Link>
          ))}
        </nav>
      </form>

      {f !== "pile" ? (
        <section className="form" style={{ gap: 12 }}>
          <h2 className="mono muted" style={{ margin: 0, fontWeight: 500 }}>
            Live · {packs.length} {packs.length === 1 ? "result" : "results"}
          </h2>
          {packs.map((p) => {
            const on = followed.has(p.slug);
            return (
              <article key={p.slug} className="card" style={{ padding: 16, gap: 10, boxShadow: "5px 5px 0 var(--ink)" }}>
                <div className="meta-row">
                  <Link href={`/${p.slug}`} className="tag tag-lg" style={{ background: tone(p.color).accent }}>
                    /{p.slug}
                  </Link>
                  <form action={followAction.bind(null, p.slug, path)}>
                    <button type="submit" className="chip" aria-pressed={on}>
                      {on ? <CheckIcon /> : <PlusIcon />}
                      {on ? "Following" : "Follow"}
                    </button>
                  </form>
                </div>
                <p className="lede" style={{ fontSize: 15 }}>
                  {p.description}
                </p>
                <span className="mono muted" style={{ fontSize: 11 }}>
                  {p.followers} following
                </span>
              </article>
            );
          })}
        </section>
      ) : null}

      {f !== "live" ? (
        <section className="form" style={{ gap: 12 }}>
          <h2 className="mono muted" style={{ margin: 0, fontWeight: 500 }}>
            In the pile · {pile.length} {pile.length === 1 ? "result" : "results"}
          </h2>
          {pile.map((p) => (
            <article key={p.id} className="list-item">
              <div className="grow">
                <span style={{ fontFamily: "var(--mono)", fontSize: 16 }}>/{p.slug}</span>
                <span style={{ fontSize: 14, lineHeight: 1.35 }}>{p.description}</span>
              </div>
              <form action={voteAction.bind(null, p.id, path)}>
                <button type="submit" className="vote" aria-pressed={p.voted} aria-label={`${p.voted ? "Remove upvote from" : "Upvote"} /${p.slug}, ${p.votes} votes`}>
                  <UpIcon />
                  {p.votes}
                </button>
              </form>
            </article>
          ))}
        </section>
      ) : null}

      <div className="card card-dashed" style={{ gap: 12 }}>
        <p className="lede" style={{ fontSize: 20, fontWeight: 800 }}>
          Not seeing it?
        </p>
        <p className="lede" style={{ fontSize: 15 }}>
          Pitch it. If people upvote it, we build it.
        </p>
        <Link href={pitchSlug ? `/pitch?slug=${encodeURIComponent(pitchSlug)}` : "/pitch"} className="btn" style={{ alignSelf: "flex-start", background: "var(--yellow)" }}>
          {pitchSlug ? `Pitch “/${pitchSlug}”` : "Pitch a pack"}
        </Link>
      </div>

      <Footer />
    </Page>
  );
}
