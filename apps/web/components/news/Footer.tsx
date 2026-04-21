import Link from 'next/link';
import Image from 'next/image';

const SECTIONS = ['India', 'World', 'Politics', 'Business', 'Sports', 'Entertainment', 'Technology'];
const MORE = [
  { label: 'Podcasts',       href: '/podcasts' },
  { label: 'Live TV',        href: '/live' },
  { label: 'Search',         href: '/search' },
  { label: 'Reporter Login', href: '/reporter' },
];

export function Footer() {
  return (
    <footer className="bg-[#0f172a] text-white mt-12">
      {/* Top band */}
      <div className="bg-red-600 py-2 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-white font-semibold">
          <span>India&apos;s AI-Powered Multilingual News Network</span>
          <div className="flex gap-4">
            <Link href="/live" className="hover:text-yellow-300 transition-colors">● Live TV</Link>
            <Link href="/podcasts" className="hover:text-yellow-300 transition-colors">Podcasts</Link>
          </div>
        </div>
      </div>

      {/* Main footer grid */}
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">

          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <Image src="/logo.png" alt="Nation Reporters" width={40} height={40} className="object-contain rounded-lg" />
              <div>
                <span className="font-black text-white text-lg tracking-tight block leading-none">NATION</span>
                <span className="font-bold text-slate-400 text-[11px] tracking-[0.2em] block mt-0.5">REPORTERS</span>
              </div>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Breaking news, in-depth analysis, and AI-powered reporting from India and across the globe — delivered 24×7.
            </p>
          </div>

          {/* Sections */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-widest mb-4 pb-2 border-b border-slate-700">Sections</h4>
            <ul className="space-y-2">
              {SECTIONS.map((s) => (
                <li key={s}>
                  <Link
                    href={`/category/${s.toLowerCase()}`}
                    className="text-slate-400 text-sm hover:text-white hover:pl-1 transition-all duration-150 flex items-center gap-1"
                  >
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* More */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-widest mb-4 pb-2 border-b border-slate-700">More</h4>
            <ul className="space-y-2">
              {MORE.map((m) => (
                <li key={m.href}>
                  <Link href={m.href} className="text-slate-400 text-sm hover:text-white hover:pl-1 transition-all duration-150 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {m.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Follow us */}
          <div>
            <h4 className="text-white font-bold text-xs uppercase tracking-widest mb-4 pb-2 border-b border-slate-700">Follow Us</h4>
            <ul className="space-y-2">
              {[
                { label: 'Facebook',    href: 'https://www.facebook.com/profile.php?id=61583995246876', external: true },
                { label: 'Twitter / X', href: '#', external: false },
                { label: 'Instagram',   href: '#', external: false },
                { label: 'YouTube',     href: 'https://www.youtube.com/@NationReporters', external: true },
                { label: 'Telegram',    href: '#', external: false },
                { label: 'WhatsApp',    href: '#', external: false },
              ].map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target={s.external ? '_blank' : undefined}
                    rel={s.external ? 'noopener noreferrer' : undefined}
                    className="text-slate-400 text-sm hover:text-white hover:pl-1 transition-all duration-150 flex items-center gap-1"
                  >
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-slate-800 pt-5 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-500">
          <div className="text-center sm:text-left space-y-0.5">
            <p>© 2024–2025 Nation Reporters. All rights reserved.</p>
            <p>
              Owned &amp; Operated by{' '}
              <span className="text-slate-400">Congregate Tech Solutions Pvt Ltd</span>
              &nbsp;|&nbsp; GST: 27AALCC1533E1ZX
            </p>
          </div>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link href="/terms"   className="hover:text-slate-300 transition-colors">Terms of Use</Link>
            <Link href="/contact" className="hover:text-slate-300 transition-colors">Contact Us</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
