'use client';
import { useEffect, useState } from 'react';
import { Rss, Plus, Play } from 'lucide-react';

interface Source {
  id: string;
  name: string;
  feedUrl: string;
  type: string;
  isActive: boolean;
  isTrusted: boolean;
  lastFetchedAt: string | null;
}

export default function SourcesAdminPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', feedUrl: '', type: 'rss', isTrusted: false });
  const [fetching, setFetching] = useState<string | null>(null);

  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  function token() { return localStorage.getItem('accessToken') ?? ''; }

  function load() {
    fetch(`${base}/sources`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d: Source[]) => { setSources(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`${base}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    load();
  }

  async function fetchNow(id: string) {
    setFetching(id);
    await fetch(`${base}/sources/${id}/fetch-now`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
    }).catch(() => null);
    setFetching(null);
    load();
  }

  async function toggle(id: string, isActive: boolean) {
    await fetch(`${base}/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ isActive: !isActive }),
    });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3"><Rss className="h-6 w-6 text-brand" /><h1 className="text-2xl font-bold">Feed Sources</h1></div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg text-sm"><Plus className="h-4 w-4" /> Add Source</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="border rounded-xl p-4 mb-6 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Source name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input required placeholder="Feed URL" value={form.feedUrl} onChange={(e) => setForm({ ...form, feedUrl: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
              <option value="rss">RSS</option><option value="atom">Atom</option><option value="json_api">JSON API</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isTrusted} onChange={(e) => setForm({ ...form, isTrusted: e.target.checked })} />
              Trusted source (eligible for auto-approve)
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-brand text-white px-4 py-2 rounded-lg text-sm">Add</button>
            <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {loading ? <p className="text-gray-400 text-center py-12">Loading...</p> : (
        <div className="space-y-3">
          {sources.map((s) => (
            <div key={s.id} className="border rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{s.name}</span>
                  {s.isTrusted && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Trusted</span>}
                  <span className={`text-xs px-2 py-0.5 rounded ${s.isActive ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{s.feedUrl}</p>
                {s.lastFetchedAt && <p className="text-xs text-gray-400">Last fetched: {new Date(s.lastFetchedAt).toLocaleString()}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => fetchNow(s.id)} disabled={fetching === s.id} className="flex items-center gap-1 text-xs border rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                  <Play className="h-3 w-3" /> {fetching === s.id ? 'Fetching...' : 'Fetch Now'}
                </button>
                <button onClick={() => toggle(s.id, s.isActive)} className="text-xs text-brand hover:underline">{s.isActive ? 'Disable' : 'Enable'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
