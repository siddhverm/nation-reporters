'use client';
import { useEffect, useState } from 'react';
import { Layers, RefreshCw } from 'lucide-react';

interface Job {
  id: string;
  platform: string;
  status: string;
  errorMsg: string | null;
  executedAt: string | null;
  retries: number;
  article: { title: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'bg-green-50 text-green-700',
  FAILED: 'bg-red-50 text-red-700',
  DEAD_LETTERED: 'bg-red-100 text-red-900',
  PENDING: 'bg-yellow-50 text-yellow-700',
  QUEUED: 'bg-blue-50 text-blue-700',
  RUNNING: 'bg-blue-100 text-blue-800',
  RETRYING: 'bg-orange-50 text-orange-700',
};

export default function PublishJobsAdminPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'dlq'>('all');

  function token() { return localStorage.getItem('accessToken') ?? ''; }

  function load() {
    setLoading(true);
    const endpoint = tab === 'dlq' ? '/publish-jobs/dlq' : '/publish-jobs';
    fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d: Job[]) => { setJobs(d); setLoading(false); });
  }

  useEffect(load, [tab]);

  async function retry(id: string) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/publish-jobs/${id}/retry`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}` },
    });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3"><Layers className="h-6 w-6 text-brand" /><h1 className="text-2xl font-bold">Publish Jobs</h1></div>
        <button onClick={load} className="border rounded-lg p-2 hover:bg-gray-50"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="flex border-b mb-4">
        {(['all', 'dlq'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t === 'dlq' ? 'Dead Letter Queue' : 'All Jobs'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-gray-400 text-center py-12">Loading...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-500"><th className="pb-2 pr-4">Article</th><th className="pb-2 pr-4">Platform</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Executed</th><th className="pb-2 pr-4">Retries</th><th className="pb-2">Error</th></tr></thead>
            <tbody className="divide-y">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-4 max-w-xs truncate">{j.article?.title ?? '—'}</td>
                  <td className="py-2 pr-4 text-gray-600">{j.platform}</td>
                  <td className="py-2 pr-4"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[j.status] ?? 'bg-gray-100'}`}>{j.status}</span></td>
                  <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{j.executedAt ? new Date(j.executedAt).toLocaleString() : '—'}</td>
                  <td className="py-2 pr-4 text-gray-500">{j.retries}</td>
                  <td className="py-2 text-xs text-gray-500 max-w-xs truncate">
                    {j.errorMsg && <span title={j.errorMsg}>{j.errorMsg.slice(0, 40)}…</span>}
                    {(j.status === 'FAILED' || j.status === 'DEAD_LETTERED') && (
                      <button onClick={() => retry(j.id)} className="ml-2 text-brand hover:underline">Retry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {jobs.length === 0 && <p className="text-gray-400 text-center py-8">No jobs found</p>}
        </div>
      )}
    </div>
  );
}
