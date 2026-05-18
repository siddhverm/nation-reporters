import { Navbar } from '@/components/news/Navbar';
import { Footer } from '@/components/news/Footer';
import { PwaAndSubscribe } from '@/components/news/PwaAndSubscribe';
import { LanguageFromUrl } from '@/components/news/LanguageFromUrl';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LanguageFromUrl />
      <Navbar />
      <PwaAndSubscribe />
      <div className="min-h-screen bg-gray-50">{children}</div>
      <Footer />
    </>
  );
}
