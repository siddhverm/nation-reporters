'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { Search, Menu, X, Mic, Radio, Globe, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { COUNTRIES, REGION_LABELS, detectCountryFromBrowser, type Country } from '@/lib/countries';

const NAV_LINKS = [
  { label: 'India',         href: '/category/india', resetToIndia: true },
  { label: '🌍 World',      href: '/world' },
  { label: 'Politics',      href: '/category/politics' },
  { label: 'Business',      href: '/category/business' },
  { label: 'Sports',        href: '/category/sports' },
  { label: 'Entertainment', href: '/category/entertainment' },
  { label: 'Technology',    href: '/category/tech' },
  { label: 'Videos',        href: '/videos' },
  { label: 'Podcasts',      href: '/podcasts' },
  { label: 'Live TV',       href: '/live' },
];

const LANGUAGES = [
  // Indian languages
  { code: 'en', label: 'English',    native: 'English',   group: 'India' },
  { code: 'hi', label: 'Hindi',      native: 'हिंदी',       group: 'India' },
  { code: 'mr', label: 'Marathi',    native: 'मराठी',       group: 'India' },
  { code: 'bn', label: 'Bengali',    native: 'বাংলা',       group: 'India' },
  { code: 'te', label: 'Telugu',     native: 'తెలుగు',      group: 'India' },
  { code: 'ta', label: 'Tamil',      native: 'தமிழ்',       group: 'India' },
  { code: 'gu', label: 'Gujarati',   native: 'ગુજરાતી',     group: 'India' },
  { code: 'kn', label: 'Kannada',    native: 'ಕನ್ನಡ',       group: 'India' },
  { code: 'pa', label: 'Punjabi',    native: 'ਪੰਜਾਬੀ',      group: 'India' },
  { code: 'ur', label: 'Urdu',       native: 'اردو',        group: 'India' },
  // Global
  { code: 'ar', label: 'Arabic',     native: 'العربية',     group: 'Global' },
  { code: 'fr', label: 'French',     native: 'Français',    group: 'Global' },
  { code: 'de', label: 'German',     native: 'Deutsch',     group: 'Global' },
  { code: 'es', label: 'Spanish',    native: 'Español',     group: 'Global' },
  { code: 'pt', label: 'Portuguese', native: 'Português',   group: 'Global' },
  { code: 'ru', label: 'Russian',    native: 'Русский',     group: 'Global' },
  { code: 'zh', label: 'Chinese',    native: '中文',         group: 'Global' },
  { code: 'ja', label: 'Japanese',   native: '日本語',       group: 'Global' },
  { code: 'ko', label: 'Korean',     native: '한국어',       group: 'Global' },
  { code: 'id', label: 'Indonesian', native: 'Bahasa',      group: 'Global' },
  { code: 'tr', label: 'Turkish',    native: 'Türkçe',      group: 'Global' },
  { code: 'it', label: 'Italian',    native: 'Italiano',    group: 'Global' },
];

// Detect browser/OS language and map to supported language
function detectLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('nr-lang');
  if (stored && LANGUAGES.find((l) => l.code === stored)) return stored;
  const nav = navigator.language || 'en';
  const code = nav.split('-')[0].toLowerCase();
  return LANGUAGES.find((l) => l.code === code)?.code ?? 'en';
}

function todayLabel() {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());
}

