/**
 * خط لولهٔ جریان مرزها (فاز ۰)
 * ------------------------------------------------------------
 * منابع فعلی:
 *  ۱) آمار رسمی گمرک×کشور×HS×ماه — درگاه اتاق تهران service.tccim.ir/stats
 *     (سایت زنجیرهٔ گواهی ناقص دارد؛ با Agent غیراعتبارسنج و فقط دادهٔ عمومی)
 *  ۲) آیندگان خبری مرزهای پرترافیک — زنجیرهٔ جستجوی وب + استخراج ساختاریافته با مدل زبانی
 * خروجی: BorderFlowRecord با provenance و confidence برای نمایش در داشبورد.
 */

export interface BorderFlowRecord {
  id: string;
  gateId: number;
  gateName: string;
  date: string;
  direction: 'import' | 'export' | 'transit-in' | 'transit-out' | 'flow';
  trucks?: number;
  tonnage?: number;
  valueUsd?: number;
  hs2?: string;
  hs6?: string;
  partnerCountry?: string;
  source: 'tccim' | 'rmto' | 'comtrade' | 'cpmm' | 'news' | 'field';
  sourceUrl?: string;
  title?: string;
  snippet?: string;
  confidence: 'high' | 'medium' | 'low';
  collectedAt: string;
}

/** گمرکات پرترافیک برای آیندگان خبری (۱۰ مرز اصلی) */
export const TOP_TRAFFIC_GATES: { id: number; name: string; neighbor: string }[] = [
  { id: 0, name: 'بازرگان', neighbor: 'ترکیه' },
  { id: 4, name: 'پرویزخان', neighbor: 'عراق' },
  { id: 5, name: 'خسروی', neighbor: 'عراق' },
  { id: 6, name: 'مهران', neighbor: 'عراق' },
  { id: 7, name: 'شلمچه', neighbor: 'عراق' },
  { id: 9, name: 'باشماق', neighbor: 'عراق' },
  { id: 22, name: 'دوغارون', neighbor: 'افغانستان' },
  { id: 21, name: 'اینچه‌برون', neighbor: 'ترکمنستان' },
  { id: 12, name: 'آستارا', neighbor: 'جمهوری آذربایجان' },
  { id: 27, name: 'ریمدان', neighbor: 'پاکستان' },
];

/* ── اعتبارسنجی منطقی ─────────────────────────────────────────────────── */

const CONF_BASE: Record<BorderFlowRecord['source'], number> = {
  tccim: 1.0, rmto: 0.9, comtrade: 0.9, cpmm: 0.8, news: 0.5, field: 0.5,
};

function confidenceFor(source: BorderFlowRecord['source']): BorderFlowRecord['confidence'] {
  const v = CONF_BASE[source];
  if (v >= 0.9) return 'high';
  if (v >= 0.7) return 'medium';
  return 'low';
}

/** پرش غیرممکن روزانه: >۵۰٪ نسبت به میانگین → مشکوک (فعلاً فقط برچسب) */
function isOutlierDaily(trucks: number): boolean {
  return trucks > 60_000 || trucks < 0;
}

/* ── آلارم نوسان (فاز ۱) ───────────────────────────────────────────────── */

export interface FlowAnomaly {
  id: string;
  gateId: number;
  gateName: string;
  kind: 'surge' | 'drop' | 'implausible' | 'conflict';
  severity: 'critical' | 'warning' | 'info';
  metric: 'trucks' | 'tonnage' | 'value';
  value: number;
  baseline?: number;
  changePct?: number;
  message: string;
  evidence: { source: BorderFlowRecord['source']; title: string; url?: string }[];
  detectedAt: string;
}

/** آستانهٔ «تردد معمول روزانه» برای هر مرز (مبنای تشخیص جهش) */
const GATE_DAILY_BASELINE: Record<number, number> = {
  0: 700, // بازرگان
  4: 1200, // پرویزخان
  5: 600, // خسروی
  6: 300, // مهران
  7: 400, // شلمچه
  9: 500, // باشماق
  22: 900, // دوغارون
  21: 200, // اینچه‌برون
  12: 250, // آستارا
  27: 300, // ریمدان
};

