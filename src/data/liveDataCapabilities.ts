/**
 * فهرست کامل قابلیت‌های محاسباتی و پردازشی برای دسترسی به داده‌های زنده و معتبر
 * ----------------------------------------------------------------------------
 * هر قابلیت شامل: کارکردی که پشتیبانی می‌کند، ارائه‌دهنده، مجوز/هزینه،
 * نیاز یا عدم نیاز به کلید API، نقطه پایانی، نرخ به‌روزرسانی،
 * مراحل محاسباتی/پردازشی لازم و وضعیت پیاده‌سازی در این سامانه.
 *
 * status:
 *  - active    : همین حالا در سامانه فعال و در حال استفاده است
 *  - keyless   : رایگان و بدون کلید؛ اتصال فقط با یک فراخوانی ساده ممکن است
 *  - needs_key : نیازمند کلید/ثبت‌نام (معمولاً رایگان تا سهمیه مشخص)
 *  - planned   : نیازمند فرآیند جمع‌آوری یا مدل داده اختصاصی (در نقشه راه)
 */

export type CapabilityStatus = 'active' | 'keyless' | 'needs_key' | 'planned';

export interface LiveDataCapability {
  id: string;
  title: string;
  category: string;
  /** کارکرد(های) برنامه که این قابلیت تغذیه می‌کند */
  purpose: string;
  provider: string;
  license: string;
  cost: string;
  keyless: boolean;
  endpoint: string | null;
  /** نرخ به‌روزرسانی داده یا توصیه‌شده برای کش */
  refresh: string;
  /** مراحل محاسباتی/پردازشی مورد نیاز روی داده */
  compute: string[];
  status: CapabilityStatus;
  /** کلید محیطی لازم در صورت وجود */
  envKey?: string;
}

export const CAPABILITY_STATUS_LABEL: Record<CapabilityStatus, string> = {
  active: 'فعال در سامانه',
  keyless: 'بدون کلید — آماده اتصال',
  needs_key: 'نیازمند کلید',
  planned: 'در نقشه راه',
};

export const CAPABILITY_STATUS_CLASS: Record<CapabilityStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  keyless: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
  needs_key: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  planned: 'bg-slate-600/20 text-slate-300 border-slate-600/50',
};

