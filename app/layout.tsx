import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PMI KC KB",
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
