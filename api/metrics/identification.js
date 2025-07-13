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

    const FPJS_PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    
    // 🔧 ИСПРАВЛЕНИЕ: Используем правильный EU endpoint
    const identificationUrl = new URL('https://eu.api.fpjs.io');
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    identificationUrl.search = originalUrl.search;
    identificationUrl.searchParams.append('ii', 'custom-proxy-integration/1.0/ingress');

    console.log('Target URL:', identificationUrl.toString());

    // 🔧 ИСПРАВЛЕНИЕ: Правильная подготовка заголовков
    const headers = {};
    
    // Копируем только нужные заголовки
    const allowedHeaders = [
      'accept',
      'accept-encoding', 
      'accept-language',
      'cache-control',
      'content-type',
      'user-agent',
      'sec-fetch-dest',
      'sec-fetch-mode',
      'sec-fetch-site'
    ];
    
    allowedHeaders.forEach(header => {
      if (req.headers[header]) {
        headers[header] = req.headers[header];
      }
    });

    // Обрабатываем cookies - оставляем только _iidt
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) acc[key] = value;
        return acc;
      }, {});
      
      if (cookies._iidt) {
        headers.cookie = `_iidt=${cookies._iidt}`;
      }
    }

    // Валидация IP и Host
    const clientIP = getClientIP(req);
    const forwardedHost = req.headers.host;
    
    console.log('Client IP:', clientIP);
    console.log('Forwarded Host:', forwardedHost);
    
    if (!isValidIP(clientIP)) {
      throw new Error(`Invalid client IP: ${clientIP}`);
    }
    
    if (!forwardedHost) {
      throw new Error('Missing host header');
    }

    // 🔧 ИСПРАВЛЕНИЕ: Добавляем обязательные Fingerprint заголовки
    headers['FPJS-Proxy-Secret'] = FPJS_PROXY_SECRET;
    headers['FPJS-Proxy-Client-IP'] = clientIP;
    headers['FPJS-Proxy-Forwarded-Host'] = forwardedHost;
    
    // 🔧 ИСПРАВЛЕНИЕ: Убеждаемся, что Content-Type правильный
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    console.log('Request headers to Fingerprint:', JSON.stringify(headers, null, 2));

    // 🔧 ИСПРАВЛЕНИЕ: Улучшенная обработка тела запроса
    const body = await getRawBody(req);
    console.log('Request body length:', body.length);
    console.log('Request body preview:', body.substring(0, 200));

    console.log('Making request to Fingerprint API...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    
    try {
      const response = await fetch(identificationUrl.toString(), {
        method: 'POST',
        headers: headers,
        body: body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      console.log('Fingerprint API response status:', response.status);
      console.log('Fingerprint API response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error('Fingerprint API error response');
        const errorText = await response.text();
        console.error('Error body:', errorText);
        throw new Error(`Fingerprint API returned ${response.status}: ${errorText}`);
      }

      const responseBody = await response.arrayBuffer();
      console.log('Response body length:', responseBody.byteLength);

      // Устанавливаем заголовки ответа
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() !== 'strict-transport-security') {
          res.setHeader(key, value);
        }
      }
      
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      res.status(response.status).send(Buffer.from(responseBody));
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout after 25 seconds');
      }
      
      console.error('Fetch error details:', {
        name: fetchError.name,
        message: fetchError.message,
        cause: fetchError.cause,
        stack: fetchError.stack
      });
      
      throw fetchError;
    }

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

function getClientIP(req) {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  const xRealIp = req.headers['x-real-ip'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  const xVercelForwardedFor = req.headers['x-vercel-forwarded-for'];
  
  console.log('IP headers:', {
    'cf-connecting-ip': cfConnectingIp,
    'x-real-ip': xRealIp,
    'x-forwarded-for': xForwardedFor,
    'x-vercel-forwarded-for': xVercelForwardedFor
  });
  
  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xVercelForwardedFor) return xVercelForwardedFor.split(',')[0].trim();
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  
  // 🔧 ВАЖНО: Замените на ваш реальный публичный IP
  return '8.8.8.8';
}

function isValidIP(ip) {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// 🔧 ИСПРАВЛЕНИЕ: Улучшенная функция получения raw body
async function getRawBody(req) {
  // Проверяем, есть ли уже обработанное тело
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      return req.body;
    }
    if (Buffer.isBuffer(req.body)) {
      return req.body;
    }
    if (typeof req.body === 'object') {
      return JSON.stringify(req.body);
    }
  }
  
  // Читаем raw тело из потока
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
