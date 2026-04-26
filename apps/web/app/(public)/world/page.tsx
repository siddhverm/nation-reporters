import Link from 'next/link';
import { COUNTRIES, REGION_LABELS } from '@/lib/countries';

export default function WorldPage() {
  const byRegion = COUNTRIES.reduce<Record<string, typeof COUNTRIES>>((acc, c) => {
    (acc[c.region] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-navy mb-1">World News</h1>
        <p className="text-gray-500">Browse news from {COUNTRIES.length}+ countries in their native languages, AI-curated 3× daily.</p>
      </div>

      {Object.entries(REGION_LABELS).map(([region, label]) => {
        const countries = byRegion[region] ?? [];
        if (!countries.length) return null;
        return (
          <section key={region} className="mb-8">
            <h2 className="text-base sm:text-sm font-black text-navy uppercase tracking-wide sm:tracking-widest border-b-2 border-brand pb-2 mb-4">
              {label}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {countries.map((c) => (
                <Link key={c.code} href={`/country/${c.slug}`}
                  className="group flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand/40 hover:shadow-md transition-all text-center">
                  <span className="text-3xl">{c.flag}</span>
                  <div>
                    <p className="text-sm font-bold text-navy group-hover:text-brand transition-colors leading-tight">{c.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{c.langName}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
