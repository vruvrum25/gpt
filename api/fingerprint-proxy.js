// 🔧 Выносим константы в глобальную область
const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
const FINGERPRINT_API = 'https://eu.api.fpjs.io';

// Убираем agent download обработку полностью
export default async function handler(req, res) {
  try {
    console.log('=== Fingerprint Unified Proxy ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);

    // Универсальные CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fpjs-client-version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // 🔧 ИСПРАВЛЕНО: Упрощаем определение типа запроса
    const url = req.url;
    const isIdentification = url.includes('identification');
    const isBrowserCache = isIdentification && req.method === 'GET';
    const isIdentificationPost = isIdentification && req.method === 'POST';

    console.log('Request type:', { isIdentification, isBrowserCache, isIdentificationPost });

    // 🔧 УБИРАЕМ agent download - используем только identification
    
    if (isBrowserCache) {
      return await handleBrowserCache(req, res);
    }

    if (isIdentificationPost) {
      return await handleIdentificationPost(req, res);
    }

    return res.status(404).json({ error: 'Unknown request type' });

  } catch (error) {
    console.error('=== ERROR ===', error);
    
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
}

// === ФУНКЦИЯ: BROWSER CACHE (ИСПРАВЛЕННАЯ) ===
async function handleBrowserCache(req, res) {
  console.log('>>> Handling Browser Cache Request');
  
  let randomPath = extractRandomPathLikePHP(req.url);
  console.log('Random path:', randomPath);

  if (!randomPath) {
    return res.status(400).json({ error: 'Missing path segments' });
  }

  let targetUrl = `${FINGERPRINT_API}/${randomPath}`;
  
  const originalUrl = new URL(req.url, `http://${req.headers.host}`);
  const queryString = originalUrl.searchParams.toString();
  if (queryString) {
    targetUrl += `?${queryString}`;
  }

  console.log('Browser cache URL:', targetUrl);

  // 🔧 ИСПРАВЛЕНИЕ: НЕ удаляем cookies для browser cache
  const headers = copyAllHeaders(req.headers, { removeCookies: false });
  
  console.log('=== Browser Cache Request Headers (with cookies) ===');
  console.log(JSON.stringify(headers, null, 2));

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: headers
  });

  const responseBody = await response.arrayBuffer();
  console.log('Browser cache response:', response.status);

  // Детальное логирование Set-Cookie
  console.log('=== Browser Cache Response Headers ===');
  const responseHeadersObj = {};
  let hasSetCookie = false;
  
  for (const [key, value] of response.headers.entries()) {
    responseHeadersObj[key] = value;
    if (key.toLowerCase() === 'set-cookie') {
      hasSetCookie = true;
      console.log('🍪 FOUND Set-Cookie:', value);
    }
  }
  
  console.log(JSON.stringify(responseHeadersObj, null, 2));
  console.log('Has Set-Cookie header:', hasSetCookie);

  copyAllResponseHeaders(res, response.headers, req);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  return res.status(response.status).send(Buffer.from(responseBody));
}

// === ФУНКЦИЯ: IDENTIFICATION POST ===
async function handleIdentificationPost(req, res) {
  console.log('>>> Identification POST');
  
  // 🔧 ДОБАВЛЯЕМ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ как в PHP
  console.log('=== Original Request Headers ===');
  console.log(JSON.stringify(req.headers, null, 2));
  
  let randomPath = extractRandomPathLikePHP(req.url);
  
  let targetUrl;
  if (randomPath) {
    targetUrl = `${FINGERPRINT_API}/${randomPath}`;
    console.log('Random path:', randomPath);
  } else {
    targetUrl = FINGERPRINT_API;
    console.log('Random path: (empty)');
  }
  
  const originalUrl = new URL(req.url, `http://${req.headers.host}`);
  const queryString = originalUrl.searchParams.toString();
  
  if (queryString) {
    targetUrl += `?${queryString}&ii=custom-proxy-integration/1.0/ingress`;
  } else {
    targetUrl += '?ii=custom-proxy-integration/1.0/ingress';
  }

  console.log('Target URL:', targetUrl);

  const headers = copyAllHeaders(req.headers, { removeCookies: true });

  // 🔧 КРИТИЧНО: Детальное логирование cookies
  console.log('=== Cookie Analysis ===');
  console.log('Original cookie header:', req.headers.cookie);
  
  const iidtCookie = filterIidtCookie(req.headers.cookie);
  if (iidtCookie) {
    headers['Cookie'] = iidtCookie;
    console.log('✅ Added _iidt cookie:', iidtCookie);
  } else {
    console.log('❌ No _iidt cookie found in request');
    // 🔧 НОВОЕ: Логируем все cookies для отладки
    if (req.headers.cookie) {
      console.log('Available cookies:', req.headers.cookie);
      const allCookies = req.headers.cookie.split(';').map(c => c.trim());
      allCookies.forEach(cookie => {
        console.log('  Cookie:', cookie);
      });
    }
  }

  const body = await getRequestBody(req);

  // Обязательные заголовки для POST
  headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
  headers['FPJS-Proxy-Client-IP'] = getClientIp(req);
  headers['FPJS-Proxy-Forwarded-Host'] = getHost(req);

  // 🔧 НОВОЕ: Логируем исходящие заголовки как в PHP
  console.log('=== Request Headers to Fingerprint API ===');
  console.log(JSON.stringify(headers, null, 2));
  
  console.log('=== Proxy Headers ===');
  console.log(JSON.stringify({
    'FPJS-Proxy-Secret': PROXY_SECRET,
    'FPJS-Proxy-Client-IP': getClientIp(req),
    'FPJS-Proxy-Forwarded-Host': getHost(req)
  }, null, 2));
  
  console.log('Request body length:', body ? body.length : 0);
  console.log('Making request to Fingerprint API...');

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: headers,
    body: body
  });

  const responseBody = await response.arrayBuffer();
  console.log('Identification response:', response.status);
  
  // 🔧 НОВОЕ: Логируем заголовки ответа как в PHP
  console.log('=== Response Headers ===');
  const responseHeadersObj = {};
  for (const [key, value] of response.headers.entries()) {
    responseHeadersObj[key] = value;
  }
  console.log(JSON.stringify(responseHeadersObj, null, 2));
  console.log('Response body length:', responseBody.byteLength);

  copyAllResponseHeaders(res, response.headers, req);
  return res.status(response.status).send(Buffer.from(responseBody));
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// 🔧 ФУНКЦИЯ: Копирует ВСЕ заголовки как в PHP
function copyAllHeaders(originalHeaders, options = {}) {
  const headers = {};
  
  const excludeHeaders = [
    'host', 'connection', 'content-length',
    'transfer-encoding', 'te', 'upgrade'
  ];
  
  const vercelHeaders = [
    'x-vercel-', 'x-forwarded-', 'x-real-', 'forwarded'
  ];

  for (const [key, value] of Object.entries(originalHeaders)) {
    const lowerKey = key.toLowerCase();
    
    if (excludeHeaders.includes(lowerKey)) continue;
    if (vercelHeaders.some(prefix => lowerKey.startsWith(prefix))) continue;
    if (options.removeCookies && lowerKey === 'cookie') continue;
    
    headers[key] = value;
  }

  return headers;
}

