'use client';
import { useEffect, useState } from 'react';
import { Share2, RefreshCw, RotateCcw, CheckCircle, XCircle, Clock, AlertTriangle, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Job {
  id: string;
  platform: string;
  status: string;
  errorMsg: string | null;
  executedAt: string | null;
  createdAt: string;
  retries: number;
  article?: { title: string; slug: string } | null;
}

const PLATFORMS = ['TWITTER','FACEBOOK','INSTAGRAM','YOUTUBE','THREADS','LINKEDIN','WHATSAPP','TELEGRAM','WEB','MOBILE_PUSH'];
const STATUSES  = ['PENDING','QUEUED','RUNNING','SUCCESS','FAILED','RETRYING','DEAD_LETTERED'];

const STATUS_CFG: Record<string, { color: string; icon: React.ElementType }> = {
  SUCCESS:      { color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  FAILED:       { color: 'bg-red-100 text-red-700',      icon: XCircle },
  DEAD_LETTERED:{ color: 'bg-red-200 text-red-900',      icon: XCircle },
  PENDING:      { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  QUEUED:       { color: 'bg-blue-100 text-blue-700',    icon: Clock },
  RUNNING:      { color: 'bg-blue-200 text-blue-800',    icon: Clock },
  RETRYING:     { color: 'bg-orange-100 text-orange-700', icon: RotateCcw },
};

const PLATFORM_ICONS: Record<string, string> = {
  TWITTER: '𝕏', FACEBOOK: '📘', INSTAGRAM: '📸', YOUTUBE: '▶️',
  THREADS: '🧵', LINKEDIN: '💼', WHATSAPP: '💬', TELEGRAM: '✈️',
  WEB: '🌐', MOBILE_PUSH: '📱',
};

export default function SocialManagerPage() {
  const { token } = useAuth();
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('');
  const [status, setStatus]     = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState('');
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

  function load() {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (platform) params.set('platform', platform);
    if (status) params.set('status', status);
    fetch(`${base}/publish-jobs?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setJobs(Array.isArray(d) ? d : (d.data ?? [])); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, [token, platform, status]);

  async function triggerDigest() {
    setTriggering(true);
    setTriggerMsg('');
    try {
      const res = await fetch(`${base}/publish-jobs/digest/trigger`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const results: { title: string; success: boolean }[] = Array.isArray(data) ? data : [];
      const ok = results.filter((r) => r.success).length;
      setTriggerMsg(`Posted ${ok}/${results.length} articles to social platforms`);
      setTimeout(() => setTriggerMsg(''), 6000);
      load();
    } catch {
      setTriggerMsg('Trigger failed — check credentials');
    } finally {
      setTriggering(false);
    }
  }

  async function retry(id: string) {
    setRetrying(id);
    try {
      await fetch(`${base}/publish-jobs/${id}/retry`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      load();
    } finally { setRetrying(null); }
  }

  const counts = {
    total: jobs.length,
    success: jobs.filter((j) => j.status === 'SUCCESS').length,
    failed: jobs.filter((j) => j.status === 'FAILED' || j.status === 'DEAD_LETTERED').length,
    pending: jobs.filter((j) => j.status === 'PENDING' || j.status === 'QUEUED' || j.status === 'RUNNING').length,
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Share2 className="h-6 w-6 text-brand" /> Social Publish Jobs
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Monitor publishing activity across all platforms</p>
        </div>
        <div className="flex gap-2">
          <button onClick={triggerDigest} disabled={triggering}
            className="flex items-center gap-1.5 text-sm bg-brand text-white px-3 py-2 rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-60">
            {triggering ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {triggering ? 'Posting…' : 'Post Top News Now'}
          </button>
          <button onClick={load} className="flex items-center gap-1.5 text-sm text-navy border border-navy px-3 py-2 rounded-lg hover:bg-navy hover:text-white transition-colors">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {triggerMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" /> {triggerMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Jobs', value: counts.total, color: 'bg-gray-50 border-gray-200' },
          { label: 'Published', value: counts.success, color: 'bg-green-50 border-green-200' },
          { label: 'Pending', value: counts.pending, color: 'bg-yellow-50 border-yellow-200' },
          { label: 'Failed', value: counts.failed, color: 'bg-red-50 border-red-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 text-center ${s.color}`}>
            <p className="text-2xl font-black text-navy">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand">
          <option value="">All Platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full mx-auto" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Share2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">No publish jobs yet.</p>
          <p className="text-sm mt-1">Jobs appear here when articles are approved and published.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Article</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Platform</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Executed</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Retries</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map((j) => {
                const cfg = STATUS_CFG[j.status] ?? { color: 'bg-gray-100 text-gray-600', icon: AlertTriangle };
                const Icon = cfg.icon;
                return (
                  <tr key={j.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 max-w-xs">
                      <p className="font-medium text-gray-900 truncate">{j.article?.title ?? 'Article'}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      <span className="text-base mr-1">{PLATFORM_ICONS[j.platform] ?? '📡'}</span>
                      {j.platform}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                        <Icon className="h-3 w-3" />{j.status}
                      </span>
                      {j.errorMsg && <p className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]">{j.errorMsg}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {j.executedAt ? new Date(j.executedAt).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{j.retries}</td>
                    <td className="px-5 py-3">
                      {(j.status === 'FAILED' || j.status === 'DEAD_LETTERED') && (
                        <button onClick={() => retry(j.id)} disabled={retrying === j.id}
                          className="flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-semibold disabled:opacity-50">
                          <RotateCcw className="h-3 w-3" />
                          {retrying === j.id ? 'Retrying…' : 'Retry'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
