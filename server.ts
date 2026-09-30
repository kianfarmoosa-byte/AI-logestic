import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

/* ------------------------------------------------------------------ *
 * دستیار هوش مصنوعی (درگاه مدل زبانی سازمانی)
 * ------------------------------------------------------------------ */

const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://vyceai.com/v1').replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || 'gpt-6-luna';

const MISSING_KEY_MESSAGE =
  'کلید AI_API_KEY روی سرور تنظیم نشده است. آن را در بخش تنظیمات › Environment (Keys) وارد کنید تا استعلام‌های هوشمند فعال شوند. سایر بخش‌ها (نقشه منبع‌باز، مسیریابی، داده‌های زنده جوی و ارزی) بدون کلید کار می‌کنند.';

function hasAiKey(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

/** فراخوانی مدل زبانی از طریق درگاه chat-completions */
async function aiChat(params: {
  user: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error(MISSING_KEY_MESSAGE);

  const messages: { role: string; content: string }[] = [];
  if (params.system) messages.push({ role: 'system', content: params.system });
  messages.push({ role: 'user', content: params.user });

  const data = await httpJson(
    `${AI_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 1400,
      }),
    },
    params.timeoutMs ?? 60000
  );

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  throw new Error('مدل زبانی پاسخی بازنگرداند');
}

const TRANSIT_SYSTEM_PROMPT = `شما دستیار ارشد هوشمند «اطلس شبکه جاده‌ای، گذرگاه‌های مرزی و ترانزیت ایران و اوراسیا» هستید.
وظیفه شما ارائهٔ تازه‌ترین، دقیق‌ترین و معتبرترین اطلاعات میدانی، اخبار تجاری، وضعیت صف کامیون‌ها، ساعات کار گمرکات، محدودیت‌های ترافیکی یا فصلی، مقررات کارنه تیر (TIR)، و شرایط واردات/صادرات است.
پاسخ را به زبان فارسی روان، ساختاریافته و با قالب‌بندی منظم شامل نکات کلیدی، وضعیت عملیاتی، و توصیه‌های ترانزیتی بنویسید.
هرگاه متن نتایج جستجوی وب در اختیار شما قرار گرفت، فقط بر پایهٔ همان منابع و دانش پایدار خود پاسخ دهید و هیچ آدرس یا آماری از خود نسازید.`;

// API: استعلام هوشمند وب (مدل زبانی + نتایج واقعی جستجو)
app.post('/api/search-grounding', async (req, res) => {
  try {
    const { query, crossingName, country, category } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    if (!hasAiKey()) {
      return res.status(503).json({ error: MISSING_KEY_MESSAGE });
    }

    // نتایج واقعی وب به‌عنوان زمینهٔ استعلام (زنجیرهٔ جستجوی سامانه، بدون سرویس هوش مصنوعی بیرونی)
    const webResults = await webSearchChain(`${query} ${crossingName || ''} ${country || ''}`.trim(), 6);
    const context = webResults
      .map(
        (item, index) =>
          `[${index + 1}] ${item.title}\nمنبع: ${item.url}\n${(item.snippet || '').slice(0, 400)}`
      )
      .join('\n\n');

    // دادهٔ زندهٔ سامانهٔ نوبتدهی Border Park (اگر مرز پرسششده در سامانه باشد)
    let liveContext = '';
    try {
      const snapshots = await ensureBorderPark();
      const normalizedQuery = query.replace(/\s+/g, '');
      const match = snapshots.find(
        (s) => s.confidence !== 'low' && (crossingName?.includes(s.gateNameFa) || normalizedQuery.includes(s.gateNameFa))
      );
      if (match) {
        liveContext = `\n\nوضعیت زندهٔ سامانهٔ نوبتدهی رسمی گمرک (دادهٔ ساختاریافتهٔ دقیق، بهروزرسانی ${match.sourceUpdatedAt ?? 'نامشخص'}):\n${snapshotToAiContext(match)}\nاین دادهٔ رسمی را بر اخبار عمومی ترجیح بده.`;
      }
    } catch {
      // بدون دادهٔ زنده، استعلام با نتایج وب ادامه مییابد
    }

    const prompt = `موضوع استعلام ترانزیتی و مرزی:
${query}
${crossingName ? `نام گذرگاه مرزی: ${crossingName}` : ''}
${country ? `کشور هدف: ${country}` : ''}
${category ? `دسته‌بندی موضوعی: ${category}` : ''}

لطفاً بر اساس تازه‌ترین اطلاعات:
۱. آخرین وضعیت عملیاتی، تردد کامیون‌ها، صف انتظار یا محدودیت‌های اعمال‌شده را گزارش کنید.
۲. نکات گمرکی، مدارک ترخیص یا توافقات دوجانبه اخیر را بررسی کنید.
۳. توصیه‌های عملیاتی برای رانندگان، شرکت‌های کریری و بازرگانان ارائه دهید.${context ? `\n\nنتایج زندهٔ جستجوی وب (فقط به این منابع استناد کنید):\n${context}` : '\n\n(نتیجهٔ جستجوی وب در دسترس نبود؛ بر پایهٔ دانش پایدار پاسخ دهید و این محدودیت را ذکر کنید.)'}${liveContext}`;

    const text = await aiChat({ system: TRANSIT_SYSTEM_PROMPT, user: prompt, maxTokens: 1600 });

    return res.json({
      success: true,
      text,
      sources: webResults.map((item) => ({ uri: item.url, title: item.title })),
      searchQueries: [query],
    });
  } catch (error: any) {
    console.error('Error in search grounding:', error);
    return res.status(500).json({
      error: 'خطا در تولید پاسخ استعلام هوشمند',
      details: error.message || String(error),
    });
  }
});

// API: شناسایی اماکن لجستیکی پیرامون یک مکان (مدل زبانی + نتایج واقعی وب)
app.post('/api/maps-grounding', async (req, res) => {
  try {
    const { query, latitude, longitude, radiusKm } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    if (!hasAiKey()) {
      return res.status(503).json({ error: MISSING_KEY_MESSAGE });
    }

    const systemInstruction = `شما کارشناس لجستیک و مکان‌یابی مکانی «اطلس گذرگاه‌های مرزی و ترانزیتی» هستید.
اطلاعات پارکینگ‌های تیر (TIR Park)، تیرپارک‌ها، پایانه‌های مرزی، گمرکات، انبارهای سرپوشیده و سردخانه‌ها، آزمایشگاه‌های قرنطینه، پمپ‌بنزین‌ها و مراکز خدمات رفاهی رانندگان بین‌المللی را به دقت استخراج و معرفی کنید.
پاسخ باید ساختارمند به زبان فارسی باشد و هر مکان را با نشانی یا نشانهٔ دقیق معرفی کنید. از ساختن نشانی یا نام مکان خودداری کنید.`;

    const locationHint =
      typeof latitude === 'number' && typeof longitude === 'number'
        ? `مختصات مرکز جستجو: عرض ${latitude}، طول ${longitude}${radiusKm ? `، شعاع ${radiusKm} کیلومتر` : ''}`
        : '';

    const webResults = await webSearchChain(`${query} ${locationHint}`.trim(), 6);
    const context = webResults
      .map((item, index) => `[${index + 1}] ${item.title}\nمنبع: ${item.url}\n${(item.snippet || '').slice(0, 400)}`)
      .join('\n\n');

    const userPrompt = `${query}\n${locationHint}\n\nلطفاً اماکن و تأسیسات لجستیکی مرتبط را فهرست کنید.${
      context ? `\n\nنتایج زندهٔ وب برای استناد:\n${context}` : '\n\n(نتیجهٔ جستجوی وب در دسترس نبود؛ فقط بر پایهٔ دانش پایدار پاسخ دهید.)'
    }`;

    const text = await aiChat({ system: systemInstruction, user: userPrompt, maxTokens: 1400 });

    // نشانی‌های مرتبط از همان نتایج جستجو (بدون سرویس نقشهٔ بیرونی)
    const uniquePlaces = Array.from(
      new Map(
        webResults.map((item) => [
          item.url,
          { uri: item.url, title: item.title, reviewSnippets: item.snippet ? [item.snippet.slice(0, 180)] : [] },
        ])
      ).values()
    );

    return res.json({
      success: true,
      text,
      places: uniquePlaces,
    });
  } catch (error: any) {
    console.error('Error in maps grounding:', error);
    return res.status(500).json({
      error: 'خطا در تولید فهرست اماکن و تأسیسات',
      details: error.message || String(error),
    });
  }
});

// API: مشاور راهبردی کریدور (مدل زبانی + نتایج واقعی وب)
app.post('/api/corridor-ai-advisor', async (req, res) => {
  try {
    const { origin, destination, cargoType, weightTons, selectedMode, customNotes } = req.body;

    if (!hasAiKey()) {
      return res.status(503).json({ error: MISSING_KEY_MESSAGE });
    }

    const prompt = `لطفاً تحلیل راهبردی و بهینه‌سازی زنجیره حمل کالا در مسیر زیر را با استعلام برخط شرایط واقعی مسیر ارائه دهید:
- مبدأ: ${origin || 'مشخص نشده'}
- مقصد: ${destination || 'مشخص نشده'}
- نوع محموله: ${cargoType || 'کالای عمومی'}
- تناژ / حجم: ${weightTons ? `${weightTons} تن` : 'استاندارد کانتینری'}
- شیوه حمل پیشنهادی: ${selectedMode || 'چندوجهی ترکیبی'}
${customNotes ? `- ملاحظات خاص: ${customNotes}` : ''}

لطفاً بررسی کنید:
۱. کوتاه‌ترین و اقتصادی‌ترین مسیر ترکیبی (جاده/ریل/دریا)
۲. گذرگاه‌های مرزی اصلی در مسیر و زمان تخمینی توقف گمرکی
۳. چالش‌های تحریمی، ریسک‌های بیمه‌ای و شرایط امنیتی کنونی
۴. اسناد مورد نیاز شامل TIR، CMR، B/L، گواهی مبدأ و استانداردها`;

    const webResults = await webSearchChain(`${origin || ''} ${destination || ''} ترانزیت کریدور مرزی گمرک`, 6);
    const context = webResults
      .map((item, index) => `[${index + 1}] ${item.title}\nمنبع: ${item.url}\n${(item.snippet || '').slice(0, 400)}`)
      .join('\n\n');

    const text = await aiChat({
      system: TRANSIT_SYSTEM_PROMPT,
      user: `${prompt}${context ? `\n\nنتایج زندهٔ وب برای استناد:\n${context}` : ''}`,
      maxTokens: 1800,
    });

    return res.json({
      success: true,
      text,
      sources: webResults.map((item) => ({ uri: item.url, title: item.title })),
    });
  } catch (error: any) {
    console.error('Error in corridor advisor:', error);
    return res.status(500).json({
      error: 'خطا در تولید تحلیل راهبردی کریدور',
      details: error.message || String(error),
    });
  }
});

/* ------------------------------------------------------------------ *
 * جستجوی واقعی وب (بدون هیچ سرویس جستجوی برند‌دار)
 *  ۱) Exa — جستجوی معنایی وب (EXA_API_KEY)
 *  ۲) ویکی‌پدیای فارسی — جایگزین بدون کلید تا سامانه هرگز بی‌پاسخ نماند
 * ------------------------------------------------------------------ */

const MISSING_EXA_MESSAGE =
  'کلید EXA_API_KEY تنظیم نشده است. برای فعال‌سازی جستجوی معنایی وب، کلید Exa را در بخش تنظیمات › Environment (Keys) وارد کنید.';

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  provider: string;
  publishedAt?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function stripHtml(value: string): string {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

async function searchWithExa(query: string, count: number): Promise<WebSearchResult[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error(MISSING_EXA_MESSAGE);

  const data = await httpJson(
    'https://api.exa.ai/search',
    {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        numResults: Math.min(10, Math.max(3, count)),
        type: 'auto',
        contents: { text: { maxCharacters: 700 } },
      }),
    },
    20000
  );

  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  return results.map((item: any) => ({
    title: item.title || hostOf(item.url || ''),
    url: item.url || '',
    snippet: String(item.text || item.summary || '').replace(/\s+/g, ' ').slice(0, 500),
    source: hostOf(item.url || ''),
    provider: 'exa',
    publishedAt: item.publishedDate || undefined,
  }));
}

/** زنجیرهٔ جستجوی وب سامانه: Exa و سپس ویکی‌پدیای فارسی */
async function webSearchChain(query: string, count = 6): Promise<WebSearchResult[]> {
  const clean = String(query || '').trim();
  if (!clean) return [];

  if (process.env.EXA_API_KEY) {
    try {
      const results = await searchWithExa(clean, count);
      if (results.length > 0) return results;
    } catch {
      // حلقهٔ بعدی زنجیره
    }
  }

  try {
    return await searchWithWikipedia(clean, count);
  } catch {
    return [];
  }
}

async function searchWithWikipedia(query: string, count: number): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(Math.min(10, Math.max(3, count))),
    format: 'json',
    origin: '*',
  });
  const data = await httpJson(`https://fa.wikipedia.org/w/api.php?${params.toString()}`, {}, 12000);
  const items: any[] = data?.query?.search || [];

  return items.map((item: any) => ({
    title: item.title,
    url: `https://fa.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
    snippet: stripHtml(item.snippet || ''),
    source: 'fa.wikipedia.org',
    provider: 'wikipedia',
  }));
}

// API: وضعیت موتورهای جستجوی وب
app.get('/api/web-search/status', (_req, res) => {
  return res.json({
    exa: {
      available: Boolean(process.env.EXA_API_KEY),
      label: 'جستجوی معنایی وب (Exa)',
      missing: process.env.EXA_API_KEY ? [] : ['EXA_API_KEY'],
    },
    wikipedia: { available: true, label: 'ویکی‌پدیای فارسی (بدون کلید)', missing: [] },
    ai: {
      available: hasAiKey(),
      label: 'دستیار هوشمند ترانزیتی (مدل زبانی سازمانی)',
      missing: hasAiKey() ? [] : ['AI_API_KEY'],
    },
  });
});

// API: جستجوی واقعی وب با زنجیرهٔ جایگزین
app.post('/api/web-search', async (req, res) => {
  try {
    const { query, mode, num } = req.body || {};

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'عبارت جستجو ارسال نشده است.' });
    }

    const cleanQuery = query.trim();
    const count = Math.min(10, Math.max(3, Number(num) || 8));
    const notes: string[] = [];

    // حالت خبری: عبارت با کلیدواژه‌های به‌روز تقویت می‌شود
    const effectiveQuery = mode === 'news' ? `${cleanQuery} آخرین اخبار` : cleanQuery;

    try {
      const results = await searchWithExa(effectiveQuery, count);
      if (results.length > 0) {
        return res.json({
          success: true,
          provider: 'exa',
          providerLabel: 'جستجوی معنایی وب (Exa)',
          query: cleanQuery,
          results,
          notes,
        });
      }
      notes.push('موتور جستجوی معنایی نتیجه‌ای بازنگرداند.');
    } catch (error: any) {
      notes.push(`جستجوی معنایی: ${error?.message || String(error)}`);
    }

    try {
      const results = await searchWithWikipedia(cleanQuery, count);
      if (results.length > 0) {
        return res.json({
          success: true,
          provider: 'wikipedia',
          providerLabel: 'ویکی‌پدیای فارسی (بدون کلید)',
          query: cleanQuery,
          results,
          notes: [...notes, 'هیچ کلید جستجویی تنظیم نشده بود؛ نتایج دانش‌نامهٔ ویکی‌پدیا نمایش داده می‌شود.'],
        });
      }
      notes.push('ویکی‌پدیا نتیجه‌ای بازنگرداند.');
    } catch (error: any) {
      notes.push(`ویکی‌پدیا: ${error?.message || String(error)}`);
    }

    return res.status(502).json({
      error: 'جستجوی وب در حال حاضر ممکن نیست. اتصال شبکه یا کلیدهای جستجو را بررسی کنید.',
      details: notes.join(' | '),
      notes,
    });
  } catch (error: any) {
    console.error('Error in web search:', error);
    return res.status(500).json({
      error: 'خطا در جستجوی وب',
      details: error.message || String(error),
    });
  }
});

/* ------------------------------------------------------------------ *
 * مسیریابی و حمل‌ونقل
 *  - OSRM      : بدون کلید (نمونهٔ عمومی پروژهٔ OSRM)
 *  - Valhalla  : نمونهٔ عمومی OSM یا نمونهٔ خودمیزبان از طریق VALHALLA_URL
 *  - ORS       : نیازمند ORS_API_KEY (پروفایل کامیون + ایزوکرون سازمانی)
 * ------------------------------------------------------------------ */

const OSRM_BASE = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const VALHALLA_BASE = (process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de').replace(/\/$/, '');
const ORS_BASE = 'https://api.openrouteservice.org';

const MISSING_ORS_KEY_MESSAGE =
  'کلید ORS_API_KEY روی سرور تنظیم نشده است. برای فعال‌سازی پروفایل کامیون سازمانی و ایزوکرون OpenRouteService آن را در بخش تنظیمات › Environment (Keys) وارد کنید. مسیریابی OSRM و Valhalla بدون هیچ کلیدی کار می‌کند.';

const OSRM_PROFILE: Record<string, string> = {
  car: 'driving',
  bus: 'driving',
  truck: 'driving',
  truck_adr: 'driving',
  pedestrian: 'foot',
};

const VALHALLA_COSTING: Record<string, string> = {
  car: 'auto',
  bus: 'bus',
  truck: 'truck',
  truck_adr: 'truck',
  pedestrian: 'pedestrian',
};

const ORS_PROFILE: Record<string, string> = {
  car: 'driving-car',
  bus: 'driving-hgv',
  truck: 'driving-hgv',
  truck_adr: 'driving-hgv',
  pedestrian: 'foot-walking',
};

function hasOrsKey(): boolean {
  return Boolean(process.env.ORS_API_KEY);
}

/* ------------------------------------------------------------------ *
 * منابع تحلیلی بدون کلید: آب‌وهوا (Open-Meteo) و هندسهٔ استان‌ها (geoBoundaries)
 * ------------------------------------------------------------------ */

/** کد آب‌وهوایی WMO به توضیح فارسی */
const WMO_CODES_FA: Record<number, string> = {
  0: 'صاف', 1: 'عمدتاً صاف', 2: 'نیمه‌ابری', 3: 'ابری', 45: 'مه', 48: 'مه یخ‌زده',
  51: 'نم‌نم خفیف', 53: 'نم‌نم', 55: 'نم‌نم شدید', 61: 'باران خفیف', 63: 'باران', 65: 'باران شدید',
  66: 'باران یخ‌زده', 67: 'باران یخ‌زده شدید', 71: 'برف خفیف', 73: 'برف', 75: 'برف سنگین',
  77: 'دانه‌های برف', 80: 'رگبار خفیف', 81: 'رگبار', 82: 'رگبار شدید', 85: 'رگبار برف', 86: 'رگبار برف سنگین',
  95: 'رعدوبرق', 96: 'رعدوبرق با تگرگ', 99: 'رعدوبرق با تگرگ شدید',
};

interface WeatherCacheEntry { at: number; payload: any }
const weatherCache = new Map<string, WeatherCacheEntry>();
const WEATHER_TTL_MS = 20 * 60 * 1000; // ۲۰ دقیقه — سرویس بدون کلید و کش کوتاه

app.get('/api/weather', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'مختصات معتبر lat و lng ارسال نشده است.' });
    }

    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const cached = weatherCache.get(key);
    if (cached && Date.now() - cached.at < WEATHER_TTL_MS) {
      return res.json({ ...cached.payload, cached: true });
    }

    const data = await httpJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
        '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m' +
        '&forecast_days=1&timezone=auto',
      {},
      12000
    );

    const cur = data?.current || {};
    const code = Number(cur.weather_code ?? -1);
    const payload = {
      lat: data?.latitude ?? lat,
      lng: data?.longitude ?? lng,
      timezone: data?.timezone || 'auto',
      time: cur.time || null,
      temperatureC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
      humidityPct: typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null,
      precipitationMm: typeof cur.precipitation === 'number' ? cur.precipitation : null,
      windSpeedKmh: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null,
      windGustKmh: typeof cur.wind_gusts_10m === 'number' ? cur.wind_gusts_10m : null,
      weatherCode: Number.isFinite(code) && code >= 0 ? code : null,
      conditionFa: WMO_CODES_FA[code] || 'نامشخص',
      source: 'Open-Meteo (بدون کلید)',
      fetchedAt: new Date().toISOString(),
    };

    if (weatherCache.size >= 200) weatherCache.clear();
    weatherCache.set(key, { at: Date.now(), payload });
    return res.json(payload);
  } catch (error: any) {
    console.error('Error in weather:', error);
    return res.status(502).json({
      error: 'دریافت وضعیت هوا ممکن نشد',
      details: error.message || String(error),
    });
  }
});

/*
 * هندسهٔ استان‌های ایران (ADM1) به‌عنوان پروکسی سرور — geoBoundaries gbOpen (ODbL).
 * فایل کامل حدود ۱۵ مگابایت است؛ نسخهٔ ساده‌شده برای نقشهٔ وب کافی است و پاسخ
 * در حافظه نهان (۲۴ ساعت) نگه داشته می‌شود تا فشار روی منبع آزاد نیفتد.
 */
const PROVINCE_GEOJSON_URLS = [
  'https://raw.githubusercontent.com/wmgeolab/geoBoundaries/main/releaseData/gbOpen/IRN/ADM1/geoBoundaries-IRN-ADM1_simplified.geojson',
  'https://www.geoboundaries.org/api/current/gbOpen/IRN/ADM1/',
];
let provinceCache: { at: number; geojson: any } | null = null;
const PROVINCE_TTL_MS = 24 * 60 * 60 * 1000; // ۲۴ ساعت

async function fetchProvincesGeoJSON(): Promise<any> {
  if (provinceCache && Date.now() - provinceCache.at < PROVINCE_TTL_MS) return provinceCache.geojson;

  const candidates: string[] = [
    PROVINCE_GEOJSON_URLS[0],
    // تلاش دوم: حل مستقیم API رسمی geoBoundaries به نشانی دانلود جاری
  ];

  try {
    const api = await httpJson(PROVINCE_GEOJSON_URLS[1], {}, 15000);
    if (api?.simplifiedGeometryGeoJSONURL) candidates.push(api.simplifiedGeometryGeoJSONURL);
    if (api?.gjDownloadURL) candidates.push(api.gjDownloadURL);
  } catch {
    // API رسمی در دسترس نبود؛ به نشانی‌های شناخته‌شده بسنده می‌کنیم
  }

  let lastError: unknown = null;
  for (const url of candidates) {
    try {
      const geojson = await httpJson(url, {}, 45000);
      if (geojson?.type === 'FeatureCollection' && Array.isArray(geojson?.features) && geojson.features.length > 0) {
        // سبک‌سازی ویژگی‌ها: فقط نام استان و رنگ ثابت برای کوروپلت سمت کلاینت
        const slim = {
          type: 'FeatureCollection',
          features: geojson.features.map((f: any) => ({
            type: 'Feature',
            geometry: f.geometry,
            properties: {
              name: f.properties?.shapeName || f.properties?.name || 'استان',
              shapeISO: f.properties?.shapeISO || '',
            },
          })),
        };
        provinceCache = { at: Date.now(), geojson: slim };
        return slim;
      }
      lastError = new Error('پاسخ، FeatureCollection معتبر نبود');
    } catch (error: any) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('هیچ منبعی از هندسهٔ استان‌ها پاسخ نداد');
}

app.get('/api/provinces', async (_req, res) => {
  try {
    const geojson = await fetchProvincesGeoJSON();
    return res.json({ success: true, source: 'geoBoundaries gbOpen IRN ADM1 (ODbL)', count: geojson.features.length, geojson });
  } catch (error: any) {
    console.error('Error in provinces:', error);
    return res.status(502).json({
      error: 'دریافت هندسهٔ استان‌ها ممکن نشد',
      details: error.message || String(error),
    });
  }
});

async function httpJson(url: string, init: RequestInit = {}, timeoutMs = 18000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const raw = data?.error?.message || data?.error || data?.message || `پاسخ ناموفق سرویس مسیریابی (${res.status})`;
      throw new Error(typeof raw === 'string' ? raw : JSON.stringify(raw));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** رمزگشایی شکل مسیر کدشده (polyline) — Valhalla با دقت ۶ رقم اعشار */
function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const coordinates: [number, number][] = [];
  const factor = Math.pow(10, precision);
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

function buildRestrictions(constraints: any): Record<string, number | boolean> {
  const c = constraints || {};
  const rest: Record<string, number | boolean> = {};
  if (Number(c.heightM) > 0) rest.height = Number(c.heightM);
  if (Number(c.widthM) > 0) rest.width = Number(c.widthM);
  if (Number(c.lengthM) > 0) rest.length = Number(c.lengthM);
  if (Number(c.weightTons) > 0) rest.weight = Number(c.weightTons);
  if (Number(c.axleLoadTons) > 0) rest.axle_load = Number(c.axleLoadTons);
  if (c.hazmat) rest.hazmat = true;
  return rest;
}

interface PlanTarget {
  lat: number;
  lng: number;
}

interface PlanRequest {
  origin: PlanTarget;
  destination: PlanTarget;
  profile: string;
  provider: string;
  constraints: any;
  alternatives: boolean;
}

async function planWithOsrm(req: PlanRequest): Promise<any> {
  const notes: string[] = [];
  const profilesToTry = [OSRM_PROFILE[req.profile] || 'driving'];
  if (profilesToTry[0] !== 'driving') profilesToTry.push('driving');

  let lastError: unknown = null;

  for (let i = 0; i < profilesToTry.length; i += 1) {
    const engineProfile = profilesToTry[i];
    const url =
      `${OSRM_BASE}/route/v1/${engineProfile}/${req.origin.lng},${req.origin.lat};${req.destination.lng},${req.destination.lat}` +
      `?overview=full&geometries=geojson&steps=false&alternatives=${req.alternatives ? 3 : 'false'}`;

    try {
      const data = await httpJson(url);
      if (data?.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
        throw new Error(data?.message || 'پاسخی از OSRM دریافت نشد');
      }

      if (i > 0) {
        notes.push('پروفایل پیادهٔ OSRM در دسترس نبود؛ مسیر با پروفایل خودرو محاسبه و زمان پیاده‌روی برآورد شد.');
      }

      const alternatives = data.routes.slice(0, 3).map((route: any, idx: number) => ({
        id: `osrm-${idx + 1}`,
        label: idx === 0 ? 'سریع‌ترین مسیر OSRM' : `مسیر جایگزین ${idx + 1} (OSRM)`,
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
        durationHours: Math.round((route.duration / 3600) * 100) / 100,
        geometry: (route.geometry?.coordinates || []) as [number, number][],
        kind: 'road',
      }));

      return {
        provider: 'osrm',
        providerLabel: 'OSRM (بدون کلید)',
        costing: engineProfile === 'foot' ? 'پیاده' : 'خودرویی',
        alternatives,
        notes,
        degraded: i > 0,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('خطای نامشخص در OSRM');
}

async function planWithValhalla(req: PlanRequest): Promise<any> {
  const costing = VALHALLA_COSTING[req.profile] || 'auto';
  const restrictions = buildRestrictions(req.constraints);
  const body: any = {
    locations: [
      { lat: req.origin.lat, lon: req.origin.lng },
      { lat: req.destination.lat, lon: req.destination.lng },
    ],
    costing,
    directions_options: { units: 'kilometers' },
  };
  if (req.alternatives) body.alternates = 2;
  if (costing === 'truck' && Object.keys(restrictions).length > 0) {
    body.costing_options = { truck: restrictions };
  }

  const data = await httpJson(`${VALHALLA_BASE}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const trips: any[] = [];
  if (data?.trip) trips.push(data.trip);
  if (Array.isArray(data?.alternates)) data.alternates.forEach((alt: any) => alt?.trip && trips.push(alt.trip));
  if (trips.length === 0) throw new Error('Valhalla مسیری بازنگرداند');

  const notes: string[] = [];
  if (costing === 'truck' && Object.keys(restrictions).length > 0) {
    notes.push('محدودیت‌های فیزیکی (ارتفاع، تناژ، عرض، بار محور و کالای خطرناک) مستقیماً روی گراف کامیون Valhalla اعمال شد.');
  }

  const alternatives = trips.map((trip: any, idx: number) => {
    const shape = (trip.legs || []).map((leg: any) => leg.shape).filter(Boolean).join('');
    const geometry = shape ? decodePolyline(shape, 6) : [];
    return {
      id: `valhalla-${idx + 1}`,
      label: idx === 0 ? 'مسیر بهینهٔ Valhalla' : `مسیر جایگزین ${idx + 1} (Valhalla)`,
      distanceKm: Math.round((trip.summary?.length || 0) * 10) / 10,
      durationHours: Math.round(((trip.summary?.time || 0) / 3600) * 100) / 100,
      geometry: geometry as [number, number][],
      kind: 'road',
    };
  });

  return {
    provider: 'valhalla',
    providerLabel: process.env.VALHALLA_URL ? 'Valhalla (خودمیزبان)' : 'Valhalla نمونهٔ عمومی OSM (بدون کلید)',
    costing,
    alternatives,
    notes,
    degraded: false,
  };
}

async function planWithOrs(req: PlanRequest): Promise<any> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) throw new Error(MISSING_ORS_KEY_MESSAGE);

  const orsProfile = ORS_PROFILE[req.profile] || 'driving-car';
  const restrictions = buildRestrictions(req.constraints);
  const notes: string[] = [];

  const baseBody: any = {
    coordinates: [
      [req.origin.lng, req.origin.lat],
      [req.destination.lng, req.destination.lat],
    ],
    instructions: false,
  };
  if (orsProfile === 'driving-hgv' && Object.keys(restrictions).length > 0) {
    baseBody.options = { profile_params: { restrictions } };
  }

  const call = async (withAlternatives: boolean) => {
    const payload = { ...baseBody };
    if (withAlternatives) payload.alternative_routes = { target_count: 3, weight_factor: 1.6, share_factor: 0.6 };
    return httpJson(`${ORS_BASE}/v2/directions/${orsProfile}/geojson`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  };

  let data: any;
  try {
    data = await call(req.alternatives);
  } catch (error) {
    if (!req.alternatives) throw error;
    notes.push('سرویس ORS مسیر جایگزین را برنگرداند؛ مسیر بهینهٔ اصلی ارائه شد.');
    data = await call(false);
  }

  const features: any[] = Array.isArray(data?.features) ? data.features : [];
  if (features.length === 0) throw new Error('ORS مسیری بازنگرداند');

  if (orsProfile === 'driving-hgv' && Object.keys(restrictions).length > 0) {
    notes.push('OpenRouteService با پروفایل HGV و اعمال محدودیت‌های فیزیکی مسیر را محاسبه کرد.');
  }

  const alternatives = features.slice(0, 3).map((feature: any, idx: number) => {
    const summary = feature.properties?.summary || {};
    return {
      id: `ors-${idx + 1}`,
      label: idx === 0 ? 'مسیر بهینهٔ ORS (HGV)' : `مسیر جایگزین ${idx + 1} (ORS)`,
      distanceKm: Math.round(((summary.distance || 0) / 1000) * 10) / 10,
      durationHours: Math.round(((summary.duration || 0) / 3600) * 100) / 100,
      geometry: (feature.geometry?.coordinates || []) as [number, number][],
      kind: 'road',
    };
  });

  return {
    provider: 'ors',
    providerLabel: 'OpenRouteService (کلید سازمانی)',
    costing: orsProfile,
    alternatives,
    notes,
    degraded: false,
  };
}

// API: وضعیت موتورهای مسیریابی
app.get('/api/route/status', async (_req, res) => {
  return res.json({
    osrm: { available: true, endpoint: OSRM_BASE, label: 'OSRM (بدون کلید)' },
    valhalla: {
      available: true,
      endpoint: VALHALLA_BASE,
      label: process.env.VALHALLA_URL ? 'Valhalla (خودمیزبان)' : 'Valhalla نمونهٔ عمومی OSM',
      selfHosted: Boolean(process.env.VALHALLA_URL),
    },
    ors: {
      available: hasOrsKey(),
      endpoint: ORS_BASE,
      label: 'OpenRouteService (HGV + ایزوکرون)',
      keyPresent: hasOrsKey(),
    },
  });
});

// API: برنامه‌ریزی مسیر واقعی جاده‌ای
app.post('/api/route/plan', async (req, res) => {
  try {
    const { origin, destination, profile, provider, constraints, alternatives } = req.body || {};

    if (!origin || !destination || typeof origin.lat !== 'number' || typeof destination.lat !== 'number') {
      return res.status(400).json({ error: 'مبدأ و مقصد معتبر ارسال نشده است.' });
    }

    const planRequest: PlanRequest = {
      origin,
      destination,
      profile: profile || 'truck',
      provider: provider || 'auto',
      constraints: constraints || {},
      alternatives: alternatives !== false,
    };

    const isTruck = planRequest.profile === 'truck' || planRequest.profile === 'truck_adr';
    const requested = planRequest.provider !== 'auto' ? [planRequest.provider] : [];
    const chain = requested.length
      ? requested
      : isTruck
        ? hasOrsKey()
          ? ['ors', 'valhalla', 'osrm']
          : ['valhalla', 'osrm']
        : ['osrm', 'valhalla'];

    const notes: string[] = [];
    const failures: string[] = [];

    for (const candidate of chain) {
      try {
        const result =
          candidate === 'osrm'
            ? await planWithOsrm(planRequest)
            : candidate === 'valhalla'
              ? await planWithValhalla(planRequest)
              : await planWithOrs(planRequest);

        if (result.alternatives.length === 0) throw new Error('هیچ مسیری بازنگرداند');

        return res.json({
          success: true,
          provider: result.provider,
          providerLabel: result.providerLabel,
          costing: result.costing,
          alternatives: result.alternatives,
          notes: [...notes, ...result.notes],
          degraded: result.degraded,
        });
      } catch (error: any) {
        failures.push(`${candidate}: ${error?.message || String(error)}`);
      }
    }

    return res.status(502).json({
      error: 'هیچ‌یک از موتورهای مسیریابی پاسخ معتبری ندادند. اتصال شبکه را بررسی کنید.',
      details: failures.join(' | '),
    });
  } catch (error: any) {
    console.error('Error in route planning:', error);
    return res.status(500).json({
      error: 'خطا در محاسبهٔ مسیر جاده‌ای',
      details: error.message || String(error),
    });
  }
});

/* موتور ایزوکرون ماتریسی OSRM
 * نمونهٔ عمومی Valhalla سقف ۶۰ دقیقه دارد، پس برای بازهٔ ۲ تا ۱۲ ساعت
 * محدودهٔ دسترسی با نمونه‌برداری شعاعی (۱۶ جهت × ۲ حلقه) و ماتریس زمان OSRM محاسبه می‌شود.
 */
const ISO_SPEED_KMH: Record<string, number> = {
  car: 80,
  bus: 64,
  truck: 58,
  truck_adr: 52,
  pedestrian: 5,
};

const ISOCOLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#a855f7'];

async function isochroneFromOsrmTable(center: PlanTarget, hours: number[], profile: string) {
  const speed = ISO_SPEED_KMH[profile] || 55;
  const directions = 16;
  const ringFractions = [0.7, 1];
  const cosLat = Math.cos((center.lat * Math.PI) / 180) || 0.7;
  const features: any[] = [];

  // ماتریس OSRM حداکثر با ۱۰۰ مختصات کار می‌کند؛ بازه‌ها دو‌تایی گروه‌بندی می‌شوند
  for (let start = 0; start < hours.length; start += 2) {
    const group = hours.slice(start, start + 2);
    const samples: { dir: number; band: number; ring: number; lat: number; lng: number }[] = [];
    const coords: string[] = [`${center.lng.toFixed(5)},${center.lat.toFixed(5)}`];
    const angles: number[] = [];

    for (let d = 0; d < directions; d += 1) {
      angles.push((2 * Math.PI * d) / directions);
    }

    group.forEach((h, band) => {
      const radius = h * speed;
      angles.forEach((angle, d) => {
        ringFractions.forEach((fraction, ring) => {
          const dist = radius * fraction;
          const lat = center.lat + (dist / 111) * Math.cos(angle);
          const lng = center.lng + (dist / (111.32 * cosLat)) * Math.sin(angle);
          samples.push({ dir: d, band, ring, lat, lng });
          coords.push(`${lng.toFixed(5)},${lat.toFixed(5)}`);
        });
      });
    });

    const data = await httpJson(
      `${OSRM_BASE}/table/v1/driving/${coords.join(';')}?sources=0&annotations=duration`,
      {},
      25000
    );
    const durations: (number | null)[] =
      (Array.isArray(data?.durations) && Array.isArray(data.durations[0]) ? data.durations[0] : []) as (number | null)[];
    if (data?.code !== 'Ok' || durations.length < samples.length + 1) {
      throw new Error(data?.message || 'ماتریس زمان OSRM پاسخی نداد');
    }

    const indexOf = (dir: number, band: number, ring: number) =>
      samples.findIndex((s) => s.dir === dir && s.band === band && s.ring === ring) + 1;

    group.forEach((h, band) => {
      const radius = h * speed;
      const limit = h * 3600;
      const ring: [number, number][] = [];

      angles.forEach((angle, d) => {
        const inner = durations[indexOf(d, band, 0)];
        const outer = durations[indexOf(d, band, 1)];
        let reach = 0;

        if (typeof outer === 'number' && outer <= limit) {
          reach = radius;
        } else if (typeof inner === 'number' && inner <= limit) {
          const outerTime = typeof outer === 'number' && outer > inner ? outer : limit * 1.6;
          const ratio = Math.min(1, Math.max(0, (limit - inner) / Math.max(1, outerTime - inner)));
          reach = radius * (0.7 + 0.3 * ratio);
        } else if (typeof inner === 'number' && inner > 0) {
          reach = radius * 0.7 * Math.min(0.95, Math.sqrt(limit / inner));
        } else {
          reach = radius * 0.15;
        }

        const lat = center.lat + (reach / 111) * Math.cos(angle);
        const lng = center.lng + (reach / (111.32 * cosLat)) * Math.sin(angle);
        ring.push([Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
      });

      ring.push(ring[0]);
      features.push({
        hours: h,
        color: ISOCOLORS[features.length % ISOCOLORS.length],
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    });
  }

  return features;
}

// API: ماتریس فاصلهٔ واقعی جاده‌ای (OSRM table) — برای «نزدیک‌ترین گذرگاه»
app.post('/api/route/distances', async (req, res) => {
  try {
    const { sources, targets, profile } = req.body || {};

    if (!Array.isArray(sources) || !Array.isArray(targets) || sources.length === 0 || targets.length === 0) {
      return res.status(400).json({ error: 'مبدأها و مقصدهای ماتریس فاصله ارسال نشده‌اند.' });
    }

    const isValid = (point: any) => point && typeof point.lat === 'number' && typeof point.lng === 'number';
    const originList = sources.filter(isValid).slice(0, 12);
    const targetList = targets.filter(isValid).slice(0, 100);

    // سقف ۱۰۰ مختصات در هر درخواست ماتریس سرویس عمومی OSRM
    while (originList.length + targetList.length > 100) targetList.pop();

    if (originList.length === 0 || targetList.length === 0) {
      return res.status(400).json({ error: 'مختصات معتبری برای ماتریس فاصله یافت نشد.' });
    }

    const coords = [...originList, ...targetList].map((point: any) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`);
    const sourceIndexes = originList.map((_point, index) => index).join(';');
    const targetIndexes = targetList.map((_point, index) => originList.length + index).join(';');

    const data = await httpJson(
      `${OSRM_BASE}/table/v1/${OSRM_PROFILE[profile] || 'driving'}/${coords.join(';')}` +
        `?sources=${sourceIndexes}&destinations=${targetIndexes}&annotations=distance,duration`,
      {},
      25000
    );

    if (data?.code !== 'Ok' || !Array.isArray(data?.distances)) {
      throw new Error(data?.message || 'ماتریس فاصلهٔ جاده‌ای OSRM پاسخی نداد');
    }

    return res.json({
      success: true,
      provider: 'osrm',
      providerLabel: 'ماتریس فاصلهٔ واقعی جاده‌ای (OSRM)',
      distancesMeters: data.distances,
      durationsSeconds: data.durations || null,
    });
  } catch (error: any) {
    console.error('Error in road distance matrix:', error);
    return res.status(502).json({
      error: 'خطا در محاسبهٔ فاصلهٔ واقعی جاده‌ای',
      details: error.message || String(error),
    });
  }
});

/*
 * هندسهٔ واقعی مسیر جاده‌ای برای جفت‌های نشانه ↔ گذرگاه (خطوط اتصال روی نقشه).
 * سرویس عمومی OSRM محدودیت نرخ دارد، پس درخواست‌ها ترتیبی و با فاصلهٔ کوتاه ارسال
 * می‌شوند و نتیجه در یک حافظهٔ نهان کلید‌شده با مختصات نگه داشته می‌شود.
 */
const roadLinkCache = new Map<string, { provider: string; geometry: [number, number][]; distanceKm: number; durationMin: number }>();
const ROAD_LINK_CACHE_LIMIT = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

app.post('/api/route/road-links', async (req, res) => {
  try {
    const { pairs, profile, limit } = req.body || {};

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return res.status(400).json({ error: 'جفت‌های نشانه و گذرگاه ارسال نشده‌اند.' });
    }

    const isPoint = (point: any) => point && typeof point.lat === 'number' && typeof point.lng === 'number';
    const capped = Math.max(1, Math.min(Number(limit) || 6, 10));
    const valid = pairs.filter((pair: any) => pair && isPoint(pair.from) && isPoint(pair.to)).slice(0, capped);

    if (valid.length === 0) {
      return res.status(400).json({ error: 'مختصات معتبری برای مسیر جاده‌ای یافت نشد.' });
    }

    const engineProfile = OSRM_PROFILE[profile] || 'driving';
    const links: any[] = [];
    const notes: string[] = [];
    let fetched = 0;

    for (const pair of valid) {
      const { from, to } = pair;
      const key = `${engineProfile}|${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;

      const cached = roadLinkCache.get(key);
      if (cached) {
        links.push({ id: pair.id ?? key, ...cached, cached: true });
        continue;
      }

      try {
        // فاصلهٔ کوتاه بین درخواست‌ها برای رعایت محدودیت نرخ سرویس عمومی
        if (fetched > 0) await sleep(320);
        fetched += 1;

        const data = await httpJson(
          // overview=simplified: هندسهٔ سبک و نمایشی که همچنان از روی راه‌های واقعی می‌گذرد
          `${OSRM_BASE}/route/v1/${engineProfile}/${from.lng},${from.lat};${to.lng},${to.lat}` +
            '?overview=simplified&geometries=geojson&alternatives=false&steps=false',
          {},
          22000
        );

        const route = data?.routes?.[0];
        const coordinates = route?.geometry?.coordinates;
        if (data?.code !== 'Ok' || !Array.isArray(coordinates) || coordinates.length < 2) {
          throw new Error(data?.message || 'مسیر جاده‌ای بازنگرداند');
        }

        const link = {
          provider: 'osrm',
          geometry: coordinates as [number, number][],
          distanceKm: Math.round((route.distance / 1000) * 10) / 10,
          durationMin: Math.round(route.duration / 60),
        };

        if (roadLinkCache.size >= ROAD_LINK_CACHE_LIMIT) {
          const oldest = roadLinkCache.keys().next().value;
          if (oldest) roadLinkCache.delete(oldest);
        }
        roadLinkCache.set(key, link);
        links.push({ id: pair.id ?? key, ...link, cached: false });
      } catch (error: any) {
        notes.push(`مسیر ${pair.id ?? ''}: ${error?.message || String(error)}`);
      }
    }

    return res.json({
      success: true,
      provider: 'osrm',
      providerLabel: 'هندسهٔ واقعی مسیر جاده‌ای (OSRM)',
      links,
      notes,
    });
  } catch (error: any) {
    console.error('Error in road links:', error);
    return res.status(502).json({
      error: 'خطا در دریافت مسیر واقعی جاده‌ای',
      details: error.message || String(error),
    });
  }
});

// API: ایزوکرون دسترسی (۲ تا ۱۲ ساعت)
app.post('/api/route/isochrone', async (req, res) => {
  try {
    const { center, hours, profile } = req.body || {};

    if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
      return res.status(400).json({ error: 'مرکز ایزوکرون معتبر ارسال نشده است.' });
    }

    const requestedHours: number[] = (Array.isArray(hours) ? hours : [2, 4, 6, 8, 12])
      .map((h: any) => Number(h))
      .filter((h: number) => h > 0 && h <= 12);
    const safeHours = requestedHours.length ? Array.from(new Set(requestedHours)).sort((a, b) => a - b) : [2, 4, 6];
    const maxHours = Math.max(...safeHours);
    const costing = VALHALLA_COSTING[profile] || 'auto';
    const notes: string[] = [];

    // بازه‌های کوتاه: اول ایزوکرون برداری Valhalla (نمونهٔ عمومی سقف ۶۰ دقیقه دارد)
    if (maxHours <= 1) {
      try {
        const data = await httpJson(`${VALHALLA_BASE}/isochrone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations: [{ lat: center.lat, lon: center.lng }],
            costing,
            contours: safeHours.map((h, idx) => ({ time: h * 60, color: ISOCOLORS[idx % ISOCOLORS.length] })),
            polygons: true,
            denoise: 0.25,
            generalize: 60,
          }),
        });

        const features: any[] = (Array.isArray(data?.features) ? data.features : []).map((feature: any, idx: number) => {
          const minutes = Number(feature.properties?.contour || safeHours[idx] * 60);
          return {
            hours: Math.round((minutes / 60) * 10) / 10,
            color: feature.properties?.color || ISOCOLORS[idx % ISOCOLORS.length],
            geometry: feature.geometry,
          };
        });

        if (features.length > 0) {
          return res.json({
            success: true,
            provider: 'valhalla',
            providerLabel: process.env.VALHALLA_URL ? 'Valhalla (خودمیزبان)' : 'Valhalla نمونهٔ عمومی OSM (بدون کلید)',
            costing,
            features,
            notes,
          });
        }
        notes.push('Valhalla ایزوکرونی بازنگرداند.');
      } catch (error: any) {
        notes.push(`Valhalla: ${error?.message || String(error)}`);
      }
    }

    // C3: پروفایل کامیون سنگین (HGV) — با وجود کلید ORS اولویت با ایزوکرون سازمانی OpenRouteService است
    if (hasOrsKey() && (profile === 'truck' || profile === 'truck_adr')) {
      try {
        const orsProfile = ORS_PROFILE[profile] || 'driving-hgv';
        const data = await httpJson(`${ORS_BASE}/v2/isochrones/${orsProfile}`, {
          method: 'POST',
          headers: { Authorization: process.env.ORS_API_KEY as string, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations: [[center.lng, center.lat]],
            range: safeHours.map((h) => h * 3600),
            range_type: 'time',
            location_type: 'start',
            smoothing: 0.4,
          }),
        });

        const features: any[] = (Array.isArray(data?.features) ? data.features : []).map((feature: any, idx: number) => ({
          hours: Math.round((Number(feature.properties?.value || safeHours[idx] * 3600) / 3600) * 10) / 10,
          color: ISOCOLORS[idx % ISOCOLORS.length],
          geometry: feature.geometry,
        }));

        if (features.length > 0) {
          return res.json({
            success: true,
            provider: 'ors',
            providerLabel: 'OpenRouteService — ایزوکرون کامیون سنگین (HGV)',
            costing: orsProfile,
            features,
            notes,
          });
        }
        notes.push('OpenRouteService ایزوکرونی بازنگرداند.');
      } catch (error: any) {
        notes.push(`OpenRouteService (HGV): ${error?.message || String(error)}`);
      }
    }

    // روش اصلی سامانه: نمونه‌برداری شعاعی + ماتریس زمان OSRM (بدون کلید، بدون سقف ۶۰ دقیقه)
    try {
      const features = await isochroneFromOsrmTable(center, safeHours, profile || 'truck');
      if (features.length > 0) {
        return res.json({
          success: true,
          provider: 'osrm-table',
          providerLabel: 'ایزوکرون ماتریسی OSRM (بدون کلید)',
          costing: profile || 'truck',
          features,
          notes: [
            'محدودهٔ دسترسی با نمونه‌برداری ۱۶ جهت و ماتریس زمان واقعی OSRM محاسبه شد؛ سرعت پایه بر اساس پروفایل انتخاب‌شده تنظیم شده است.',
            ...notes,
          ],
        });
      }
      notes.push('روش ماتریسی OSRM محدوده‌ای بازنگرداند.');
    } catch (error: any) {
      notes.push(`ماتریس OSRM: ${error?.message || String(error)}`);
    }

    if (hasOrsKey()) {
      try {
        const orsProfile = ORS_PROFILE[profile] || 'driving-car';
        const data = await httpJson(`${ORS_BASE}/v2/isochrones/${orsProfile}`, {
          method: 'POST',
          headers: { Authorization: process.env.ORS_API_KEY as string, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locations: [[center.lng, center.lat]],
            range: safeHours.map((h) => h * 3600),
            range_type: 'time',
            location_type: 'start',
            smoothing: 0.4,
          }),
        });

        const features: any[] = (Array.isArray(data?.features) ? data.features : []).map((feature: any, idx: number) => ({
          hours: Math.round((Number(feature.properties?.value || safeHours[idx] * 3600) / 3600) * 10) / 10,
          color: ISOCOLORS[idx % ISOCOLORS.length],
          geometry: feature.geometry,
        }));

        if (features.length > 0) {
          return res.json({
            success: true,
            provider: 'ors',
            providerLabel: 'OpenRouteService (ایزوکرون سازمانی)',
            costing: orsProfile,
            features,
            notes,
          });
        }
        notes.push('OpenRouteService ایزوکرونی بازنگرداند.');
      } catch (error: any) {
        notes.push(`OpenRouteService: ${error?.message || String(error)}`);
      }
    }

    return res.status(502).json({
      error: 'محاسبهٔ ایزوکرون دسترسی در حال حاضر ممکن نیست.',
      details: notes.join(' | '),
      notes,
    });
  } catch (error: any) {
    console.error('Error in isochrone:', error);
    return res.status(500).json({
      error: 'خطا در محاسبهٔ ایزوکرون دسترسی',
      details: error.message || String(error),
    });
  }
});

/* ------------------------------------------------------------------ *
 * جریان مرزها (فاز ۰): آمار رسمی + آیندگان خبری + امتیاز اعتماد
 * ------------------------------------------------------------------ */

import { gateIdForCustomsName } from './src/services/customsGateMap';
import {
  aggregateDestinations,
  collectBorderFlow,
  detectAnomalies,
  TOP_TRAFFIC_GATES,
  type FlowAnomaly,
} from './src/services/borderFlow';
import {
  BORDERPARK_GATES,
  fetchAllGates,
  snapshotToAiContext,
  type BorderParkSnapshot,
} from './src/services/borderPark';

interface BorderFlowCache {
  at: number;
  official: any[];
  news: any[];
  officialAvailable: boolean;
}
let borderFlowLast: BorderFlowCache | null = null;
let borderFlowAnomalies: FlowAnomaly[] = [];
const BORDER_FLOW_TTL_MS = 30 * 60 * 1000; // ۳۰ دقیقه

/** نگاشت نام گمرک رسمی به شناسهٔ گذرگاه اطلس روی رکوردهای رسمی */
function mapOfficialToGates(records: any[]): any[] {
  return records.map((r) => ({ ...r, gateId: gateIdForCustomsName(r.gateName) ?? -1 })).filter((r) => r.gateId !== -1);
}

// API: وضعیت و دادهٔ جریان مرزها (رسمی + خبری)
app.get('/api/border-flow', async (_req, res) => {
  const now = Date.now();
  if (borderFlowLast && now - borderFlowLast.at < BORDER_FLOW_TTL_MS) {
    return res.json({ success: true, cached: true, ...borderFlowLast });
  }
  try {
    const result = await collectBorderFlow({
      exaKey: process.env.EXA_API_KEY,
      aiKey: process.env.AI_API_KEY,
      aiBaseUrl: AI_BASE_URL,
      aiModel: AI_MODEL,
    });
    const payload: BorderFlowCache = {
      at: now,
      official: mapOfficialToGates(result.official),
      news: result.news,
      officialAvailable: result.officialAvailable,
    };
    borderFlowAnomalies = detectAnomalies(result.news);
    borderFlowLast = payload;
    return res.json({ success: true, cached: false, ...payload });
  } catch (error: any) {
    return res.status(500).json({ error: 'خطا در گردآوری جریان مرزها', details: error?.message || String(error) });
  }
});

/* ------------------------------------------------------------------ *
 * سامانهٔ نوبتدهی Border Park — وضعیت زندهٔ صف مرزها (فاز ۱+)
 * ------------------------------------------------------------------ */

interface BorderParkCache {
  at: number;
  snapshots: BorderParkSnapshot[];
}
let borderParkLast: BorderParkCache | null = null;
const BORDERPARK_TTL_MS = 15 * 60 * 1000; // ۱۵ دقیقه

async function ensureBorderPark(): Promise<BorderParkSnapshot[]> {
  if (borderParkLast && Date.now() - borderParkLast.at < BORDERPARK_TTL_MS) return borderParkLast.snapshots;
  const snapshots = await fetchAllGates();
  borderParkLast = { at: Date.now(), snapshots };
  recordQueueHistory(snapshots, borderParkLast.at);
  return snapshots;
}

/* ------------------------------------------------------------------ *
 * تاریخچهٔ صف مرزها: هر واکشی تازهٔ Border Park (چرخهٔ ۱۵ دقیقهای)
 * یک نقطهٔ سری‌زمانی ثبت میکند (سراسری + تفکیک هر مرز) و در
 * data/queue-history.json ماندگار میشود؛ نسخهٔ کامل‌تر به‌صورت الحاقی
 * در data/queue-history-archive.jsonl بایگانی میشود تا اگر فایل اصلی
 * گم یا محدود شد، بتوان از بایگانی بازسازی کرد.
 * جهش/افت آشکار صف (آزمون ترکیبی دلتا + درصد روی پنجرهٔ ~۴۵ دقیقه)
 * روی همین سری محاسبه و به مرکز اعلان تزریق میشود.
 * ------------------------------------------------------------------ */
interface QueueGateValue {
  totalQueue: number;
  maxWaitHours: number;
}

interface QueueSurge {
  kind: 'jump' | 'drop';
  gateSlug: string;
  gateName: string;
  changePct: number;
  from: number;
  to: number;
  windowMin: number;
}

interface QueueHistoryPoint {
  at: number; // epoch ms
  totalQueue: number; // جمع تریلرهای صف در مرزهای زنده
  maxWaitHours: number; // بیشینهٔ انتظار
  liveGates: number; // تعداد مرز با دادهٔ معتبر
  gateValues?: Record<string, QueueGateValue>; // تفکیک هر مرز بر اساس slug
  surge?: QueueSurge | null; // جهش/افت آشکار نسبت به پنجرهٔ قبلی
}

const QUEUE_HISTORY_PATH = path.join(__dirname, 'data', 'queue-history.json');
const QUEUE_ARCHIVE_PATH = path.join(__dirname, 'data', 'queue-history-archive.jsonl');
const QUEUE_HISTORY_MAX_POINTS = 672; // ~۷ روز با نمونه‌گیری ۱۵ دقیقهای
const QUEUE_HISTORY_MIN_INTERVAL_MS = 10 * 60 * 1000; // حداقل فاصلهٔ دو نقطه

function loadQueueHistory(): QueueHistoryPoint[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(QUEUE_HISTORY_PATH, 'utf8'));
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as QueueHistoryPoint[];
  } catch {
    /* فایل هنوز وجود ندارد */
  }
  // بازسازی از بایگانی الحاقی (تکراریها با سطل ۱۰ دقیقهای حذف میشوند)
  try {
    const lines = readFileSync(QUEUE_ARCHIVE_PATH, 'utf8').trim().split('\n').filter(Boolean);
    const seen = new Set<number>();
    const restored: QueueHistoryPoint[] = [];
    for (const line of lines.slice(-QUEUE_HISTORY_MAX_POINTS * 2)) {
      try {
        const p = JSON.parse(line) as QueueHistoryPoint;
        const bucket = Math.floor(p.at / QUEUE_HISTORY_MIN_INTERVAL_MS);
        if (!seen.has(bucket) && typeof p.totalQueue === 'number') {
          seen.add(bucket);
          restored.push(p);
        }
      } catch {
        /* خط خراب بایگانی */
      }
    }
    if (restored.length > 0) console.log(`[queue-history] restored ${restored.length} points from archive`);
    return restored;
  } catch {
    return [];
  }
}

function persistQueueHistory(points: QueueHistoryPoint[]): void {
  try {
    mkdirSync(path.dirname(QUEUE_HISTORY_PATH), { recursive: true });
    writeFileSync(QUEUE_HISTORY_PATH, JSON.stringify(points.slice(-QUEUE_HISTORY_MAX_POINTS)), 'utf8');
  } catch (error: any) {
    console.warn('[queue-history] persist failed:', error?.message || error);
  }
}

/** بایگانی الحاقی: هر نقطه یک خط JSON — بدون بازنویسی فایل */
function appendArchivePoint(point: QueueHistoryPoint): void {
  try {
    mkdirSync(path.dirname(QUEUE_ARCHIVE_PATH), { recursive: true });
    appendFileSync(QUEUE_ARCHIVE_PATH, `${JSON.stringify(point)}\n`, 'utf8');
  } catch (error: any) {
    console.warn('[queue-history] archive append failed:', error?.message || error);
  }
}

/**
 * تحلیل روند کوتاه‌مدت: مقایسهٔ آخرین مقدار با میانگین حداکثر ۳ نقطهٔ قبل
 * (~۴۵ دقیقه). جهش/افت فقط با هم‌زمانی دلتای مطلق و درصد معنادار است تا
 * نویز ۵–۱۰ تریلری اعلان نسازد.
 */
function analyzeQueueTrend(points: QueueHistoryPoint[]): QueueSurge | null {
  if (points.length < 3) return null;
  const prev = points.slice(-4, -1);
  const baseline = prev.reduce((s, p) => s + p.totalQueue, 0) / prev.length;
  const to = points[points.length - 1].totalQueue;
  const delta = to - baseline;
  if (baseline <= 0) return null;
  const changePct = (delta / baseline) * 100;
  const windowMin = Math.round((points[points.length - 1].at - prev[0].at) / 60000);
  if (delta >= 150 && changePct >= 15) {
    return { kind: 'jump', gateSlug: '*', gateName: 'کل مرزها', changePct, from: Math.round(baseline), to, windowMin };
  }
  if (delta <= -150 && changePct <= -15) {
    return { kind: 'drop', gateSlug: '*', gateName: 'کل مرزها', changePct, from: Math.round(baseline), to, windowMin };
  }
  return null;
}

let queueHistory: QueueHistoryPoint[] = loadQueueHistory();
let lastQueueRecordAt = 0;
let lastQueueSurge: { surge: QueueSurge; at: number } | null = null;

// اگر نقطهٔ بایگانی‌شدهای روند جهش داشت، بعد از restart هم در دسترس بماند
for (let i = queueHistory.length - 1; i >= 0; i--) {
  if (queueHistory[i]?.surge) {
    lastQueueSurge = { surge: queueHistory[i].surge!, at: queueHistory[i].at };
    break;
  }
}

function recordQueueHistory(snapshots: BorderParkSnapshot[], observedAt: number): void {
  if (Date.now() - lastQueueRecordAt < QUEUE_HISTORY_MIN_INTERVAL_MS && queueHistory.length > 0) return;
  lastQueueRecordAt = Date.now();
  const live = snapshots.filter((g) => g.confidence !== 'low');
  const gateValues: Record<string, QueueGateValue> = {};
  for (const g of live) {
    gateValues[g.gateSlug] = { totalQueue: g.totalQueue, maxWaitHours: g.maxWaitHours };
  }
  const point: QueueHistoryPoint = {
    at: observedAt,
    totalQueue: live.reduce((s, g) => s + g.totalQueue, 0),
    maxWaitHours: live.reduce((mx, g) => Math.max(mx, g.maxWaitHours), 0),
    liveGates: live.length,
    gateValues,
  };
  queueHistory.push(point);
  queueHistory = queueHistory.slice(-QUEUE_HISTORY_MAX_POINTS);
  const trend = analyzeQueueTrend(queueHistory);
  point.surge = trend;
  if (trend) lastQueueSurge = { surge: trend, at: point.at };
  persistQueueHistory(queueHistory);
  appendArchivePoint(point);
}

// API: سری‌زمانی صف مرزها برای نمودار روند داشبورد (+ نام مرزها و روند اخیر)
app.get('/api/border-park/history', (_req, res) => {
  return res.json({
    success: true,
    count: queueHistory.length,
    points: queueHistory,
    gateNames: Object.fromEntries(BORDERPARK_GATES.map((g) => [g.slug, g.nameFa])),
    trend: lastQueueSurge?.surge ?? null,
  });
});

// API: وضعیت زندهٔ همهٔ مرزهای سامانهٔ نوبتدهی
app.get('/api/border-park/status', async (_req, res) => {
  try {
    const snapshots = await ensureBorderPark();
    return res.json({ success: true, at: borderParkLast?.at, gates: snapshots });
  } catch (error: any) {
    return res.status(500).json({ error: 'خطا در جمعآوری وضعیت Border Park', details: error?.message || String(error) });
  }
});

// API: وضعیت زندهٔ یک مرز
app.get('/api/border-park/status/:slug', async (req, res) => {
  const gate = BORDERPARK_GATES.find((g) => g.slug === req.params.slug);
  if (!gate) return res.status(404).json({ error: 'مرز مورد نظر در سامانهٔ نوبتدهی یافت نشد' });
  try {
    const snapshots = await ensureBorderPark();
    const snapshot = snapshots.find((s) => s.gateSlug === gate.slug);
    if (snapshot) return res.json({ success: true, snapshot });
    // اگر در نهانگاه نبود، مستقیم بگیر
    const { fetchGateStatus } = await import('./src/services/borderPark');
    const fresh = await fetchGateStatus(gate.slug, gate.gateId, gate.nameFa);
    return res.json({ success: true, snapshot: fresh });
  } catch (error: any) {
    return res.status(500).json({ error: 'خطا در وضعیت مرز', details: error?.message || String(error) });
  }
});

// API: آلارمهای نوسان (سراسری یا یک گذرگاه) — قبل از مسیر پارامتری ثبت میشود
app.get('/api/border-flow/anomalies', (req, res) => {
  const gateParam = req.query.gateId ? Number(req.query.gateId) : null;
  const items =
    gateParam != null && Number.isFinite(gateParam)
      ? borderFlowAnomalies.filter((a) => a.gateId === gateParam)
      : borderFlowAnomalies;
  return res.json({
    success: true,
    count: items.length,
    anomalies: items,
    lastCollection: borderFlowLast?.at ?? null,
  });
});

/* ------------------------------------------------------------------ *
 * مرکز اعلان عملیاتی: صف بحرانی Border Park (انتظار ≥ ۲۰۰ ساعت) و
 * ناهنجاری‌های critical جریان مرزی را یکجا برمی‌گرداند. با NTFY_TOPIC
 * (اختیاری) هر آیتم جدید به کانال ntfy.sh هم push می‌شود تا اپراتور
 * روی موبایل بدون باز کردن داشبورد مطلع شود.
 * ------------------------------------------------------------------ */
interface OpsNotification {
  id: string;
  kind: 'critical-queue' | 'flow-anomaly' | 'queue-surge';
  title: string;
  detail: string;
  gateId?: number;
  severity: 'critical' | 'warning';
  at: string;
}

let lastNotifiedSignatures = new Set<string>(); // جلوگیری از push تکراری ntfy
let lastNotifiedAt = 0;
const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000; // حداکثر یک موج push در ۱۵ دقیقه

async function pushToNtfy(items: OpsNotification[]): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic || !items.length) return;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: {
        Title: 'اطلس ترانزیت — هشدار عملیاتی',
        Tags: 'truck,warning',
        Priority: 'high',
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: items.map((n) => `• ${n.title}\n${n.detail}`).join('\n\n'),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error: any) {
    console.warn('[notify] ntfy push failed:', error?.message || error);
  }
}

app.get('/api/notifications', async (_req, res) => {
  const items: OpsNotification[] = [];

  // ۱) صف‌های بحرانی زنده (انتظار ≥ ۲۰۰ ساعت)
  try {
    const snapshots = await ensureBorderPark();
    snapshots
      .filter((g) => g.maxWaitHours >= 200)
      .forEach((g) => {
        items.push({
          id: `queue-${g.gateSlug ?? g.gateId}`,
          kind: 'critical-queue',
          title: `صف بحرانی: ${g.gateNameFa}`,
          detail: `${g.totalQueue.toLocaleString('fa-IR')} تریلر در صف · انتظار ≈ ${Math.round(g.maxWaitHours).toLocaleString('fa-IR')} ساعت`,
          gateId: g.gateId ?? undefined,
          severity: 'critical',
          at: g.sourceUpdatedAt || new Date().toISOString(),
        });
      });
  } catch { /* بدون دادهٔ زنده، بخش صف خالی می‌ماند */ }

  // ۲) ناهنجاری‌های critical جریان مرزی
  borderFlowAnomalies
    .filter((a) => a.severity === 'critical')
    .slice(0, 10)
    .forEach((a) => {
      items.push({
        id: `anomaly-${a.id}`,
        kind: 'flow-anomaly',
        title: `ناهنجاری جریان: ${a.gateName}`,
        detail: a.message,
        gateId: a.gateId,
        severity: 'critical',
        at: a.detectedAt,
      });
    });

  // ۳) جهش/افت آشکار صف (تشخیص خودکار روی سری‌زمانی ۱۵ دقیقهای؛ اعتبار ۲ ساعته)
  if (lastQueueSurge && Date.now() - lastQueueSurge.at < 2 * 60 * 60 * 1000) {
    const s = lastQueueSurge.surge;
    const slugGate = s.gateSlug !== '*' ? BORDERPARK_GATES.find((g) => g.slug === s.gateSlug) : undefined;
    items.push({
      id: `surge-${s.kind}-${Math.floor(lastQueueSurge.at / 600000)}`,
      kind: 'queue-surge',
      title:
        s.kind === 'jump'
          ? `جهش صف: ${slugGate?.nameFa ?? s.gateName}`
          : `کاهش چشمگیر صف: ${slugGate?.nameFa ?? s.gateName}`,
      detail: `${s.kind === 'jump' ? 'افزایش' : 'کاهش'} ${Math.abs(Math.round(s.changePct)).toLocaleString('fa-IR')}٪ در ~${Math.max(1, Math.round(s.windowMin)).toLocaleString('fa-IR')} دقیقه (${Math.round(s.from).toLocaleString('fa-IR')} ← ${Math.round(s.to).toLocaleString('fa-IR')} تریلر)`,
      gateId: slugGate?.gateId ?? undefined,
      severity: s.kind === 'jump' ? 'critical' : 'warning',
      at: new Date(lastQueueSurge.at).toISOString(),
    });
  }

  // push اعلان‌های جدید به ntfy فقط با فاصلهٔ حداقلی (بدون NTFY_TOPIC، فقط feed داشبورد)
  const signatures = new Set(items.map((n) => n.id));
  const fresh = items.filter((n) => !lastNotifiedSignatures.has(n.id));
  if (process.env.NTFY_TOPIC && fresh.length && Date.now() - lastNotifiedAt >= NOTIFY_COOLDOWN_MS) {
    lastNotifiedSignatures = signatures;
    lastNotifiedAt = Date.now();
    void pushToNtfy(fresh);
  }

  return res.json({
    success: true,
    count: items.length,
    notifications: items.sort((a, b) => (b.at > a.at ? 1 : -1)),
    at: Date.now(),
  });
});

// API: جریان یک گذرگاه خاص (رسمی + خبری)
app.get('/api/border-flow/:gateId', async (req, res) => {
  const gateId = Number(req.params.gateId);
  if (!Number.isFinite(gateId)) return res.status(400).json({ error: 'شناسهٔ گذرگاه نامعتبر است' });
  try {
    if (!borderFlowLast || Date.now() - borderFlowLast.at >= BORDER_FLOW_TTL_MS) {
      const result = await collectBorderFlow({
        exaKey: process.env.EXA_API_KEY,
        aiKey: process.env.AI_API_KEY,
        aiBaseUrl: AI_BASE_URL,
        aiModel: AI_MODEL,
      });
      borderFlowLast = { at: Date.now(), official: mapOfficialToGates(result.official), news: result.news, officialAvailable: result.officialAvailable };
    }
    const gate = TOP_TRAFFIC_GATES.find((g) => g.id === gateId);
    const gateOfficial = borderFlowLast.official.filter((r) => r.gateId === gateId);
    const gateNews = borderFlowLast.news.filter((r) => r.gateId === gateId);
    const { destinations, hs2Groups } = aggregateDestinations(gateOfficial);
    return res.json({
      success: true,
      gateId,
      gateName: gate?.name ?? null,
      official: gateOfficial,
      news: gateNews,
      destinations,
      hs2Groups,
      anomalies: borderFlowAnomalies.filter((a) => a.gateId === gateId),
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'خطا در گردآوری جریان گذرگاه', details: error?.message || String(error) });
  }
});

// API: روند ماهانهٔ یک گذرگاه — ترکیب آمار رسمی (تن/دلار) و اخبار ساختاریافته (کامیون)
app.get('/api/border-flow/:gateId/trend', async (req, res) => {
  const gateId = Number(req.params.gateId);
  if (!Number.isFinite(gateId)) return res.status(400).json({ error: 'شناسهٔ گذرگاه نامعتبر است' });
  try {
    if (!borderFlowLast || Date.now() - borderFlowLast.at >= BORDER_FLOW_TTL_MS) {
      const result = await collectBorderFlow({
        exaKey: process.env.EXA_API_KEY,
        aiKey: process.env.AI_API_KEY,
        aiBaseUrl: AI_BASE_URL,
        aiModel: AI_MODEL,
      });
      borderFlowLast = { at: Date.now(), official: mapOfficialToGates(result.official), news: result.news, officialAvailable: result.officialAvailable };
    }

    // روند رسمی: تناژ و ارزش به تفکیک ماه
    const monthly = new Map<
      string,
      { month: string; exportT: number; importT: number; exportUsd: number; importUsd: number; trucks: number; sources: Set<string> }
    >();
    const touch = (month: string) => {
      let m = monthly.get(month);
      if (!m) {
        m = { month, exportT: 0, importT: 0, exportUsd: 0, importUsd: 0, trucks: 0, sources: new Set() };
        monthly.set(month, m);
      }
      return m;
    };
    for (const r of borderFlowLast.official.filter((x) => x.gateId === gateId)) {
      const m = touch(String(r.date ?? '').slice(0, 7) || 'نامشخص');
      if (r.direction === 'export') {
        m.exportT += r.tonnage ?? 0;
        m.exportUsd += r.valueUsd ?? 0;
      } else {
        m.importT += r.tonnage ?? 0;
        m.importUsd += r.valueUsd ?? 0;
      }
      m.sources.add('tccim');
    }
    for (const r of borderFlowLast.news.filter((x) => x.gateId === gateId && typeof x.trucks === 'number')) {
      const m = touch(String(r.date ?? '').slice(0, 7));
      m.trucks += r.trucks ?? 0;
      m.sources.add('news');
    }
    const trend = Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month));
    return res.json({ success: true, gateId, trend });
  } catch (error: any) {
    return res.status(500).json({ error: 'خطا در محاسبهٔ روند ماهانه', details: error?.message || String(error) });
  }
});

/* ------------------------------------------------------------------ *
 * گزارش خطاهای زمان اجرای مرورگر
 * ------------------------------------------------------------------ */

interface ClientErrorRecord {
  message: string;
  stack?: string | null;
  source?: string;
  url?: string;
  ua?: string;
  at: string;
}

const clientErrors: ClientErrorRecord[] = [];

app.post('/api/client-error', (req, res) => {
  const { message, stack, source, url, ua } = req.body || {};
  const record: ClientErrorRecord = {
    message: String(message || 'نامشخص'),
    stack: stack ? String(stack).slice(0, 4000) : null,
    source: source ? String(source) : 'unknown',
    url: url ? String(url) : '',
    ua: ua ? String(ua).slice(0, 300) : '',
    at: new Date().toISOString(),
  };

  console.error('[client-error]', record.source, '|', record.message, '\n', record.stack || '');
  clientErrors.push(record);
  if (clientErrors.length > 50) clientErrors.shift();

  return res.json({ success: true });
});

// آخرین خطاهای گزارش‌شده از مرورگر (برای بررسی)
app.get('/api/client-error', (_req, res) => {
  return res.json({ success: true, count: clientErrors.length, errors: clientErrors });
});

/*
 * دو نکته دربارهٔ منابع تحلیلی بخش بعدی فایل:
 * ۱) `import { gateIdForCustomsName } from './src/services/customsGateMap'` — این ایمپورت استاتیک ESM
 *    است و باید پیش از هر فراخوانی runtime اجرا شود؛ چون استاتیک است، ترتیب آن با بقیهٔ فایل تضمین‌شده است.
 * ۲) `import type { ... }`ها type-only هستند و هیچ کد runtime تولید نمی‌کنند؛ اجازهٔ استفاد در هر جای فایل را دارند.
 * این بخش‌ها مستقل از منابع تحلیلی کش‌شدهٔ بالا (/api/weather و /api/provinces) عمل می‌کنند.
 */

// گرم‌کردن اوّلیه: نخستین واکشی وضعیت زندهٔ صف در آغاز فرایند تا تاریخچه،
// نمودار روند و اعلانها از همان لحظهٔ بالا آمدن سرور زنده باشند.
void ensureBorderPark().catch((error: any) => console.warn('[warmup] border park:', error?.message || error));

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
