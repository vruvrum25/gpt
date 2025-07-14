export default async function handler(req, res) {
  try {
    console.log('=== Starting Fingerprint Proxy ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    
    // CORS заголовки (добавляем сразу)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fpjs-client-version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Обрабатываем preflight OPTIONS запрос
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // === КОНФИГИ (точно как в PHP) ===
    const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    const FINGERPRINT_API = 'https://eu.api.fpjs.io';

    // === ФУНКЦИИ ТОЧНО КАК В PHP ===
    
    // PHP: getClientIp()
    function getClientIp() {
      const xForwardedFor = req.headers['x-forwarded-for'];
      if (xForwardedFor) {
        const ips = xForwardedFor.split(',');
        return ips[0].trim();
      }
      return req.connection?.remoteAddress || req.socket?.remoteAddress || '8.8.8.8';
    }

    // PHP: getHost()
    function getHost() {
      return req.headers.host || '';
    }

    // PHP: filterIidtCookie()
    function filterIidtCookie(cookie) {
      if (!cookie) return '';
      const match = cookie.match(/_iidt=([^;]+)/);
      return match ? `_iidt=${match[1]}` : '';
    }

    // === ОПРЕДЕЛЯЕМ ПУТЬ ДЛЯ ПРОКСИРОВАНИЯ (точно как в PHP) ===
    // PHP: $scriptName = $_SERVER['SCRIPT_NAME'];
    const scriptName = '/metrics/identification';
    // PHP: $requestUri = $_SERVER['REQUEST_URI'];
    const requestUri = req.url;
    
    let randomPath = '';
    if (requestUri.startsWith(scriptName)) {
      const after = requestUri.substring(scriptName.length);
      const qPos = after.indexOf('?');
      randomPath = qPos === -1 ? after : after.substring(0, qPos);
    }
    randomPath = randomPath.replace(/^\/+|\/+$/g, ''); // trim slashes

    console.log('Random path:', randomPath);

    // === ФОРМИРУЕМ URL (точно как в PHP) ===
    const method = req.method;
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    const query = originalUrl.searchParams.toString();
    
    let url;
    if (randomPath) {
      url = `${FINGERPRINT_API}/${randomPath}`;
    } else {
      url = FINGERPRINT_API;
    }

    // PHP: if ($method === 'POST')
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

    // === ЗАГОЛОВКИ (точно как в PHP) ===
    const headers = {};

    // PHP: foreach (getallheaders() as $key => $value)
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === 'cookie') continue;
      // Исключаем заголовки, которые могут вызвать проблемы
      if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) continue;
      headers[key] = value;
    }

    // PHP: filterIidtCookie($_SERVER['HTTP_COOKIE'] ?? '')
    const cookieHeader = req.headers.cookie || '';
    const iidt = filterIidtCookie(cookieHeader);
    if (iidt) {
      headers['cookie'] = iidt;
    }

    // PHP: if ($method === 'POST')
    if (method === 'POST') {
      headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
      headers['FPJS-Proxy-Client-IP'] = getClientIp();
      headers['FPJS-Proxy-Forwarded-Host'] = getHost();
    }

    console.log('Request headers:', headers);
    console.log('Proxy headers:', {
      'FPJS-Proxy-Secret': headers['FPJS-Proxy-Secret'],
      'FPJS-Proxy-Client-IP': headers['FPJS-Proxy-Client-IP'],
      'FPJS-Proxy-Forwarded-Host': headers['FPJS-Proxy-Forwarded-Host']
    });

    // === ПОЛУЧАЕМ ТЕЛО ЗАПРОСА (точно как PHP: file_get_contents('php://input')) ===
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

    // === ВЫПОЛНЯЕМ ЗАПРОС (точно как CURL в PHP) ===
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

    // === ОБРАБАТЫВАЕМ ОТВЕТ (точно как в PHP) ===
    // PHP: получаем заголовки и тело отдельно
    const responseHeaders = response.headers;
    const responseBody = await response.arrayBuffer();
    
    console.log('Response body length:', responseBody.byteLength);

    // PHP: отдаём заголовки (кроме HSTS и Transfer-Encoding)
    for (const [key, value] of responseHeaders.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'strict-transport-security') continue;
      if (lowerKey === 'transfer-encoding') continue;
      if (lowerKey.startsWith('content-encoding')) continue; // Важно для избежания проблем со сжатием
      
      res.setHeader(key, value);
    }

    // Обеспечиваем CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // PHP: http_response_code($http_code); echo $body;
    res.status(response.status).send(Buffer.from(responseBody));

  } catch (error) {
    console.error('=== ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // PHP: catch (Throwable $e) - обработка ошибок
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
