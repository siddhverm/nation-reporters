'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Search, Menu, X, Mic, Radio } from 'lucide-react';
import { useRouter } from 'next/navigation';

const NAV_LINKS = [
  { label: 'India', href: '/category/india' },
  { label: 'World', href: '/category/world' },
  { label: 'Politics', href: '/category/politics' },
  { label: 'Business', href: '/category/business' },
  { label: 'Sports', href: '/category/sports' },
  { label: 'Entertainment', href: '/category/entertainment' },
  { label: 'Tech', href: '/category/tech' },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
      {/* Top bar */}
      <div className="bg-brand text-white text-xs py-1 px-4 flex justify-between items-center">
        <span className="hidden sm:block">India&apos;s AI-Powered Multilingual News Network</span>
        <div className="flex items-center gap-3 ml-auto">
          <Link href="/live" className="flex items-center gap-1 hover:text-yellow-300 transition-colors">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <Radio className="h-3 w-3" /> LIVE
          </Link>
          <Link href="/podcasts" className="flex items-center gap-1 hover:text-yellow-300 transition-colors">
            <Mic className="h-3 w-3" /> Podcasts
          </Link>
        </div>
      </div>

      {/* Main navbar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {/* Shows logo.png if it exists, falls back to text */}
          <div className="relative h-10 w-10">
            <Image
              src="/logo.png"
              alt="Nation Reporters"
              fill
              className="object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div className="leading-tight">
            <span className="font-black text-brand text-lg tracking-tight block">NATION</span>
            <span className="font-bold text-navy text-sm tracking-widest block -mt-1">REPORTERS</span>
          </div>
        </Link>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md hidden sm:flex">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search news..."
              className="w-full pl-9 pr-4 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-gray-50"
            />
          </div>
        </form>

        {/* CMS Login */}
        <div className="ml-auto flex items-center gap-3">
          <Link href="/reporter" className="hidden sm:block text-xs font-medium text-brand hover:underline">
            Reporter Login
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden p-1"
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Category nav */}
      <nav className="border-t bg-gray-50 hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-brand hover:bg-white border-b-2 border-transparent hover:border-brand transition-colors whitespace-nowrap"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t bg-white px-4 pb-4">
          <form onSubmit={handleSearch} className="pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search news..."
                className="w-full pl-9 pr-4 py-2 border rounded-full text-sm focus:outline-none"
              />
            </div>
          </form>
          <div className="grid grid-cols-3 gap-2">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                className="text-center text-sm font-medium text-gray-700 py-2 rounded-lg hover:bg-gray-100">
                {l.label}
              </Link>
            ))}
          </div>
          <Link href="/reporter" className="block mt-3 text-center text-sm text-brand font-medium border border-brand rounded-lg py-2">
            Reporter Login
          </Link>
        </div>
      )}
    </header>
  );
}
