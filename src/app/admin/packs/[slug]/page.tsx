import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditLineForm, EditPackForm } from "@/components/client";
import { Page } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/repo";
import { isAdmin } from "@/lib/session";
import { updateLineAction, updatePackAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit pack", robots: { index: false } };

type Props = { params: Promise<{ slug: string }> };

function note(line: repo.EditableLine): string {
  if (line.status === "rejected") return "rejected";
  if (line.status === "pending") return "pending";
  return line.shownOn ? `shown ${formatDay(line.shownOn).replace(/^\w+ · /, "")}` : "not shown yet";
}

export default async function EditPack({ params }: Props) {
  if (!(await isAdmin())) redirect("/admin");
  const { slug } = await params;
  const db = await getDb();
  const pack = await repo.getPack(db, slug);
  if (!pack) notFound();
  const lines = await repo.listPackLines(db, slug);
  const approved = lines.filter((l) => l.status === "approved").length;

  return (
    <Page pack={pack}>
      <header className="topbar">
        <Link href="/admin?tab=packs" className="back">
          ← Packs
        </Link>
        <Link href={`/${pack.slug}`} className="back">
          View page →
        </Link>
      </header>

      <div className="form" style={{ gap: 8 }}>
        <span className="tag tag-lg" style={{ alignSelf: "flex-start" }}>
          /{pack.slug}
        </span>
        <h1 className="display" style={{ fontSize: 44 }}>
          Edit pack
        </h1>
        <p className="mono muted" style={{ margin: 0 }}>
          {approved} lines in rotation · the name /{pack.slug} can&apos;t change
        </p>
      </div>

      <EditPackForm action={updatePackAction.bind(null, pack.slug)} pack={pack} />

      <section className="reports">
        <h2 className="h2" style={{ marginBottom: 8 }}>
          Lines
        </h2>
        <p className="hint" style={{ fontSize: 14, marginBottom: 8 }}>
          Fix typos or change a line&apos;s {pack.meterLabel}. Wrap words in *asterisks* to highlight them.
        </p>
        {lines.map((l) => (
          <EditLineForm key={l.id} action={updateLineAction} line={{ id: l.id, body: l.body, level: l.level, note: note(l) }} meterLabel={pack.meterLabel} />
        ))}
      </section>
    </Page>
  );
}
