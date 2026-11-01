import type { Metadata, Viewport } from "next";
import { Anton, Bricolage_Grotesque, DM_Mono } from "next/font/google";
import "./globals.css";

const display = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-body" });
const mono = DM_Mono({ weight: "500", subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Extra", template: "%s · Extra" },
  description: "Tiny doses of text, once a day.",
};

export const viewport: Viewport = { themeColor: "#1a0a10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
