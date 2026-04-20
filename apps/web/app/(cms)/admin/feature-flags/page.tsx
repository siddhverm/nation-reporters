'use client';
import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';

interface Flag {
  id: string;
  key: string;
  enabled: boolean;
  updatedAt: string;
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  function token() { return localStorage.getItem('accessToken') ?? ''; }

  function load() {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/feature-flags`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d: Flag[]) => { setFlags(d); setLoading(false); });
  }

  useEffect(load, []);

  async function toggle(key: string, enabled: boolean) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/feature-flags/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ enabled: !enabled }),
    });
    load();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Flag className="h-6 w-6 text-brand" />
        <h1 className="text-2xl font-bold">Feature Flags</h1>
      </div>

      {loading ? <p className="text-gray-400 text-center py-12">Loading...</p> : (
        <div className="space-y-3">
          {flags.map((f) => (
            <div key={f.id} className="border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-mono font-semibold text-gray-900">{f.key}</p>
                <p className="text-xs text-gray-400 mt-0.5">Updated {new Date(f.updatedAt).toLocaleString()}</p>
              </div>
              <button
                onClick={() => toggle(f.key, f.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${f.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${f.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
