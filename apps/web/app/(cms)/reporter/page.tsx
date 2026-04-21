'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FileText, Clock, CheckCircle, XCircle, Mic, Send, Globe } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Article {
  id: string; title: string; status: string; createdAt: string; updatedAt: string;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType; tip: string }> = {
  DRAFT:          { label: 'Draft',          color: 'bg-gray-100 text-gray-600',    icon: FileText,    tip: 'Not yet submitted' },
  PENDING_REVIEW: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-700',icon: Clock,       tip: 'Waiting for Chief Editor' },
  AI_PROCESSING:  { label: 'AI Processing',  color: 'bg-blue-100 text-blue-700',    icon: Clock,       tip: 'AI is analysing' },
  NEEDS_EDIT:     { label: 'Needs Edit',     color: 'bg-red-100 text-red-600',      icon: XCircle,     tip: 'Editor returned for revision' },
  APPROVED:       { label: 'Approved',       color: 'bg-green-100 text-green-700',  icon: CheckCircle, tip: 'Approved — will publish soon' },
  PUBLISHING:     { label: 'Publishing…',    color: 'bg-blue-100 text-blue-800',    icon: Globe,       tip: 'Being sent to all platforms' },
  PUBLISHED:      { label: 'Published',      color: 'bg-green-200 text-green-800',  icon: Globe,       tip: 'Live on website + social media' },
};

export default function ReporterDashboard() {
  const { user, token, checked } = useAuth();
  const [articles, setArticles]  = useState<Article[]>([]);
  const [loading, setLoading]    = useState(true);
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

  useEffect(() => {
    if (!token) return;
    fetch(`${base}/articles?limit=50`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((res) => { setArticles(res.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (!checked || loading) return (
    <div className="p-8 text-center">
      <div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full mx-auto" />
    </div>
  );

  const counts = { draft: 0, pending: 0, published: 0 };
  articles.forEach((a) => {
    if (a.status === 'DRAFT') counts.draft++;
    else if (a.status === 'PENDING_REVIEW' || a.status === 'AI_PROCESSING') counts.pending++;
    else if (a.status === 'PUBLISHED') counts.published++;
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Stories</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back, {user?.name}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reporter/podcasts"
            className="flex items-center gap-1.5 border border-navy text-navy px-3 py-2 rounded-lg text-sm font-medium hover:bg-navy hover:text-white transition-colors">
            <Mic className="h-4 w-4" /> Upload Podcast
          </Link>
          <Link href="/reporter/new"
            className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-dark transition-colors">
            <Plus className="h-4 w-4" /> New Story
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Drafts', value: counts.draft, color: 'bg-gray-50 border-gray-200' },
          { label: 'In Review', value: counts.pending, color: 'bg-yellow-50 border-yellow-200' },
          { label: 'Published', value: counts.published, color: 'bg-green-50 border-green-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 text-center ${s.color}`}>
            <p className="text-2xl font-black text-navy">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Workflow guide */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">How publishing works</p>
        <div className="flex items-center gap-2 flex-wrap text-xs text-blue-700">
          {['Write Draft', '→', 'Submit for Review', '→', 'Chief Editor Approves', '→', 'Published Everywhere'].map((s, i) => (
            <span key={i} className={s === '→' ? 'text-blue-400' : 'font-semibold bg-white px-2 py-0.5 rounded border border-blue-200'}>{s}</span>
          ))}
        </div>
        <p className="text-xs text-blue-600 mt-2">Once approved, your article is published to: Website · Mobile App · Twitter/X · Facebook · Instagram · WhatsApp · Telegram</p>
      </div>

      {articles.length === 0 && (
        <div className="text-center text-gray-400 py-16">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No stories yet. Start writing!</p>
          <Link href="/reporter/new" className="mt-4 inline-flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-dark transition-colors text-sm">
            <Plus className="h-4 w-4" /> Write your first story
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {articles.map((a) => {
          const cfg = STATUS_CFG[a.status] ?? STATUS_CFG.DRAFT;
          const Icon = cfg.icon;
          return (
            <div key={a.id} className="border rounded-xl p-4 bg-white shadow-sm flex items-center justify-between gap-4 group hover:border-brand/30 transition-colors">
              <div className="flex-1 min-w-0">
                <Link href={`/reporter/${a.id}/edit`} className="font-semibold text-gray-900 hover:text-brand truncate block">
                  {a.title}
                </Link>
                <p className="text-xs text-gray-400 mt-0.5">Updated {new Date(a.updatedAt).toLocaleDateString('en-IN')}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`} title={cfg.tip}>
                  <Icon className="h-3 w-3" /> {cfg.label}
                </span>
                {(a.status === 'DRAFT' || a.status === 'NEEDS_EDIT') && (
                  <Link href={`/reporter/${a.id}/edit`}
                    className="text-xs text-brand font-semibold hover:underline">Edit</Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
