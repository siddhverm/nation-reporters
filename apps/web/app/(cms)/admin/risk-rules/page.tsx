'use client';
import { useEffect, useState } from 'react';
import { Shield, Plus } from 'lucide-react';

interface Rule {
  id: string;
  name: string;
  category: string | null;
  maxScore: number;
  minConfidence: number;
  requireTrustedSource: boolean;
  autoApprove: boolean;
  isActive: boolean;
}

export default function RiskRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', maxScore: 0.4, minConfidence: 0.7, requireTrustedSource: false, autoApprove: false });

  function token() { return localStorage.getItem('accessToken') ?? ''; }

  function load() {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/risk-rules`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json()).then((d: Rule[]) => { setRules(d); setLoading(false); });
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/risk-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    load();
  }

  async function toggle(id: string, isActive: boolean) {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/risk-rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ isActive: !isActive }),
    });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3"><Shield className="h-6 w-6 text-brand" /><h1 className="text-2xl font-bold">Risk Rules</h1></div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg text-sm"><Plus className="h-4 w-4" /> Add Rule</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="border rounded-xl p-4 mb-6 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
            <label className="text-sm">Max Risk Score: <strong>{form.maxScore}</strong>
              <input type="range" min="0" max="1" step="0.05" value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: +e.target.value })} className="w-full mt-1" />
            </label>
            <label className="text-sm">Min Confidence: <strong>{form.minConfidence}</strong>
              <input type="range" min="0" max="1" step="0.05" value={form.minConfidence} onChange={(e) => setForm({ ...form, minConfidence: +e.target.value })} className="w-full mt-1" />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requireTrustedSource} onChange={(e) => setForm({ ...form, requireTrustedSource: e.target.checked })} /> Require trusted source</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.autoApprove} onChange={(e) => setForm({ ...form, autoApprove: e.target.checked })} /> Auto-approve matching articles</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-brand text-white px-4 py-2 rounded-lg text-sm">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {loading ? <p className="text-gray-400 text-center py-12">Loading...</p> : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r.id} className="border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{r.name}</span>
                  {r.category && <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{r.category}</span>}
                  {r.autoApprove && <span className="ml-2 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Auto-approve</span>}
                </div>
                <button onClick={() => toggle(r.id, r.isActive)} className={`text-xs px-3 py-1 rounded-lg ${r.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {r.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-4 text-xs text-gray-500">
                <span>Max score: {r.maxScore}</span>
                <span>Min confidence: {r.minConfidence}</span>
                <span>Trusted source: {r.requireTrustedSource ? 'Required' : 'Not required'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
