import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryBody, Header, Page, Footer } from "@/components/ui";
import { formatDay, formatIssue, issueNumber, timeAgo, utcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ pack: string }>;
  searchParams: Promise<{ sort?: string; n?: string }>;
};

const SORTS: Array<{ key: repo.ReportSort; label: string }> = [
  { key: "new", label: "Newest" },
  { key: "high", label: "Highest" },
  { key: "low", label: "Lowest" },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pack } = await params;
  return { title: `Field reports · /${pack}` };
}

export default async function ReportsPage({ params, searchParams }: Props) {
  const { pack: slug } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const pack = await repo.getLivePack(db, slug);
  if (!pack) notFound();

  const sort: repo.ReportSort = sp.sort === "high" || sp.sort === "low" ? sp.sort : "new";
  const limit = Math.min(Math.max(Number(sp.n) || 10, 10), 200);
  const day = utcDay();
  const [daily, summary, { reports, total }] = await Promise.all([
    repo.getDaily(db, slug, day),
    repo.ratingSummary(db, slug, day),
    repo.listReports(db, slug, day, { sort, limit }),
  ]);

  return (
    <Page pack={pack}>
      <Header
        slug={pack.slug}
        right={
          <Link href={`/${pack.slug}`} className="back">
            ← Today
          </Link>
        }
      />

      <div className="form" style={{ gap: 12 }}>
        <h1 className="display" style={{ fontSize: 52 }}>
          Field reports
        </h1>
        <p className="mono" style={{ margin: 0 }}>
          {formatIssue(issueNumber(pack.launchedOn, day))} · {formatDay(day)}
        </p>
        {daily ? (
          <div className="card" style={{ margin: 0, padding: "14px 16px", boxShadow: "none", fontSize: 18, lineHeight: 1.3, fontWeight: 800 }}>
            <EntryBody body={daily.body} quoted={pack.kind !== "cards"} />
            {daily.back ? (
              <details style={{ marginTop: 10, fontWeight: 600 }}>
                <summary className="mono" style={{ cursor: "pointer" }}>
                  Show the back
                </summary>
                <div style={{ marginTop: 8 }}>
                  <EntryBody body={daily.back} quoted={false} />
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className="bars mono" aria-label="Score breakdown">
        <div className="row" style={{ alignItems: "baseline", gap: 10, marginBottom: 6 }}>
          <span className="big-score" style={{ fontSize: 40 }}>
            {summary.count ? summary.average.toFixed(1) : "–"}
          </span>
          <span>
            {summary.count} ratings · {total} reports
          </span>
        </div>
        {[5, 4, 3, 2, 1].map((score) => {
          const pct = summary.count ? Math.round((summary.counts[score - 1] / summary.count) * 100) : 0;
          return (
            <div className="bar" key={score}>
              <span style={{ width: 12 }}>{score}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${pct}%` }} />
              </span>
              <span style={{ width: 36, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </section>

      <nav className="row" aria-label="Sort reports">
        {SORTS.map((s) => (
          <Link key={s.key} href={`/${pack.slug}/reports?sort=${s.key}`} className="chip" aria-current={s.key === sort ? "page" : undefined}>
            {s.label}
          </Link>
        ))}
      </nav>

      <section className="reports">
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
          <p className="lede muted">No reports yet today.</p>
        )}
      </section>

      {total > reports.length ? (
        <div className="form" style={{ gap: 10, alignItems: "center" }}>
          <span className="mono muted">
            Showing {reports.length} of {total}
          </span>
          <Link href={`/${pack.slug}/reports?sort=${sort}&n=${limit + 10}`} className="btn btn-block" scroll={false}>
            Load 10 more
          </Link>
        </div>
      ) : null}

      <Link href={`/${pack.slug}#review`} className="btn btn-accent btn-block">
        Add your report
      </Link>

      <Footer />
    </Page>
  );
}
