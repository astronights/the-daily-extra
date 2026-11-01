import Link from "next/link";
import { Footer, Header, Page } from "@/components/ui";

export default function NotFound() {
  return (
    <Page>
      <Header />
      <div className="form" style={{ gap: 12, padding: "24px 0" }}>
        <span className="display" style={{ fontSize: 96, color: "var(--accent-text)" }}>
          404
        </span>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>No pack lives here. Yet.</h1>
        <div className="row">
          <Link href="/" className="btn btn-ink btn-plain">
            All packs
          </Link>
          <Link href="/pitch" className="btn btn-plain" style={{ background: "var(--yellow)" }}>
            Pitch it
          </Link>
        </div>
      </div>
      <Footer />
    </Page>
  );
}
