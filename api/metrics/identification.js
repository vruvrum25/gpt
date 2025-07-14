export default async function handler(req, res) {
  try {
    console.log('=== Identification Request Debug ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
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

    // 🔧 ПРОВЕРЯЕМ ПРОКСИ-СЕКРЕТ
    const FPJS_PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    console.log('Using proxy secret:', FPJS_PROXY_SECRET.substring(0, 4) + '...');
    
    const FINGERPRINT_API = 'https://eu.api.fpjs.io';
    
    // Формируем URL точно как в PHP
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    const query = originalUrl.search.substring(1);
    
    let targetUrl = FINGERPRINT_API;
    if (query) {
      targetUrl += '?' + query + '&ii=custom-proxy-integration/1.0/ingress';
    } else {
      targetUrl += '?ii=custom-proxy-integration/1.0/ingress';
    }

    console.log('Target URL:', targetUrl);

    // Копируем все заголовки кроме cookie и проблемных
    const headers = {};
    const excludeHeaders = [
      'cookie', 
      'host', 
      'connection', 
      'content-length',
      'accept-encoding' // 🔧 ИСКЛЮЧАЕМ для избежания сжатия
    ];
    
    for (const [key, value] of Object.entries(req.headers)) {
      if (!excludeHeaders.includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    // Фильтрация _iidt cookie
    function filterIidtCookie(cookieString) {
      if (!cookieString) return '';
      const match = cookieString.match(/_iidt=([^;]+)/);
      return match ? `_iidt=${match[1]}` : '';
    }

    const cookieHeader = req.headers.cookie;
    const iidtCookie = filterIidtCookie(cookieHeader);
    if (iidtCookie) {
      headers.cookie = iidtCookie;
    }

    // 🔧 УЛУЧШЕННАЯ ВАЛИДАЦИЯ IP
    const clientIP = getClientIP(req);
    const forwardedHost = req.headers.host;
    
    console.log('=== Proxy Headers Validation ===');
    console.log('Client IP:', clientIP);
    console.log('Forwarded Host:', forwardedHost);
    console.log('Is valid public IP:', isValidPublicIP(clientIP));
    
    // Проверяем что IP публичный
    if (!isValidPublicIP(clientIP)) {
      console.error('Invalid or private IP detected:', clientIP);
      // 🔧 ПРИНУДИТЕЛЬНО УСТАНАВЛИВАЕМ ВАЛИДНЫЙ ПУБЛИЧНЫЙ IP
      const fallbackIP = '8.8.8.8'; // Или ваш реальный публичный IP
      console.log('Using fallback IP:', fallbackIP);
      headers['FPJS-Proxy-Client-IP'] = fallbackIP;
    } else {
      headers['FPJS-Proxy-Client-IP'] = clientIP;
    }
    
    if (!forwardedHost) {
      throw new Error('Missing host header');
    }

    // Устанавливаем обязательные Fingerprint заголовки
    headers['FPJS-Proxy-Secret'] = FPJS_PROXY_SECRET;
    headers['FPJS-Proxy-Forwarded-Host'] = forwardedHost;
    
    // 🔧 УБЕЖДАЕМСЯ ЧТО НЕТ СЖАТИЯ
    headers['Accept-Encoding'] = 'identity'; // Только несжатые ответы

    console.log('=== Final Request Headers ===');
    console.log('FPJS-Proxy-Secret:', headers['FPJS-Proxy-Secret'] ? '***SET***' : 'MISSING');
    console.log('FPJS-Proxy-Client-IP:', headers['FPJS-Proxy-Client-IP']);
    console.log('FPJS-Proxy-Forwarded-Host:', headers['FPJS-Proxy-Forwarded-Host']);

    const body = await getRawBody(req);
    console.log('Request body length:', body.length);

    console.log('Making request to Fingerprint API...');
    
    // 🔧 ПРОСТОЙ FETCH БЕЗ ЛИШНИХ ОПЦИЙ
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: headers,
      body: body,
    });

    console.log('=== Fingerprint API Response ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));

    // 🔧 ОБРАБОТКА ОШИБОК ОТ FINGERPRINT API
    if (!response.ok) {
      console.error('Fingerprint API error response');
      
      let errorText;
      try {
        // Пытаемся прочитать как текст
        errorText = await response.text();
        console.error('Error body (raw):', errorText);
        
        // Проверяем, может ли это быть JSON
        try {
          const errorJson = JSON.parse(errorText);
          console.error('Error body (parsed):', errorJson);
          errorText = JSON.stringify(errorJson);
        } catch (e) {
          // Оставляем как есть, если не JSON
        }
      } catch (readError) {
        console.error('Could not read error body:', readError);
        errorText = `Status: ${response.status} ${response.statusText}`;
      }
      
      throw new Error(`Fingerprint API returned ${response.status}: ${errorText}`);
    }

    // 🔧 БЕЗОПАСНОЕ ЧТЕНИЕ ТЕЛА ОТВЕТА
    const responseBody = await response.arrayBuffer();
    console.log('Response body length:', responseBody.byteLength);

    // Копируем заголовки ответа
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'strict-transport-security' && 
          lowerKey !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    res.status(response.status).send(Buffer.from(responseBody));

  } catch (error) {
    console.error('=== Identification Error ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Timestamp:', new Date().toISOString());
    
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

// 🔧 УЛУЧШЕННАЯ ФУНКЦИЯ ПОЛУЧЕНИЯ IP
function getClientIP(req) {
  const headers = req.headers;
  
  // Проверяем заголовки в порядке приоритета
  const possibleIPs = [
    headers['cf-connecting-ip'],
    headers['x-real-ip'],
    headers['x-vercel-forwarded-for'],
    headers['x-forwarded-for']
  ];
  
  console.log('Available IP headers:', {
    'cf-connecting-ip': headers['cf-connecting-ip'],
    'x-real-ip': headers['x-real-ip'],
    'x-vercel-forwarded-for': headers['x-vercel-forwarded-for'],
    'x-forwarded-for': headers['x-forwarded-for']
  });
  
  for (const ip of possibleIPs) {
    if (ip) {
      // Для x-forwarded-for берем первый IP
      const cleanIP = ip.split(',')[0].trim();
      if (isValidPublicIP(cleanIP)) {
        console.log('Found valid public IP:', cleanIP);
        return cleanIP;
      }
    }
  }
  
  // Fallback - замените на ваш реальный публичный IP
  console.log('No valid public IP found, using fallback');
  return '8.8.8.8';
}

// 🔧 ФУНКЦИЯ ПРОВЕРКИ ПУБЛИЧНОГО IP
function isValidPublicIP(ip) {
  if (!ip) return false;
  
  // Простая проверка IPv4
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  if (!ipv4Regex.test(ip)) {
    return false;
  }
  
  // Проверяем что IP не приватный
  const parts = ip.split('.').map(Number);
  
  // Приватные диапазоны IPv4
  if (parts[0] === 10) return false; // 10.0.0.0/8
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false; // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return false; // 192.168.0.0/16
  if (parts[0] === 127) return false; // 127.0.0.0/8 (localhost)
  if (parts[0] === 169 && parts[1] === 254) return false; // 169.254.0.0/16 (link-local)
  
  return true;
}

// Функция чтения raw body остается без изменений
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    req.on('data', chunk => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer);
    });
    
    req.on('error', reject);
  });
}