export function Navbar() {
  const [menuOpen, setMenuOpen]         = useState(false);
  const [langOpen, setLangOpen]         = useState(false);
  const [worldOpen, setWorldOpen]       = useState(false);
  const [lang, setLang]                 = useState('en');
  const [country, setCountry]           = useState<Country | null>(null);
  const [showLangPrompt, setShowLangPrompt] = useState(false);
  const [todayText, setTodayText]           = useState('');
  const [q, setQ]                       = useState('');
  const router                          = useRouter();
  const langRef                         = useRef<HTMLDivElement>(null);
  const worldRef                        = useRef<HTMLDivElement>(null);

  // On mount: restore language + country from localStorage, detect if not saved
  useEffect(() => {
    const detected = detectLanguage();
    setLang(detected);
    const hasChosen = !!localStorage.getItem('nr-lang');
    if (!hasChosen && detected !== 'en') setShowLangPrompt(true);
    // Restore saved country first; fall back to browser detection
    const saved = localStorage.getItem('nr-country');
    const countryCode = saved ?? detectCountryFromBrowser();
    const found = COUNTRIES.find((c) => c.code === countryCode);
    if (found) setCountry(found);
    setTodayText(todayLabel());
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
      if (worldRef.current && !worldRef.current.contains(e.target as Node)) setWorldOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function chooseLang(code: string) {
    setLang(code);
    localStorage.setItem('nr-lang', code);
    setLangOpen(false);
    setShowLangPrompt(false);
    // Dispatch event so components can react without full reload
    window.dispatchEvent(new CustomEvent('nr-lang-change', { detail: { lang: code } }));
    // Reload page to re-fetch content in selected language
    window.location.reload();
  }

  // Languages filtered by selected country's relevant languages
  const filteredLanguages = (() => {
    if (!country) return LANGUAGES;
    const countryLang = country.lang;
    // Always include English + country's primary language + globally common ones
    const priority = new Set(['en', countryLang]);
    const countryGroup = country.region === 'south-asia' ? 'India' : 'Global';
    return LANGUAGES.filter((l) => priority.has(l.code) || l.group === countryGroup);
  })();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  return (
    <>
      {/* ── Language prompt banner (auto-detected non-English) ── */}
      {showLangPrompt && (
        <div className="bg-signal text-navy text-sm px-4 py-2 flex items-center justify-between gap-4 z-50">
          <span className="font-semibold">
            We detected your language as <strong>{LANGUAGES.find(l => l.code === lang)?.native}</strong>. Switch to read in your language?
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => chooseLang(lang)}
              className="bg-navy text-white text-xs font-bold px-3 py-1 rounded hover:bg-navy-dark transition-colors">
              Yes, {LANGUAGES.find(l => l.code === lang)?.native}
            </button>
            <button onClick={() => { setShowLangPrompt(false); localStorage.setItem('nr-lang', 'en'); }}
              className="text-navy/60 text-xs hover:text-navy underline">
              Stay in English
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 shadow-md bg-white">

        {/* ── Top utility bar ── */}
        <div className="bg-navy text-white text-[11px] py-1.5 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="hidden sm:block text-blue-200" suppressHydrationWarning>{todayText || ' '}</span>
            <div className="flex items-center gap-3 ml-auto">

              {/* Country / World picker */}
              <div ref={worldRef} className="relative">
                <button onClick={() => setWorldOpen(!worldOpen)}
                  className="flex items-center gap-1 text-blue-200 hover:text-white transition-colors font-semibold">
                  <span className="text-sm">{country?.flag ?? '🌍'}</span>
                  <span className="max-w-[9rem] sm:max-w-none truncate text-left text-xs sm:text-sm">
                    {country?.name ?? 'World'}
                  </span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${worldOpen ? 'rotate-180' : ''}`} />
                </button>
                {worldOpen && (
                  <div className="absolute right-0 top-7 bg-white text-gray-800 rounded-xl shadow-xl border border-gray-100 w-72 z-50 overflow-hidden max-h-96 overflow-y-auto">
                    <div className="px-3 py-2 bg-navy text-white text-[10px] font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Browse by Country</span>
                      <Link href="/world" onClick={() => setWorldOpen(false)} className="text-signal hover:underline normal-case text-[10px]">See all →</Link>
                    </div>
                    {Object.entries(REGION_LABELS).map(([region, label]) => {
                      const regionCountries = COUNTRIES.filter((c) => c.region === region);
                      return (
                        <div key={region}>
                          <div className="px-3 py-1 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
                          {regionCountries.map((c) => (
                            <Link key={c.code} href={`/country/${c.slug}`}
                              onClick={() => {
                                setWorldOpen(false);
                                localStorage.setItem('nr-country', c.code);
                                // Switch language to match country's primary language
                                const newLang = LANGUAGES.find((l) => l.code === c.lang) ? c.lang : 'en';
                                localStorage.setItem('nr-lang', newLang);
                                setCountry(c);
                                setLang(newLang);
                              }}
                              className={`flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-navy/5 transition-colors ${country?.code === c.code ? 'font-bold text-brand' : ''}`}>
                              <span>{c.flag}</span>
                              <span className="flex-1">{c.name}</span>
                              <span className="text-[10px] text-gray-400">{c.langName}</span>
                            </Link>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="w-px h-3 bg-blue-600" />

              {/* Language picker */}
              <div ref={langRef} className="relative">
                <button
                  onClick={() => setLangOpen(!langOpen)}
                  className="flex items-center gap-1 text-blue-200 hover:text-white transition-colors font-semibold"
                >
                  <Globe className="h-3 w-3" />
                  <span>{currentLang.native}</span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-6 bg-white text-gray-800 rounded-xl shadow-xl border border-gray-100 w-44 z-50 overflow-hidden">
                    <div className="px-3 py-2 bg-navy text-white text-[10px] font-bold uppercase tracking-wider">
                      Choose Language
                    </div>
                    {filteredLanguages.map((l) => (
                      <button key={l.code} onClick={() => chooseLang(l.code)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-navy/5 transition-colors ${lang === l.code ? 'font-bold text-brand' : ''}`}>
                        <span>{l.native}</span>
                        <span className="text-xs text-gray-400">{l.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-px h-3 bg-blue-600" />

              <Link href="/live" className="flex items-center gap-1.5 text-blue-200 hover:text-white transition-colors">
                <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                <Radio className="h-3 w-3" />
                <span className="font-semibold">LIVE</span>
              </Link>
              <Link href="/podcasts" className="flex items-center gap-1 text-blue-200 hover:text-white transition-colors">
                <Mic className="h-3 w-3" /><span>Podcasts</span>
              </Link>
              <Link href="/login" className="hidden sm:block text-blue-200 hover:text-white transition-colors font-medium">
                Reporter Login
              </Link>
            </div>
          </div>
        </div>

        {/* ── Brand bar ── */}
        <div className="bg-white border-b-2 border-brand">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <Image
                src="/logo.png"
                alt="Nation Reporters"
                width={48}
                height={48}
                className="object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="leading-none">
                <span className="font-black text-brand text-xl tracking-tight block leading-none">NATION</span>
                <span className="font-bold text-navy text-[11px] tracking-[0.2em] block mt-0.5">REPORTERS</span>
              </div>
            </Link>

            <div className="hidden lg:flex flex-col ml-3 pl-3 border-l-2 border-signal">
              <p className="text-[11px] text-navy font-semibold leading-tight">India&apos;s AI-Powered</p>
              <p className="text-[11px] text-gray-500 leading-tight">Multilingual News Network</p>
            </div>

            <form onSubmit={handleSearch} className="flex-1 max-w-lg hidden sm:flex ml-auto">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search news, topics, reporters..."
                  className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-full text-sm focus:outline-none focus:border-brand bg-gray-50 hover:bg-white transition-colors"
                />
              </div>
            </form>

            <button onClick={() => setMenuOpen(!menuOpen)}
              className="sm:hidden p-1.5 ml-auto rounded-lg hover:bg-gray-100 text-navy" aria-label="Menu">
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* ── Category nav strip ── */}
        <nav className="bg-navy hidden sm:block">
          <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href}
                onClick={l.resetToIndia ? () => {
                  localStorage.setItem('nr-country', 'IN');
                  localStorage.setItem('nr-lang', 'en');
                  setCountry(COUNTRIES.find((c) => c.code === 'IN') ?? null);
                  setLang('en');
                } : undefined}
                className="px-4 py-2.5 text-[13px] font-semibold text-blue-200 hover:text-white hover:bg-navy-light transition-colors whitespace-nowrap border-r border-blue-900/40 last:border-0">
                {l.label}
              </Link>
            ))}
            <div className="ml-auto flex items-center pr-2">
              <span className="text-signal text-[11px] font-bold tracking-wider flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />
                24×7 NEWS
              </span>
            </div>
          </div>
        </nav>

        {/* ── Mobile dropdown ── */}
        {menuOpen && (
          <div className="sm:hidden border-t bg-white px-4 pb-5 shadow-lg">
            <form onSubmit={handleSearch} className="pt-3 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search news..."
                  className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-full text-sm focus:outline-none focus:border-brand" />
              </div>
            </form>
            <div className="grid grid-cols-3 gap-2">
              {NAV_LINKS.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                  className="text-center text-[13px] font-semibold text-navy py-2 rounded-lg hover:bg-navy hover:text-white transition-colors">
                  {l.label}
                </Link>
              ))}
            </div>
            {/* Mobile language picker */}
            <div className="mt-3 border-t pt-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Language</p>
              <div className="grid grid-cols-3 gap-2">
                {filteredLanguages.slice(0, 6).map((l) => (
                  <button key={l.code} onClick={() => chooseLang(l.code)}
                    className={`text-center text-xs py-1.5 rounded-lg border transition-colors ${lang === l.code ? 'bg-brand text-white border-brand' : 'border-gray-200 text-gray-600 hover:border-brand hover:text-brand'}`}>
                    {l.native}
                  </button>
                ))}
              </div>
            </div>
            <Link href="/reporter" className="block mt-3 text-center text-sm text-brand font-bold border-2 border-brand rounded-lg py-2 hover:bg-brand hover:text-white transition-colors">
              Reporter Login
            </Link>
          </div>
        )}
      </header>
    </>
  );
}
