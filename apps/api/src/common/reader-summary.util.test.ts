import {
  stripPublisherFeedBoilerplate,
  buildReaderSummaryFromPlainText,
  sanitizePublisherStoryText,
} from './reader-summary.util';

// Helper: assert none of the forbidden patterns appear in output
function assertClean(output: string, forbidden: RegExp[], label: string) {
  for (const pattern of forbidden) {
    if (pattern.test(output)) {
      throw new Error(`[${label}] Output still contains forbidden pattern: ${pattern}\nOutput: ${output.slice(0, 300)}`);
    }
  }
}

// ─── HINDI (Dainik Bhaskar) ───────────────────────────────────────────────────
test('Hindi: strips Dainik Bhaskar byline, desk, timestamp, vigyapan', () => {
  const raw = `सचिन कुमार, नई दिल्ली Published by: दुष्यंत शर्मा Updated Fri, 29 May 2026 06:30 AM IST विज्ञापन7 भारत सरकार ने नई आर्थिक नीति की घोषणा की है जिससे देश की GDP में वृद्धि होने की उम्मीद है। यह नीति अगले पांच वर्षों के लिए लागू की जाएगी।`;
  const out = stripPublisherFeedBoilerplate(raw, 'भारत सरकार की नई नीति');
  assertClean(out, [
    /Published by:/i,
    /दुष्यंत शर्मा/,
    /06:30 AM IST/,
    /विज्ञापन/,
    /सचिन कुमार/,
  ], 'Hindi Dainik Bhaskar');
  expect(out.length).toBeGreaterThan(30);
});

test('Hindi: strips news desk attribution', () => {
  const raw = `न्यूज डेस्क, अमर उजाला नई दिल्ली। देश में बारिश का मौसम शुरू हो गया है और कई राज्यों में भारी वर्षा की चेतावनी जारी की गई है।`;
  const out = stripPublisherFeedBoilerplate(raw, 'बारिश का मौसम');
  assertClean(out, [/न्यूज डेस्क/, /अमर उजाला/], 'Hindi desk');
  expect(out).toContain('बारिश');
});

test('Hindi: strips Bhaskar breadcrumb footer', () => {
  const raw = `प्रधानमंत्री ने आज नई योजना का उद्घाटन किया। इस योजना से लाखों लोगों को फायदा होगा। Hindi NewsNationalBreaking News Headlines Today, Pictures, Videos And More From Dainik Bhaskar`;
  const out = stripPublisherFeedBoilerplate(raw, 'प्रधानमंत्री की नई योजना');
  assertClean(out, [/Dainik Bhaskar/i, /Hindi News/i], 'Hindi Bhaskar footer');
});

// ─── ENGLISH (Times of India) ─────────────────────────────────────────────────
test('English TOI: strips edition picker, byline, copyright footer', () => {
  const raw = `EditionININUSGCCEnglishEnglishहिन्दीमराठीWeatherSign InTOIToday's ePaper Gujarat Titans pulled off a record chase in Qualifier 2. Shubman Gill won the Player of the Match award for his brilliant innings. TOI Sports Desk / TIMESOFINDIA.COM / May 30, 2026, 08:33 IST CommentsShareAA+Text SizeSmallMediumLarge Copyright © 2026 Bennett, Coleman & Co.Ltd.All rights reserved. For reprint rights: Times Syndication Service`;
  const out = stripPublisherFeedBoilerplate(raw, 'Gujarat Titans reach IPL Final');
  assertClean(out, [
    /EditionIN/i,
    /TIMESOFINDIA\.COM/i,
    /TOI Sports Desk/i,
    /Bennett, Coleman/i,
    /Times Syndication/i,
    /CommentsShare/i,
    /Text Size/i,
  ], 'English TOI');
  expect(out).toContain('Gujarat Titans');
});

