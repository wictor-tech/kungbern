import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUP Hjälp",
  description: "Skriv vad du vill göra i LUPNUMBER – så visar vi exakt hur.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0da0ec",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
