import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestalt Lexicon",
  description: "A shared reference of Gestalt therapy terms with Harvard citations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white text-neutral-900">{children}</body>
    </html>
  );
}
