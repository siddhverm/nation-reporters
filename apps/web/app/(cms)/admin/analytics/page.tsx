'use client';
import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, CheckCircle, XCircle, Database } from 'lucide-react';

interface Overview {
  totalArticles: number;
  published: number;
  pending: number;
  failed: number;
  activeSources: number;
}

export default function AnalyticsAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const token = localStorage.getItem('accessToken');
    fetch(`${base}/analytics/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: Overview) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!data) return null;

  const cards = [
    { label: 'Total Articles', value: data.totalArticles, icon: BarChart2, color: 'text-blue-600 bg-blue-50' },
    { label: 'Published', value: data.published, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { label: 'Pending Review', value: data.pending, icon: TrendingUp, color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Failed Publish Jobs', value: data.failed, icon: XCircle, color: 'text-red-600 bg-red-50' },
    { label: 'Active Sources', value: data.activeSources, icon: Database, color: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <BarChart2 className="h-6 w-6 text-brand" />
        <h1 className="text-2xl font-bold">Analytics</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="border rounded-xl p-5">
              <div className={`inline-flex p-2 rounded-lg mb-3 ${c.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{c.value.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 border rounded-xl p-5 bg-gray-50">
        <p className="text-sm text-gray-500">
          Detailed time-series analytics, per-platform publish rates, and source performance dashboards
          will be available in the next release.
        </p>
      </div>
    </div>
  );
}
