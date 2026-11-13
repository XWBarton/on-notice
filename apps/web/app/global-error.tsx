"use client";

/**
 * Last-resort boundary for errors thrown by the root layout itself (app/error.tsx
 * handles everything below it). Must render its own <html> and <body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "6rem 1rem", color: "#1f2937" }}>
        <p style={{ fontSize: "1.25rem", fontWeight: 600 }}>On Notice couldn&apos;t load.</p>
        <p style={{ fontSize: "0.875rem", color: "#6b7280", margin: "0.75rem 0" }}>
          {error.message || "An unexpected error occurred."}
        </p>
        <button onClick={reset} style={{ color: "#2563eb", background: "none", border: 0, cursor: "pointer", fontSize: "0.875rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
