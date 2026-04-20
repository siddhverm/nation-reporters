'use client';
import { useEffect, useState } from 'react';
import { Share2, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';

interface Job {
  id: string;
  platform: string;
  status: string;
  errorMsg: string | null;
  executedAt: string | null;
  createdAt: string;
  retries: number;
  article: { title: string; slug: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'text-green-600 bg-green-50',
  FAILED: 'text-red-600 bg-red-50',
  DEAD_LETTERED: 'text-red-800 bg-red-100',
  PENDING: 'text-yellow-600 bg-yellow-50',
  QUEUED: 'text-blue-600 bg-blue-50',
  RUNNING: 'text-blue-700 bg-blue-100',
  RETRYING: 'text-orange-600 bg-orange-50',
};

export default function SocialManagerPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');

  function load() {
    setLoading(true);
    const token = localStorage.getItem('accessToken');
    const params = new URLSearchParams();
    if (platform) params.set('platform', platform);
    if (status) params.set('status', status);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/publish-jobs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: Job[]) => { setJobs(d); setLoading(false); });
  }

  useEffect(load, [platform, status]);

  async function retry(id: string) {
    const token = localStorage.getItem('accessToken');
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/publish-jobs/${id}/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Share2 className="h-6 w-6 text-brand" />
        <h1 className="text-2xl font-bold text-gray-900">Publish Jobs</h1>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Platforms</option>
          {['TWITTER','FACEBOOK','INSTAGRAM','YOUTUBE','THREADS','LINKEDIN','WHATSAPP','TELEGRAM','WEB'].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {['PENDING','QUEUED','RUNNING','SUCCESS','FAILED','RETRYING','DEAD_LETTERED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={load} className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-4">Article</th>
                <th className="pb-2 pr-4">Platform</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Executed</th>
                <th className="pb-2 pr-4">Retries</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-4 max-w-xs truncate font-medium">{j.article?.title ?? j.id}</td>
                  <td className="py-2 pr-4 text-gray-600">{j.platform}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[j.status] ?? 'bg-gray-100'}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {j.executedAt ? new Date(j.executedAt).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">{j.retries}</td>
                  <td className="py-2">
                    {(j.status === 'FAILED' || j.status === 'DEAD_LETTERED') && (
                      <button
                        onClick={() => retry(j.id)}
                        className="text-xs text-brand hover:underline"
                      >
                        Retry
                      </button>
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
