import type { Metadata } from "next";
import { BackHeader, Footer, Page } from "@/components/ui";
import { PALETTE } from "@/lib/palette";

export const metadata: Metadata = { title: "Pack colours" };

export default function Colours() {
  return (
    <Page>
      <BackHeader />
      <div className="form" style={{ gap: 10 }}>
        <h1 className="display" style={{ fontSize: 52 }}>
          Pack colours
        </h1>
        <p className="lede">Each new pack gets the next tone in the cycle. After {PALETTE.length} it starts again.</p>
      </div>
      <ol className="form" style={{ listStyle: "none", padding: 0, margin: 0, gap: 12 }}>
        {PALETTE.map((t, i) => (
          <li key={t.name} className="swatch" style={{ background: t.ground }}>
            <span className="rank" style={{ width: 28 }}>
              {i + 1}
            </span>
            <span className="tag tag-lg" style={{ background: t.accent }}>
              /pack
            </span>
            <span className="mono" style={{ flex: 1, textAlign: "right", color: t.text, fontWeight: 700 }}>
              {t.name} {t.accent}
            </span>
          </li>
        ))}
      </ol>
      <p className="hint" style={{ fontSize: 14 }}>
        Black, white and the yellow highlight stay the same on every pack.
      </p>
      <Footer />
    </Page>
  );
}
