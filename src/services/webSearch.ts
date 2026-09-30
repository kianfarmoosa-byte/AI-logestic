/**
 * لایهٔ جستجوی واقعی وب
 * ---------------------
 * زنجیرهٔ موتورها در سرور: جستجوی معنایی وب (Exa) → ویکی‌پدیای فارسی.
 * سپس نتایج به دستیار هوشمند سامانه (مدل زبانی سازمانی) داده می‌شود.
 * بنابراین رابط کاربری همیشه پاسخ می‌گیرد و برچسب موتور استفاده‌شده را نشان می‌دهد.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  provider: string;
  publishedAt?: string;
}

export interface WebSearchResponse {
  success: boolean;
  provider: string;
  providerLabel: string;
  query: string;
  results: WebSearchResult[];
  text?: string;
  notes: string[];
}

export interface WebSearchEngineStatus {
  available: boolean;
  label: string;
  missing: string[];
}

export interface WebSearchStatus {
  exa: WebSearchEngineStatus;
  wikipedia: WebSearchEngineStatus;
  ai: WebSearchEngineStatus;
}

export type WebSearchMode = 'web' | 'news' | 'official';

export const WEB_SEARCH_MODE_LABELS: Record<WebSearchMode, string> = {
  web: 'کل وب',
  news: 'اخبار و به‌روزرسانی',
  official: 'منابع رسمی و دولتی',
};

export async function searchWeb(params: {
  query: string;
  mode?: WebSearchMode;
  num?: number;
  site?: string;
}): Promise<WebSearchResponse> {
  const res = await fetch('/api/web-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error || errorData?.details || `خطای جستجو (${res.status})`);
  }

  return (await res.json()) as WebSearchResponse;
}

export async function fetchWebSearchStatus(): Promise<WebSearchStatus | null> {
  try {
    const res = await fetch('/api/web-search/status');
    if (!res.ok) return null;
    return (await res.json()) as WebSearchStatus;
  } catch {
    return null;
  }
}

/** پرسش‌های آمادهٔ پرکاربرد برای ترانزیت مرزی */
export const QUICK_SEARCHES: { label: string; query: string; mode: WebSearchMode }[] = [
  { label: 'صف کامیون مرز بازرگان', query: 'وضعیت صف کامیون و زمان انتظار مرز بازرگان', mode: 'news' },
  { label: 'تعرفه و مقررات TIR امسال', query: 'تعرفه ترانزیت جادهای و مقررات کارنه تیر TIR', mode: 'official' },
  { label: 'وضعیت مرزهای عراق', query: 'وضعیت مرزهای ایران و عراق مهران شلمچه پرویزخان', mode: 'news' },
  { label: 'کریدور شمال-جنوب INSTC', query: 'کریدور بینالمللی شمال-جنوب INSTC آخرین تحولات', mode: 'news' },
  { label: 'محدودیتهای کامیون اروپا', query: 'محدودیت تردد کامیون در اروپا و عوارض جادهای', mode: 'web' },
  { label: 'زمانبندی قطار باری ایران-ترکیه', query: 'زمانبندی قطار باری ایران ترکیه و ظرفیت ریلی', mode: 'web' },
];
