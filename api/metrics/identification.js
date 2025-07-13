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
    
    // Создаем URL с расширенной диагностикой
    const identificationUrl = new URL('https://eu.api.fpjs.io');
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    identificationUrl.search = originalUrl.search;
    identificationUrl.searchParams.append('ii', 'custom-proxy-integration/1.0/ingress');

    console.log('Target URL:', identificationUrl.toString());

    // Подготавливаем заголовки с валидацией
    const headers = { ...req.headers };
    delete headers.cookie;

    // Улучшенная обработка cookies
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

    // Валидация и установка Fingerprint заголовков
    const clientIP = getClientIP(req);
    const forwardedHost = req.headers.host;
    
    console.log('Client IP:', clientIP);
    console.log('Forwarded Host:', forwardedHost);
    
    // Проверяем валидность IP
    if (!isValidIP(clientIP)) {
      throw new Error(`Invalid client IP: ${clientIP}`);
    }
    
    if (!forwardedHost) {
      throw new Error('Missing host header');
    }

    headers['FPJS-Proxy-Secret'] = FPJS_PROXY_SECRET;
    headers['FPJS-Proxy-Client-IP'] = clientIP;
    headers['FPJS-Proxy-Forwarded-Host'] = forwardedHost;
    
    // Убираем проблемные заголовки
    delete headers['host'];
    delete headers['connection'];
    delete headers['content-length'];

    console.log('Request headers to Fingerprint:', JSON.stringify(headers, null, 2));

    const body = await getRawBody(req);
    console.log('Request body length:', body.length);

    console.log('Making request to Fingerprint API...');
    
    // Добавляем таймаут и обработку ошибок
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 секунд
    
    try {
      const response = await fetch(identificationUrl.toString(), {
        method: 'POST',
        headers: headers,
        body: body,
        signal: controller.signal,
        // Дополнительные опции для отладки
        keepalive: false,
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
    
    // CORS заголовки для ошибок
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

// Улучшенная функция получения IP
function getClientIP(req) {
  // Проверяем различные заголовки в порядке приоритета
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
  
  // Fallback - используйте ваш реальный публичный IP
  return '8.8.8.8';
}

// Функция валидации IP
function isValidIP(ip) {
  // Простая проверка IPv4
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // Простая проверка IPv6
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// Функция получения raw body остается без изменений
async function getRawBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      return req.body;
    }
    if (Buffer.isBuffer(req.body)) {
      return req.body;
    }
    return JSON.stringify(req.body);
  }
  
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}
