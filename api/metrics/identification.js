export default async function handler(req, res) {
  try {
    console.log('=== Identification Request Debug ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    
    // CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fpjs-client-version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const FPJS_PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    const FINGERPRINT_API = 'https://eu.api.fpjs.io';
    
    // 🔧 ИСПРАВЛЕНИЕ: Точно как в PHP - формируем URL
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    const query = originalUrl.search.substring(1); // Убираем '?' в начале
    
    // Базовый URL (без динамического пути для POST запросов)
    let targetUrl = FINGERPRINT_API;
    
    // 🔧 ИСПРАВЛЕНИЕ: Добавляем query параметры точно как в PHP
    if (req.method === 'POST') {
      if (query) {
        targetUrl += '?' + query + '&ii=custom-proxy-integration/1.0/ingress';
      } else {
        targetUrl += '?ii=custom-proxy-integration/1.0/ingress';
      }
    } else {
      if (query) {
        targetUrl += '?' + query;
      }
    }

    console.log('Target URL:', targetUrl);

    // 🔧 ИСПРАВЛЕНИЕ: Копируем ВСЕ заголовки кроме cookie (как в PHP)
    const headers = {};
    
    // Копируем все заголовки кроме cookie
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() !== 'cookie') {
        headers[key] = value;
      }
    }

    // 🔧 ИСПРАВЛЕНИЕ: Фильтрация _iidt cookie точно как в PHP
    function filterIidtCookie(cookieString) {
      if (!cookieString) return '';
      const match = cookieString.match(/_iidt=([^;]+)/);
      return match ? `_iidt=${match[1]}` : '';
    }

    // Добавляем только _iidt cookie если есть
    const cookieHeader = req.headers.cookie;
    const iidtCookie = filterIidtCookie(cookieHeader);
    if (iidtCookie) {
      headers.cookie = iidtCookie;
    }

    // 🔧 ИСПРАВЛЕНИЕ: Добавляем прокси-заголовки только для POST (как в PHP)
    if (req.method === 'POST') {
      const clientIP = getClientIP(req);
      const forwardedHost = req.headers.host;
      
      console.log('Client IP:', clientIP);
      console.log('Forwarded Host:', forwardedHost);
      
      headers['FPJS-Proxy-Secret'] = FPJS_PROXY_SECRET;
      headers['FPJS-Proxy-Client-IP'] = clientIP;
      headers['FPJS-Proxy-Forwarded-Host'] = forwardedHost;
    }

    console.log('Request headers to Fingerprint:', JSON.stringify(headers, null, 2));

    // 🔧 ИСПРАВЛЕНИЕ: Читаем raw body точно как в PHP (file_get_contents('php://input'))
    const body = await getRawBody(req);
    console.log('Request body length:', body.length);
    
    // Показываем первые символы тела для отладки
    if (body.length > 0) {
      console.log('Request body preview:', body.toString().substring(0, 100));
    }

    console.log('Making request to Fingerprint API...');
    
    // 🔧 ИСПРАВЛЕНИЕ: Простой fetch без лишних опций
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method === 'POST' ? body : undefined,
    });

    console.log('Fingerprint API response status:', response.status);
    console.log('Fingerprint API response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fingerprint API error:', errorText);
      throw new Error(`Fingerprint API returned ${response.status}: ${errorText}`);
    }

    // 🔧 ИСПРАВЛЕНИЕ: Получаем тело как ArrayBuffer
    const responseBody = await response.arrayBuffer();
    console.log('Response body length:', responseBody.byteLength);

    // 🔧 ИСПРАВЛЕНИЕ: Копируем заголовки ответа (исключаем проблемные)
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'strict-transport-security' && 
          lowerKey !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }
    
    // Добавляем CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Отправляем ответ с тем же статус кодом
    res.status(response.status).send(Buffer.from(responseBody));

  } catch (error) {
    console.error('Identification error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      url: req.url,
      method: req.method
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Content-Type', 'application/json');
    
    const requestId = `${Date.now()}.${Math.random().toString(36).substr(2, 6)}`;
    
    res.status(500).json({
      v: '2',
      error: {
        code: 'IntegrationFailed',
        message: `An identification error occurred with the custom integration. Reason: ${error.message}`,
      },
      requestId,
      products: {},
    });
  }
}

// 🔧 ИСПРАВЛЕНИЕ: Точная копия PHP логики getClientIp()
function getClientIP(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',');
    return ips[0].trim();
  }
  return req.headers['x-real-ip'] || 
         req.headers['cf-connecting-ip'] || 
         '8.8.8.8'; // Fallback
}

// 🔧 ИСПРАВЛЕНИЕ: Точная копия PHP file_get_contents('php://input')
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    req.on('data', chunk => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      // Возвращаем Buffer, точно как PHP
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });
    
    req.on('error', reject);
  });
}
