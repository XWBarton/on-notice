import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "On Notice — Australian Parliament Daily Feed",
  description:
    "Bills, divisions, and an edited question time podcast. No Dorothy Dixers.",
  openGraph: {
    siteName: "On Notice",
    type: "website",
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
              <a href="/divisions" className="hover:text-gray-900">Divisions</a>
              <a href="/members" className="hover:text-gray-900">Members</a>
              <a href="/podcast" className="hover:text-gray-900">Podcast</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-200 mt-16">
          <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-gray-500 flex justify-between">
            <span>On Notice — Australian Parliament Feed</span>
            <a href="/podcast/feed.xml" className="hover:text-gray-700">
              RSS Feed
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
