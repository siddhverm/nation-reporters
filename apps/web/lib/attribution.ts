/**
 * Multilingual attribution detection (bylines, photo credits, source/"via" lines).
 * Keep in sync with apps/api/src/common/attribution.util.ts (parity test: apps/api/src/common/attribution.parity.test.ts).
 *
 * Covers every UI language: en hi mr bn te ta gu kn pa ur ml ar fr de es pt ru zh ja ko id tr it.
 */

/** Words that introduce an author/reporter name ("By", "लेखक", "作者", "Par", ...). */
export const BYLINE_LABELS: readonly string[] = [
  'By', 'Author', 'Reporter', 'Reported by', 'Written by', 'Words by', 'Story by', 'Correspondent', 'Staff Reporter', 'Edited by',
  'लेखक', 'रिपोर्ट', 'रिपोर्टर', 'संवाददाता', 'प्रतिनिधी', 'वार्ताहर', 'बातमीदार',
  'প্রতিবেদক', 'লেখক', 'প্রতিনিধি', 'সংবাদদাতা',
  'రచయిత', 'విలేకరి', 'రిపోర్టర్', 'ప్రతినిధి',
  'எழுதியவர்', 'நிருபர்', 'செய்தியாளர்',
  'લેખક', 'રિપોર્ટર', 'પ્રતિનિધિ', 'સંવાદદાતા',
  'ಲೇಖಕ', 'ವರದಿಗಾರ', 'ವರದಿ',
  'ਲੇਖਕ', 'ਰਿਪੋਰਟਰ', 'ਪ੍ਰਤੀਨਿਧੀ',
  'تحریر', 'رپورٹر', 'نامہ نگار', 'نمائندہ',
  'എഴുത്ത്', 'റിപ്പോർട്ടർ', 'ലേഖകൻ',
  'بقلم', 'مراسل', 'مراسلنا', 'كتب', 'المحرر', 'تقرير',
  'Par', 'Auteur', 'Reportage',
  'Von', 'Autor', 'Text',
  'Por', 'Autor', 'Texto',
  'Автор', 'Текст', 'Корреспондент',
  '作者', '记者', '記者', '编辑', '編輯', '撰文', '文',
  '執筆', '取材', '文・',
  '기자', '글', '취재', '작성',
  'Oleh', 'Penulis',
  'Yazan', 'Muhabir', 'Haber',
  'Di', 'Autore', 'Testo',
];

/** Words that introduce an image/photo credit. */
export const PHOTO_LABELS: readonly string[] = [
  'Photo', 'Photos', 'Image', 'Pic', 'Picture', 'Credit', 'Image credit', 'Photo credit', 'Courtesy',
  'फोटो', 'तस्वीर', 'चित्र',
  'ছবি',
  'ఫోటో', 'చిత్రం',
  'புகைப்படம்', 'படம்',
  'ફોટો', 'તસવીર',
  'ಫೋಟೋ', 'ಚಿತ್ರ',
  'ਫੋਟੋ', 'ਤਸਵੀਰ',
  'تصویر', 'فوٹو',
  'ഫോട്ടോ', 'ചിത്രം',
  'صورة', 'تصوير',
  'Crédit photo', 'Foto', 'Bild', 'Imagem', 'Crédito', 'Immagine',
  'Фото', 'Изображение',
  '图片', '图', '图源', '摄影', '摄',
  '写真', '画像', '撮影',
  '사진', '이미지',
  'Gambar', 'Fotoğraf', 'Görsel',
];

/** Words that introduce the origin of the story ("Source:", "स्रोत", "来源", "Fuente", ...). */
export const SOURCE_LABELS: readonly string[] = [
  'Source', 'Sources', 'Via', 'Courtesy', 'With inputs from', 'Agencies', 'Original',
  'स्रोत', 'सूत्र',
  'সূত্র',
  'మూలం',
  'ஆதாரம்',
  'સ્ત્રોત',
  'ಮೂಲ',
  'ਸਰੋਤ',
  'ماخذ', 'بحوالہ',
  'ഉറവിടം',
  'المصدر', 'نقلا عن',
  'Quelle', 'Fuente', 'Fonte', 'Sumber', 'Kaynak',
  'Источник',
  '来源', '來源', '出典', '출처', '제공',
];

const SEP = '[:：|｜]';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (labels: readonly string[]) =>
  [...new Set(labels)].sort((a, b) => b.length - a.length).map(esc).join('|');

// "<label>: <short value>" (label may be followed by a space only for Latin labels like "By Name").
const LABELLED_LINE = new RegExp(
  `^\\s*(?:${alt([...BYLINE_LABELS, ...PHOTO_LABELS, ...SOURCE_LABELS])})\\s*${SEP}\\s*\\S`,
  'u',
);
// Latin-script "By Name" / "Par Name" without a colon — names are Capitalised words only.
const NAME_TOKEN = "\\p{Lu}[\\p{L}.'’-]*";
const PARTICLE = '(?:de|da|do|dos|das|di|del|della|von|van|der|den|la|le|el|bin|bint|al|y|e)';
const LATIN_BYLINE = new RegExp(
  `^(?:By|Par|Von|Por|Di|Da|Oleh|Yazan)\\s+${NAME_TOKEN}(?:\\s+(?:${PARTICLE}|${NAME_TOKEN})){0,4}\\s*[,|—–-]?\\s*(?:${NAME_TOKEN})?$`,
  'u',
);
const SENTENCE_END_INSIDE = /[.!?。！？।؟]\s*\S/u;

/** True when a whole line is an attribution (byline / photo credit / source) and carries no story text. */
export function isAttributionLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 140) return false;
  if (LABELLED_LINE.test(t) && !SENTENCE_END_INSIDE.test(t.replace(/^[^:：|｜]*[:：|｜]/u, ''))) return true;
  if (t.length <= 70 && LATIN_BYLINE.test(t)) return true;
  return false;
}
