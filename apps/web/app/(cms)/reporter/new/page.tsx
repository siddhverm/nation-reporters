'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RichEditor } from '@/components/cms/RichEditor';
import { Send, Save } from 'lucide-react';

export default function NewArticlePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState<object>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(submit: boolean) {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, excerpt, body }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed to save');
      const article = await res.json() as { id: string };

      if (submit) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/articles/${article.id}/submit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      router.push('/reporter');
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Story</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter story headline..."
            className="w-full border rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand text-xl font-semibold"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            placeholder="Brief summary (optional)..."
            className="w-full border rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Story Body</label>
          <RichEditor content={body} onChange={setBody} />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Save Draft
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Submit for Review
          </button>
        </div>
      </div>
    </div>
  );
}
