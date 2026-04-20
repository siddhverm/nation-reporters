import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="bg-navy text-white mt-12">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative h-10 w-10">
                <Image src="/logo.png" alt="Nation Reporters" fill className="object-contain" />
              </div>
              <div>
                <span className="font-black text-white text-base block">NATION</span>
                <span className="font-bold text-gray-400 text-xs tracking-widest block -mt-1">REPORTERS</span>
              </div>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              India&apos;s AI-powered multilingual digital news network. Breaking news, analysis, and in-depth reporting from India and the world.
            </p>
          </div>

          {/* Sections */}
          <div>
            <h4 className="font-semibold text-sm mb-3 text-gray-300 uppercase tracking-wider">Sections</h4>
            <ul className="space-y-1.5 text-sm text-gray-400">
              {['India', 'World', 'Politics', 'Business', 'Sports', 'Entertainment', 'Technology'].map((s) => (
                <li key={s}>
                  <Link href={`/category/${s.toLowerCase()}`} className="hover:text-white transition-colors">{s}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* More */}
          <div>
            <h4 className="font-semibold text-sm mb-3 text-gray-300 uppercase tracking-wider">More</h4>
            <ul className="space-y-1.5 text-sm text-gray-400">
              <li><Link href="/podcasts" className="hover:text-white transition-colors">Podcasts</Link></li>
              <li><Link href="/live" className="hover:text-white transition-colors">Live TV</Link></li>
              <li><Link href="/search" className="hover:text-white transition-colors">Search</Link></li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="font-semibold text-sm mb-3 text-gray-300 uppercase tracking-wider">Follow Us</h4>
            <ul className="space-y-1.5 text-sm text-gray-400">
              <li><a href="https://www.facebook.com/profile.php?id=61583995246876" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Facebook</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Twitter / X</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Instagram</a></li>
              <li><a href="#" className="hover:text-white transition-colors">YouTube</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Telegram</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 pt-5 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Nation Reporters. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-gray-300">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-300">Terms of Use</Link>
            <Link href="/contact" className="hover:text-gray-300">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