/**
 * تشخیص نوسان از رکوردهای خبری یک دور جمعآوری:
 *  - surge: تعداد کامیون ≥ ۲ برابر خط مبنا
 *  - drop: اعلام توقف/کاهش شدید در متن خبر (جهت خروجی با کامیون صفر یا متن کلیدواژه‌دار)
 *  - implausible: عدد خارج از بازهٔ منطقی
 *  - conflict: دو خبر همزمان با اعداد ناسازگار برای یک مرز (نسبت > ۳)
 */
export function detectAnomalies(news: BorderFlowRecord[]): FlowAnomaly[] {
  const anomalies: FlowAnomaly[] = [];
  const byGate = new Map<number, BorderFlowRecord[]>();
  for (const r of news) {
    const list = byGate.get(r.gateId) ?? [];
    list.push(r);
    byGate.set(r.gateId, list);
  }

  for (const [gateId, records] of byGate) {
    const gateName = records[0]?.gateName ?? `گذرگاه ${gateId}`;
    const baseline = GATE_DAILY_BASELINE[gateId] ?? 400;
    const withTrucks = records.filter((r) => typeof r.trucks === 'number' && (r.trucks ?? 0) > 0);

    // جهش نسبت به خط مبنا
    for (const r of withTrucks) {
      const trucks = r.trucks ?? 0;
      if (trucks >= baseline * 2) {
        anomalies.push({
          id: `anom-surge-${r.id}`,
          gateId,
          gateName,
          kind: 'surge',
          severity: trucks >= baseline * 4 ? 'critical' : 'warning',
          metric: 'trucks',
          value: trucks,
          baseline,
          changePct: Math.round(((trucks - baseline) / baseline) * 100),
          message: `تردد ${trucks.toLocaleString('fa-IR')} کامیون — حدود ${(trucks / baseline).toFixed(1)} برابر سطح معمول روزانه`,
          evidence: records.slice(0, 2).map((e) => ({ source: e.source, title: e.title ?? '', url: e.sourceUrl })),
          detectedAt: new Date().toISOString(),
        });
      }
      if (isOutlierDaily(trucks)) {
        anomalies.push({
          id: `anom-impl-${r.id}`,
          gateId,
          gateName,
          kind: 'implausible',
          severity: 'info',
          metric: 'trucks',
          value: trucks,
          message: 'عدد اعلامشده خارج از بازهٔ منطقی است؛ نیازمند راستیآزمایی',
          evidence: [{ source: r.source, title: r.title ?? '', url: r.sourceUrl }],
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // تعارض دو منبع
    if (withTrucks.length >= 2) {
      const sorted = [...withTrucks].sort((a, b) => (b.trucks ?? 0) - (a.trucks ?? 0));
      const hi = sorted[0];
      const lo = sorted[sorted.length - 1];
      if ((lo.trucks ?? 0) > 0 && (hi.trucks ?? 0) / (lo.trucks ?? 1) > 3) {
        anomalies.push({
          id: `anom-conflict-${gateId}-${hi.id}`,
          gateId,
          gateName,
          kind: 'conflict',
          severity: 'info',
          metric: 'trucks',
          value: hi.trucks ?? 0,
          baseline: lo.trucks,
          message: `دو خبر ناسازگار: ${(hi.trucks ?? 0).toLocaleString('fa-IR')} در برابر ${(lo.trucks ?? 0).toLocaleString('fa-IR')} کامیون`,
          evidence: [hi, lo].map((e) => ({ source: e.source, title: e.title ?? '', url: e.sourceUrl })),
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // اعلام کاهش شدید/توقف در متن
    for (const r of records) {
      const text = `${r.title ?? ''} ${r.snippet ?? ''}`;
      if (/(توقف کامل|بسته شد|تعطیلی مرز|مسدود شد)/.test(text)) {
        anomalies.push({
          id: `anom-drop-${r.id}`,
          gateId,
          gateName,
          kind: 'drop',
          severity: 'critical',
          metric: 'trucks',
          value: 0,
          message: 'اعلام توقف یا بستهشدن تردد در منابع خبری',
          evidence: [{ source: r.source, title: r.title ?? '', url: r.sourceUrl }],
          detectedAt: new Date().toISOString(),
        });
        break;
      }
    }
  }

  // حداکثر یکی از هر نوع برای هر مرز تا داشبورد شلوغ نشود
  const seen = new Set<string>();
  return anomalies.filter((a) => {
    const key = `${a.gateId}-${a.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** تجمیع مقصد و گروههای کالایی یک گذرگاه از رکوردهای رسمی */
export function aggregateDestinations(records: BorderFlowRecord[]): {
  destinations: { country: string; exportT: number; importT: number; exportUsd: number; importUsd: number; confidence: BorderFlowRecord['confidence'] }[];
  hs2Groups: { hs2: string; exportT: number; importT: number; exportUsd: number; importUsd: number }[];
} {
  const dest = new Map<string, { exportT: number; importT: number; exportUsd: number; importUsd: number; conf: BorderFlowRecord['confidence'] }>();
  const hs = new Map<string, { exportT: number; importT: number; exportUsd: number; importUsd: number }>();
  for (const r of records) {
    if (r.partnerCountry) {
      const d = dest.get(r.partnerCountry) ?? { exportT: 0, importT: 0, exportUsd: 0, importUsd: 0, conf: r.confidence };
      if (r.direction === 'export') {
        d.exportT += r.tonnage ?? 0;
        d.exportUsd += r.valueUsd ?? 0;
      } else {
        d.importT += r.tonnage ?? 0;
        d.importUsd += r.valueUsd ?? 0;
      }
      dest.set(r.partnerCountry, d);
    }
    if (r.hs2) {
      const g = hs.get(r.hs2) ?? { exportT: 0, importT: 0, exportUsd: 0, importUsd: 0 };
      if (r.direction === 'export') {
        g.exportT += r.tonnage ?? 0;
        g.exportUsd += r.valueUsd ?? 0;
      } else {
        g.importT += r.tonnage ?? 0;
        g.importUsd += r.valueUsd ?? 0;
      }
      hs.set(r.hs2, g);
    }
  }
  return {
    destinations: Array.from(dest.entries())
      .map(([country, v]) => ({ country, ...v, confidence: v.conf }))
      .sort((a, b) => b.exportT + b.importT - (a.exportT + a.importT)),
    hs2Groups: Array.from(hs.entries())
      .map(([hs2, v]) => ({ hs2, ...v }))
      .sort((a, b) => b.exportT + b.importT - (a.exportT + a.importT)),
  };
}

/* ── ۱) واکشی آمار رسمی اتاق تهران ────────────────────────────────────── */

let tlsFetch: ((url: string, timeoutMs: number) => Promise<string>) | null = null;

/** fetch با tls شل فقط برای دامنهٔ اتاق تهران (زنجیرهٔ گواهی ناقص) */
async function insecureFetch(url: string, timeoutMs = 45000): Promise<string> {
  if (!tlsFetch) {
    try {
      // Bun هر دو زیرمجموعهٔ Node TLS و متغیر محیطی را پشتیبانی میکند؛
      // برای دامنهٔ خاص، child فرایند سبک Node با NODE_TLS_REJECT_UNAUTHORIZED=0 می‌سازیم
      const { execFile } = await import('child_process');
      tlsFetch = (target: string, timeout: number) =>
        new Promise((resolve, reject) => {
          const js = `process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';fetch(${JSON.stringify(target)},{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(${timeout})}).then(r=>r.text()).then(t=>console.log(t)).catch(e=>{console.error(e.message);process.exit(1)})`;
          execFile('node', ['-e', js], { timeout: timeout + 5000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err && !stdout) return reject(new Error(stderr || err.message));
            resolve(stdout || '');
          });
        });
    } catch {
      tlsFetch = null;
    }
  }
  if (tlsFetch) return tlsFetch(url, timeoutMs);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return await res.text();
}

const TCCIM_TPL = (year: number, flow: 'Import' | 'Export') =>
  `https://service.tccim.ir/stats?sYear=${year}&slcImpExp=${flow}&mode=doit`;

/** واکشی ردیف‌های جدول آمار (سال شمسی، جهت تجاری) — تحلیل HTML بدون کتابخانهٔ بیرونی */
async function fetchTccimStats(year: number): Promise<BorderFlowRecord[]> {
  const records: BorderFlowRecord[] = [];
  for (const flow of ['Export', 'Import'] as const) {
    let html = '';
    try {
      html = await insecureFetch(TCCIM_TPL(year, flow));
    } catch {
      continue; // دسترسی موقتاً ناموفق؛ منبع خبری جریان را پوشش می‌دهد
    }
    if (!html) continue;
    const rows = parseTccimHtml(html, year, flow);
    records.push(...rows);
  }
  return records;
}

/** پارس جدول HTML: ردیف‌ها شامل ماه/گمرک/کشور/HS/وزن/ارزش */
function parseTccimHtml(html: string, year: number, flow: 'Import' | 'Export'): BorderFlowRecord[] {
  const out: BorderFlowRecord[] = [];
  // هر ردیف در یک <tr> با سلول‌های متوالی؛ عدد HS شش‌رقمی
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html)) !== null) {
    const cells: string[] = [];
    let t: RegExpExecArray | null;
    const tdRe2 = new RegExp(tdRe.source, 'g');
    while ((t = tdRe2.exec(m[1])) !== null) {
      cells.push(t[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    }
    if (cells.length < 7) continue;
    const hsMatch = cells.find((c) => /^\d{8,10}$/.test(c.replace(/\D/g, '').slice(0, 10)) && c.length >= 8);
    const weightKg = toNumberFa(cells[4] ?? '');
    const rial = toNumberFa(cells[5] ?? '');
    const usd = toNumberFa(cells[6] ?? '');
    if (!hsMatch || weightKg <= 0) continue;
    const hs6 = hsMatch.replace(/\D/g, '').slice(0, 6);
    const gateName = cells[2] ?? '';
    const country = cells[3] ?? '';
    const month = cells[1] ?? '';
    out.push({
      id: `tccim-${year}-${flow}-${hs6}-${gateName}-${country}-${month}`,
      gateId: -1, // پس از نگاشت پر می‌شود
      gateName,
      date: `${year}-${month || '01'}`,
      direction: flow === 'Export' ? 'export' : 'import',
      tonnage: weightKg / 1000,
      valueUsd: usd > 0 ? usd : undefined,
      hs2: hs6.slice(0, 2),
      hs6,
      partnerCountry: country || undefined,
      source: 'tccim',
      confidence: confidenceFor('tccim'),
      collectedAt: new Date().toISOString(),
    });
  }
  return out;
}

function toNumberFa(value: string): number {
  const fa = value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const num = Number(fa.replace(/[,\s]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

/* ── ۲) آیندگان خبری مرزهای پرترافیک ─────────────────────────────────── */

export interface NewsWalkerOptions {
  exaKey?: string;
  aiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
  days?: number;
}

/** استخراج ساختاریافته از متن خبر با مدل زبانی سازمانی — متن کامل صفحه هم بررسی می‌شود */
async function extractStructuredNews(
  title: string,
  snippet: string,
  articleText: string,
  opts: NewsWalkerOptions
): Promise<{ trucks?: number; tonnage?: number; direction?: BorderFlowRecord['direction'] } | null> {
  if (!opts.aiKey) return null;
  const body = [title ? `عنوان: ${title}` : '', snippet ? `چکیده: ${snippet.slice(0, 500)}` : '', articleText ? `متن صفحه: ${articleText.slice(0, 2200)}` : '']
    .filter(Boolean)
    .join('\n');
  if (!body.trim()) return null;
  try {
    const base = (opts.aiBaseUrl || 'https://vyceai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.aiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.aiModel || 'gpt-6-luna',
        temperature: 0,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'از متن خبری دربارهٔ گذرگاه مرزی فقط اعداد ساختاریافته استخراج کن. اعداد فارسی (مثل ۱۸۶۳ یا ۱٬۱۲۴) را به عدد لاتین تبدیل کن. اگر چند عدد بود، بزرگترین تعداد کامیون را بده. خروجی را فقط JSON بده: {"trucks": number|null, "tonnage": number|null, "direction": "import"|"export"|"transit-in"|"transit-out"|null}. اگر عددی دربارهٔ تردد/صف/ورود/خروج کامیون در متن نیست، null بگذار. هیچ توضیحی ننویس.',
          },
          { role: 'user', content: body },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      if (process.env.BORDER_FLOW_DEBUG === '1') console.log(`[border-flow] ai http ${res.status}`);
      return null;
    }
    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (process.env.BORDER_FLOW_DEBUG === '1') {
      console.log(`[border-flow] ai raw=${String(content).slice(0, 120).replace(/\n/g, ' ')} | ${title.slice(0, 40)}`);
    }
    if (typeof content !== 'string') return null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
    const trucks = typeof parsed.trucks === 'number' && parsed.trucks > 0 ? parsed.trucks : undefined;
    const tonnage = typeof parsed.tonnage === 'number' && parsed.tonnage > 0 ? parsed.tonnage : undefined;
    return { trucks, tonnage, direction: typeof parsed.direction === 'string' ? parsed.direction : undefined };
  } catch {
    return null;
  }
}

/** جستجوی معنایی وب (Exa) برای یک گذرگاه — با متن کامل صفحه برای استخراج بهتر */
async function searchExaNews(
  query: string,
  exaKey: string,
  count: number
): Promise<{ title: string; url: string; snippet: string; articleText: string }[]> {
  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'x-api-key': exaKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        numResults: count,
        useAutoprompt: true,
        type: 'neural',
        category: 'news',
        contents: { text: { maxCharacters: 3000 } }, // متن کامل صفحه برای استخراج اعداد
        startPublishedDate: new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const results: any[] = data?.results || [];
    if (process.env.BORDER_FLOW_DEBUG === '1') {
      console.log(`[border-flow] exa results=${results.length} withText=${results.filter((r: any) => r.text).length}`);
    }
    return results.map((r: any) => {
      const full = String(r.text || '').replace(/\s+/g, ' ');
      return {
        title: r.title || '',
        url: r.url || '',
        snippet: (r.summary || full).slice(0, 600),
        articleText: full.slice(0, 3000),
      };
    });
  } catch {
    return [];
  }
}

/** آیندگان خبری مرزهای پرترافیک + استخراج ساختاریافتهٔ مدل زبانی — موازی برای پاسخ سریع */
export async function walkBorderNews(opts: NewsWalkerOptions): Promise<BorderFlowRecord[]> {
  if (!opts.exaKey) return [];

  // برای جلوگیری از محدودیت نرخ مدل زبانی: استخراج ترتیبی با وقفه، فقط نتیجهٔ اول هر مرز
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const perGate = async (gate: (typeof TOP_TRAFFIC_GATES)[number]): Promise<BorderFlowRecord[]> => {
    const results = await searchExaNews(
      `تردد کامیون و وضعیت صف مرز ${gate.name} ${gate.neighbor} صادرات واردات ترانزیت`,
      opts.exaKey!,
      2
    );
    const extracted: BorderFlowRecord[] = [];
    for (const r of results) {
      await sleep(2500); // وقفهٔ بلندتر برای احترام به محدودیت نرخ مدل زبانی
      const structured = await extractStructuredNews(r.title, r.snippet, r.articleText, opts);
      extracted.push({
        id: `news-${gate.id}-${hashUrl(r.url)}`,
        gateId: gate.id,
        gateName: gate.name,
        date: new Date().toISOString().slice(0, 10),
        direction: structured?.direction ?? 'flow',
        trucks: structured?.trucks,
        tonnage: structured?.tonnage,
        source: 'news',
        sourceUrl: r.url,
        title: r.title,
        snippet: r.snippet.slice(0, 260),
        confidence: confidenceFor('news'),
        collectedAt: new Date().toISOString(),
      });
    }
    return extracted;
  };

  // مرزها به‌صورت موازی ولی استخراج هر مرز ترتیبی (کنترل نرخ مدل زبانی)
  const all = await Promise.all(TOP_TRAFFIC_GATES.map(perGate));
  return all.flat().filter((r) => !isOutlierDaily(r.trucks ?? 0));
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/* ── API اصلی ماژول ────────────────────────────────────────────────────── */

export async function collectBorderFlow(opts: NewsWalkerOptions): Promise<{
  official: BorderFlowRecord[];
  news: BorderFlowRecord[];
  officialAvailable: boolean;
}> {
  const [official, news] = await Promise.all([
    fetchTccimStats(new Date().getFullYear() - 626).catch(() => [] as BorderFlowRecord[]),
    walkBorderNews(opts),
  ]);
  return { official, news, officialAvailable: official.length > 0 };
}
