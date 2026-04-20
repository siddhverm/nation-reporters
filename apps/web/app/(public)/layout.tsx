import { Navbar } from '@/components/news/Navbar';
import { Footer } from '@/components/news/Footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50">{children}</div>
      <Footer />
    </>
  );
}