// 🔧 ИСПРАВЛЕНО: Специальная обработка Set-Cookie для Vercel
function copyAllResponseHeaders(res, responseHeaders, req) {
  console.log('=== Copying Response Headers (Vercel optimized) ===');
  
  // 🔧 КРИТИЧНО: Принудительная установка Set-Cookie для Vercel
  const setCookieHeaders = [];
  
  // Сначала собираем все Set-Cookie заголовки
  for (const [key, value] of responseHeaders.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      setCookieHeaders.push(value);
      console.log('🍪 Found Set-Cookie:', value);
    }
  }
  
  // Устанавливаем обычные заголовки
  for (const [key, value] of responseHeaders.entries()) {
    const lowerKey = key.toLowerCase();
    
    if (lowerKey === 'strict-transport-security') continue;
    if (lowerKey === 'transfer-encoding') continue;
    if (lowerKey === 'set-cookie') continue; // Обрабатываем отдельно
    
    console.log(`✅ Setting: ${key} = ${value}`);
    res.setHeader(key, value);
  }
  
  // 🔧 VERCEL FIX: Принудительная установка Set-Cookie
  if (setCookieHeaders.length > 0) {
    console.log('🍪 VERCEL: Force setting Set-Cookie headers');
    
    // Метод 1: Прямая установка
    setCookieHeaders.forEach((cookieValue, index) => {
      console.log(`🍪 Setting cookie ${index + 1}: ${cookieValue}`);
      
      // Парсим cookie для установки правильного домена
      const modifiedCookie = cookieValue.replace(
        /Domain=[^;]+;?/gi, 
        `Domain=${getHost(req)};`
      );
      
      if (index === 0) {
        res.setHeader('Set-Cookie', modifiedCookie);
      } else {
        const existing = res.getHeader('Set-Cookie');
        const newCookies = Array.isArray(existing) 
          ? [...existing, modifiedCookie]
          : [existing, modifiedCookie];
        res.setHeader('Set-Cookie', newCookies);
      }
    });
    
    // Метод 2: Резервная установка через writeHead
    res.writeHead = (function(original) {
      return function(statusCode, headers) {
        if (headers) {
          setCookieHeaders.forEach((cookieValue, index) => {
            const cookieKey = index === 0 ? 'Set-Cookie' : `Set-Cookie-${index}`;
            headers[cookieKey] = cookieValue;
          });
        }
        return original.call(this, statusCode, headers);
      };
    })(res.writeHead);
    
    console.log('🍪 Final verification:', res.getHeader('Set-Cookie'));
  }
  
  // Всегда устанавливаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// 🔧 ФУНКЦИЯ: Парсинг path как в PHP
function extractRandomPathLikePHP(requestUrl) {
  const scriptName = '/metrics/identification';
  
  if (requestUrl.startsWith(scriptName)) {
    let after = requestUrl.substring(scriptName.length);
    const qPos = after.indexOf('?');
    const randomPath = qPos === -1 ? after : after.substring(0, qPos);
    return randomPath.replace(/^\/+|\/+$/g, '');
  }
  
  return '';
}

// 🔧 ФУНКЦИЯ: Фильтр _iidt как в PHP
function filterIidtCookie(cookie) {
  if (!cookie) return '';
  const match = cookie.match(/_iidt=([^;]+)/);
  return match ? `_iidt=${match[1]}` : '';
}

// 🔧 ИСПРАВЛЕНО: Добавляем getHost функцию
function getHost(req) {
  return req.headers['x-forwarded-host'] || req.headers.host || '';
}

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return '89.117.67.22';
}

async function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
