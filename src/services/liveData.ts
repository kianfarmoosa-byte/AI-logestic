/**
 * لایه دسترسی به داده‌های زنده و رایگان (بدون کلید API)
 * ------------------------------------------------------
 * ۱) Open-Meteo  : وضعیت جوی لحظه‌ای هر گذرگاه + دید افقی
 * ۲) Frankfurter : نرخ ارز مرجع (ECB) برای برآورد هزینه حمل
 *
 * هر فراخوانی با مهلت زمانی (timeout) و مدیریت خطای مستقل انجام می‌شود
 * تا از کار افتادن یک سرویس، بقیه سامانه را متوقف نکند.
 */

export interface LiveWeather {
  observedAt: string | null;
  temperatureC: number | null;
  apparentC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  windKmh: number | null;
  gustsKmh: number | null;
  visibilityKm: number | null;
  weatherCode: number | null;
  sourceUrl: string;
}

export interface TransitRisk {
  score: number; // ۰ تا ۱۰۰
  level: 'کم' | 'متوسط' | 'بالا' | 'بحرانی';
  reasons: string[];
}

const WEATHER_CODE_FA: Record<number, string> = {
  0: 'آسمان صاف',
  1: 'عمدتاً صاف',
  2: 'نیمه‌ابری',
  3: 'ابری',
  45: 'مه',
  48: 'مه یخ‌زننده',
  51: 'نم‌نم باران سبک',
  53: 'نم‌نم باران',
  55: 'نم‌نم باران شدید',
  56: 'باران یخ‌زننده سبک',
  57: 'باران یخ‌زننده',
  61: 'باران سبک',
  63: 'باران',
  65: 'باران شدید',
  66: 'باران یخ‌زننده سبک',
  67: 'باران یخ‌زننده شدید',
  71: 'برف سبک',
  73: 'برف',
  75: 'برف سنگین',
  77: 'دانه‌های برف',
  80: 'رگبار سبک',
  81: 'رگبار',
  82: 'رگبار شدید',
  85: 'رگبار برف سبک',
  86: 'رگبار برف سنگین',
  95: 'رعد و برق',
  96: 'رعد و برق با تگرگ سبک',
  99: 'رعد و برق با تگرگ شدید',
};

export function weatherCodeToFa(code: number | null): string {
  if (code === null) return 'نامشخص';
  return WEATHER_CODE_FA[code] || 'وضعیت نامشخص';
}

