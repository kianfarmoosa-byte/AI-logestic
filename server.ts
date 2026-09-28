import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI SDK lazily so a missing key never breaks server startup
let aiClient: GoogleGenAI | null = null;

const MISSING_KEY_MESSAGE =
  'کلید GEMINI_API_KEY روی سرور تنظیم نشده است. آن را در بخش تنظیمات › Environment (Keys) وارد کنید تا استعلام‌های بلادرنگ فعال شوند. سایر بخش‌ها (نقشه منبع‌باز، داده‌های زنده جوی و ارزی) بدون کلید کار می‌کنند.';

function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Model for text and grounding tasks
const GROUNDING_MODEL = 'gemini-3.8-flash';

// API: Search Grounding via Google Search
app.post('/api/search-grounding', async (req, res) => {
  try {
    const { query, crossingName, country, category } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(503).json({ error: MISSING_KEY_MESSAGE });
    }

    const systemInstruction = `شما دستیار ارشد هوشمند «اطلس شبکه جاده‌ای، گذرگاه‌های مرزی و ترانزیت ایران و اوراسیا» هستید.
وظیفه شما ارائه تازه‌ترین، دقیق‌ترین و معتبرترین اطلاعات میدانی، اخبار تجاری، وضعیت صف کامیون‌ها، ساعات کار گمرکات، محدودیت‌های ترافیکی یا فصلی، مقررات کارنه تیر (TIR)، و شرایط واردات/صادرات با اتکا به جستجوی وب گوگل (Google Search Grounding) است.
پاسخ را به زبان فارسی روان، ساختاریافته و با قالب‌بندی منظم شامل نکات کلیدی، وضعیت عملیاتی، و توصیه‌های ترانزیتی بنویسید.`;

    const prompt = `موضوع استعلام ترانزیتی و مرزی:
${query}
${crossingName ? `نام گذرگاه مرزی: ${crossingName}` : ''}
${country ? `کشور هدف: ${country}` : ''}
${category ? `دسته‌بندی موضوعی: ${category}` : ''}

لطفاً بر اساس تازه‌ترین اطلاعات موجود در وب:
۱. آخرین وضعیت عملیاتی، تردد کامیون‌ها، صف انتظار یا محدودیت‌های اعمال‌شده را گزارش کنید.
۲. نکات گمرکی، مدارک ترخیص یا توافقات دوجانبه اخیر را بررسی کنید.
۳. توصیه‌های عملیاتی برای رانندگان، شرکت‌های کریری و بازرگانان ارائه دهید.`;

    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
      },
    });

    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks || [];
    const searchQueries = groundingMetadata?.webSearchQueries || [];

    // Extract web citations
    const webSources = groundingChunks
      .filter((chunk: any) => chunk.web && chunk.web.uri)
      .map((chunk: any) => ({
        uri: chunk.web.uri,
        title: chunk.web.title || chunk.web.uri,
      }));

    // Deduplicate sources by URI
    const uniqueSources = Array.from(new Map(webSources.map((item: any) => [item.uri, item])).values());

    return res.json({
      success: true,
      text: response.text || '',
      sources: uniqueSources,
      searchQueries,
    });
  } catch (error: any) {
    console.error('Error in search grounding:', error);
    return res.status(500).json({
      error: 'خطا در ارتباط با سرویس جستجوی بلادرنگ گوگل',
      details: error.message || String(error),
    });
  }
});

// API: Maps Grounding via Google Maps
app.post('/api/maps-grounding', async (req, res) => {
  try {
    const { query, latitude, longitude, radiusKm } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(503).json({ error: MISSING_KEY_MESSAGE });
    }

    const systemInstruction = `شما کارشناس لجستیک و مکان‌یابی مکانی «اطلس گذرگاه‌های مرزی و ترانزیتی» هستید.
با استفاده از داده‌های مکانی موثق گوگل مپس (Google Maps Grounding)، اطلاعات پارکینگ‌های تیر (TIR Park)، تیرپارک‌ها، پایانه‌های مرزی، گمرکات، انبارهای سرپوشیده و سردخانه‌ها، آزمایشگاه‌های قرنطینه، پمپ‌بنزین‌ها و مراکز خدمات رفاهی رانندگان بین‌المللی را به دقت استخراج و معرفی کنید.
پاسخ باید ساختاریافته به زبان فارسی باشد.`;

    const config: any = {
      systemInstruction,
      tools: [{ googleMaps: {} }],
    };

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude,
            longitude,
          },
        },
      };
    }

    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: query,
      config,
    });

    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks || [];

    // Extract maps places, uris and review snippets
    const mapPlaces = groundingChunks
      .filter((chunk: any) => chunk.maps && chunk.maps.uri)
      .map((chunk: any) => ({
        uri: chunk.maps.uri,
        title: chunk.maps.title || 'مکان در گوگل مپس',
        reviewSnippets: chunk.maps.placeAnswerSources?.reviewSnippets || [],
      }));

    const uniquePlaces = Array.from(new Map(mapPlaces.map((p: any) => [p.uri, p])).values());

    return res.json({
      success: true,
      text: response.text || '',
      places: uniquePlaces,
    });
  } catch (error: any) {
    console.error('Error in maps grounding:', error);
    return res.status(500).json({
      error: 'خطا در ارتباط با سرویس داده‌های مکانی گوگل مپس',
      details: error.message || String(error),
    });
  }
});

// API: Multi-modal AI Corridor Advisor with Search Grounding
app.post('/api/corridor-ai-advisor', async (req, res) => {
  try {
    const { origin, destination, cargoType, weightTons, selectedMode, customNotes } = req.body;

    const ai = getAI();
    if (!ai) {
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

    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks || [];

    const webSources = groundingChunks
      .filter((chunk: any) => chunk.web && chunk.web.uri)
      .map((chunk: any) => ({
        uri: chunk.web.uri,
        title: chunk.web.title || chunk.web.uri,
      }));

    return res.json({
      success: true,
      text: response.text || '',
      sources: Array.from(new Map(webSources.map((item: any) => [item.uri, item])).values()),
    });
  } catch (error: any) {
    console.error('Error in corridor advisor:', error);
    return res.status(500).json({
      error: 'خطا در تولید تحلیل راهبردی کریدور',
      details: error.message || String(error),
    });
  }
});

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
