import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "On Notice — Australian Parliament Daily Feed",
  description:
    "Bills, divisions, and an edited question time podcast. No Dorothy Dixers.",
  openGraph: {
    siteName: "On Notice",
    type: "website",
    images: [{ url: "/icon.svg" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
            <a href="/" className="text-xl font-bold tracking-tight">
              On Notice
            </a>
            <nav className="flex gap-6 text-sm text-gray-600">
              <a href="/calendar" className="hover:text-gray-900">Calendar</a>
              <a href="/divisions" className="hover:text-gray-900">Divisions</a>
              <a href="/members" className="hover:text-gray-900">Members</a>
              <a href="/podcast" className="hover:text-gray-900">Podcast</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
