'use client';
import { useState, useRef } from 'react';
import { Mic, Upload, Send, CheckCircle, FileAudio, X, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface PodcastDraft {
  title: string;
  description: string;
  category: string;
  language: string;
  file: File | null;
}

const CATEGORIES = ['Politics', 'Business', 'Sports', 'Technology', 'Health', 'Entertainment', 'World', 'India'];

export default function PodcastUploadPage() {
  const { user, token, checked } = useAuth();
  const [draft, setDraft] = useState<PodcastDraft>({
    title: '', description: '', category: 'India', language: 'en', file: null,
  });
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.name.endsWith('.mp3') && !file.name.endsWith('.m4a') && !file.name.endsWith('.wav')) {
      setError('Please upload an audio file (MP3, M4A, WAV)'); return;
    }
    if (file.size > 200 * 1024 * 1024) { setError('File must be under 200 MB'); return; }
    setError('');
    setDraft((d) => ({ ...d, file }));
  }

  async function submit(asDraft: boolean) {
    if (!draft.title.trim()) { setError('Title is required'); return; }
    if (!draft.file)         { setError('Please upload an audio file'); return; }
    setUploading(true);
    setError('');

    try {
      // Step 1: Get presigned S3 URL for audio upload
      const presignRes = await fetch(`${base}/media/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: draft.file.name, mimeType: draft.file.type, type: 'AUDIO' }),
      });

      let audioUrl = '';
      if (presignRes.ok) {
        const { uploadUrl, publicUrl } = await presignRes.json() as { uploadUrl: string; publicUrl: string };
        // Upload to S3
        await fetch(uploadUrl, { method: 'PUT', body: draft.file, headers: { 'Content-Type': draft.file.type } });
        audioUrl = publicUrl;
      }

      // Step 2: Create article of type podcast
      const articleRes = await fetch(`${base}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: draft.title,
          excerpt: draft.description,
          language: draft.language,
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: draft.description }] },
              ...(audioUrl ? [{ type: 'paragraph', content: [{ type: 'text', text: `[PODCAST_AUDIO:${audioUrl}]` }] }] : []),
            ],
          },
          podcastScript: draft.description,
        }),
      });

      if (!articleRes.ok) throw new Error('Failed to create podcast article');
      const article = await articleRes.json() as { id: string };

      // Step 3: Submit for review (unless saving as draft)
      if (!asDraft) {
        await fetch(`${base}/articles/${article.id}/submit`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        });
      }

      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (!checked) return <div className="p-8 text-center"><div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full mx-auto" /></div>;

  if (submitted) return (
    <div className="max-w-2xl mx-auto py-16 text-center">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Podcast Submitted!</h2>
      <p className="text-gray-500 mb-6">Your podcast has been sent to the Chief Editor for review. Once approved, it will be published on the website and promoted on social media.</p>
      <div className="flex justify-center gap-3">
        <button onClick={() => { setSubmitted(false); setDraft({ title: '', description: '', category: 'India', language: 'en', file: null }); }}
          className="bg-brand text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-brand-dark transition-colors">
          Upload Another
        </button>
        <a href="/reporter" className="border border-navy text-navy px-5 py-2.5 rounded-lg font-semibold hover:bg-navy hover:text-white transition-colors">
          My Stories
        </a>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upload Podcast</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload an audio file — it will go to the Chief Editor for review before publishing.</p>
      </div>

      {/* Workflow */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 flex-wrap text-xs text-blue-700">
          {['Upload Audio', '→', 'Submit for Review', '→', 'Chief Editor Approves', '→', 'Published + Promoted'].map((s, i) => (
            <span key={i} className={s === '→' ? 'text-blue-400' : 'font-semibold bg-white px-2 py-0.5 rounded border border-blue-200'}>{s}</span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <X className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Audio file drop */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Audio File *</label>
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              draft.file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-brand/50 hover:bg-gray-50'
            }`}>
            {draft.file ? (
              <div className="flex items-center justify-center gap-3">
                <FileAudio className="h-8 w-8 text-green-600" />
                <div className="text-left">
                  <p className="font-semibold text-gray-800">{draft.file.name}</p>
                  <p className="text-xs text-gray-500">{(draft.file.size / (1024 * 1024)).toFixed(1)} MB</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setDraft((d) => ({ ...d, file: null })); }}
                  className="ml-2 text-gray-400 hover:text-red-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <>
                <Mic className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="font-semibold text-gray-600">Click to select audio file</p>
                <p className="text-xs text-gray-400 mt-1">MP3, M4A, WAV · Max 200 MB</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" onChange={handleFile} className="hidden" />
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Episode Title *</label>
          <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="e.g. India Budget 2025: What it means for you"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description / Show Notes</label>
          <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            rows={4} placeholder="Brief description of what this episode covers…"
            className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none" />
        </div>

        {/* Category + Language */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
            <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Language</label>
            <select value={draft.language} onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand">
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
              <option value="mr">मराठी</option>
              <option value="bn">বাংলা</option>
              <option value="ta">தமிழ்</option>
              <option value="te">తెలుగు</option>
              <option value="ar">Arabic</option>
              <option value="ur">Urdu</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button onClick={() => submit(true)} disabled={uploading}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            <Clock className="h-4 w-4" /> Save Draft
          </button>
          <button onClick={() => submit(false)} disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 bg-brand text-white px-4 py-2.5 rounded-lg font-bold hover:bg-brand-dark transition-colors disabled:opacity-60">
            {uploading
              ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Uploading…</>
              : <><Send className="h-4 w-4" /> Submit for Review</>}
          </button>
        </div>
      </div>
    </div>
  );
}
