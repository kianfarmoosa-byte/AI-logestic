/**
 * جمعآوری دادهٔ زندهٔ مرزها از سامانهٔ نوبتدهی Border Park
 * ------------------------------------------------------------
 * منبع: https://borderpark.ir/Fa — سامانهٔ رسمی نوبتدهی ناوگان مرزی گمرک ایران
 * ساختار هر مرز: borderpark.ir/<gate>_api/Fa/status
 *   - «وضعیت مرز در نگاه کلی»: پذیرش گمرک، ترانزیت، صادرات، تخلیه/بارگیری
 *   - «تیرپارکهای فعال»: نام، ظرفیت تریلی، خدمات
 *   - «وضعیت صفهای ناوگان»: جدول عنوان صف / کل صف / فراخوان شده / انتظار / پذیرش / زمان انتظار (ساعت)
 *
 * دسترسی مستقیم از سندباکس به borderpark.ir مسدود است (TLS handshake متوقف میشود)؛
 * بنابراین واکشی از دو مسیر انجام میشود: ۱) متن‌ساز r.jina.ai  ۲) مستقیم (در محیط باز)
 * هر دو مسیر با timeout و مدیریت خطای مستقل؛ خروجی: BorderParkSnapshot ساختاریافته.
 */

export interface BorderParkQueueRow {
  queueTitle: string;
  total: number;          // کل صف
  called: number;         // فراخوان شده
  awaitingEntry: number;  // در انتظار ورود به گمرک
  accepted: number;       // پذیرش گمرک
  waitHours: number;      // زمان انتظار (ساعت)
}

export interface BorderParkTirPark {
  name: string;
  capacityTrailers: number | null;
  services: string[];
}

export interface BorderParkOverview {
  customsAcceptance: number; // پذیرش گمرک
  transit: number;           // ترانزیت
  export: number;            // صادرات
  loading: number;           // تخلیه/بارگیری
}

export interface BorderParkSnapshot {
  gateId: number | null;
  gateSlug: string;          // مثلاً bazargan
  gateNameFa: string;
  observedAt: string;        // ISO
  sourceUpdatedAt?: string;  // مهر «آخرین بهروزرسانی» خود سامانه (مثلاً 1405-07-07 13:07)
  overview: BorderParkOverview | null;
  tirParks: BorderParkTirPark[];
  queues: BorderParkQueueRow[];
  totalQueue: number;
  maxWaitHours: number;
  fetchPath: 'jina' | 'direct' | 'none';
  confidence: 'high' | 'medium' | 'low';
  rawTitle?: string;
}

/** مرزهای دارای سامانهٔ نوبتدهی Border Park (شناسهٔ گذرگاه اطلس) */
export const BORDERPARK_GATES: { slug: string; gateId: number; nameFa: string }[] = [
  { slug: 'bazargan', gateId: 0, nameFa: 'بازرگان' },
  { slug: 'razi', gateId: 1, nameFa: 'رازی' },
  { slug: 'norduz', gateId: 11, nameFa: 'نوردوز' },
  { slug: 'jolfa', gateId: 15, nameFa: 'جلفا' },
  { slug: 'doogharon', gateId: 21, nameFa: 'دوغارون' },
  { slug: 'rimdan', gateId: 27, nameFa: 'ریمدان' },
];

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

/** «(923) 965» یا «965» یا «۹۲۳» → عدد؛ اگر پرانتز داشت، جمع پرانتز + عدد بیرونی (مجموع صف) */
function parseCount(cell: string): number {
  const cleaned = toEnDigits(String(cell || ''));
  const paren = cleaned.match(/\((\d+)\)\s*(\d+)?/);
  if (paren) {
    const inside = Number(paren[1]) || 0;
    const outside = paren[2] ? Number(paren[2]) : 0;
    return inside + outside; // مجموع صف = حاضر + غایب
  }
  const plain = cleaned.replace(/[^\d]/g, '');
  return plain ? Number(plain) : 0;
}