async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`پاسخ ناموفق سرویس زنده (${res.status})`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** وضعیت جوی زنده و دید افقی یک گذرگاه از Open-Meteo */
export async function fetchLiveWeather(lat: number, lng: number): Promise<LiveWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,` +
    `weather_code,wind_speed_10m,wind_gusts_10m&hourly=visibility&forecast_days=2&timezone=auto`;

  const data: any = await fetchJson(url);
  const current = data?.current || {};
  const hourly = data?.hourly || {};

  // دید افقی فقط در بخش ساعتی ارائه می‌شود؛ نزدیک‌ترین ساعت به زمان مشاهده انتخاب می‌شود
  // (بازه «current» می‌تواند ۱۵ دقیقه‌ای باشد، پس تطبیق دقیق رشته‌ای کافی نیست)
  let visibilityM: number | null = null;
  if (Array.isArray(hourly.time) && Array.isArray(hourly.visibility) && typeof current.time === 'string') {
    const hourKey = `${current.time.slice(0, 13)}:00`;
    let idx = hourly.time.indexOf(hourKey);
    if (idx < 0) {
      let best = -1;
      let bestDiff = Number.POSITIVE_INFINITY;
      const target = new Date(hourKey).getTime();
      hourly.time.forEach((t: string, i: number) => {
        const diff = Math.abs(new Date(t).getTime() - target);
        if (!Number.isNaN(diff) && diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      });
      idx = best;
    }
    const value = hourly.visibility[idx >= 0 ? idx : 0];
    if (typeof value === 'number') visibilityM = value;
  }

  const num = (v: unknown) => (typeof v === 'number' ? v : null);

  return {
    observedAt: typeof current.time === 'string' ? current.time : null,
    temperatureC: num(current.temperature_2m),
    apparentC: num(current.apparent_temperature),
    humidityPct: num(current.relative_humidity_2m),
    precipitationMm: num(current.precipitation),
    windKmh: num(current.wind_speed_10m),
    gustsKmh: num(current.wind_gusts_10m),
    visibilityKm: visibilityM === null ? null : Math.round((visibilityM / 1000) * 10) / 10,
    weatherCode: num(current.weather_code),
    sourceUrl: url,
  };
}

/** محاسبه شاخص ریسک ترانزیت (۰ تا ۱۰۰) از داده جوی زنده */
export function computeTransitRisk(w: LiveWeather | null): TransitRisk {
  if (!w) return { score: 0, level: 'کم', reasons: [] };

  let score = 0;
  const reasons: string[] = [];

  if (w.precipitationMm !== null && w.precipitationMm > 0) {
    score += Math.min(25, w.precipitationMm * 6);
    reasons.push(`بارش فعال (${w.precipitationMm} میلی‌متر) — کاهش چسبندگی جاده`);
  }

  if (w.visibilityKm !== null) {
    if (w.visibilityKm < 1) {
      score += 30;
      reasons.push(`دید افقی بحرانی (${w.visibilityKm} کیلومتر) — ریسک توقف ناوگان`);
    } else if (w.visibilityKm < 5) {
      score += 15;
      reasons.push(`کاهش دید افقی (${w.visibilityKm} کیلومتر)`);
    }
  }

  if (w.gustsKmh !== null) {
    if (w.gustsKmh > 70) {
      score += 25;
      reasons.push(`تندباد شدید (${w.gustsKmh} کیلومتر بر ساعت) — خطر واژگونی کامیون`);
    } else if (w.gustsKmh > 45) {
      score += 12;
      reasons.push(`باد جانبی قابل توجه (${w.gustsKmh} کیلومتر بر ساعت)`);
    }
  }

  if (w.temperatureC !== null && w.temperatureC <= 0) {
    score += 20;
    reasons.push(`دمای زیر صفر (${w.temperatureC}°) — ریسک یخ‌زدگی سطح جاده`);
  }
  if (w.temperatureC !== null && w.temperatureC >= 40) {
    score += 12;
    reasons.push(`دمای بحرانی (${w.temperatureC}°) — محدودیت کارکرد بار یخچالی`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: TransitRisk['level'] = 'کم';
  if (score >= 60) level = 'بحرانی';
  else if (score >= 35) level = 'بالا';
  else if (score >= 15) level = 'متوسط';

  if (reasons.length === 0) reasons.push('شرایط جوی برای تردد کامیون مناسب است');

  return { score, level, reasons };
}

export interface LiveFxRates {
  base: string;
  date: string;
  rates: Record<string, number>;
  sourceUrl: string;
}

// فقط ارزهایی که بانک مرکزی اروپا واقعاً منتشر می‌کند (درهم/ریال در فهرست ECB نیست)
const FX_SYMBOLS = ['EUR', 'TRY', 'CNY', 'INR', 'GBP'];

/** نرخ ارز مرجع زنده (بانک مرکزی اروپا از طریق Frankfurter) */
export async function fetchLiveFxRates(base = 'USD'): Promise<LiveFxRates> {
  const url = `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${FX_SYMBOLS.join(',')}`;
  const data: any = await fetchJson(url);
  return {
    base: data?.base || base,
    date: data?.date || new Date().toISOString().slice(0, 10),
    rates: data?.rates || {},
    sourceUrl: url,
  };
}

export const FX_LABELS: Record<string, string> = {
  EUR: 'یورو (اروپا)',
  TRY: 'لیر ترکیه',
  CNY: 'یوان چین',
  INR: 'روپیه هند',
  GBP: 'پوند بریتانیا',
};
