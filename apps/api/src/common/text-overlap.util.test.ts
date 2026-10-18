import { extractNumbers, measureOverlap, normalizeForOverlap, numberRetention, overlapTooHigh, toAsciiDigits } from './text-overlap.util';

const SRC =
  'The government on Sunday unveiled a new metro line that will connect the airport to the city centre by 2028. ' +
  'Officials said the project will cost 12,500 crore rupees and create 40,000 jobs over six years.';

describe('measureOverlap', () => {
  it('flags a verbatim copy', () => {
    const r = measureOverlap(SRC, SRC);
    expect(r.ratio).toBeGreaterThan(0.9);
    expect(overlapTooHigh(r)).toBe(true);
  });
  it('flags a copied long run even inside new text', () => {
    const out = 'In short, ' + 'the government on Sunday unveiled a new metro line that will connect the airport to the city centre by 2028' + ' and people are happy about it today.';
    const r = measureOverlap(out, SRC);
    expect(r.longestRun).toBeGreaterThanOrEqual(19);
    expect(overlapTooHigh(r)).toBe(true);
  });
  it('allows an original explanation that shares the facts (numbers, names)', () => {
    const out = 'A new metro line will link the airport with the middle of the city. It should be ready in 2028, costs 12,500 crore rupees and is expected to bring 40,000 jobs across six years.';
    const r = measureOverlap(out, SRC);
    expect(overlapTooHigh(r)).toBe(false);
  });
  it('is case/punctuation/diacritic insensitive', () => {
    expect(normalizeForOverlap('  Hello,   WORLD! ')).toBe('hello world');
    expect(measureOverlap(SRC.toUpperCase().replace(/,/g, ' ;'), SRC).ratio).toBeGreaterThan(0.9);
  });
  it('uses character n-grams for CJK text', () => {
    const src = '政府は日曜日、2028年までに空港と市中心部を結ぶ新しい地下鉄路線を発表した。当局者は、駅の広告収入が事業費の一部に充てられると述べた。';
    const same = measureOverlap(src, src);
    expect(same.unit).toBe('char');
    expect(overlapTooHigh(same)).toBe(true);
    const other = '新しい地下鉄の計画が出ました。空港から街の中心まで早く行けるようになります。完成は2028年の予定です。';
    expect(overlapTooHigh(measureOverlap(other, src))).toBe(false);
  });
  it('is safe on empty / very short input', () => {
    expect(overlapTooHigh(measureOverlap('', SRC))).toBe(false);
    expect(overlapTooHigh(measureOverlap('Hi there', SRC))).toBe(false);
    expect(overlapTooHigh(measureOverlap(SRC, ''))).toBe(false);
  });
});

describe('numbers', () => {
  it('normalises non-ASCII digits (Devanagari, Arabic-Indic, Bengali)', () => {
    expect(toAsciiDigits('२०२८')).toBe('2028');
    expect(toAsciiDigits('٢٠٢٨')).toBe('2028');
    expect(toAsciiDigits('২০২৮')).toBe('2028');
  });
  it('extracts amounts regardless of separators and skips single digits', () => {
    expect(extractNumbers('12,500 crore, 40,000 jobs, 3 lines, 2028').sort()).toEqual(['12500', '2028', '40000']);
  });
  it('measures how many source numbers survive, across scripts', () => {
    const r = numberRetention('यह लाइन २०२८ तक बनेगी, ख़र्च १२,५०० करोड़ और ४०,००० नौकरियां', SRC);
    expect(r.ratio).toBe(1);
    const lost = numberRetention('A new line will open soon.', SRC);
    expect(lost.ratio).toBe(0);
    expect(lost.missing.sort()).toEqual(['12500', '2028', '40000']);
  });
  it('has nothing to retain when the source has no numbers', () => {
    expect(numberRetention('anything', 'no digits here').ratio).toBe(1);
  });
});
