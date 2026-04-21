'use client';
import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, LogIn, AlertCircle, FileText, ShieldCheck, Share2, Settings } from 'lucide-react';
import { login, saveAuth } from '@/lib/auth';

const ROLES = [
  {
    role: 'Reporter',
    key: 'REPORTER',
    icon: FileText,
    desc: 'Write & submit articles for editor review',
    hint: 'reporter@nationreporters.com',
    color: 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
    badge: 'bg-blue-600',
  },
  {
    role: 'Chief Editor',
    key: 'CHIEF_EDITOR',
    icon: ShieldCheck,
    desc: 'Review, approve & publish to all platforms',
    hint: 'editor@nationreporters.com',
    color: 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100',
    badge: 'bg-green-600',
  },
  {
    role: 'Social Manager',
    key: 'SOCIAL_MANAGER',
    icon: Share2,
    desc: 'Schedule & manage social media posts',
    hint: 'social@nationreporters.com',
    color: 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
    badge: 'bg-purple-600',
  },
  {
    role: 'Admin',
    key: 'ADMIN',
    icon: Settings,
    desc: 'Full access: users, sources, settings',
    hint: 'admin@nationreporters.com',
    color: 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
    badge: 'bg-brand',
  },
];

export default function LoginPage() {
  const router       = useRouter();
  const params       = useSearchParams();
  const redirect     = params.get('redirect') ?? '/reporter';
  const emailRef     = useRef<HTMLInputElement>(null);

  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  function pickRole(r: typeof ROLES[0]) {
    setSelectedRole(r.key);
    setError('');
    // scroll to form and focus email
    emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => emailRef.current?.focus(), 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    setError('');
    try {
      const { token, user } = await login(email, password);
      saveAuth(token, user);
      if (user.role === 'CHIEF_EDITOR' || user.role === 'ADMIN') {
        router.push('/editor');
      } else if (user.role === 'SOCIAL_MANAGER') {
        router.push('/social');
      } else {
        router.push(redirect);
      }
    } catch (err) {
      setError((err as Error).message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  const active = ROLES.find((r) => r.key === selectedRole);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Brand */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-4">
            <Image src="/logo.png" alt="NR" width={48} height={48} className="object-contain rounded"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div className="text-left">
              <span className="font-black text-brand text-2xl tracking-tight block leading-none">NATION</span>
              <span className="font-bold text-navy text-[11px] tracking-[0.2em] block">REPORTERS</span>
            </div>
          </Link>
          <h1 className="text-xl font-bold text-navy">CMS Login</h1>
          <p className="text-sm text-gray-500 mt-1">Select your role below, then sign in</p>
        </div>

        {/* Role selector cards */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const isActive = selectedRole === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => pickRole(r)}
                className={`rounded-xl border-2 p-4 text-left transition-all cursor-pointer ${r.color} ${
                  isActive ? 'ring-2 ring-offset-1 ring-brand shadow-md scale-[1.02]' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full ${r.badge}`}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </span>
                  <span className="text-sm font-bold">{r.role}</span>
                </div>
                <p className="text-xs opacity-80 leading-snug">{r.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">
          {active && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold border ${active.color}`}>
              <active.icon className="h-4 w-4 shrink-0" />
              Signing in as <span className="font-black">{active.role}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={active?.hint ?? 'you@nationreporters.com'}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-brand text-white font-bold py-3 rounded-lg hover:bg-brand-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {loading
              ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              : <LogIn className="h-4 w-4" />}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-center text-xs text-gray-400">
            Account not found? Contact{' '}
            <a href="mailto:editorial@nationreporters.com" className="text-brand hover:underline">editorial@nationreporters.com</a>
          </p>
        </form>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-navy hover:text-brand font-medium">← Back to Nation Reporters</Link>
        </div>
      </div>
    </div>
  );
}
