/**
 * Safe fallback when the AI rewrite is unavailable (quota/outage) or keeps copying the source:
 * source text is NEVER published. Either hold a DRAFT for an editor/retry (default) or publish a short
 * placeholder that contains no source-derived text.
 */
export type RawFallbackMode = 'draft' | 'placeholder';

export function parseRawFallbackMode(value: string | null | undefined): RawFallbackMode {
  return (value ?? '').trim().toLowerCase() === 'placeholder' ? 'placeholder' : 'draft';
}

/** "A simple summary of this story is being prepared. Please check back shortly." */
export const HELD_PLACEHOLDER: Record<string, string> = {
  en: 'A simple summary of this story is being prepared. Please check back shortly.',
  hi: 'इस खबर का आसान भाषा में सारांश तैयार किया जा रहा है। कृपया थोड़ी देर बाद फिर देखें।',
  mr: 'या बातमीचा सोप्या भाषेतील सारांश तयार केला जात आहे. कृपया थोड्या वेळाने पुन्हा पहा.',
  bn: 'এই খবরের সহজ ভাষায় সারাংশ তৈরি করা হচ্ছে। অনুগ্রহ করে একটু পরে আবার দেখুন।',
  te: 'ఈ వార్త యొక్క సులభమైన సారాంశం సిద్ధం చేస్తున్నాం. దయచేసి కాసేపటి తర్వాత మళ్లీ చూడండి.',
  ta: 'இந்தச் செய்தியின் எளிய சுருக்கம் தயாராகி வருகிறது. சிறிது நேரம் கழித்து மீண்டும் பார்க்கவும்.',
  gu: 'આ સમાચારનો સરળ ભાષામાં સારાંશ તૈયાર થઈ રહ્યો છે. કૃપા કરીને થોડી વારમાં ફરી જુઓ.',
  kn: 'ಈ ಸುದ್ದಿಯ ಸರಳ ಸಾರಾಂಶವನ್ನು ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ನೋಡಿ.',
  pa: 'ਇਸ ਖ਼ਬਰ ਦਾ ਸੌਖੀ ਭਾਸ਼ਾ ਵਿੱਚ ਸਾਰ ਤਿਆਰ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਥੋੜ੍ਹੀ ਦੇਰ ਬਾਅਦ ਦੁਬਾਰਾ ਵੇਖੋ।',
  ur: 'اس خبر کا آسان زبان میں خلاصہ تیار کیا جا رہا ہے۔ براہِ کرم کچھ دیر بعد دوبارہ دیکھیں۔',
  ml: 'ഈ വാർത്തയുടെ ലളിതമായ സംഗ്രഹം തയ്യാറാക്കുകയാണ്. ദയവായി അൽപ്പസമയം കഴിഞ്ഞ് വീണ്ടും നോക്കുക.',
  ar: 'يجري إعداد ملخص مبسّط لهذا الخبر. يرجى العودة بعد قليل.',
  fr: 'Un résumé simple de cette information est en cours de préparation. Merci de revenir dans quelques instants.',
  de: 'Eine einfache Zusammenfassung dieser Nachricht wird gerade erstellt. Bitte schauen Sie in Kürze wieder vorbei.',
  es: 'Se está preparando un resumen sencillo de esta noticia. Vuelve a consultar en unos momentos.',
  pt: 'Um resumo simples desta notícia está sendo preparado. Volte a consultar em instantes.',
  ru: 'Простое краткое изложение этой новости готовится. Пожалуйста, загляните чуть позже.',
  zh: '这条新闻的简明摘要正在准备中，请稍后再来查看。',
  ja: 'このニュースのやさしい要約を準備しています。しばらくしてからもう一度ご覧ください。',
  ko: '이 뉴스의 쉬운 요약을 준비하고 있습니다. 잠시 후 다시 확인해 주세요.',
  id: 'Ringkasan sederhana berita ini sedang disiapkan. Silakan periksa kembali sebentar lagi.',
  tr: 'Bu haberin sade bir özeti hazırlanıyor. Lütfen birazdan tekrar kontrol edin.',
  it: 'Stiamo preparando un riassunto semplice di questa notizia. Torna a controllare tra poco.',
};

export function heldPlaceholderText(lang: string | null | undefined): string {
  const code = (lang ?? 'en').toLowerCase().split(/[-_]/)[0];
  return HELD_PLACEHOLDER[code] ?? HELD_PLACEHOLDER.en;
}
