'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Globe, Send, Eye, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Article {
  id: string; title: string; status: string; excerpt: string | null;
  riskScore: number | null; riskFlags: string[]; createdAt: string;
  author: { name: string };
  riskAssessment?: { score: number; flags: string[]; reasoning: string } | null;
  provenance?: { sourceName: string; sourceUrl: string } | null;
}

function riskLevel(score: number | null) {
  if (!score || score < 0.3) return 'low';
  if (score < 0.6) return 'medium';
  return 'high';
}

const RISK_COLOR = { low: 'text-green-600 bg-green-50', medium: 'text-yellow-700 bg-yellow-50', high: 'text-red-600 bg-red-50' };

const PLATFORMS = ['Website', 'Twitter/X', 'Facebook', 'Instagram', 'WhatsApp', 'Telegram', 'Mobile Push'];

export default function EditorReviewPage() {
  const { user, token, checked } = useAuth('CHIEF_EDITOR');
  const [articles, setArticles]  = useState<Article[]>([]);
  const [loading, setLoading]    = useState(true);
  const [acting, setActing]      = useState<string | null>(null);
  const [expanded, setExpanded]  = useState<string | null>(null);
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

  async function load() {
    if (!token) return;
    setLoading(true);
    fetch(`${base}/articles?status=PENDING_REVIEW&limit=50`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((res) => { setArticles(res.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { if (token) load(); }, [token]);

  async function approve(id: string) {
    setActing(id);
    try {
      // Approve then immediately trigger publish to all platforms
      await fetch(`${base}/articles/${id}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      await fetch(`${base}/articles/${id}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } finally { setActing(null); }
  }

  async function reject(id: string) {
    setActing(id);
    try {
      await fetch(`${base}/articles/${id}/reject`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } finally { setActing(null); }
  }

  if (!checked || loading) return (
    <div className="p-8 text-center">
      <div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full mx-auto" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">{articles.length} article{articles.length !== 1 ? 's' : ''} awaiting approval</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-navy border border-navy px-3 py-2 rounded-lg hover:bg-navy hover:text-white transition-colors">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Publish-to notice */}
      <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-6">
        <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-1.5">On Approve — publishes to:</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 text-xs bg-white border border-green-200 text-green-700 px-2 py-0.5 rounded-full font-medium">
              <Globe className="h-3 w-3" /> {p}
            </span>
          ))}
        </div>
      </div>

      {articles.length === 0 && (
        <div className="text-center text-gray-400 py-16">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400 opacity-50" />
          <p className="font-semibold">Queue is clear — no articles pending review</p>
        </div>
      )}

      <div className="space-y-4">
        {articles.map((a) => {
          const level = riskLevel(a.riskScore);
          const isActing = acting === a.id;
          const open = expanded === a.id;
          return (
            <div key={a.id} className="border rounded-xl bg-white shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-lg leading-snug">{a.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      By <span className="font-semibold">{a.author?.name ?? 'Unknown'}</span> · {new Date(a.createdAt).toLocaleDateString('en-IN')}
                      {a.provenance && (
                        <> · Source: <a href={a.provenance.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="text-brand hover:underline">{a.provenance.sourceName}</a></>
                      )}
                    </p>
                    {a.excerpt && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{a.excerpt}</p>}

                    {/* Risk badge */}
                    {a.riskScore !== null && (
                      <div className={`inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-2.5 py-1 rounded-full ${RISK_COLOR[level]}`}>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Risk {level}: {(a.riskScore * 100).toFixed(0)}%
                        {a.riskFlags.length > 0 && <> · {a.riskFlags.slice(0, 3).join(', ')}</>}
                      </div>
                    )}

                    {open && a.riskAssessment?.reasoning && (
                      <p className="text-sm text-gray-500 mt-2 bg-gray-50 rounded-lg p-3">{a.riskAssessment.reasoning}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={() => approve(a.id)} disabled={isActing}
                      className="flex items-center gap-1.5 bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
                      {isActing ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <CheckCircle className="h-4 w-4" />}
                      Approve & Publish
                    </button>
                    <button onClick={() => reject(a.id)} disabled={isActing}
                      className="flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border border-red-200">
                      <XCircle className="h-4 w-4" /> Return to Reporter
                    </button>
                    <button onClick={() => setExpanded(open ? null : a.id)}
                      className="flex items-center gap-1.5 text-gray-500 hover:text-navy text-xs py-1 justify-center">
                      <Eye className="h-3.5 w-3.5" /> {open ? 'Hide' : 'Details'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
