'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FileText, Users, Settings, BarChart2, Radio, Share2, Rss, ShieldCheck, Flag, Briefcase, LogOut, ChevronDown } from 'lucide-react';
import { getUser, getToken, clearAuth, type AuthUser } from '@/lib/auth';

const NAV = [
  { label: 'My Stories',    href: '/reporter',            icon: FileText,    roles: ['REPORTER','CHIEF_EDITOR','ADMIN'] },
  { label: 'New Story',     href: '/reporter/new',        icon: Briefcase,   roles: ['REPORTER','CHIEF_EDITOR','ADMIN'] },
  { label: 'Review Queue',  href: '/editor',              icon: ShieldCheck, roles: ['CHIEF_EDITOR','ADMIN'] },
  { label: 'Podcasts',      href: '/reporter/podcasts',   icon: Radio,       roles: ['REPORTER','CHIEF_EDITOR','ADMIN'] },
  { label: 'Social',        href: '/social',              icon: Share2,      roles: ['SOCIAL_MANAGER','CHIEF_EDITOR','ADMIN'] },
  { label: 'Sources',       href: '/admin/sources',       icon: Rss,         roles: ['ADMIN'] },
  { label: 'Users',         href: '/admin/users',         icon: Users,       roles: ['ADMIN'] },
  { label: 'Risk Rules',    href: '/admin/risk-rules',    icon: ShieldCheck, roles: ['ADMIN'] },
  { label: 'Feature Flags', href: '/admin/feature-flags', icon: Flag,        roles: ['ADMIN'] },
  { label: 'Publish Jobs',  href: '/admin/publish-jobs',  icon: Radio,       roles: ['ADMIN'] },
  { label: 'Analytics',     href: '/admin/analytics',     icon: BarChart2,   roles: ['ADMIN'] },
  { label: 'Content Health',href: '/admin/content-health',icon: BarChart2,   roles: ['ADMIN'] },
  { label: 'Settings',      href: '/admin/settings',      icon: Settings,    roles: ['ADMIN'] },
];

function roleLabel(role: string) {
  return { REPORTER: 'Reporter', CHIEF_EDITOR: 'Chief Editor', SOCIAL_MANAGER: 'Social Manager', ADMIN: 'Admin' }[role] ?? role;
}
function roleColor(role: string) {
  return { REPORTER: 'bg-blue-500', CHIEF_EDITOR: 'bg-green-600', SOCIAL_MANAGER: 'bg-purple-600', ADMIN: 'bg-brand' }[role] ?? 'bg-gray-500';
}

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  const path   = usePathname();
  const router = useRouter();
  const [user, setUser]   = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    const t = getToken();
    if (!u || !t) { router.replace(`/login?redirect=${encodeURIComponent(path)}`); return; }
    setUser(u);
    setToken(t);
  }, []);

  function logout() {
    clearAuth();
    router.replace('/login');
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin h-8 w-8 border-4 border-brand border-t-transparent rounded-full" />
    </div>
  );

  const visibleNav = NAV.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-navy text-white flex flex-col hidden md:flex">
        <Link href="/" className="flex items-center gap-2 px-4 py-4 border-b border-navy-light">
          <Image src="/logo.png" alt="NR" width={32} height={32} className="object-contain rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="leading-none">
            <span className="font-black text-white text-sm block">NATION</span>
            <span className="font-bold text-blue-300 text-[10px] tracking-widest block">REPORTERS</span>
          </div>
        </Link>

        {/* User info */}
        <div className="px-4 py-3 border-b border-navy-light bg-navy-dark/30">
          <p className="text-white text-sm font-semibold truncate">{user.name}</p>
          <span className={`inline-block text-white text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${roleColor(user.role)}`}>
            {roleLabel(user.role)}
          </span>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = path === item.href || path.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                  active ? 'bg-brand text-white font-semibold' : 'text-blue-200 hover:bg-navy-light hover:text-white'
                }`}>
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-navy-light space-y-2">
          <Link href="/" className="text-blue-300 text-xs hover:text-white transition-colors block">← Back to site</Link>
          <button onClick={logout} className="flex items-center gap-1.5 text-blue-300 text-xs hover:text-white transition-colors">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden bg-navy text-white px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="NR" width={28} height={28} className="object-contain rounded"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="font-black text-sm">NATION REPORTERS CMS</span>
          </Link>
          <button onClick={logout} className="text-blue-300 hover:text-white">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