/** واکشی متن صفحه از مسیر متن‌ساز (جینا) — با تلاش مجدد ۴۲۹/۴۰۳ و رد کش خالی */
async function fetchViaJina(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    // x-no-cache: جینا گاهی snapshot خالی کششده را برمیگرداند؛ تلاش دوم کش را دور میزند
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: attempt === 0 ? { 'User-Agent': 'Mozilla/5.0' } : { 'User-Agent': 'Mozilla/5.0', 'x-no-cache': 'true' },
      signal: AbortSignal.timeout(45000),
    });
    if (res.ok) {
      const text = await res.text();
      // متن کششدهٔ خالی را قبول نکن — حداقل جدول یا شمارنده داشته باشد
      if (text.length > 400 && (text.includes('|') || /\*\*\d+\*\*/.test(text))) return text;
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    if (res.status === 429 || res.status === 403) {
      await new Promise((r) => setTimeout(r, 4000 + attempt * 2000));
      continue;
    }
    throw new Error(`jina ${res.status}`);
  }
  throw new Error('jina rate-limited');
}

/** واکشی مستقیم — در محیطی که دسترسی باز است کار میکند */
async function fetchDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`direct ${res.status}`);
  return await res.text();
}

/** پارس وضعیت کلی: چهار شمارندهٔ نگاه کلی (جمع ستون «کل صف» جدول) */
function parseOverview(text: string): BorderParkOverview | null {
  const grab = (label: string): number => {
    const re = new RegExp(`${label}[\\s\\S]{0,80}?\\*\\*(\\d+)\\*\\*`);
    const m = text.match(re);
    return m ? Number(m[1]) : 0;
  };
  const overview: BorderParkOverview = {
    customsAcceptance: grab('پذیرش گمرک'),
    transit: grab('ترانزیت'),
    export: grab('صادرات'),
    loading: grab('تخلیه\\s*,?\\s*بارگیری|تخلیه, بارگیری'),
  };
  const hasAny = overview.customsAcceptance + overview.transit + overview.export + overview.loading > 0;
  return hasAny ? overview : null;
}

/** پارس تیرپارکهای فعال: نام + ظرفیت تریلی + خدمات */
function parseTirParks(text: string): BorderParkTirPark[] {
  const parks: BorderParkTirPark[] = [];
  // الگو: نام بولد، سپس خدمات، سپس «N تریلی»
  const re = /\*\*([^*]{2,40})\*\*\s*\n([^*]*?)\s*\n\s*(\d[\d,]*)\s*تریلی/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const services = (m[2] || '')
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter((s) => s && s.length > 2 && !/^\d+$/.test(s));
    parks.push({
      name: m[1].trim(),
      capacityTrailers: Number(toEnDigits(m[3]).replace(/,/g, '')) || null,
      services,
    });
  }
  return parks;
}

/** پارس جدول صفهای ناوگان */
function parseQueues(text: string): { queues: BorderParkQueueRow[]; sourceUpdatedAt?: string } {
  const queues: BorderParkQueueRow[] = [];
  const updated = text.match(/آخرین به روزرسانی\s*:\s*([\d-]+\s+[\d:]+)/);
  const sourceUpdatedAt = updated ? toEnDigits(updated[1]).trim() : undefined;
  // ردیفهای جدول مارکداون: | عنوان | کل | فراخوان | انتظار | پذیرش | ساعت |
  const rowRe = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(text)) !== null) {
    // m[1]=عنوان، m[2]=کل، m[3]=فراخوان، m[4]=انتظار، m[5]=پذیرش، m[6]=ساعت
    const title = m[1].trim();
    if (!title || /^(عنوان|---|-)/.test(title)) continue;
    queues.push({
      queueTitle: title,
      total: parseCount(m[2]),
      called: parseCount(m[3]),
      awaitingEntry: parseCount(m[4]),
      accepted: parseCount(m[5]),
      waitHours: parseCount(m[6]),
    });
  }
  return { queues, sourceUpdatedAt };
}

/** جمع کل صف و بیشترین زمان انتظار — ردیفهای تجمیعی («صادرات»، «ترانزیت») را مستثنا میکند */
function summarize(rows: BorderParkQueueRow[]): { totalQueue: number; maxWaitHours: number } {
  // ردیفهای «صادرات» و «ترانزیت» جمع سایر ردیفهایند؛ برای مجموع، زیرگروهها شمرده میشوند
  const detailRows = rows.filter((r) => !['صادرات', 'ترانزيت', 'ترانزیت'].includes(r.queueTitle.trim()));
  const source = detailRows.length > 3 ? detailRows : rows;
  return {
    totalQueue: source.reduce((s, r) => s + r.total, 0),
    maxWaitHours: rows.reduce((mx, r) => Math.max(mx, r.waitHours), 0),
  };
}

