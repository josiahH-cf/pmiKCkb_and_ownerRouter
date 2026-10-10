import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { connection } from "next/server";
import { readApplicationDisplayName } from "@/lib/firestore/presentation-settings";
import { PMI_COMPANY } from "@/lib/constants";
import { APP_VIEWPORT } from "@/lib/ui/app-viewport";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/ui/theme";

// Official PMI primary typeface ("Use Poppins from Google for all print and digital applications
// whenever possible" — PMI Brand Style Guide 071525, docs/brand_pack). Self-hosted at build by
// next/font; the guide's body weights are Light/Regular and heading weights SemiBold/Bold.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return {
    title: `${await readApplicationDisplayName()} · ${PMI_COMPANY}`,
    description: "Internal source-backed knowledge base for PMI KC Metro.",
  };
}

// S165: one explicit phone viewport for every page (safe areas, keyboard-aware layout, zoom kept).
export const viewport: Viewport = APP_VIEWPORT;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={poppins.variable} lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
