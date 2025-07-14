export default async function handler(req, res) {
  try {
    console.log('=== Starting Fingerprint Proxy ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);

    // CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fpjs-client-version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    const FINGERPRINT_API = 'https://eu.api.fpjs.io';

    function getClientIp() {
      const xForwardedFor = req.headers['x-forwarded-for'];
      if (xForwardedFor) {
        const ips = xForwardedFor.split(',');
        return ips[0].trim();
      }
      return '89.117.67.22';
    }

    function getHost() {
      return req.headers['x-forwarded-host'] || req.headers.host || '';
    }

    // 🔧 ИСПРАВЛЕННАЯ функция для парсинга cookies
    function parseCookies(cookieHeader) {
      if (!cookieHeader) return {};
      
      const cookies = {};
      cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.trim().split('=');
        if (name && rest.length > 0) {
          cookies[name] = rest.join('=');
        }
      });
      
      return cookies;
    }

    // Определяем путь для проксирования
    const scriptName = '/metrics/identification';
    const requestUri = req.url;
    let randomPath = '';
    
    if (requestUri.startsWith(scriptName)) {
      const after = requestUri.substring(scriptName.length);
      const qPos = after.indexOf('?');
      randomPath = qPos === -1 ? after : after.substring(0, qPos);
    }

    randomPath = randomPath.replace(/^\/+|\/+$/g, '');

    // Формируем URL
    const method = req.method;
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    const query = originalUrl.searchParams.toString();
    
    let url;
    if (randomPath) {
      url = `${FINGERPRINT_API}/${randomPath}`;
    } else {
      url = FINGERPRINT_API;
    }

    if (method === 'POST') {
      if (query) {
        url += `?${query}&ii=custom-proxy-integration/1.0/ingress`;
      } else {
        url += '?ii=custom-proxy-integration/1.0/ingress';
      }
    } else {
      if (query) {
        url += `?${query}`;
      }
    }

    console.log('Target URL:', url);

    // 🔧 ИСПРАВЛЕННАЯ ОБРАБОТКА ЗАГОЛОВКОВ
    const headers = {};
    
    // Разрешенные заголовки (согласно документации - все кроме cookie)
    const allowedHeaders = [
      'user-agent',
      'sec-ch-ua',
      'sec-ch-ua-platform', 
      'sec-ch-ua-mobile',
      'content-type',
      'accept',
      'origin',
      'sec-fetch-site',
      'sec-fetch-mode',
      'sec-fetch-dest',
      'referer',
      'accept-encoding',
      'accept-language',
      'priority'
    ];

    // Копируем все заголовки кроме cookie
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      
      // Пропускаем служебные заголовки
      if (lowerKey.startsWith('x-vercel-')) continue;
      if (lowerKey.startsWith('x-forwarded-')) continue;
      if (lowerKey.startsWith('x-real-')) continue;
      if (lowerKey === 'forwarded') continue;
      if (lowerKey === 'cookie') continue; // Обрабатываем отдельно
      if (lowerKey === 'host') continue;
      if (lowerKey === 'connection') continue;

      if (allowedHeaders.includes(lowerKey)) {
        headers[key] = value;
      }
    }

    // 🔧 КРИТИЧНО: Правильная обработка cookies согласно документации
    console.log('=== Cookie Debug ===');
    console.log('Original cookie header:', req.headers.cookie);
    
    const cookieHeader = req.headers.cookie || '';
    const cookieMap = parseCookies(cookieHeader);
    const _iidtCookie = cookieMap['_iidt'];
    
    console.log('Parsed cookies:', cookieMap);
    console.log('_iidt cookie:', _iidtCookie);
    
    // Согласно документации: передаем только _iidt если он есть
    if (_iidtCookie) {
      headers['cookie'] = `_iidt=${_iidtCookie}`;
      console.log('✅ _iidt cookie added to headers');
    } else {
      console.log('❌ No _iidt cookie found - not setting cookie header');
      // НЕ устанавливаем cookie header вообще
    }

    // Получаем тело запроса
    let body = null;
    if (method === 'POST') {
      body = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
      headers['Content-Length'] = body.length.toString();
      console.log('Request body length:', body.length);
    }

    // 🔧 ОБЯЗАТЕЛЬНЫЕ заголовки Fingerprint (только для POST)
    if (method === 'POST') {
      headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
      headers['FPJS-Proxy-Client-IP'] = getClientIp();
      headers['FPJS-Proxy-Forwarded-Host'] = getHost();
    }

    console.log('=== Final Request Headers ===');
    console.log('Cookie header in final request:', headers['cookie'] || 'NOT SET');
    console.log('Total headers count:', Object.keys(headers).length);
    console.log('Proxy headers:', {
      'FPJS-Proxy-Secret': headers['FPJS-Proxy-Secret'] ? 'SET' : 'NOT SET',
      'FPJS-Proxy-Client-IP': headers['FPJS-Proxy-Client-IP'],
      'FPJS-Proxy-Forwarded-Host': headers['FPJS-Proxy-Forwarded-Host']
    });

    // Выполняем запрос
    console.log('Making request to Fingerprint API...');
    const fetchOptions = {
      method: method,
      headers: headers
    };

    if (method === 'POST' && body) {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    // Обрабатываем ответ
    const responseHeaders = response.headers;
    const responseBody = await response.arrayBuffer();
    console.log('Response body length:', responseBody.byteLength);

    // Устанавливаем заголовки ответа
    for (const [key, value] of responseHeaders.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'strict-transport-security') continue;
      if (lowerKey === 'transfer-encoding') continue;
      if (lowerKey.startsWith('content-encoding')) continue;
      res.setHeader(key, value);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(response.status).send(Buffer.from(responseBody));

  } catch (error) {
    console.error('=== ERROR ===');
    console.error('Error:', error.message);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    const requestId = `${Date.now()}.${Math.random().toString(36).substr(2, 6)}`;
    res.status(500).json({
      v: '2',
      error: {
        code: 'IntegrationFailed',
        message: `An identification error occurred with the custom integration. Reason: ${error.message}`,
      },
      requestId: requestId,
      products: {}
    });
  }
}
