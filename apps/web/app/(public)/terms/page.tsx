export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-black text-navy mb-2">Terms of Use</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: April 2025</p>
      <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
        <section><h2 className="font-bold text-navy text-lg">1. Acceptance</h2><p>By accessing Nation Reporters you agree to these Terms. If you disagree, please discontinue use of the site.</p></section>
        <section><h2 className="font-bold text-navy text-lg">2. Content Ownership &amp; Attribution</h2><p>Nation Reporters publishes original editorial content and AI-assisted summaries based on third-party source feeds. Copyright in third-party reporting, trademarks, and source media remains with the respective owners. We provide source attribution and links where available. Reproduction of Nation Reporters original content without written permission is prohibited.</p></section>
        <section><h2 className="font-bold text-navy text-lg">3. Accuracy</h2><p>Nation Reporters strives for accuracy using a mix of automated and editorial workflows. AI-assisted output can contain errors; readers should verify critical information with primary sources. We are not liable for decisions made based on published content.</p></section>
        <section><h2 className="font-bold text-navy text-lg">4. User Conduct</h2><p>You agree not to scrape, republish, or commercially exploit any content without explicit permission.</p></section>
        <section><h2 className="font-bold text-navy text-lg">5. Copyright Complaints &amp; Takedowns</h2><p>If you believe content infringes your rights, email <a href="mailto:legal@nationreporters.com" className="text-brand hover:underline">legal@nationreporters.com</a> with the URL, ownership details, and contact information. We review and action verified notices promptly.</p></section>
        <section><h2 className="font-bold text-navy text-lg">6. Governing Law</h2><p>These Terms are governed by the laws of India. Disputes shall be subject to the jurisdiction of courts in Mumbai, Maharashtra.</p></section>
      </div>
    </div>
  );
}
