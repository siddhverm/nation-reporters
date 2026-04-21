export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-black text-navy mb-2">Contact Us</h1>
      <p className="text-gray-500 mb-8">Reach out for editorial, advertising, or partnership enquiries.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
        {[
          { title: 'Editorial', email: 'editorial@nationreporters.com', desc: 'Story tips, corrections, press releases' },
          { title: 'Advertising', email: 'ads@nationreporters.com', desc: 'Display ads, sponsored content, partnerships' },
          { title: 'Legal & Compliance', email: 'legal@nationreporters.com', desc: 'Takedown requests, copyright, privacy' },
          { title: 'General', email: 'info@nationreporters.com', desc: 'Everything else' },
        ].map((c) => (
          <div key={c.title} className="bg-white border border-gray-100 rounded-xl p-5">
            <h3 className="font-bold text-navy text-sm uppercase tracking-wider mb-1">{c.title}</h3>
            <p className="text-xs text-gray-500 mb-2">{c.desc}</p>
            <a href={`mailto:${c.email}`} className="text-brand font-semibold text-sm hover:underline">{c.email}</a>
          </div>
        ))}
      </div>
      <div className="bg-navy text-white rounded-xl p-6">
        <h3 className="font-bold text-lg mb-1">Congregate Tech Solutions Pvt Ltd</h3>
        <p className="text-blue-200 text-sm">GST: 27AALCC1533E1ZX</p>
        <p className="text-blue-200 text-sm mt-2">Follow us on <a href="https://www.facebook.com/profile.php?id=61583995246876" target="_blank" rel="noopener noreferrer" className="text-signal hover:underline">Facebook</a> · <a href="https://www.youtube.com/@NationReporters" target="_blank" rel="noopener noreferrer" className="text-signal hover:underline">YouTube</a></p>
      </div>
    </div>
  );
}
