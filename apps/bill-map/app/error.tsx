"use client";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
      <div className="bg-white rounded-lg border border-red-200 p-6 max-w-2xl w-full">
        <h2 className="text-sm font-semibold text-red-700 mb-2">Application error</h2>
        <p className="text-sm font-mono text-gray-800 mb-4">{error.message}</p>
        {error.stack && (
          <pre className="text-xs text-gray-500 overflow-auto whitespace-pre-wrap bg-gray-50 rounded p-3">
            {error.stack}
          </pre>
        )}
      </div>
    </div>
  );
}
