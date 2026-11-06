import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TimePilot — Dein Lerncockpit",
  description: "Dein Semester. Dein Tempo. Wochenplanung, Fokus und dein Second Brain an einem Ort.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de-CH">
      <body className="antialiased">{children}</body>
    </html>
  );
}
