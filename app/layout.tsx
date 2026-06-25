import type { Metadata } from "next";
import "./globals.css";
import { PMI_COMPANY, PRODUCT_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} · ${PMI_COMPANY}`,
  description: "Internal source-backed knowledge base for PMI KC Metro.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
