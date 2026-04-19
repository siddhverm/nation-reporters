'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FileText, Clock, CheckCircle, XCircle } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT:          { label: 'Draft',    color: 'bg-gray-100 text-gray-600',   icon: FileText },
  PENDING_REVIEW: { label: 'Pending',  color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  AI_PROCESSING:  { label: 'AI Processing', color: 'bg-blue-100 text-blue-700', icon: Clock },
  APPROVED:       { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  PUBLISHED:      { label: 'Published', color: 'bg-green-200 text-green-800', icon: CheckCircle },
  NEEDS_EDIT:     { label: 'Needs Edit', color: 'bg-red-100 text-red-600',   icon: XCircle },
  REJECTED:       { label: 'Rejected', color: 'bg-red-100 text-red-600',     icon: XCircle },
};

export default function ReporterDashboard() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/articles?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((res) => { setArticles(res.data ?? []); setLoading(false); });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Stories</h1>
        <Link
          href="/reporter/new"
          className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-dark transition-colors"
        >
          <Plus className="h-4 w-4" /> New Story
        </Link>
      </div>

      {articles.length === 0 && (
        <div className="text-center text-gray-400 py-16">
          <FileText className="h-12 w-12 mx-auto mb-3" />
          <p>No stories yet. Start writing!</p>
        </div>
      )}

      <div className="space-y-3">
        {articles.map((a) => {
          const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.DRAFT;
          const Icon = cfg.icon;
          return (
            <div key={a.id} className="border rounded-xl p-4 bg-white shadow-sm flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <Link href={`/reporter/${a.id}/edit`} className="font-semibold text-gray-900 hover:text-brand truncate block">
                  {a.title}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">
                  Updated {new Date(a.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full shrink-0 ${cfg.color}`}>
                <Icon className="h-3 w-3" /> {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
