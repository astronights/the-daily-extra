import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { followAction, postReview, submitLine } from "@/app/actions";
import { CopyShare, Countdown, LineForm, ReviewForm } from "@/components/client";
import { CheckIcon, Footer, Header, Highlighted, Meter, Page, PlusIcon } from "@/components/ui";
import { formatDay, formatIssue, issueNumber, timeAgo, utcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/repo";
import { readList } from "@/lib/session";
import { plainText } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ pack: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pack: slug } = await params;
  const pack = await repo.getLivePack(await getDb(), slug);
  if (!pack) return { title: "Not found" };
  return { title: `Today's ${pack.noun} · /${pack.slug}`, description: pack.description };
}

export default async function PackPage({ params }: Props) {
  const { pack: slug } = await params;
  const db = await getDb();
  const pack = await repo.getLivePack(db, slug);
  if (!pack) notFound();

  const day = utcDay();
  const following = (await readList("follows")).includes(slug);
  const [daily, summary, { reports, total }] = await Promise.all([
    repo.getDaily(db, slug, day),
    repo.ratingSummary(db, slug, day),
    repo.listReports(db, slug, day, { limit: 3 }),
  ]);
  const fives = summary.count ? Math.round((summary.counts[4] / summary.count) * 100) : 0;

  return (
    <Page pack={pack}>
      <Header slug={pack.slug} />

      <section id="today" className="form" style={{ gap: 20 }}>
        <div className="meta-row mono">
          <span>
            {formatIssue(issueNumber(pack.launchedOn, day))} · next in <Countdown />
          </span>
          <form action={followAction.bind(null, pack.slug, `/${pack.slug}`)}>
            <button type="submit" className="chip" aria-pressed={following}>
              {following ? <CheckIcon /> : <PlusIcon />}
              {following ? "Following" : "Follow"}
            </button>
          </form>
        </div>

        {daily ? (
          <div className="card today">
            <span className="sticker">Today&apos;s {pack.noun}</span>
            <p className="quote">
              “<Highlighted body={daily.body} />”
            </p>
            <div className="row">
              <Meter score={daily.avgScore} ratings={daily.ratings} label={pack.meterLabel} />
              {daily.author ? <span className="mono muted">· {daily.author}</span> : null}
            </div>
            <CopyShare text={plainText(daily.body)} title={`Today's ${pack.noun} · Extra`} />
          </div>
        ) : (
          <div className="card card-dashed today">
            <span className="sticker" style={{ background: "var(--paper)" }}>
              Today&apos;s {pack.noun}
            </span>
            <p className="quote" style={{ fontSize: 30 }}>
              Suspiciously quiet today.
            </p>
            <p className="lede">The pile is empty. Be the reason tomorrow isn&apos;t.</p>
            <a href="#submit" className="btn btn-accent" style={{ alignSelf: "flex-start" }}>
              Submit a line
            </a>
          </div>
        )}
      </section>

      {daily ? (
        <>
          <section className="verdict" aria-label="The verdict">
            <span className="big-score">{summary.count ? summary.average.toFixed(1) : "–"}</span>
            <span className="mono" style={{ fontSize: 13, lineHeight: 1.5 }}>
              The verdict
              <br />
              {summary.count} {summary.count === 1 ? "rating" : "ratings"}
              <br />
              {summary.count ? `${fives}% gave it a 5` : "Be the first"}
            </span>
          </section>

          <ReviewForm action={postReview} slug={pack.slug} day={day} />

          <section id="reports" className="reports">
            <h2 className="h2" style={{ fontSize: 30, marginBottom: 12 }}>
              Field reports
            </h2>
            {reports.length ? (
              reports.map((r) => (
                <article key={r.id} className="report">
                  <div className="row mono" style={{ gap: 10, textTransform: "none" }}>
                    <strong>{r.name ?? "anonymous"}</strong>
                    <span className="pill">{r.score}/5</span>
                    <span className="muted">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p>{r.body}</p>
                </article>
              ))
            ) : (
              <p className="lede muted">No reports yet. Send it, then tell us how it went.</p>
            )}
            {total > reports.length ? (
              <Link href={`/${pack.slug}/reports`} className="mono" style={{ fontSize: 13, padding: "14px 0" }}>
                See all {total} reports →
              </Link>
            ) : null}
          </section>
        </>
      ) : null}

      <section className="form" style={{ gap: 10, borderTop: "3px solid var(--ink)", paddingTop: 16 }}>
        <h2 className="mono" style={{ margin: 0, fontWeight: 500 }}>
          About /{pack.slug}
        </h2>
        <p className="lede">{pack.description}</p>
        <p className="mono muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {pack.author ? `Pitched by ${pack.author} · ` : ""}Since {formatDay(pack.launchedOn).replace(/^\w+ · /, "")}
          <br />
          {pack.followers} following · Rated on {pack.meterLabel}
        </p>
      </section>

      <LineForm action={submitLine} slug={pack.slug} />

      <Footer />
    </Page>
  );
}
