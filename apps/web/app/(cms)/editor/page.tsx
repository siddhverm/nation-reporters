'use client';
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  status: string;
  riskScore: number | null;
  riskFlags: string[];
  createdAt: string;
  author: { name: string };
  riskAssessment?: { score: number; flags: string[]; reasoning: string; autoApprove: boolean } | null;
}

const RISK_COLOR: Record<string, string> = {
  low: 'text-green-600',
  medium: 'text-yellow-600',
  high: 'text-red-600',
};

function riskLevel(score: number | null): 'low' | 'medium' | 'high' {
  if (!score) return 'low';
  if (score < 0.3) return 'low';
  if (score < 0.6) return 'medium';
  return 'high';
}

export default function EditorReviewPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/articles?status=PENDING_REVIEW&limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((res) => { setArticles(res.data ?? []); setLoading(false); });
  }, []);

  const action = async (id: string, action: 'approve' | 'reject') => {
    const token = localStorage.getItem('accessToken');
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/articles/${id}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setArticles((prev) => prev.filter((a) => a.id !== id));
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading review queue...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Review Queue ({articles.length})</h1>

      {articles.length === 0 && (
        <div className="text-center text-gray-400 py-16">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
          <p>No articles pending review</p>
        </div>
      )}

      <div className="space-y-4">
        {articles.map((a) => {
          const level = riskLevel(a.riskScore);
          return (
            <div key={a.id} className="border rounded-xl p-5 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-lg leading-snug">{a.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    By {a.author?.name} · {new Date(a.createdAt).toLocaleDateString()}
                  </p>

                  {a.riskAssessment && (
                    <div className={`mt-2 text-sm font-medium ${RISK_COLOR[level]}`}>
                      <AlertTriangle className="h-4 w-4 inline mr-1" />
                      Risk: {(a.riskScore! * 100).toFixed(0)}% — {a.riskFlags.join(', ') || 'none'}
                      {a.riskAssessment.reasoning && (
                        <p className="font-normal text-gray-500 mt-1">{a.riskAssessment.reasoning}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => action(a.id, 'approve')}
                    className="flex items-center gap-1 bg-green-50 text-green-700 hover:bg-green-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <CheckCircle className="h-4 w-4" /> Approve
                  </button>
                  <button
                    onClick={() => action(a.id, 'reject')}
                    className="flex items-center gap-1 bg-red-50 text-red-600 hover:bg-red-100 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
