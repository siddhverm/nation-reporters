export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-black text-navy mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: April 2025 · Effective date: April 2025</p>

      <div className="bg-signal/10 border border-signal/30 rounded-xl p-5 mb-8">
        <h2 className="font-bold text-navy text-base mb-2">Important Notice: AI-Generated &amp; Aggregated Content</h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          Nation Reporters is an AI-powered news aggregation and rewriting platform operated by
          <strong> Congregate Tech Solutions Pvt Ltd</strong>. Articles published on this platform
          may be AI-rewritten summaries of publicly available news from licensed RSS/Atom feeds.
          We do <strong>not</strong> claim original copyright over aggregated or AI-rewritten content.
          All source attributions are displayed on each article. If you believe any content infringes
          your rights, please contact <a href="mailto:legal@nationreporters.com" className="text-brand hover:underline">legal@nationreporters.com</a> for
          immediate review and removal.
        </p>
      </div>

      <div className="prose prose-sm max-w-none text-gray-700 space-y-6">

        <section>
          <h2 className="font-bold text-navy text-lg">1. About Us</h2>
          <p>Nation Reporters (nationreporters.com) is owned and operated by <strong>Congregate Tech Solutions Pvt Ltd</strong>,
          GST: 27AALCC1533E1ZX, India. For all privacy matters, contact: <a href="mailto:privacy@nationreporters.com" className="text-brand hover:underline">privacy@nationreporters.com</a>.</p>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">2. Content Disclaimer &amp; No Copyright Claim</h2>
          <p>Nation Reporters aggregates news from publicly available, licensed RSS/Atom feeds and rewrites content
          using artificial intelligence (Google Gemini). We make no claim of original authorship or copyright over
          AI-generated rewrites of third-party news articles. All original reporting credits and source links are
          preserved and displayed alongside each article in accordance with applicable attribution requirements.</p>
          <p className="mt-2">This platform operates under the principles of fair use and news aggregation as permitted
          under applicable law. We do not republish full original articles verbatim. If a rights holder objects to
          any content, we will remove it promptly upon written request to <a href="mailto:legal@nationreporters.com" className="text-brand hover:underline">legal@nationreporters.com</a>.</p>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">3. Information We Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Reporters &amp; CMS users:</strong> Name, email address, hashed password, role, MFA settings, and article submissions.</li>
            <li><strong>Visitors:</strong> Pages visited, articles read, search queries, language preference (stored in browser localStorage), approximate location (country/region via IP, not stored).</li>
            <li><strong>Automatically:</strong> IP address (logs, not permanently stored), browser type, device type, referrer URL, session duration.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">4. How We Use Information</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Delivering personalised, language-appropriate news content based on your stored language preference.</li>
            <li>Operating the CMS workflow for reporters, editors, and administrators.</li>
            <li>Improving AI content quality and editorial workflows.</li>
            <li>Sending editorial newsletters or push notifications (only with your explicit consent).</li>
            <li>Preventing abuse, spam, and security threats.</li>
            <li>Complying with applicable Indian laws and regulations.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">5. Cookies &amp; Local Storage</h2>
          <p>We use:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Essential cookies:</strong> Authentication tokens (JWT) for CMS users — required for site operation.</li>
            <li><strong>Preference storage:</strong> Your language choice is stored in <code>localStorage</code> under the key <code>nr-lang</code> on your device only.</li>
            <li><strong>Analytics:</strong> We may use privacy-respecting analytics. No third-party advertising cookies are used.</li>
          </ul>
          <p className="mt-2">You may clear localStorage and cookies at any time via your browser settings.</p>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">6. Third-Party Services</h2>
          <p>Our platform integrates the following third-party services, each governed by their own privacy policies:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Google Gemini API (AI content generation) — Google LLC Privacy Policy</li>
            <li>YouTube embeds — Google LLC / YouTube Privacy Policy</li>
            <li>Facebook &amp; Instagram social sharing — Meta Platforms Privacy Policy</li>
            <li>Twitter/X sharing buttons — X Corp Privacy Policy</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">7. Data Retention</h2>
          <p>CMS user account data is retained for as long as the account is active. Published articles and their metadata are retained indefinitely for archival purposes. Server access logs are purged after 30 days. You may request deletion of your personal data at any time.</p>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">8. Your Rights (under IT Act 2000 &amp; DPDP Act 2023)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Right to access personal data we hold about you.</li>
            <li>Right to correct inaccurate personal data.</li>
            <li>Right to erasure (deletion) of your personal data.</li>
            <li>Right to withdraw consent for newsletter/push notifications at any time.</li>
            <li>Right to raise a grievance with our Data Protection Officer.</li>
          </ul>
          <p className="mt-2">To exercise any right, email: <a href="mailto:privacy@nationreporters.com" className="text-brand hover:underline">privacy@nationreporters.com</a>. We will respond within 30 days.</p>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">9. Content Takedown &amp; DMCA / Copyright</h2>
          <p>If you are a copyright holder and believe any article on Nation Reporters infringes your rights, please send a
          written notice to <a href="mailto:legal@nationreporters.com" className="text-brand hover:underline">legal@nationreporters.com</a> with:
          (a) identification of the copyrighted work, (b) identification of the infringing content with URL,
          (c) your contact details, and (d) a statement of good faith belief. We will remove or correct the content within 48 hours of verification.</p>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">10. Security</h2>
          <p>We use industry-standard security measures including HTTPS/TLS encryption, hashed password storage (bcrypt), JWT authentication with short-lived tokens, and role-based access controls. No system is 100% secure; we cannot guarantee absolute security of transmitted data.</p>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">11. Changes to This Policy</h2>
          <p>We may update this Privacy Policy periodically. Changes will be posted on this page with a revised effective date. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>
        </section>

        <section>
          <h2 className="font-bold text-navy text-lg">12. Contact &amp; Grievance Officer</h2>
          <p><strong>Congregate Tech Solutions Pvt Ltd</strong><br />
          GST: 27AALCC1533E1ZX, India<br />
          Privacy / DPO: <a href="mailto:privacy@nationreporters.com" className="text-brand hover:underline">privacy@nationreporters.com</a><br />
          Legal / Takedowns: <a href="mailto:legal@nationreporters.com" className="text-brand hover:underline">legal@nationreporters.com</a>
          </p>
        </section>

      </div>
    </div>
  );
}
