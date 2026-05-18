'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl font-black text-brand mb-4">!</div>
        <h1 className="text-2xl font-bold text-navy mb-2">Something went wrong</h1>
        <p className="text-gray-500 mb-8">The page failed to load. Try again or return home.</p>
        <ErrorActions onRetry={reset} />
      </div>
    </div>
  );
}

function ErrorActions({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex gap-3 justify-center">
      <button
        type="button"
        onClick={onRetry}
        className="bg-brand text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-dark transition-colors"
      >
        Try again
      </button>
      <Link
        href="/"
        className="bg-navy text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-navy-light transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