test('English: strips photo credit and By byline', () => {
  const raw = `May 29, 2026 10:03 am Executive Chairman Peter Undiandeye. Photo: Patrick Odey. By Patrick Odey Kindly share this story: The government announced new infrastructure projects worth billions of dollars that will create thousands of jobs across the country.`;
  const out = stripPublisherFeedBoilerplate(raw, 'New infrastructure projects announced');
  assertClean(out, [
    /Photo:\s*Patrick/i,
    /By Patrick Odey/,
    /Kindly share this story/i,
    /May 29, 2026 10:03/,
  ], 'English byline/photo');
  expect(out).toContain('infrastructure');
});

// ─── BENGALI ──────────────────────────────────────────────────────────────────
test('Bengali: strips reporter attribution', () => {
  const raw = `নিজস্ব সংবাদদাতা, কলকাতা। নতুন সরকার গঠিত হয়েছে এবং দেশের উন্নয়নে গুরুত্বপূর্ণ পদক্ষেপ নেওয়া হবে। বিশেষজ্ঞরা এই উদ্যোগকে ইতিবাচক হিসেবে দেখছেন।`;
  const out = stripPublisherFeedBoilerplate(raw, 'বাংলাদেশে নতুন সরকার');
  assertClean(out, [/নিজস্ব সংবাদদাতা/], 'Bengali reporter');
  expect(out.length).toBeGreaterThan(10);
});

// ─── MARATHI ─────────────────────────────────────────────────────────────────
test('Marathi: strips desk/reporter attribution', () => {
  const raw = `वार्ताहर, पुणे। महाराष्ट्र सरकारने नवीन धोरण जाहीर केले आहे. या धोरणामुळे शेतकऱ्यांना मोठा दिलासा मिळणार आहे.`;
  const out = stripPublisherFeedBoilerplate(raw, 'महाराष्ट्र सरकारचे नवीन धोरण');
  assertClean(out, [/वार्ताहर/], 'Marathi reporter');
  expect(out).toContain('शेतकऱ्यांना');
});

// ─── TAMIL ───────────────────────────────────────────────────────────────────
test('Tamil: strips reporter attribution', () => {
  const raw = `நமது நிருபர், சென்னை. தமிழ்நாட்டில் புதிய திட்டம் அறிவிக்கப்பட்டுள்ளது. இந்த திட்டம் மாணவர்களுக்கு பெரும் பயனளிக்கும்.`;
  const out = stripPublisherFeedBoilerplate(raw, 'தமிழ்நாட்டில் புதிய திட்டம்');
  assertClean(out, [/நமது நிருபர்/], 'Tamil reporter');
  expect(out).toContain('மாணவர்களுக்கு');
});

// ─── URDU ─────────────────────────────────────────────────────────────────────
test('Urdu: strips reporter attribution', () => {
  const raw = `نامہ نگار، کراچی۔ نئی حکومت نے بڑے اقتصادی اصلاحات کا اعلان کیا ہے جن سے ملک کی معیشت بہتر ہونے کی امید ہے۔`;
  const out = stripPublisherFeedBoilerplate(raw, 'پاکستان میں اصلاحات');
  assertClean(out, [/نامہ نگار/], 'Urdu reporter');
  expect(out.length).toBeGreaterThan(10);
});

// ─── ARABIC ──────────────────────────────────────────────────────────────────
test('Arabic: strips reporter attribution', () => {
  const raw = `مراسلنا في القاهرة. أعلنت الحكومة المصرية عن خطة جديدة للتنمية الاقتصادية. وتهدف هذه الخطة إلى تحسين مستوى المعيشة للمواطنين.`;
  const out = stripPublisherFeedBoilerplate(raw, 'خطة التنمية المصرية');
  assertClean(out, [/مراسلنا/], 'Arabic reporter');
  expect(out).toContain('الحكومة');
});

// ─── AUSTRALIAN ENGLISH (Brisbane Times / Fairfax) ───────────────────────────
test('Australian English: strips Morning Edition promo, reporter at outlet, advertisement', () => {
  const raw = `Sign up for our Morning Edition A humpback whale tangled in fishing nets was rescued off the Gold Coast on Thursday. Wildlife officers cut the nets free after a three-hour operation. reporter at Brisbane Times. Advertisem`;
  const out = stripPublisherFeedBoilerplate(raw, 'Humpback whale rescued off Gold Coast');
  assertClean(out, [
    /Sign up for our Morning Edition/i,
    /reporter at Brisbane Times/i,
    /Advertisem/i,
  ], 'Australian Fairfax');
  expect(out).toContain('humpback whale');
});

