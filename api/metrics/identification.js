export default async function handler(req, res) {
  try {
    console.log('=== Starting Fingerprint Proxy ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    
    // === КОНФИГИ ===
    const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    const FINGERPRINT_API = 'https://eu.api.fpjs.io';

    // Получаем origin из заголовков для правильного CORS
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || `https://${req.headers.host}`;
    
    // CORS заголовки (используем конкретный origin, а не *)
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fpjs-client-version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Обрабатываем preflight OPTIONS запрос
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // === ФУНКЦИИ ===
    function getClientIp() {
      // Приоритет для x-real-ip (как в рабочем запросе)
      return req.headers['x-real-ip'] || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.connection?.remoteAddress || 
             req.socket?.remoteAddress || 
             '8.8.8.8';
    }

    function getHost() {
      return req.headers.host || '';
    }

    function filterIidtCookie(cookie) {
      if (!cookie) return '';
      const match = cookie.match(/_iidt=([^;]+)/);
      return match ? `_iidt=${match[1]}` : '';
    }

    // === ОПРЕДЕЛЯЕМ ПУТЬ ===
    const scriptName = '/metrics/identification';
    const requestUri = req.url;
    
    let randomPath = '';
    if (requestUri.startsWith(scriptName)) {
      const after = requestUri.substring(scriptName.length);
      const qPos = after.indexOf('?');
      randomPath = qPos === -1 ? after : after.substring(0, qPos);
    }
    randomPath = randomPath.replace(/^\/+|\/+$/g, '');

    console.log('Random path:', randomPath);

    // === ФОРМИРУЕМ URL ===
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

    // === ПОЛУЧАЕМ ТЕЛО ЗАПРОСА СНАЧАЛА ===
    let body = null;
    if (method === 'POST') {
      body = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
      console.log('Request body length:', body.length);
    }

    // === ЗАГОЛОВКИ (КРИТИЧЕСКИЕ ИЗМЕНЕНИЯ) ===
    const headers = {};

    // Добавляем обязательные заголовки как в рабочем запросе
    headers['Host'] = 'eu.api.fpjs.io'; // Важно! Host должен указывать на API
    headers['User-Agent'] = req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    headers['Content-Type'] = req.headers['content-type'] || 'text/plain';
    headers['Accept'] = req.headers['accept'] || '*/*';
    headers['Accept-Language'] = req.headers['accept-language'] || 'en-US,en;q=0.9';
    headers['Accept-Encoding'] = req.headers['accept-encoding'] || 'gzip, deflate, br, zstd';
    
    // Добавляем Content-Length для POST запросов
    if (method === 'POST' && body) {
      headers['Content-Length'] = body.length.toString();
    }

    // Добавляем Origin и Referer от клиента
    if (req.headers.origin) {
      headers['Origin'] = req.headers.origin;
    }
    if (req.headers.referer) {
      headers['Referer'] = req.headers.referer;
    }

    // Добавляем sec-* заголовки если есть
    const secHeaders = ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'];
    secHeaders.forEach(header => {
      if (req.headers[header]) {
        headers[header] = req.headers[header];
      }
    });

    // КРИТИЧНО: Обрабатываем Cookie
    const cookieHeader = req.headers.cookie || '';
    const iidt = filterIidtCookie(cookieHeader);
    
    console.log('Original cookie:', cookieHeader);
    console.log('Filtered _iidt:', iidt);
    
    // Если нет _iidt cookie, это может быть причиной 403!
    if (!iidt) {
      console.warn('WARNING: No _iidt cookie found - this may cause 403 error');
    }
    
    if (iidt) {
      headers['Cookie'] = iidt;
    }

    // Добавляем прокси заголовки для POST
    if (method === 'POST') {
      headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
      headers['FPJS-Proxy-Client-IP'] = getClientIp();
      headers['FPJS-Proxy-Forwarded-Host'] = getHost();
    }

    console.log('Request headers:', JSON.stringify(headers, null, 2));
    console.log('Proxy headers:', {
      'FPJS-Proxy-Secret': headers['FPJS-Proxy-Secret'],
      'FPJS-Proxy-Client-IP': headers['FPJS-Proxy-Client-IP'],
      'FPJS-Proxy-Forwarded-Host': headers['FPJS-Proxy-Forwarded-Host']
    });

    // === ВЫПОЛНЯЕМ ЗАПРОС ===
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
    
    // Логируем заголовки ответа
    const responseHeadersObj = Object.fromEntries(response.headers.entries());
    console.log('Response headers:', JSON.stringify(responseHeadersObj, null, 2));

    // === ОБРАБАТЫВАЕМ ОТВЕТ ===
    const responseBody = await response.arrayBuffer();
    console.log('Response body length:', responseBody.byteLength);

    // Передаем заголовки ответа (исключая проблемные)
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'strict-transport-security') continue;
      if (lowerKey === 'transfer-encoding') continue;
      if (lowerKey.startsWith('content-encoding')) continue;
      
      res.setHeader(key, value);
    }

    // Переопределяем CORS для конкретного origin
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    res.status(response.status).send(Buffer.from(responseBody));

  } catch (error) {
    console.error('=== ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
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
