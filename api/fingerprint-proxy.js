export default async function handler(req, res) {
  try {
    console.log('=== Fingerprint Unified Proxy ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', req.headers);

    // Универсальные CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fpjs-client-version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    const FINGERPRINT_API = 'https://eu.api.fpjs.io';
    const FINGERPRINT_CDN = 'https://fpcdn.io';

    // Определяем тип запроса по URL
    const url = req.url;
    const isAgentDownload = url.includes('agent') || url.includes('apiKey');
    const isIdentification = url.includes('identification');
    const isBrowserCache = isIdentification && req.method === 'GET';
    const isIdentificationPost = isIdentification && req.method === 'POST';

    console.log('Request type:', { isAgentDownload, isIdentification, isBrowserCache, isIdentificationPost });

    // === 1. AGENT DOWNLOAD ===
    if (isAgentDownload && req.method === 'GET') {
      return await handleAgentDownload(req, res);
    }

    // === 2. BROWSER CACHE REQUEST ===
    if (isBrowserCache) {
      return await handleBrowserCache(req, res);
    }

    // === 3. IDENTIFICATION POST ===
    if (isIdentificationPost) {
      return await handleIdentificationPost(req, res);
    }

    // Неизвестный тип запроса
    return res.status(404).json({ error: 'Unknown request type' });

  } catch (error) {
    console.error('=== UNIFIED PROXY ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Content-Type', 'application/json');
    
    const requestId = `${Date.now()}.${Math.random().toString(36).substr(2, 6)}`;
    return res.status(500).json({
      v: '2',
      error: {
        code: 'IntegrationFailed',
        message: `An error occurred with the custom integration. Reason: ${error.message}`,
      },
      requestId: requestId,
      products: {}
    });
  }

  // === ФУНКЦИЯ 1: AGENT DOWNLOAD ===
  async function handleAgentDownload(req, res) {
    console.log('>>> Handling Agent Download');
    
    const { apiKey, version = 3, loaderVersion } = req.query;
    if (!apiKey) {
      return res.status(400).send('API key is required');
    }

    const loaderParam = loaderVersion ? `/loader_v${loaderVersion}.js` : '';
    const agentDownloadUrl = new URL(`${FINGERPRINT_CDN}/v${version}/${apiKey}${loaderParam}`);
    
    // Копируем query параметры
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    originalUrl.searchParams.forEach((value, key) => {
      agentDownloadUrl.searchParams.append(key, value);
    });
    agentDownloadUrl.searchParams.append('ii', 'custom-proxy-integration/1.0.1/procdn');

    console.log('Agent download URL:', agentDownloadUrl.toString());

    // Подготавливаем заголовки (без cookies)
    const headers = prepareHeaders(req.headers, { removeCookies: true });

    const response = await fetch(agentDownloadUrl.toString(), {
      method: 'GET',
      headers: headers
    });

    const responseBody = await response.arrayBuffer();
    console.log('Agent download response:', response.status);

    // Устанавливаем заголовки ответа
    setResponseHeaders(res, response.headers, { 
      setCacheControl: 'public, max-age=3600, s-maxage=60',
      preserveSetCookie: true // Сохраняем Set-Cookie если есть
    });

    return res.status(response.status).send(Buffer.from(responseBody));
  }

  // === ФУНКЦИЯ 2: BROWSER CACHE ===
  async function handleBrowserCache(req, res) {
    console.log('>>> Handling Browser Cache Request');
    
    // Извлекаем random path
    let randomPath = extractRandomPath(req.url);
    console.log('Random path:', randomPath);

    if (!randomPath) {
      return res.status(400).json({ error: 'Missing path segments' });
    }

    const browserCacheUrl = new URL(`${FINGERPRINT_API}/${randomPath}`);
    
    // Копируем query параметры
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    originalUrl.searchParams.forEach((value, key) => {
      if (!key.match(/^(segments|\d+|__nextjs|__vercel)$/)) {
        browserCacheUrl.searchParams.append(key, value);
      }
    });

    console.log('Browser cache URL:', browserCacheUrl.toString());

    // Подготавливаем заголовки (без cookies)
    const headers = prepareHeaders(req.headers, { removeCookies: true });

    const response = await fetch(browserCacheUrl.toString(), {
      method: 'GET',
      headers: headers
    });

    const responseBody = await response.arrayBuffer();
    console.log('Browser cache response:', response.status);

    // 🔧 КРИТИЧНО: Устанавливаем заголовки с Set-Cookie
    setResponseHeaders(res, response.headers, { 
      preserveSetCookie: true, // Обязательно сохраняем Set-Cookie
      setCacheControl: 'no-cache, no-store, must-revalidate'
    });

    return res.status(response.status).send(Buffer.from(responseBody));
  }

  // === ФУНКЦИЯ 3: IDENTIFICATION POST ===
  async function handleIdentificationPost(req, res) {
    console.log('>>> Handling Identification POST');
    
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    const query = originalUrl.searchParams.toString();
    
    let url = FINGERPRINT_API;
    if (query) {
      url += `?${query}&ii=custom-proxy-integration/1.0/ingress`;
    } else {
      url += '?ii=custom-proxy-integration/1.0/ingress';
    }

    console.log('Identification URL:', url);

    // Подготавливаем заголовки
    const headers = prepareHeaders(req.headers, { removeCookies: false });

    // 🔧 КРИТИЧНО: Обработка cookies
    const cookieHeader = req.headers.cookie || '';
    const cookieMap = parseCookies(cookieHeader);
    const _iidtCookie = cookieMap['_iidt'];
    
    console.log('=== Cookie Debug ===');
    console.log('Original cookies:', cookieMap);
    console.log('_iidt cookie:', _iidtCookie);

    // Устанавливаем только _iidt cookie если есть
    if (_iidtCookie) {
      headers['cookie'] = `_iidt=${_iidtCookie}`;
      console.log('✅ _iidt cookie set');
    } else {
      console.log('❌ No _iidt cookie found');
      delete headers['cookie'];
    }

    // Получаем тело запроса
    const body = await getRequestBody(req);
    if (body) {
      headers['Content-Length'] = body.length.toString();
    }

    // Обязательные заголовки для POST
    headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
    headers['FPJS-Proxy-Client-IP'] = getClientIp(req);
    headers['FPJS-Proxy-Forwarded-Host'] = getHost(req);

    console.log('Request headers:', headers);

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body
    });

    const responseBody = await response.arrayBuffer();
    console.log('Identification response:', response.status);

    // Устанавливаем заголовки ответа
    setResponseHeaders(res, response.headers, { 
      preserveSetCookie: true // Сохраняем Set-Cookie для установки _iidt
    });

    return res.status(response.status).send(Buffer.from(responseBody));
  }

  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

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

  function extractRandomPath(url) {
    const basePrefix = '/metrics/identification/';
    if (url.startsWith(basePrefix)) {
      const pathAfterBase = url.substring(basePrefix.length);
      const [extractedPath] = pathAfterBase.split('?');
      return extractedPath;
    }
    return '';
  }

  function prepareHeaders(originalHeaders, options = {}) {
    const headers = {};
    const allowedHeaders = [
      'user-agent', 'accept', 'accept-encoding', 'accept-language',
      'referer', 'origin', 'sec-ch-ua', 'sec-ch-ua-platform',
      'sec-ch-ua-mobile', 'sec-fetch-site', 'sec-fetch-mode',
      'sec-fetch-dest', 'content-type', 'authorization'
    ];

    for (const [key, value] of Object.entries(originalHeaders)) {
      const lowerKey = key.toLowerCase();
      
      // Пропускаем служебные заголовки
      if (lowerKey.startsWith('x-vercel-')) continue;
      if (lowerKey.startsWith('x-forwarded-')) continue;
      if (lowerKey.startsWith('x-real-')) continue;
      if (lowerKey === 'forwarded') continue;
      if (lowerKey === 'host') continue;
      if (lowerKey === 'connection') continue;
      if (lowerKey === 'content-length') continue;
      
      if (options.removeCookies && lowerKey === 'cookie') continue;
      
      if (allowedHeaders.includes(lowerKey) || lowerKey === 'cookie') {
        headers[key] = value;
      }
    }

    return headers;
  }

  function setResponseHeaders(res, responseHeaders, options = {}) {
    console.log('=== Setting Response Headers ===');
    
    // Устанавливаем все заголовки ответа
    for (const [key, value] of responseHeaders.entries()) {
      const lowerKey = key.toLowerCase();
      
      // Пропускаем проблематичные заголовки
      if (lowerKey === 'transfer-encoding') continue;
      if (lowerKey.startsWith('content-encoding')) continue;
      if (lowerKey === 'strict-transport-security') continue;
      
      console.log(`Setting header: ${key} = ${value}`);
      res.setHeader(key, value);
    }

    // 🔧 КРИТИЧНО: Дополнительная обработка Set-Cookie
    if (options.preserveSetCookie) {
      const setCookieHeaders = [];
      
      // Способ 1: Стандартный заголовок
      const setCookieHeader = responseHeaders.get('set-cookie');
      if (setCookieHeader) {
        setCookieHeaders.push(setCookieHeader);
      }

      // Способ 2: Множественные заголовки
      if (typeof responseHeaders.getSetCookie === 'function') {
        const setCookieArray = responseHeaders.getSetCookie();
        if (setCookieArray && setCookieArray.length > 0) {
          setCookieHeaders.push(...setCookieArray);
        }
      }

      // Принудительно устанавливаем Set-Cookie
      if (setCookieHeaders.length > 0) {
        console.log('🍪 Setting Set-Cookie headers:', setCookieHeaders);
        res.setHeader('Set-Cookie', setCookieHeaders);
      }
    }

    // Устанавливаем дополнительные заголовки
    if (options.setCacheControl) {
      res.setHeader('Cache-Control', options.setCacheControl);
    }

    // Всегда устанавливаем CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  function getClientIp(req) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
    return '89.117.67.22';
  }

  function getHost(req) {
    return req.headers['x-forwarded-host'] || req.headers.host || '';
  }

  async function getRequestBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
}
