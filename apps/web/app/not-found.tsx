import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black text-brand mb-4">404</div>
        <h1 className="text-2xl font-bold text-navy mb-2">Page Not Found</h1>
        <p className="text-gray-500 mb-8">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="bg-brand text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-dark transition-colors">
            Go Home
          </Link>
          <Link href="/search" className="bg-navy text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-navy-light transition-colors">
            Search News
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap gap-2 justify-center text-sm">
          {['India','World','Politics','Business','Sports','Tech'].map((c) => (
            <Link key={c} href={`/category/${c.toLowerCase()}`}
              className="text-brand hover:underline">{c}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}