/** جمعآوری وضعیت یک مرز از هر دو مسیر */
export async function fetchGateStatus(slug: string, gateId: number | null, nameFa: string): Promise<BorderParkSnapshot> {
  const target = `https://borderpark.ir/${slug}_api/Fa/status`;
  let text = '';
  let path: BorderParkSnapshot['fetchPath'] = 'none';

  try {
    text = await fetchViaJina(target);
    path = 'jina';
  } catch {
    try {
      text = await fetchDirect(target);
      path = 'direct';
    } catch {
      path = 'none';
    }
  }

  if (!text || text.length < 400) {
    // صفحات رندر سنگین (مثل رازی/دوغارون) به متن‌ساز خالی میدهند؛ راهنمای شفاف برگردان
    return {
      gateId, gateSlug: slug, gateNameFa: nameFa,
      observedAt: new Date().toISOString(),
      overview: null, tirParks: [], queues: [],
      totalQueue: 0, maxWaitHours: 0,
      fetchPath: path, confidence: 'low',
      rawTitle: 'صفحهٔ این مرز در متن‌ساز خالی برمیگردد (رندر جاوااسکریپت سنگین)؛ دادهٔ زنده فعلاً از این مرز در دسترس نیست.',
    };
  }

  const overview = parseOverview(text);
  const tirParks = parseTirParks(text);
  const { queues, sourceUpdatedAt } = parseQueues(text);
  const { totalQueue, maxWaitHours } = summarize(queues);

  return {
    gateId, gateSlug: slug, gateNameFa: nameFa,
    observedAt: new Date().toISOString(),
    sourceUpdatedAt,
    overview,
    tirParks,
    queues,
    totalQueue,
    maxWaitHours,
    fetchPath: path,
    confidence: queues.length > 0 ? 'high' : overview || tirParks.length ? 'medium' : 'low',
    rawTitle: text.slice(0, 200),
  };
}

/** جمعآوری همهٔ مرزهای فعال سامانه — موازی با مهلت مستقل */
export async function fetchAllGates(): Promise<BorderParkSnapshot[]> {
  return Promise.all(BORDERPARK_GATES.map((g) => fetchGateStatus(g.slug, g.gateId, g.nameFa)));
}

/** خلاصهٔ تحلیلی یک snapshot برای تزریق به استعلام هوشمند */
export function snapshotToAiContext(s: BorderParkSnapshot): string {
  if (s.confidence === 'low') return `مرز ${s.gateNameFa}: دادهٔ زندهٔ سامانهٔ نوبتدهی در دسترس نیست.`;
  const lines = [
    `مرز ${s.gateNameFa} (سامانهٔ نوبتدهی رسمی، آخرین بهروزرسانی: ${s.sourceUpdatedAt ?? 'نامشخص'}):`,
  ];
  if (s.overview) {
    lines.push(
      `- امروز: پذیرش گمرک ${s.overview.customsAcceptance}، ترانزیت ${s.overview.transit}، صادرات ${s.overview.export}، تخلیه/بارگیری ${s.overview.loading}`
    );
  }
  if (s.queues.length > 0) {
    lines.push('- صفهای فعال (کل صف | فراخوان شده | زمان انتظار ساعت):');
    for (const q of s.queues.slice(0, 6)) {
      lines.push(`  · ${q.queueTitle}: ${q.total} | ${q.called} | ${q.waitHours} ساعت`);
    }
    lines.push(`- مجموع صف: ${s.totalQueue} دستگاه؛ بیشترین انتظار: ${s.maxWaitHours} ساعت`);
  }
  if (s.tirParks.length > 0) {
    lines.push(`- تیرپارکها: ${s.tirParks.map((p) => `${p.name}${p.capacityTrailers ? ` (${p.capacityTrailers} تریلی)` : ''}`).join('، ')}`);
  }
  return lines.join('\n');
}
