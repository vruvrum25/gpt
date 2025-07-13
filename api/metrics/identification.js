export default async function handler(req, res) {
  try {
    // 🔧 ДОБАВЛЯЕМ CORS ЗАГОЛОВКИ В НАЧАЛЕ
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fpjs-client-version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Обрабатываем preflight OPTIONS запрос
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    console.log('=== Identification Request ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const FPJS_PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    
    const identificationUrl = new URL('https://api.fpjs.io');
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    identificationUrl.search = originalUrl.search;
    identificationUrl.searchParams.append('ii', 'custom-proxy-integration/1.0/ingress');

    const headers = { ...req.headers };
    delete headers.cookie;

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

    headers['FPJS-Proxy-Secret'] = FPJS_PROXY_SECRET;
    headers['FPJS-Proxy-Client-IP'] = getClientIP(req);
    headers['FPJS-Proxy-Forwarded-Host'] = req.headers.host;

    const body = await getRawBody(req);

    console.log('Making request to Fingerprint API...');
    
    const response = await fetch(identificationUrl.toString(), {
      method: 'POST',
      headers: headers,
      body: body,
    });

    console.log('Fingerprint API response status:', response.status);

    const responseBody = await response.arrayBuffer();

    // 🔧 СОХРАНЯЕМ CORS ЗАГОЛОВКИ ПРИ КОПИРОВАНИИ
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() !== 'strict-transport-security') {
        res.setHeader(key, value);
      }
    }
    
    // 🔧 УБЕЖДАЕМСЯ ЧТО CORS ЗАГОЛОВКИ ОСТАЛИСЬ
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    res.status(response.status).send(Buffer.from(responseBody));

  } catch (error) {
    console.error('Identification error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // 🔧 CORS ЗАГОЛОВКИ ДЛЯ ОШИБОК
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

// Вспомогательные функции остаются без изменений
function getClientIP(req) {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  const xRealIp = req.headers['x-real-ip'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  
  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  
  return '8.8.8.8';
}

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
