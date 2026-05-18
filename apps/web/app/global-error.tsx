'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl font-black text-red-600 mb-4">!</div>
            <h1 className="text-2xl font-bold mb-2">Application error</h1>
            <p className="text-gray-500 mb-8">Something went wrong. Refresh the page to try again.</p>
            <button
              type="button"
              onClick={() => reset()}
              className="bg-red-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
