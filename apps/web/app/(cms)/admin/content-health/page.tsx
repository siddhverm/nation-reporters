'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Activity } from 'lucide-react';

type HealthRow = {
  categorySlug: string;
  categoryName: string;
  language: string;
  count24h: number;
  countTotal: number;
  belowMin: boolean;
};

type ContentHealthResponse = {
  generatedAt: string;
  minRequired: number;
  lastIngestionAt: string | null;
  activeSourceCount: number;
  categories: { slug: string; name: string }[];
  languages: string[];
  rows: HealthRow[];
  lowInventory: HealthRow[];
};

export default function ContentHealthPage() {
  const [data, setData] = useState<ContentHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = localStorage.getItem('accessToken');
    fetch(`${base}/analytics/content-health`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed: ${r.status}`);
        return r.json() as Promise<ContentHealthResponse>;
      })
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, []);

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, HealthRow[]>();
    for (const row of data?.rows ?? []) {
      const arr = map.get(row.categorySlug) ?? [];
      arr.push(row);
      map.set(row.categorySlug, arr);
    }
    return map;
  }, [data]);

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading content health…</div>;
  }

  if (error || !data) {
    return <div className="p-8 text-center text-red-500">Unable to load content health: {error ?? 'Unknown error'}</div>;
  }

  const downloadCsv = () => {
    const header = ['category_slug', 'category_name', 'language', 'count_24h', 'count_total', 'min_required_24h', 'status'];
    const rows = data.rows.map((r) => [
      r.categorySlug,
      r.categoryName,
      r.language,
      String(r.count24h),
      String(r.countTotal),
      String(data.minRequired),
      r.belowMin ? 'below_target' : 'healthy',
    ]);
    const csv = [header, ...rows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-health-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Content Health</h1>
            <p className="text-sm text-gray-500">Section-language coverage and ingestion freshness</p>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Download CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-xs text-gray-500">Low-inventory pairs</p>
          <p className="text-2xl font-bold text-red-600">{data.lowInventory.length}</p>
        </div>
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-xs text-gray-500">Minimum required (24h)</p>
          <p className="text-2xl font-bold text-gray-900">{data.minRequired}</p>
        </div>
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-xs text-gray-500">Active sources</p>
          <p className="text-2xl font-bold text-gray-900">{data.activeSourceCount}</p>
        </div>
        <div className="rounded-xl border p-4 bg-white">
          <p className="text-xs text-gray-500">Last ingestion</p>
          <p className="text-sm font-semibold text-gray-900">
            {data.lastIngestionAt ? new Date(data.lastIngestionAt).toLocaleString('en-IN') : 'N/A'}
          </p>
        </div>
      </div>

      {data.lowInventory.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertTriangle className="h-4 w-4" />
            Low inventory warnings
          </div>
          <p className="text-xs mt-1">
            Some section-language pairs are below required coverage in the last 24 hours.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {data.categories.map((c) => {
          const rows = (groupedByCategory.get(c.slug) ?? []).sort((a, b) => a.language.localeCompare(b.language));
          return (
            <div key={c.slug} className="rounded-xl border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h2 className="font-semibold text-gray-900">{c.name}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="px-4 py-2">Language</th>
                      <th className="px-4 py-2">Count (24h)</th>
                      <th className="px-4 py-2">Count (Total)</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.categorySlug}-${r.language}`} className="border-b last:border-b-0">
                        <td className="px-4 py-2 font-mono">{r.language}</td>
                        <td className="px-4 py-2">{r.count24h}</td>
                        <td className="px-4 py-2">{r.countTotal}</td>
                        <td className="px-4 py-2">
                          {r.belowMin ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">
                              Below target
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-semibold">
                              Healthy
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
