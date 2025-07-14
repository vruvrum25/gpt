// 🔧 Выносим константы в глобальную область
const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
const FINGERPRINT_API = 'https://eu.api.fpjs.io';
const FINGERPRINT_CDN = 'https://fpcdn.io';

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

    // Определяем тип запроса
    const url = req.url;
    const isAgentDownload = url.includes('agent') || url.includes('apiKey');
    const isIdentification = url.includes('identification');
    const isBrowserCache = isIdentification && req.method === 'GET';
    const isIdentificationPost = isIdentification && req.method === 'POST';

    console.log('Request type:', { isAgentDownload, isIdentification, isBrowserCache, isIdentificationPost });

    if (isAgentDownload && req.method === 'GET') {
      return await handleAgentDownload(req, res);
    }

    if (isBrowserCache) {
      return await handleBrowserCache(req, res);
    }

    if (isIdentificationPost) {
      return await handleIdentificationPost(req, res);
    }

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
  
  const originalUrl = new URL(req.url, `http://${req.headers.host}`);
  originalUrl.searchParams.forEach((value, key) => {
    agentDownloadUrl.searchParams.append(key, value);
  });
  agentDownloadUrl.searchParams.append('ii', 'custom-proxy-integration/1.0.1/procdn');

  console.log('Agent download URL:', agentDownloadUrl.toString());

  const headers = copyAllHeaders(req.headers, { removeCookies: true });

  const response = await fetch(agentDownloadUrl.toString(), {
    method: 'GET',
    headers: headers
  });

  const responseBody = await response.arrayBuffer();
  console.log('Agent download response:', response.status);

  copyAllResponseHeaders(res, response.headers);
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=60');

  return res.status(response.status).send(Buffer.from(responseBody));
}

// === ФУНКЦИЯ 2: BROWSER CACHE ===
async function handleBrowserCache(req, res) {
  console.log('>>> Handling Browser Cache Request');
  console.log('=== Browser Cache Debug ===');
  console.log('Original request headers:', JSON.stringify(req.headers, null, 2));
  
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

  const headers = copyAllHeaders(req.headers, { removeCookies: true });
  
  // 🔧 КРИТИЧНО: НЕ добавляем _iidt для browser cache запросов
  // Browser cache запросы должны работать без cookies и УСТАНАВЛИВАТЬ их
  console.log('=== Browser Cache Request Headers ===');
  console.log(JSON.stringify(headers, null, 2));

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: headers
  });

  const responseBody = await response.arrayBuffer();
  console.log('Browser cache response:', response.status);

  // 🔧 КРИТИЧНО: Детальное логирование Set-Cookie
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

  copyAllResponseHeaders(res, response.headers);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  // 🔧 НОВОЕ: Проверяем что Set-Cookie действительно установлен
  const finalHeaders = res.getHeaders();
  console.log('=== Final Response Headers Being Sent ===');
  console.log(JSON.stringify(finalHeaders, null, 2));

  return res.status(response.status).send(Buffer.from(responseBody));
}

// === ФУНКЦИЯ 3: IDENTIFICATION POST ===
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

  copyAllResponseHeaders(res, response.headers);
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

// 🔧 ФУНКЦИЯ: Копирует ВСЕ заголовки ответа как в PHP
function copyAllResponseHeaders(res, responseHeaders) {
  console.log('=== Copying ALL Response Headers (PHP style) ===');
  
  // 🔧 НОВОЕ: Принудительная установка Set-Cookie
  let setCookieFound = false;
  
  for (const [key, value] of responseHeaders.entries()) {
    const lowerKey = key.toLowerCase();
    
    if (lowerKey === 'strict-transport-security') {
      console.log(`❌ Skipping: ${key}`);
      continue;
    }
    if (lowerKey === 'transfer-encoding') {
      console.log(`❌ Skipping: ${key}`);
      continue;
    }
    
    console.log(`✅ Setting: ${key} = ${value}`);
    
    // 🔧 СПЕЦИАЛЬНАЯ обработка Set-Cookie
    if (lowerKey === 'set-cookie') {
      setCookieFound = true;
      console.log('🍪 CRITICAL: Setting Set-Cookie header');
      
      // Множественные способы установки
      try {
        res.setHeader(key, value);
        
        // Дополнительная проверка
        const testHeader = res.getHeader('Set-Cookie');
        console.log('🍪 Verification - Set-Cookie actually set:', testHeader);
        
      } catch (error) {
        console.error('🍪 ERROR setting Set-Cookie:', error);
      }
    } else {
      res.setHeader(key, value);
    }
  }
  
  if (!setCookieFound) {
    console.log('❌ No Set-Cookie header found in response');
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
