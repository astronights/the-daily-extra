import Link from "next/link";
import { followAction, voteAction } from "@/app/actions";
import { Footer, Highlighted, Page, SearchIcon, UpIcon } from "@/components/ui";
import { formatDay, formatIssue, issueNumber, utcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { tone } from "@/lib/palette";
import * as repo from "@/lib/repo";
import { readVoterId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const voter = await readVoterId();
  const day = utcDay();
  const [mine, allPacks, pile] = await Promise.all([
    voter ? repo.followedPacks(db, voter) : Promise.resolve([]),
    repo.listPacks(db),
    repo.listPile(db, voter, { limit: 3 }),
  ]);
  const dailies = await Promise.all(mine.map((p) => repo.getDaily(db, p.slug, day)));

  return (
    <Page>
      <header className="masthead">
        <div className="masthead-top mono">
          <span>{formatDay(day).replace(/ \d{4}$/, "")}</span>
          <Link href="/explore" className="row" style={{ gap: 6, textDecoration: "none", minHeight: 44 }}>
            <SearchIcon />
            Search
          </Link>
        </div>
        <h1 className="display">The Daily</h1>
        <p className="lede" style={{ fontSize: 18 }}>
          Tiny doses of text, once a day.
        </p>
      </header>

      <section className="form" style={{ gap: 16 }}>
        <div className="meta-row" style={{ alignItems: "baseline" }}>
          <h2 className="h2">Your packs</h2>
          <Link href="/explore" className="mono" style={{ padding: "10px 0" }}>
            + Add packs
          </Link>
        </div>

        {mine.length ? (
          mine.map((p, i) => {
            const d = dailies[i];
            return (
              <Link key={p.slug} href={`/${p.slug}`} className="card pack-card" style={{ padding: 18, gap: 12 }}>
                <span className="meta-row">
                  <span className="tag tag-lg" style={{ background: tone(p.color).accent }}>
                    /{p.slug}
                  </span>
                  <span className="mono muted" style={{ fontSize: 11 }}>
                    {formatIssue(issueNumber(p.launchedOn, day))}
                  </span>
                </span>
                <span className="snippet">{d ? <>“<Highlighted body={d.body} />”</> : "Nothing today. Got a line?"}</span>
              </Link>
            );
          })
        ) : (
          <div className="card card-dashed" style={{ gap: 12 }}>
            <p className="lede" style={{ fontSize: 20, fontWeight: 800 }}>
              Pick your poison.
            </p>
            {allPacks.length ? (
              <>
                <p className="lede" style={{ fontSize: 15 }}>
                  Follow a pack and its daily lands right here. No account needed.
                </p>
                <div className="row">
                  {allPacks.slice(0, 3).map((p) => (
                    <form key={p.slug} action={followAction.bind(null, p.slug, "/")}>
                      <button type="submit" className="chip" style={{ fontFamily: "var(--mono)", fontWeight: 500 }}>
                        + /{p.slug}
                      </button>
                    </form>
                  ))}
                  <Link href="/explore" className="mono" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>
                    Browse all →
                  </Link>
                </div>
              </>
            ) : (
              <p className="lede" style={{ fontSize: 15 }}>
                No packs are live yet. Pitch the first one below.
              </p>
            )}
          </div>
        )}
      </section>

      {pile.length ? (
        <section className="form" style={{ gap: 12 }}>
          <h2 className="h2">Most wanted</h2>
          <p className="lede" style={{ fontSize: 15, marginTop: -4 }}>
            Pitched packs that aren&apos;t live yet. Upvote the ones you want built.
          </p>
          {pile.map((p, i) => (
            <article key={p.id} className="list-item">
              <span className="rank">{i + 1}</span>
              <div className="grow">
                <span style={{ fontFamily: "var(--mono)", fontSize: 16 }}>/{p.slug}</span>
                <span style={{ fontSize: 14, lineHeight: 1.35 }}>{p.description}</span>
              </div>
              <form action={voteAction.bind(null, p.id, "/")}>
                <button type="submit" className="vote" aria-pressed={p.voted} aria-label={`${p.voted ? "Remove upvote from" : "Upvote"} /${p.slug}, ${p.votes} votes`}>
                  <UpIcon />
                  {p.votes}
                </button>
              </form>
            </article>
          ))}
          <Link href="/explore?f=pile" className="mono" style={{ alignSelf: "flex-start", padding: "12px 0" }}>
            Search the whole pile →
          </Link>
        </section>
      ) : null}

      <Link href="/pitch" className="yellow pack-card">
        <span className="display" style={{ fontSize: 44 }}>
          Pitch us
          <br />a pack.
        </span>
        <span className="lede" style={{ fontSize: 15 }}>
          Got an idea for a daily? Name it and bring 100 lines.
        </span>
        <span className="btn btn-ink" style={{ alignSelf: "flex-start", boxShadow: "3px 3px 0 var(--accent)" }}>
          Start a pitch
        </span>
      </Link>

      <Footer />
    </Page>
  );
}