export const CAPABILITIES: LiveDataCapability[] = [
  /* ── ۱. نقشه پایه و کاشی‌سازی ───────────────────────────────────── */
  {
    id: 'openfreemap',
    title: 'کاشی وکتور OpenFreeMap (نقشه پایه منبع‌باز)',
    category: 'نقشه پایه و کاشی‌سازی',
    purpose: 'نمایش زمینه نقشه در همه تب‌ها (اطلس گذرگاه‌ها، شبکه راه، مسیریاب)',
    provider: 'OpenFreeMap (بر پایه OpenMapTiles + داده OSM)',
    license: 'نرم‌افزار آزاد؛ داده ODbL با ذکر منبع',
    cost: 'رایگان و بدون کلید، بدون محدودیت سهمیه',
    keyless: true,
    endpoint: 'https://tiles.openfreemap.org/styles/dark | /bright',
    refresh: 'بازتولید روزانه داده‌ها',
    compute: [
      'خواندن سبک استاندارد MapLibre (Style JSON) بدون تبدیل',
      'پردازش کاشی در Web Worker جداگانه برای جلوگیری از انسداد رابط کاربری',
      'جابه‌جایی سبک در زمان اجرا (روشن/تیره/شطرنجی)',
      'بازمیزبانی نقشه پایه با Martin یا tileserver-gl در صورت قطع سرویس عمومی',
    ],
    status: 'active',
  },
  {
    id: 'osm-raster',
    title: 'کاشی شطرنجی کلاسیک OpenStreetMap',
    category: 'نقشه پایه و کاشی‌سازی',
    purpose: 'لایه پشتیبان نقشه در صورت اختلال در کاشی‌های وکتور',
    provider: 'بنیاد OpenStreetMap',
    license: 'داده ODbL با ذکر منبع',
    cost: 'رایگان؛ تابع سیاست کاربرد منصفانه OSM',
    keyless: true,
    endpoint: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    refresh: 'پیوسته (ویرایش‌های مردمی)',
    compute: [
      'کش کاشی در مرورگر و تعیین maxzoom/انحراف شبکه',
      'تغییر تنظیمات رنگ لایه شطرنجی برای حالت تیره',
      'پایش نرخ درخواست و بازگشت به کاشی وکتور در بار زیاد',
    ],
    status: 'active',
  },
  {
    id: 'osm-container',
    title: 'نقشه پایه خودمیزبان (Self-hosting)',
    category: 'نقشه پایه و کاشی‌سازی',
    purpose: 'استقلال کامل از سرویس‌های بیرونی و اجرا در شبکه بسته',
    provider: 'OpenMapTiles / Planetiler + Martin / tileserver-gl',
    license: 'آزاد (کد) + ODbL (داده)',
    cost: 'هزینه زیرساخت سرور داخلی',
    keyless: true,
    endpoint: null,
    refresh: 'همگام‌سازی ماهانه با planet.osm.pbf',
    compute: [
      'تبدیل planet.osm.pbf به MBTiles با Planetiler',
      'سرو کاشی وکتور با Martin و کش لبه‌ای (Nginx)',
      'به‌روزرسانی افزایشی دلتا برای پرهیز از بازتولید کل کره',
    ],
    status: 'planned',
  },

  /* ── ۲. زمین‌کدگذاری و جستجوی مکانی ─────────────────────────────── */
  {
    id: 'nominatim',
    title: 'زمین‌کدگذاری و واژه‌یابی مکانی Nominatim',
    category: 'زمین‌کدگذاری و جستجوی مکانی',
    purpose: 'تبدیل نام شهر/روستا/انبار به مختصات و برعکس در جستجوی عمومی',
    provider: 'OSM Nominatim',
    license: 'ODbL؛ سیاست کاربرد منصفانه',
    cost: 'رایگان بدون کلید (سقف ۱ درخواست بر ثانیه)',
    keyless: true,
    endpoint: 'https://nominatim.openstreetmap.org/search?format=jsonv2&q=…',
    refresh: 'به‌روز از داده OSM (کش ۲۴ ساعته توصیه‌شده)',
    compute: [
      'نرمال‌سازی متن فارسی/عربی (ی/ي، ک/ك، حذف نیم‌فاصله)',
      'قطعی‌سازی نام‌های دوگانه مرزی (نام ایرانی/نام آن‌سوی مرز)',
      'کش نتایج با TTL و سقف نرخ درخواست',
      'رتبه‌بندی نتایج بر اساس فاصله از گذرگاه انتخاب‌شده',
    ],
    status: 'keyless',
  },
  {
    id: 'photon',
    title: 'جستجوی پیشوندی آدرس Photon',
    category: 'زمین‌کدگذاری و جستجوی مکانی',
    purpose: 'تکمیل خودکار نام شهر و مکان در فرم‌های مبدأ/مقصد',
    provider: 'Komoot Photon (داده OSM)',
    license: 'Apache-2.0 / ODbL',
    cost: 'رایگان بدون کلید',
    keyless: true,
    endpoint: 'https://photon.komoot.io/api/?q=…&limit=5',
    refresh: 'به‌روز از داده OSM',
    compute: [
      'debounce ورودی کاربر پیش از فراخوانی',
      'فیلتر مکانی با bbox کشورهای هدف (ایران، ترکیه، عراق…)',
      'ادغام نتایج فارسی و انگلیسی در یک فهرست',
    ],
    status: 'keyless',
  },
  {
    id: 'overpass',
    title: 'استعلام تأسیسات لجستیکی از Overpass API',
    category: 'زمین‌کدگذاری و جستجوی مکانی',
    purpose: 'جایگزین رایگان استعلام اماکن گوگل‌مپس: تیرپارک، گمرک، باسکول، سردخانه، تعمیرگاه',
    provider: 'Overpass API (داده OSM)',
    license: 'ODbL',
    cost: 'رایگان بدون کلید (سقف تعداد کوئری روزانه)',
    keyless: true,
    endpoint: 'https://overpass-api.de/api/interpreter',
    refresh: 'به‌روز از داده OSM (کش ساعتی توصیه‌شده)',
    compute: [
      'ساخت کوئری Overpass QL بر پایه شعاع ۲۵ کیلومتری اطراف گذرگاه',
      'نگاشت برچسب‌های OSM (amenity=parking، industrial=warehouse، tag:amenity=customs) به دسته‌های لجستیکی',
      'تبدیل پاسخ JSON به GeoJSON و افزودن آن به لایه نقشه',
      'حذف تکراری‌ها و رتبه‌بندی بر اساس فاصله، ظرفیت و کامل‌بودن برچسب‌ها',
      'تعویض خودکار سرور آینه در صورت خطای ۴۲۹/۵۰۴',
    ],
    status: 'keyless',
  },

  /* ── ۳. مسیریابی، شبکه و محدوده دسترسی ──────────────────────────── */
  {
    id: 'osrm',
    title: 'مسیریابی واقعی جاده‌ای با OSRM',
    category: 'مسیریابی، شبکه و محدوده دسترسی',
    purpose: 'جایگزین تخمین ضرب‌در-هوایی در «ترانزیت‌یاب» با مسافت و زمان واقعی مسیر',
    provider: 'Project OSRM (داده OSM)',
    license: 'BSD-2-Clause / ODbL',
    cost: 'رایگان؛ سرور نمایشی بدون کلید',
    keyless: true,
    endpoint: 'https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full',
    refresh: 'به‌روز از داده OSM',
    compute: [
      'تبدیل مختصات جغرافیایی از/به قالب OSRM و Polyline فشرده',
      'ماتریس مبدأ-مقصد (Table) برای انتخاب بهینه‌ترین گذرگاه مرزی',
      'بازنمونه‌برداری پروفایل برای کامیون سنگین (پرهیز از مسیرهای کم‌عرض)',
      'صاف‌سازی مسیر هندسی و برش آن به بخش‌های بین‌مرزی',
      'مقایسه خروجی با تخمین داخلی و هشدار در اختلاف بیش از ۳۰٪',
    ],
    status: 'keyless',
  },
  {
    id: 'ors',
    title: 'مسیریابی و محدوده دسترسی OpenRouteService',
    category: 'مسیریابی، شبکه و محدوده دسترسی',
    purpose: 'پروفایل اختصاصی کامیون، محدوده دسترسی زمانی (Isochrone) و مسیرهای ممنوعه',
    provider: 'HeiGIT / OpenRouteService',
    license: 'داده ODbL؛ سرویس با کلید آزاد',
    cost: 'رایگان تا ۲۰۰۰ درخواست در روز',
    keyless: false,
    endpoint: 'https://api.openrouteservice.org/v2/directions/driving-hgv',
    refresh: 'به‌روز از داده OSM',
    compute: [
      'تعریف پروفایل driving-hgv با ابعاد، وزن و بار محورها',
      'محاسبه محدوده دسترسی ۲ تا ۱۲ ساعته برای زمان‌بندی تحویل',
      'اعمال محدودیت‌های ارتفاعی/تناژی و مسیرهای ممنوع شبانه',
      'تبدیل ایزوکرون به بردار برای نمایش روی نقشه',
    ],
    status: 'needs_key',
    envKey: 'ORS_API_KEY',
  },
  {
    id: 'valhalla',
    title: 'موتور مسیریابی Valhalla (خودمیزبان)',
    category: 'مسیریابی، شبکه و محدوده دسترسی',
    purpose: 'مسیریابی با معیار هزینه، تناژ و ترجیحات ترانزیت بدون وابستگی ابری',
    provider: 'Valhalla (خودمیزبان)',
    license: 'MIT / ODbL',
    cost: 'رایگان (هزینه سرور داخلی)',
    keyless: true,
    endpoint: 'http://<self-host>/route',
    refresh: 'همگام با به‌روزرسانی داده OSM',
    compute: [
      'ساخت کاشی‌های Valhalla از planet.osm.pbf',
      'تعریف هزینه‌های سفارشی (toll، گذرگاه مرزی، صف تخمینی)',
      'محاسبه مسیرهای جایگزین در زمان انسداد یک گذرگاه',
    ],
    status: 'planned',
  },

  /* ── ۴. ارتفاع، شیب و اقلیم مسیر ───────────────────────────────── */
  {
    id: 'elevation',
    title: 'ارتفاع و شیب مسیر از سرویس‌های DEM',
    category: 'ارتفاع، شیب و اقلیم مسیر',
    purpose: 'محاسبه افت‌وخیز و دشواری مسیر گردنه‌های کوهستانی و ریسک زمستانی',
    provider: 'OpenTopoData / Open-Elevation / AWS Terrain Tiles',
    license: 'CC-BY / داده ارتفاع آزاد',
    cost: 'رایگان بدون کلید',
    keyless: true,
    endpoint: 'https://api.opentopodata.org/v1/srtm90m?locations=lat,lng|lat,lng',
    refresh: 'ایستا (DEM ثابت)',
    compute: [
      'نمونه‌برداری ارتفاع در گام‌های ۵ کیلومتری مسیر',
      'محاسبه شیب میانگین و بیشینه و شمار گردنه‌ها',
      'امتیاز دشواری مسیر و تخمین افت سرعت کامیون در سربالایی',
    ],
    status: 'keyless',
  },

  /* ── ۵. وضعیت جوی، دید افقی و مخاطرات ─────────────────────────── */
  {
    id: 'open-meteo',
    title: 'وضعیت جوی زنده گذرگاه (Open-Meteo)',
    category: 'وضعیت جوی، دید افقی و مخاطرات',
    purpose: 'شاخص ریسک ترانزیت: یخ‌زدگی، دید افقی، باد جانبی و بارش در هر گذرگاه',
    provider: 'Open-Meteo (مدل‌های هواشناسی آزاد)',
    license: 'CC-BY-4.0؛ کد Apache-2.0',
    cost: 'رایگان، بدون کلید و بدون سقف سخت‌گیرانه',
    keyless: true,
    endpoint: 'https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=…&hourly=visibility',
    refresh: 'هر ۱۵ دقیقه تا ۱ ساعت',
    compute: [
      'نگاشت کد وضعیت هوا (WMO) به توضیح فارسی و آیکون',
      'محاسبه شاخص ریسک ۰ تا ۱۰۰ از بارش، دید، رطوبت، دما و باد',
      'پیش‌بینی ۷۲ ساعته برای برنامه‌ریزی پنجرهٔ ترخیص گمرکی',
      'کش مکانی/زمانی و درخواست دسته‌ای برای همه گذرگاه‌ها',
    ],
    status: 'active',
  },
  {
    id: 'open-meteo-air',
    title: 'کیفیت هوا و غبار پرتابی',
    category: 'وضعیت جوی، دید افقی و مخاطرات',
    purpose: 'هشدار توفان گردوغبار در مسیرهای جنوبی و بین‌النهرین و اثر آن بر دید راننده',
    provider: 'Open-Meteo Air Quality API',
    license: 'CC-BY-4.0',
    cost: 'رایگان بدون کلید',
    keyless: true,
    endpoint: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=…&longitude=…',
    refresh: 'ساعتی',
    compute: [
      'تبدیل شاخص PM10/PM2.5 به سطح هشدار عملیاتی جاده',
      'همجوشی با دید افقی هواشناسی برای آستانه توقف ناوگان',
    ],
    status: 'keyless',
  },
  {
    id: 'open-meteo-marine',
    title: 'وضعیت دریا و بندر (کاسپین و خلیج فارس)',
    category: 'وضعیت جوی، دید افقی و مخاطرات',
    purpose: 'برآورد تأخیر حمل رو-رو/کانتینری از موج، باد و ارتفاع موج بندری',
    provider: 'Open-Meteo Marine API',
    license: 'CC-BY-4.0',
    cost: 'رایگان بدون کلید',
    keyless: true,
    endpoint: 'https://marine-api.open-meteo.com/v1/marine?latitude=…&longitude=…',
    refresh: 'ساعتی',
    compute: [
      'پیوند بندر مبدأ/مقصد به مختصات آب آزاد',
      'محاسبه تأخیر تخمینی بر پایه ارتفاع موج و سرعت باد',
    ],
    status: 'keyless',
  },

  /* ── ۶. صف، ترافیک و وضعیت عملیاتی مرز ─────────────────────────── */
  {
    id: 'gemini-search-grounding',
    title: 'استعلام وب بلادرنگ با Google Search Grounding',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'آخرین وضعیت صف کامیون، ساعات کار گمرک، اخبار مسیر و مقررات کارنه تیر',
    provider: 'Gemini + Google Search (سرور Express)',
    license: 'سرویس تجاری گوگل',
    cost: 'بر پایه مصرف؛ کلید در سمت سرور',
    keyless: false,
    endpoint: 'POST /api/search-grounding',
    refresh: 'در لحظه استعلام کاربر',
    compute: [
      'غنی‌سازی پرسش با نام گذرگاه، کشور و دسته موضوعی',
      'استخراج ارجاع‌های وب و حذف تکراری‌ها',
      'دسته‌بندی پاسخ و بازگشت به رابط کاربری به‌صورت ساختاریافته',
      'هرم‌سازی وضعیت: خام (وب) ← خلاصه مدل ← نشان ریسک عملیاتی',
    ],
    status: 'active',
    envKey: 'GEMINI_API_KEY',
  },
  {
    id: 'gemini-maps-grounding',
    title: 'استعلام اماکن و تأسیسات با Google Maps Grounding',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'شناسایی تیرپارک، پایانه، گمرک و مراکز خدمات رانندگان در حوالی مرز',
    provider: 'Gemini + Google Maps',
    license: 'سرویس تجاری گوگل',
    cost: 'بر پایه مصرف؛ کلید در سمت سرور',
    keyless: false,
    endpoint: 'POST /api/maps-grounding',
    refresh: 'در لحظه استعلام کاربر',
    compute: [
      'تزریق مختصات گذرگاه به‌عنوان محدوده بازیابی (retrievalConfig)',
      'استخراج لینک اماکن و نقل‌قول نظرات',
      'ادغام خروجی با نتایج Overpass برای پوشش رایگان و منبع‌باز',
    ],
    status: 'active',
    envKey: 'GEMINI_API_KEY',
  },
  {
    id: 'traffic-commercial',
    title: 'جریان ترافیک و رخدادهای جاده‌ای (تجاری)',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'زمان واقعی سفر، انسدادها و تصادفات روی کریدورهای اصلی',
    provider: 'TomTom Traffic / HERE Traffic / Google Routes',
    license: 'تجاری',
    cost: 'اشتراک ماهانه (سهمیه آزمایشی محدود)',
    keyless: false,
    endpoint: 'https://api.tomtom.com/routing/1/calculateRoute/…',
    refresh: 'دقیقه‌ای',
    compute: [
      'پروفایل کامیون (height/weight/maxSpeed) در درخواست مسیر',
      'تبدیل رخدادها به هشدارهای مکانی نزدیک مسیر',
      'برون‌یابی بهینه بین «سریع‌ترین» و «کم‌ریسک‌ترین» مسیر',
    ],
    status: 'needs_key',
    envKey: 'TOMTOM_API_KEY',
  },
  {
    id: 'field-reports',
    title: 'گزارش میدانی رانندگان و اپراتورهای مرزی',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'داده اختصاصی صف و زمان انتظار که هیچ سرویس بیرونی پوشش نمی‌دهد',
    provider: 'داده داخلی سامانه (ورودی کاربر/اپراتور)',
    license: 'اختصاصی سامانه',
    cost: 'بدون هزینه سرویس',
    keyless: true,
    endpoint: 'فرم ثبت گزارش + تأییدیه مکانی',
    refresh: 'پیوسته',
    compute: [
      'اعتبارسنجی گزارش (فاصله مکانی، تکرارپذیری، امتیاز گزارش‌دهنده)',
      'میانگین وزنی و میانه زمان انتظار در بازه‌های ۳۰ دقیقه‌ای',
      'تشخیص داده پرت و حذف گزارش‌های مشکوک',
      'درجه اطمینان نمایش‌داده‌شده کنار هر عدد (بالا/متوسط/پایین)',
    ],
    status: 'planned',
  },

  /* ── ۷. ارز، سوخت و برآورد هزینه ───────────────────────────────── */
  {
    id: 'frankfurter-fx',
    title: 'نرخ ارز زنده بانک مرکزی اروپا',
    category: 'ارز، سوخت و برآورد هزینه',
    purpose: 'تبدیل هزینه حمل به ارز مبدأ/مقصد در برنامه‌ریز چندوجهی و مشاور کریدور',
    provider: 'Frankfurter / ECB Reference Rates',
    license: 'داده آزاد؛ کد MIT',
    cost: 'رایگان بدون کلید',
    keyless: true,
    endpoint: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,TRY,CNY,INR,GBP',
    refresh: 'روزهای کاری، حدود ساعت ۱۶ به وقت اروپا',
    compute: [
      'نرمال‌سازی همه نرخ‌ها به یک ارز پایه',
      'میانگین متحرک ۷ روزه برای هموارسازی نوسان',
      'اعمال نرخ روز روی برآورد هزینه کرایه و بیمه محموله',
      'کش روزانه و نمایش تاریخ اعتبار نرخ',
    ],
    status: 'active',
  },
  {
    id: 'fuel-prices',
    title: 'قیمت سوخت و عوارض جاده‌ای',
    category: 'ارز، سوخت و برآورد هزینه',
    purpose: 'دقیق‌سازی سهم سوخت و عوارض در هزینه تمام‌شده هر سناریوی حمل',
    provider: 'داده دستی/دوره‌ای (بدون API آزاد پایدار)',
    license: 'داده عمومی',
    cost: 'بدون هزینه سرویس',
    keyless: true,
    endpoint: null,
    refresh: 'هفتگی',
    compute: [
      'نگهداری جدول قیمت سوخت به تفکیک کشور و تاریخ اعتبار',
      'محاسبه مصرف بر پایه تناژ، شیب مسیر و نوع خودرو',
      'افزودن هزینه عوارض و عبور از گذرگاه به مدل هزینه',
    ],
    status: 'planned',
  },

  /* ── ۸. تجارت، گمرک و مقررات ───────────────────────────────────── */
  {
    id: 'comtrade',
    title: 'آمار تجارت دوجانبه UN Comtrade',
    category: 'تجارت، گمرک و مقررات',
    purpose: 'حجم و ارزش صادرات/واردات هر گذرگاه برای تحلیل و پیش‌بینی بار',
    provider: 'UN Comtrade API',
    license: 'داده آزاد سازمان ملل',
    cost: 'رایگان سهمیه‌ای؛ سهمیه بالاتر با ثبت‌نام',
    keyless: false,
    endpoint: 'https://comtradeapi.un.org/data/v1/get/C/A/HS',
    refresh: 'ماهانه/سالانه',
    compute: [
      'نگاشت کد HS کالا به گروه کالایی خوانا',
      'تجمیع سری زمانی و محاسبه سهم هر گذرگاه از کل تجارت',
      'شناسایی روند و فصل‌بندی تقاضا',
    ],
    status: 'needs_key',
    envKey: 'COMTRADE_API_KEY',
  },
  {
    id: 'worldbank',
    title: 'شاخص‌های اقتصادی و لجستیکی بانک جهانی',
    category: 'تجارت، گمرک و مقررات',
    purpose: 'امتیاز لجستیک (LPI)، زمان ترخیص و ریسک کشوری برای امتیازدهی کریدور',
    provider: 'World Bank Open Data API',
    license: 'CC-BY-4.0',
    cost: 'رایگان بدون کلید',
    keyless: true,
    endpoint: 'https://api.worldbank.org/v2/country/{iso}/indicator/LP.LPI.OVRL.XQ?format=json',
    refresh: 'سالانه',
    compute: [
      'هم‌ترازی کد ISO کشورها با نام فارسی کشورها در اطلس',
      'تبدیل شاخص‌ها به وزن‌های امتیازدهی کریدور',
    ],
    status: 'keyless',
  },
  {
    id: 'news-rss',
    title: 'پایش خبری و مقرراتی گذرگاه‌ها',
    category: 'تجارت، گمرک و مقررات',
    purpose: 'هشدار زودهنگام تعطیلی مرز، اعتصاب، محدودیت فصلی و تغییر تعرفه',
    provider: 'خوراک‌های RSS خبرگزاری‌ها و نهادهای مرزی (IRNA، UNECE، IRU)',
    license: 'محتوای عمومی با ذکر منبع',
    cost: 'رایگان',
    keyless: true,
    endpoint: 'RSS/Atom + تحلیل Gemini',
    refresh: 'هر ۳۰ دقیقه',
    compute: [
      'پارس خوراک و حذف موارد تکراری',
      'تشخیص موجودیت گذرگاه/کشور در متن خبر',
      'امتیاز مرتبط‌بودن و دسته‌بندی (تعرفه، امنیت، زیرساخت)',
      'ارجاع خودکار خبر به کارت گذرگاه مربوطه',
    ],
    status: 'keyless',
  },

  /* ── ۹. تحلیل، اعتبارسنجی و پردازش داده ────────────────────────── */
  {
    id: 'data-validation',
    title: 'اعتبارسنجی طرح‌واره و تطبیق چندمنبعی',
    category: 'تحلیل، اعتبارسنجی و پردازش داده',
    purpose: 'تضمین «معتبر بودن» داده: جلوگیری از ورود مقدار نامعتبر و رفع تعارض منابع',
    provider: 'لایه داخلی (Zod + قواعد دامنه)',
    license: 'اختصاصی سامانه',
    cost: 'بدون هزینه سرویس',
    keyless: true,
    endpoint: 'لایه میانی سرور پیش از هر پاسخ API',
    refresh: 'در هر درخواست',
    compute: [
      'اعتبارسنجی طرح‌واره پاسخ هر سرویس پیش از مصرف',
      'بررسی بازه‌های منطقی (مختصات داخل ایران/همسایگان، ظرفیت مثبت)',
      'مقایسه دو منبع مستقل و ثبت درجه اطمینان (بالا/متوسط/پایین)',
      'علامت‌گذاری مقادیر کهنه با مهر زمانی و انقضا',
    ],
    status: 'keyless',
  },
  {
    id: 'geo-aggregation',
    title: 'خوشه‌بندی و تجمیع مکانی نقاط',
    category: 'تحلیل، اعتبارسنجی و پردازش داده',
    purpose: 'نمایش سریع هزاران نقطه/تأسیسات و محاسبه چگالی امکانات اطراف گذرگاه',
    provider: 'لایه داخلی (Supercluster / H3)',
    license: 'ISC / Apache-2.0',
    cost: 'رایگان',
    keyless: true,
    endpoint: null,
    refresh: 'در هر تغییر داده',
    compute: [
      'خوشه‌بندی سلسله‌مراتبی نقاط بر پایه سطح بزرگ‌نمایی',
      'شمارش امکانات در شبکه شش‌ضلعی H3 اطراف هر گذرگاه',
      'محاسبه «امتیاز پشتیبانی لجستیکی» هر مرز',
    ],
    status: 'keyless',
  },
  {
    id: 'graph-routing',
    title: 'محاسبات گراف شبکه راه و بهینه‌سازی مسیر',
    category: 'تحلیل، اعتبارسنجی و پردازش داده',
    purpose: 'الگوریتم‌های A*/Dijkstra روی شبکه ۲۴ کشور و انتخاب گذرگاه بهینه',
    provider: 'لایه داخلی سامانه',
    license: 'اختصاصی سامانه',
    cost: 'بدون هزینه سرویس',
    keyless: true,
    endpoint: null,
    refresh: 'در هر درخواست',
    compute: [
      'ساخت گراف وزنی از شهرها، گذرگاه‌ها و کریدورها',
      'وزن‌دهی ترکیبی زمان، مسافت، هزینه مرز و ریسک',
      'محرک A* با برآورد خط راست (haversine) و صف اولویت',
      'محاسبه مسیرهای جایگزین و مقایسه سناریوها',
    ],
    status: 'active',
  },
];

export interface CapabilityCategory {
  name: string;
  items: LiveDataCapability[];
}

export function groupCapabilitiesByCategory(
  items: LiveDataCapability[] = CAPABILITIES
): CapabilityCategory[] {
  const order: string[] = [];
  const map = new Map<string, LiveDataCapability[]>();
  items.forEach((item) => {
    if (!map.has(item.category)) {
      map.set(item.category, []);
      order.push(item.category);
    }
    map.get(item.category)!.push(item);
  });
  return order.map((name) => ({ name, items: map.get(name)! }));
}

export const CAPABILITY_SUMMARY = {
  total: CAPABILITIES.length,
  active: CAPABILITIES.filter((c) => c.status === 'active').length,
  keyless: CAPABILITIES.filter((c) => c.keyless).length,
  needsKey: CAPABILITIES.filter((c) => c.status === 'needs_key').length,
  categories: new Set(CAPABILITIES.map((c) => c.category)).size,
};
