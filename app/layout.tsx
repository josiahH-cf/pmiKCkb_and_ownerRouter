import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { PMI_COMPANY, PRODUCT_NAME } from "@/lib/constants";
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

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} · ${PMI_COMPANY}`,
  description: "Internal source-backed knowledge base for PMI KC Metro.",
};

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
