import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bill Map — on-notice",
  description: "Explore Australian parliamentary bills as a network graph, from today back to 2006.",
  openGraph: {
    title: "Bill Map",
    description: "Australian parliamentary bills as an interactive network",
    url: "https://bills.on-notice.xyz",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
