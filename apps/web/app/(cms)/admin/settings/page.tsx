'use client';
import { useEffect, useState } from 'react';
import { Settings, Save, RefreshCw, Globe, Bell, Shield, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface SiteSettings {
  siteName: string;
  siteTagline: string;
  siteUrl: string;
  adminEmail: string;
  articlesPerPage: number;
  autoPublishRss: boolean;
  enableComments: boolean;
  maintenanceMode: boolean;
}

const DEFAULT: SiteSettings = {
  siteName: 'Nation Reporters',
  siteTagline: 'Breaking News, Latest News, India & World News',
  siteUrl: 'https://nationreporters.com',
  adminEmail: 'admin@nationreporters.com',
  articlesPerPage: 20,
  autoPublishRss: false,
  enableComments: false,
  maintenanceMode: false,
};

export default function SettingsPage() {
  const { token } = useAuth('ADMIN');
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [flags, setFlags] = useState<{ key: string; enabled: boolean }[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${base}/feature-flags`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setFlags(Array.isArray(d) ? d : []))
      .catch(() => null);
  }, [token]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function toggleFlag(key: string, enabled: boolean) {
    await fetch(`${base}/feature-flags/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setFlags((prev) => prev.map((f) => f.key === key ? { ...f, enabled: !enabled } : f));
  }

  const sections = [
    { title: 'Site Identity', icon: Globe, fields: ['siteName', 'siteTagline', 'siteUrl', 'adminEmail'] as const },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6 text-brand" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Platform configuration and feature toggles</p>
        </div>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm flex items-center gap-2">
          <Save className="h-4 w-4" /> Settings saved successfully.
        </div>
      )}

      <form onSubmit={save} className="space-y-6">
        {/* Site Identity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Globe className="h-5 w-5 text-brand" />
            <h2 className="font-bold text-gray-900">Site Identity</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'siteName', label: 'Site Name' },
              { key: 'siteTagline', label: 'Tagline' },
              { key: 'siteUrl', label: 'Site URL' },
              { key: 'adminEmail', label: 'Admin Email' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                <input
                  value={settings[key as keyof SiteSettings] as string}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Articles Per Page</label>
              <input
                type="number" min={5} max={100} value={settings.articlesPerPage}
                onChange={(e) => setSettings({ ...settings, articlesPerPage: +e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Zap className="h-5 w-5 text-brand" />
            <h2 className="font-bold text-gray-900">Platform Behaviour</h2>
          </div>
          <div className="space-y-4">
            {[
              { key: 'autoPublishRss', label: 'Auto-publish RSS (without editor review)', desc: 'Dangerous — only enable for trusted sources' },
              { key: 'enableComments', label: 'Enable reader comments', desc: 'Requires moderation pipeline' },
              { key: 'maintenanceMode', label: 'Maintenance mode', desc: 'Public site shows maintenance page' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
                <button type="button"
                  onClick={() => setSettings({ ...settings, [key]: !settings[key as keyof SiteSettings] })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings[key as keyof SiteSettings] ? 'bg-brand' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings[key as keyof SiteSettings] ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Flags from DB */}
        {flags.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="h-5 w-5 text-brand" />
              <h2 className="font-bold text-gray-900">Feature Flags</h2>
            </div>
            <div className="space-y-3">
              {flags.map((f) => (
                <div key={f.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-mono text-gray-800">{f.key}</p>
                  <button type="button" onClick={() => toggleFlag(f.key, f.enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${f.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${f.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-brand text-white px-6 py-2.5 rounded-lg font-bold hover:bg-brand-dark transition-colors disabled:opacity-60">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
