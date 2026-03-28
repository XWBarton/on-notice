import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { BrainrotProvider } from "@/context/BrainrotContext";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Suspense } from "react";
import Image from "next/image";
import { headers } from "next/headers";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const isWA = headersList.get("x-is-wa") === "1";

  if (isWA) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <BrainrotProvider>
          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto max-w-3xl px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
              <Suspense fallback={
                <a href="/" className="flex items-center gap-2.5">
                  <Image src="/icon.svg" alt="On Notice" width={32} height={32} />
                  <span className="text-xl font-bold tracking-tight">On Notice</span>
                </a>
              }>
                <HeaderLogo />
              </Suspense>
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
        </BrainrotProvider>
      </body>
    </html>
  );
}
