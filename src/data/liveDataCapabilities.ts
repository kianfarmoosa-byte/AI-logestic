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
  {
    id: 'basemap-extras',
    title: 'کاشی‌های تکمیلی نقشه پایه (توپوگرافی، بشردوستانه، ماهواره‌ای)',
    category: 'نقشه پایه و کاشی‌سازی',
    purpose: 'انتخاب نقشه پایه متناسب با تحلیل: توپوگرافی برای گردنه‌ها، HOT برای مناطق کم‌پوشش، تصویر هوایی برای گذرگاه‌ها',
    provider: 'OpenTopoMap · HOT OSM · CARTO Positron · CyclOSM · Esri World Imagery',
    license: 'CC-BY-SA / ODbL و تصویر Esri با ذکر منبع',
    cost: 'رایگان، بدون کلید',
    keyless: true,
    endpoint:
      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png | https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png | https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png | https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png | https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    refresh: 'به‌روز از داده OSM / تصویر ماهواره‌ای ثابت',
    compute: [
      'ساخت استایل شطرنجی MapLibre برای هر منبع همراه با ذکر منبع',
      'سوییچ زندهٔ نقشهٔ پایه بدون بازسازی لایه‌های داده (رویداد style.load)',
      'انتخاب خودکار نقشهٔ پایهٔ روشن/تیره هم‌راستا با تم سامانه',
    ],
    status: 'active',
  },
  {
    id: 'map-overlays',
    title: 'لایه‌های تحلیلی روی نقشه (راه‌آهن، دریا و سایهٔ ارتفاع)',
    category: 'نقشه پایه و کاشی‌سازی',
    purpose: 'دیدن شبکهٔ ریلی، علائم دریایی و بندرها و ناهمواری زمین روی همان نقشه برای تحلیل کریدور',
    provider: 'OpenRailwayMap · OpenSeaMap · Mapterhorn (ارتفاع)',
    license: 'CC-BY-SA / ODbL / دادهٔ ارتفاع رایگان',
    cost: 'رایگان، بدون کلید',
    keyless: true,
    endpoint:
      'https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png | https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png | https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
    refresh: 'به‌روز از داده OSM / دادهٔ ارتفاع ثابت',
    compute: [
      'افزودن لایهٔ شطرنجی روی نقشهٔ پایه با شفافیت قابل تنظیم',
      'تبدیل کاشی terrarium وب‌پی (Mapterhorn) به منبع raster-dem و رندر سایه‌نگاری ارتفاع (hillshade)',
      'افزودن/حذف پویا هنگام تغییر استایل نقشهٔ پایه',
    ],
    status: 'active',
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
    purpose: 'مسافت و زمان واقعی مسیر در «مسیریاب حمل و نقل» و «ترانزیت‌یاب» — جایگزین تخمین داخلی',
    provider: 'Project OSRM (داده OSM)',
    license: 'BSD-2-Clause / ODbL',
    cost: 'رایگان؛ سرور نمایشی بدون کلید',
    keyless: true,
    endpoint: 'POST /api/route/plan → https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&alternatives=3',
    refresh: 'به‌روز از داده OSM',
    compute: [
      'تبدیل مختصات جغرافیایی از/به قالب OSRM و رمزگشایی هندسه GeoJSON',
      'دریافت تا ۳ مسیر جایگزین در یک فراخوانی (alternatives=3) و مقایسهٔ زمان/هزینه/ریسک در کنار هم',
      'پروفایل پیادهٔ مرزی (foot) با پشتیبان خودرویی در صورت نبود پروفایل',
      'پشتیبان اتصال مستقیم مرورگر در صورت در دسترس نبودن واسط سرور',
      'کشف گذرگاه‌های مرزی نزدیک به هندسهٔ مسیر (پنجرهٔ ۴۰ کیلومتری) از دادهٔ اطلس',
    ],
    status: 'active',
  },
  {
    id: 'ors',
    title: 'مسیریابی و محدوده دسترسی OpenRouteService',
    category: 'مسیریابی، شبکه و محدوده دسترسی',
    purpose: 'پروفایل HGV سازمانی برای محدودیت‌های فیزیکی و ایزوکرون پشتیبان (پیش‌فرض سامانه بدون کلید کار می‌کند)',
    provider: 'HeiGIT / OpenRouteService',
    license: 'داده ODbL؛ سرویس با کلید آزاد',
    cost: 'رایگان تا ۲۰۰۰ درخواست در روز',
    keyless: false,
    endpoint: 'POST /api/route/plan و /api/route/isochrone → https://api.openrouteservice.org/v2/directions/driving-hgv',
    refresh: 'به‌روز از داده OSM',
    compute: [
      'اعمال driving-hgv با ابعاد، وزن، طول و بار محور روی گراف',
      'ایزوکرون سازمانی ۲ تا ۱۲ ساعته (در صورت نبود کلید، Valhalla جایگزین می‌شود)',
      'مسیرهای جایگزین با alternative_routes و در صورت خطا بازگشت به مسیر اصلی',
      'اولویت خودکار در پروفایل کامیون وقتی کلید تنظیم شده باشد',
    ],
    status: 'needs_key',
    envKey: 'ORS_API_KEY',
  },
  {
    id: 'valhalla',
    title: 'موتور مسیریابی Valhalla (خودمیزبان)',
    category: 'مسیریابی، شبکه و محدوده دسترسی',
    purpose: 'کامیون با اعمال واقعی محدودیت ارتفاع/تناژ/عرض/بار محور و ایزوکرون دسترسی ۲ تا ۱۲ ساعته',
    provider: 'Valhalla (نمونهٔ عمومی OSM یا نمونهٔ خودمیزبان سازمانی)',
    license: 'MIT / ODbL',
    cost: 'رایگان؛ نمونهٔ عمومی بدون کلید و نمونهٔ خودمیزبان با VALHALLA_URL',
    keyless: true,
    endpoint: 'POST /api/route/plan و /api/route/isochrone → https://valhalla1.openstreetmap.de (یا VALHALLA_URL)',
    refresh: 'همگام با به‌روزرسانی داده OSM',
    compute: [
      'costing تخصصی truck با costing_options ارتفاع، عرض، طول، وزن، بار محور و hazmat',
      'costing های auto (خودرو)، bus (اتوبوس) و pedestrian (پیادهٔ مرزی)',
      'ایزوکرون بدون کلید برای بازه‌های ۲، ۳، ۴، ۶، ۸، ۱۰ و ۱۲ ساعت',
      'رمزگشایی پلی‌لاین دقت ۶ و مسیرهای جایگزین (alternates)',
      'امکان جایگزینی کامل با نمونهٔ خودمیزبان سازمانی از طریق متغیر VALHALLA_URL',
    ],
    status: 'active',
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
    id: 'ai-transit-assistant',
    title: 'دستیار هوشمند استعلام ترانزیتی',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'آخرین وضعیت صف کامیون، ساعات کار گمرک، اخبار مسیر و مقررات کارنه تیر',
    provider: 'درگاه مدل زبانی سازمانی (سرور Express)',
    license: 'بر پایه قرارداد سرویس‌دهندهٔ مدل',
    cost: 'بر پایه مصرف؛ کلید فقط در سمت سرور',
    keyless: false,
    endpoint: 'POST /api/search-grounding',
    refresh: 'در لحظه استعلام کاربر',
    compute: [
      'غنی‌سازی پرسش با نام گذرگاه، کشور و دسته موضوعی',
      'تغذیهٔ نتایج واقعی جستجوی وب سامانه به مدل به‌عنوان زمینهٔ استناد',
      'دسته‌بندی پاسخ و بازگشت به رابط کاربری به‌صورت ساختاریافته',
      'هرم‌سازی وضعیت: خام (وب) ← خلاصه مدل ← نشان ریسک عملیاتی',
    ],
    status: 'active',
    envKey: 'AI_API_KEY',
  },
  {
    id: 'ai-places-assistant',
    title: 'استعلام اماکن و تأسیسات لجستیکی',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'شناسایی تیرپارک، پایانه، گمرک و مراکز خدمات رانندگان در حوالی مرز',
    provider: 'درگاه مدل زبانی سازمانی + جستجوی وب سامانه',
    license: 'بر پایه قرارداد سرویس‌دهندهٔ مدل',
    cost: 'بر پایه مصرف؛ کلید فقط در سمت سرور',
    keyless: false,
    endpoint: 'POST /api/maps-grounding',
    refresh: 'در لحظه استعلام کاربر',
    compute: [
      'تزریق مختصات گذرگاه به‌عنوان محدودهٔ بازیابی مکانی',
      'استخراج نشانی اماکن و نقل‌قول منابع از نتایج واقعی وب',
      'ادغام خروجی با نتایج Overpass برای پوشش رایگان و منبع‌باز',
    ],
    status: 'active',
    envKey: 'AI_API_KEY',
  },
  {
    id: 'exa-search',
    title: 'جستجوی معنایی وب (Exa)',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'نتایج معنایی و به‌روز وب برای تحلیل کریدور، اخبار ترانزیت و پرسش‌های تحلیلی',
    provider: 'Exa',
    license: 'سرویس تجاری — اعتبار رایگان ماهانه',
    cost: 'اعتبار رایگان ماهانه + پرداخت بر اساس مصرف',
    keyless: false,
    endpoint: 'POST /api/web-search → https://api.exa.ai/search',
    refresh: 'بلادرنگ',
    compute: [
      'ارسال درخواست semantic search با تعداد مشخص و متن کامل صفحه',
      'نگاشت خروجی Exa به قالب یکسان نتایج جستجو',
      'استفاده به‌عنوان موتور اصلی جستجوی وب سامانه',
    ],
    status: 'needs_key',
    envKey: 'EXA_API_KEY',
  },
  {
    id: 'wikipedia-fallback',
    title: 'جستجوی جایگزین ویکی‌پدیای فارسی (بدون کلید)',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'اطمینان از کارکرد جستجو حتی بدون هیچ کلیدی؛ دانش پایه دربارهٔ گذرگاه‌ها، کریدورها و شهرها',
    provider: 'Wikimedia Action API',
    license: 'CC-BY-SA',
    cost: 'رایگان، بدون کلید',
    keyless: true,
    endpoint: 'https://fa.wikipedia.org/w/api.php?action=query&list=search',
    refresh: 'بلادرنگ',
    compute: [
      'جستجوی فارسی با srlimit و تبدیل HTML چکیده به متن ساده',
      'استفاده به‌عنوان آخرین حلقهٔ زنجیرهٔ جستجو',
    ],
    status: 'active',
  },
  {
    id: 'borderpark-live',
    title: 'وضعیت زندهٔ صف مرزها — سامانهٔ نوبتدهی Border Park',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'دادهٔ رسمی و لحظهای صف ناوگان، نوبتدهی، پذیرش گمرک و تیرپارکهای فعال مرزهای دارای سامانه',
    provider: 'سامانهٔ نوبتدهی ناوگان مرزی گمرک (borderpark.ir) — منبع رسمی',
    license: 'دادهٔ رسمی عمومی گمرک',
    cost: 'رایگان',
    keyless: true,
    endpoint: 'GET /api/border-park/status + /status/:slug — واکشی از صفحات وضعیت ۶ مرز (بازرگان، رازی، نوردوز، جلفا، دوغارون، ریمدان)',
    refresh: 'حافظهٔ نهان ۱۵ دقیقهای؛ مهر بهروزرسانی خود سامانه',
    compute: [
      'پارس جدول صفها: کل، فراخوان شده، در انتظار ورود، پذیرش گمرک، زمان انتظار (ساعت)',
      'جمع هوشمند: تشخیص ردیفهای تجمیعی («صادرات»، «ترانزیت») و جمع زیرگروهها',
      'تبدیل اعداد فارسی و فرمت «(غایب) حاضر» سامانه به عدد مجموع',
      'استخراج تیرپارکهای فعال با ظرفیت تریلی و خدمات',
      'تزریق خودکار دادهٔ زنده به استعلام هوشمند (اولویت رسمی بر اخبار)',
      'داشبورد زنده با لینک نقشه و رنگبندی شدت زمان انتظار',
    ],
    status: 'active',
  },
  {
    id: 'border-flow-monitor',
    title: 'پایش جریان مرزها — کامیون و بار ورودی/خروجی (فاز ۰)',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'دادهٔ مستمر تردد کامیون و جریان بار مرزی با نوع کالا (HS) و کشور طرف معامله، همراه با امتیاز اعتماد چندمنبعی',
    provider: 'درگاه آمار رسمی اتاق تهران (گمرک×کشور×HS) + آیندگان خبری مرزهای پرترافیک + استخراج ساختاریافتهٔ مدل زبانی',
    license: 'آمار رسمی با ذکر منبع + اخبار رسانه‌ها',
    cost: 'رایگان (منابع عمومی)',
    keyless: true,
    endpoint: 'GET /api/border-flow + GET /api/border-flow/:gateId — نگاشت گمرک↔گذرگاه در customsGateMap.ts',
    refresh: 'حافظهٔ نهان ۳۰ دقیقهای؛ آیندگان خبری ۱۰ مرز پرترافیک',
    compute: [
      'نگاشت ۲۸ گمرک رسمی ایران به گذرگاههای اطلس با نرمالسازی نام (منطقه ویژه، ریلی،...) ',
      'واکشی آمار گمرک×کشور×HS×ماه از درگاه اتاق تهران (با کنترل TLS نامعتبر سایت)',
      'جستجوی خبری هفتگی مرزهای پرترافیک با موتور معنایی + متن کامل صفحه',
      'استخراج ساختاریافتهٔ تعداد کامیون/تناژ/جهت از متن خبر با مدل زبانی (تبدیل اعداد فارسی)',
      'امتیاز اعتماد: اعتبار منبع × تازگی × همرأیی (رسمی بالا، خبری نیازمند تأیید)',
      'داشبورد جریان مرزها با لینک مستقیم هر رکورد به گذرگاه روی نقشه',
    ],
    status: 'active',
  },
  {
    id: 'search-geotagging',
    title: 'مکان‌یابی نتایج جستجو روی نقشه و اتصال به گذرگاه‌ها',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'استخراج نام مکان‌ها از نتایج جستجو و نشان‌دادن آن‌ها روی نقشه، به‌همراه خط اتصال به نزدیک‌ترین گذرگاه مرزی با فاصلهٔ واقعی جاده‌ای و زمان سفر',
    provider: 'موتور محلی اطلس (فهرست مکانی از داده‌های گذرگاه‌ها، شهرها، کریدورها و کشورها)',
    license: 'دادهٔ خود پروژه',
    cost: 'رایگان، بدون کلید و بدون سرویس بیرونی',
    keyless: true,
    endpoint:
      'src/services/geoTagging.ts → buildGazetteer / tagText / geoTagResults / fetchRoadMatrix → POST /api/route/distances (OSRM table) + fetchRoadLinks → POST /api/route/road-links (OSRM route)',
    refresh: 'بلادرنگ در مرورگر',
    compute: [
      'ساخت فهرست مکانی (گازتیر) با بیش از ۲۰۰ نام از داده‌های خود اطلس',
      'یکسان‌سازی متن فارسی/عربی برای تطبیق قابل‌اعتماد نام‌ها',
      'الویت‌بندی تطبیق: گذرگاه مرزی > شهر > کریدور > کشور',
      'غربال گذرگاه‌های نامزد با فاصلهٔ هوایی و سپس انتخاب نزدیک‌ترین گذرگاه بر پایهٔ فاصلهٔ واقعی جاده‌ای (ماتریس OSRM)',
      'رسم هندسهٔ واقعی مسیر جاده‌ای تا گذرگاه (خط ممتد) بهجای خط مستقیم، با حافظهٔ نهان سمت سرور و درخواست ترتیبی برای رعایت محدودیت نرخ',
      'زمان تخمینی سفر جاده‌ای تا گذرگاه و بازگشت به فاصلهٔ/خط هوایی در صورت نبود شبکه',
    ],
    status: 'active',
  },
  {
    id: 'search-geojson',
    title: 'خروجی GeoJSON نتایج جستجو و خطوط اتصال گذرگاه',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'دانلود یا کپی مجموعهٔ عارضهٔ استاندارد از نتایج مکانی‌یابی‌شده برای استفاده در GIS، گزارش‌ها و اشتراک‌گذاری',
    provider: 'تولید محلی FeatureCollection با استاندارد EPSG:4326',
    license: 'دادهٔ خود پروژه',
    cost: 'رایگان، بدون کلید',
    keyless: true,
    endpoint: 'src/services/geoTagging.ts → buildSearchGeoJSON / downloadGeoJson',
    refresh: 'بلادرنگ در مرورگر',
    compute: [
      'عارضه‌های Point برای نشانه‌های جستجو و گذرگاه‌های متصل',
      'عارضه‌های LineString برای خطوط اتصال نشانه به گذرگاه با فاصلهٔ کیلومتری',
      'حفظ فرادادهٔ پرسش، موتور جستجو و زمان تولید در properties مجموعه',
      'دانلود مستقیم به‌صورت فایل .geojson یا کپی در کلیپ‌بورد',
    ],
    status: 'active',
  },
  {
    id: 'traffic-commercial',
    title: 'جریان ترافیک و رخدادهای جاده‌ای (تجاری)',
    category: 'صف، ترافیک و وضعیت عملیاتی مرز',
    purpose: 'زمان واقعی سفر، انسدادها و تصادفات روی کریدورهای اصلی',
    provider: 'TomTom Traffic / HERE Traffic / سرویس‌های مسیریابی تجاری',
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
    endpoint: 'RSS/Atom + تحلیل مدل زبانی',
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
