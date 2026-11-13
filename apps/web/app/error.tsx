"use client";

import { useEffect } from "react";

/**
 * Catches render errors in any page so a single bad component shows a recoverable
 * message instead of Next's blank "Application error: a client-side exception has
 * occurred" screen. The header and navigation stay usable.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="text-center py-24 space-y-3">
      <p className="text-xl font-semibold text-gray-800">Something went wrong loading this page.</p>
      <p className="text-sm text-gray-500">
        {error.message || "An unexpected error occurred."}
        {error.digest && <span className="text-gray-400"> (ref {error.digest})</span>}
      </p>
      <div className="flex items-center justify-center gap-4 text-sm">
        <button onClick={reset} className="text-blue-600 hover:underline cursor-pointer">
          Try again
        </button>
        <a href="/" className="text-blue-600 hover:underline">
          Go to the latest sitting day
        </a>
      </div>
    </div>
  );
}
