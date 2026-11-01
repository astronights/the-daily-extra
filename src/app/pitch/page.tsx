import type { Metadata } from "next";
import { pitchPack } from "@/app/actions";
import { PackForm } from "@/components/client";
import { BackHeader, Footer } from "@/components/ui";
import { normalizeSlug } from "@/lib/validation";

export const metadata: Metadata = { title: "Pitch a pack" };

type Props = { searchParams: Promise<{ slug?: string }> };

export default async function PitchPage({ searchParams }: Props) {
  const { slug } = await searchParams;
  return (
    <div className="page" style={{ background: "var(--yellow)" }}>
      <div className="wrap" style={{ gap: 24 }}>
        <BackHeader />
        <div className="form" style={{ gap: 10 }}>
          <h1 className="display" style={{ fontSize: 60 }}>
            Pitch us
            <br />a pack.
          </h1>
          <p className="lede">We read every pitch. Good ones go in the pile for upvotes, and the most wanted get built.</p>
        </div>
        <PackForm action={pitchPack} mode="pitch" defaultSlug={normalizeSlug(slug ?? "").slice(0, 24)} />
        <Footer />
      </div>
    </div>
  );
}