test('Australian English: strips Image notice placeholder lines', () => {
  const raw = `Image notice: Article image is shown when available for this story. A humpback whale was rescued off Queensland.`;
  const out = stripPublisherFeedBoilerplate(raw, 'Whale rescue');
  assertClean(out, [/Image notice/i, /Article image is shown/i], 'Image notice');
  expect(out).toContain('humpback whale');
});

// ─── FRENCH ───────────────────────────────────────────────────────────────────
test('French: strips Par byline and Advertisement', () => {
  const raw = `Par Jean Dupont | Le gouvernement français a annoncé de nouvelles mesures économiques. Ces mesures visent à réduire le chômage et à stimuler la croissance. Publicité`;
  const out = stripPublisherFeedBoilerplate(raw, 'Nouvelles mesures économiques');
  assertClean(out, [/Par Jean Dupont/i, /Publicité/i], 'French byline');
  expect(out).toContain('gouvernement');
});

// ─── GERMAN ───────────────────────────────────────────────────────────────────
test('German: strips Von byline and Werbung', () => {
  const raw = `Von Hans Müller — Die deutsche Regierung hat neue Wirtschaftsmaßnahmen angekündigt. Diese Maßnahmen sollen die Arbeitslosigkeit reduzieren. Werbung`;
  const out = stripPublisherFeedBoilerplate(raw, 'Neue Wirtschaftsmaßnahmen');
  assertClean(out, [/Von Hans Müller/i, /Werbung/i], 'German byline');
  expect(out).toContain('Regierung');
});

// ─── AMAR UJALA FOOTER ────────────────────────────────────────────────────────
test('Hindi: strips Amar Ujala footer chrome (photo credit, link-copied, promo, footer nav, app promo, disclaimer)', () => {
  const raw = `कर्नाटक के मुख्यमंत्री सिद्धारमैया ने आज एक बड़ी घोषणा की। राज्य में नई योजना लागू होगी जिससे लाखों लोगों को फायदा होगा। फोटो : @अमर उजाला ग्राफिक्स Link Copied खबरें लगातार पढ़ने के लिए अमर उजाला ऐप डाउनलोड करें Recommended विशेष आज का विचार About Us Advertise with us Careers Contact Us Privacy Policy Terms And Conditions © 2020-21 Amar Ujala Limited अमर उजाला एप इंस्टॉल कर रजिस्टर करें Disclaimer हम डाटा संग्रह टूल्स का इस्तेमाल करते हैं`;
  const out = stripPublisherFeedBoilerplate(raw, 'कर्नाटक मुख्यमंत्री की घोषणा');
  assertClean(out, [
    /फोटो\s*:\s*@अमर/u,
    /Link\s*Copied/i,
    /खबरें\s*लगातार\s*पढ़ने/u,
    /Recommended\s+विशेष/u,
    /About\s+Us\s+Advertise/i,
    /Amar\s+Ujala\s+Limited/i,
    /एप\s+इंस्टॉल/u,
    /Disclaimer\s+हम\s+डाटा/u,
  ], 'Amar Ujala footer');
  expect(out).toContain('मुख्यमंत्री');
});

// ─── WIRE AGENCIES ───────────────────────────────────────────────────────────
test('English: strips wire agency attribution', () => {
  const raw = `PTI: New Delhi. The Indian government has announced a major policy reform. Reporter: John Smith, ANI. The reform aims to boost economic growth over the next decade.`;
  const out = stripPublisherFeedBoilerplate(raw, 'Major policy reform announced');
  assertClean(out, [/Reporter:\s*John Smith/i], 'Wire agencies');
  expect(out).toContain('economic growth');
});

