"use client";

import { useState } from "react";

export function CopyRssButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs font-medium bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 transition-colors text-gray-700"
    >
      {copied ? "Copied!" : "Copy RSS Feed"}
    </button>
  );
}
