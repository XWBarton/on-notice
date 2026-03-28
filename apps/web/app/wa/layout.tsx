import type { Metadata } from "next";
import "../globals.css";
import Image from "next/image";

export const metadata: Metadata = {
  title: "On Notice WA — Western Australian Parliament Daily Feed",
  description:
    "Questions without notice and parliamentary business from the WA Legislative Assembly and Council.",
  openGraph: {
    siteName: "On Notice WA",
    type: "website",
    images: [{ url: "/icon.svg" }],
  },
};

export default function WALayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <a href="/" className="flex items-center gap-2.5">
            <Image src="/icon.svg" alt="On Notice WA" width={32} height={32} />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight">On Notice</span>
              <span className="text-sm font-semibold text-gold px-1.5 py-0.5 rounded bg-[#FFD700]/15 text-[#B8860B]">
                WA
              </span>
            </div>
          </a>
          <nav className="flex gap-6 text-sm text-gray-600">
            <a href="/podcast" className="hover:text-gray-900">Podcast</a>
            <a href="/api/feed.xml" className="hover:text-gray-900">RSS</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-gray-200 mt-16">
        <div className="mx-auto max-w-3xl px-4 py-6 text-xs text-gray-400 flex justify-between">
          <span>On Notice WA</span>
          <a href="https://on-notice.xyz" className="hover:text-gray-600">
            Also: Federal Parliament →
          </a>
        </div>
      </footer>
    </>
  );
}