test('English India Today: strips glued Entertainment DeskNew Delhi,UPDATED chrome', () => {
  const raw =
    'India Today Entertainment DeskNew Delhi,UPDATED Alpha movie release and review live: Can Alia and Sharvari crack the box office? The film opened to strong numbers across multiplexes on day one.';
  const out = stripPublisherFeedBoilerplate(raw, 'Alpha movie release and review live');
  assertClean(
    out,
    [/India Today/i, /Entertainment Desk/i, /UPDATED/i, /DeskNew/i],
    'India Today desk chrome',
  );
  expect(out).toMatch(/Alpha|film|multiplexes/i);
});

test('English India Today: day-month UPDATED date order is stripped', () => {
  const raw =
    'India Today Entertainment Desk New Delhi, UPDATED 30 May 2026 08:33 IST The film opened to strong numbers on day one.';
  const out = stripPublisherFeedBoilerplate(raw, 'Alpha movie');
  assertClean(out, [/India Today/i, /UPDATED/i, /Entertainment Desk/i], 'day-month UPDATED');
  expect(out).toMatch(/film opened/i);
});

test('sanitizePublisherStoryText: chrome-only field becomes empty', () => {
  const raw = 'India Today Entertainment DeskNew Delhi,UPDATED';
  const out = sanitizePublisherStoryText(raw, { sourceName: 'India Today - India' });
  expect(out.trim()).toBe('');
});

test('English India Today: strips desk chrome from headline-only field', () => {
  const raw = 'India Today Entertainment DeskNew Delhi,UPDATED Alpha movie release and review live';
  const out = stripPublisherFeedBoilerplate(raw);
  assertClean(out, [/India Today/i, /Entertainment Desk/i, /UPDATED/i], 'India Today title');
  expect(out).toMatch(/Alpha movie/i);
});

test('Summary: rebuilds from dirty India Today lede after chrome strip', () => {
  const raw =
    'India Today Entertainment DeskNew Delhi,UPDATED The film opened to strong numbers across multiplexes on day one. Crowds lined up early for the Alia Bhatt and Sharvari starrer.';
  const summary = buildReaderSummaryFromPlainText(raw, 'Alpha movie release and review live', {
    minChars: 48,
  });
  expect(summary.length).toBeGreaterThan(40);
  expect(summary).not.toMatch(/India Today|UPDATED|Entertainment Desk/i);
  expect(summary).toMatch(/film|multiplexes|Crowds/i);
});

// ─── SUMMARY BUILDER ─────────────────────────────────────────────────────────
test('buildReaderSummaryFromPlainText: produces clean summary within length limits', () => {
  const raw = `TOI Sports Desk / TIMESOFINDIA.COM / May 30, 2026, 08:33 IST CommentsShareAA+ Gujarat Titans pulled off a record chase in Qualifier 2 of IPL 2026. Shubman Gill won the Player of the Match award for his brilliant innings of 98 not out. The team will now face Mumbai Indians in the final. This is the third time Gujarat Titans have reached the IPL final. The match was played at the Narendra Modi Stadium in Ahmedabad. Copyright © 2026 Bennett, Coleman & Co.Ltd. All rights reserved.`;
  const summary = buildReaderSummaryFromPlainText(raw, 'Gujarat Titans reach IPL Final');
  expect(summary.length).toBeGreaterThan(100);
  expect(summary.length).toBeLessThan(1300);
  expect(summary).toContain('Gujarat Titans');
  expect(summary).not.toMatch(/TIMESOFINDIA\.COM/i);
  expect(summary).not.toMatch(/Bennett, Coleman/i);
  expect(summary).not.toMatch(/CommentsShare/i);
});

test('buildReaderSummaryFromPlainText: does not return empty for clean input', () => {
  const raw = `The Reserve Bank of India reported a 26% increase in income to 4.3 lakh crore rupees in FY26. This growth was primarily driven by gains from foreign exchange transactions. The central bank also increased its dividend payout to the government significantly compared to last year.`;
  const summary = buildReaderSummaryFromPlainText(raw, 'RBI income rises 26%');
  expect(summary.length).toBeGreaterThan(80);
  expect(summary).toContain('Reserve Bank');
});
