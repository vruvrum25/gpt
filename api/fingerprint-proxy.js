// 🔧 Выносим константы в глобальную область
const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
const FINGERPRINT_API = 'https://eu.api.fpjs.io';
const FINGERPRINT_CDN = 'https://fpcdn.io';

export default async function handler(req, res) {
  try {
    console.log('=== Fingerprint Unified Proxy ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);

    // CORS заголовки
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

async function handleAgentDownload(req, res) {
  console.log('>>> Agent Download');
  
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

  // 🔧 ИСПРАВЛЕНИЕ: Копируем ВСЕ заголовки как в PHP (кроме служебных)
  const headers = copyAllHeaders(req.headers, { removeCookies: true });

  const response = await fetch(agentDownloadUrl.toString(), {
    method: 'GET',
    headers: headers
  });

  const responseBody = await response.arrayBuffer();
  
  // 🔧 ИСПРАВЛЕНИЕ: Пропускаем ВСЕ заголовки ответа как в PHP
  copyAllResponseHeaders(res, response.headers);
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=60');

  return res.status(response.status).send(Buffer.from(responseBody));
}

async function handleBrowserCache(req, res) {
  console.log('>>> Browser Cache Request');
  
  // 🔧 ИСПРАВЛЕНИЕ: Используем ту же логику что и в PHP
  let randomPath = extractRandomPathLikePHP(req.url);
  console.log('Random path:', randomPath);

  if (!randomPath) {
    return res.status(400).json({ error: 'Missing path segments' });
  }

  // Формируем URL как в PHP
  let targetUrl = `${FINGERPRINT_API}/${randomPath}`;
  
  const originalUrl = new URL(req.url, `http://${req.headers.host}`);
  const queryString = originalUrl.searchParams.toString();
  if (queryString) {
    targetUrl += `?${queryString}`;
  }

  console.log('Browser cache URL:', targetUrl);

  // 🔧 ИСПРАВЛЕНИЕ: Копируем ВСЕ заголовки как в PHP
  const headers = copyAllHeaders(req.headers, { removeCookies: true });
  
  // 🔧 КРИТИЧНО: Добавляем _iidt cookie если есть
  const iidtCookie = filterIidtCookie(req.headers.cookie);
  if (iidtCookie) {
    headers['Cookie'] = iidtCookie;
    console.log('✅ Added _iidt cookie:', iidtCookie);
  }

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: headers
  });

  const responseBody = await response.arrayBuffer();
  console.log('Browser cache response:', response.status);

  // 🔧 КРИТИЧНО: Пропускаем ВСЕ заголовки ответа как в PHP
  copyAllResponseHeaders(res, response.headers);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  return res.status(response.status).send(Buffer.from(responseBody));
}

async function handleIdentificationPost(req, res) {
  console.log('>>> Identification POST');
  
  // 🔧 ИСПРАВЛЕНИЕ: Используем логику PHP для URL
  let randomPath = extractRandomPathLikePHP(req.url);
  
  let targetUrl;
  if (randomPath) {
    targetUrl = `${FINGERPRINT_API}/${randomPath}`;
  } else {
    targetUrl = FINGERPRINT_API;
  }
  
  const originalUrl = new URL(req.url, `http://${req.headers.host}`);
  const queryString = originalUrl.searchParams.toString();
  
  if (queryString) {
    targetUrl += `?${queryString}&ii=custom-proxy-integration/1.0/ingress`;
  } else {
    targetUrl += '?ii=custom-proxy-integration/1.0/ingress';
  }

  console.log('Identification URL:', targetUrl);

  // 🔧 ИСПРАВЛЕНИЕ: Копируем ВСЕ заголовки как в PHP
  const headers = copyAllHeaders(req.headers, { removeCookies: true });

  // 🔧 КРИТИЧНО: Обработка _iidt cookie
  const iidtCookie = filterIidtCookie(req.headers.cookie);
  if (iidtCookie) {
    headers['Cookie'] = iidtCookie;
    console.log('✅ Added _iidt cookie:', iidtCookie);
  } else {
    console.log('❌ No _iidt cookie found');
  }

  // Получаем тело запроса
  const body = await getRequestBody(req);

  // Обязательные заголовки для POST
  headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
  headers['FPJS-Proxy-Client-IP'] = getClientIp(req);
  headers['FPJS-Proxy-Forwarded-Host'] = getHost(req);

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: headers,
    body: body
  });

  const responseBody = await response.arrayBuffer();
  console.log('Identification response:', response.status);

  // 🔧 КРИТИЧНО: Пропускаем ВСЕ заголовки ответа как в PHP
  copyAllResponseHeaders(res, response.headers);

  return res.status(response.status).send(Buffer.from(responseBody));
}

// 🔧 НОВАЯ ФУНКЦИЯ: Копирует ВСЕ заголовки как в PHP
function copyAllHeaders(originalHeaders, options = {}) {
  const headers = {};
  
  // Заголовки которые НУЖНО исключить (как в Vercel)
  const excludeHeaders = [
    'host', 'connection', 'content-length',
    'transfer-encoding', 'te', 'upgrade'
  ];
  
  // Vercel специфичные заголовки
  const vercelHeaders = [
    'x-vercel-', 'x-forwarded-', 'x-real-', 'forwarded'
  ];

  for (const [key, value] of Object.entries(originalHeaders)) {
    const lowerKey = key.toLowerCase();
    
    // Исключаем служебные заголовки
    if (excludeHeaders.includes(lowerKey)) continue;
    
    // Исключаем Vercel заголовки
    if (vercelHeaders.some(prefix => lowerKey.startsWith(prefix))) continue;
    
    // Исключаем cookie если нужно
    if (options.removeCookies && lowerKey === 'cookie') continue;
    
    // Добавляем ВСЕ остальные заголовки
    headers[key] = value;
  }

  return headers;
}

// 🔧 НОВАЯ ФУНКЦИЯ: Копирует ВСЕ заголовки ответа как в PHP
function copyAllResponseHeaders(res, responseHeaders) {
  console.log('=== Copying ALL Response Headers (PHP style) ===');
  
  for (const [key, value] of responseHeaders.entries()) {
    const lowerKey = key.toLowerCase();
    
    // Исключаем только проблематичные заголовки (как в PHP)
    if (lowerKey === 'strict-transport-security') {
      console.log(`❌ Skipping: ${key}`);
      continue;
    }
    if (lowerKey === 'transfer-encoding') {
      console.log(`❌ Skipping: ${key}`);
      continue;
    }
    
    console.log(`✅ Setting: ${key} = ${value}`);
    res.setHeader(key, value);
  }
  
  // Всегда устанавливаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// 🔧 ИСПРАВЛЕННАЯ ФУНКЦИЯ: Парсинг path как в PHP
function extractRandomPathLikePHP(requestUrl) {
  // PHP логика: $scriptName = '/metrics/fp-identify.php'
  const scriptName = '/metrics/identification';
  
  if (requestUrl.startsWith(scriptName)) {
    let after = requestUrl.substring(scriptName.length);
    const qPos = after.indexOf('?');
    const randomPath = qPos === -1 ? after : after.substring(0, qPos);
    return randomPath.replace(/^\/+|\/+$/g, ''); // trim slashes
  }
  
  return '';
}

// 🔧 ИСПРАВЛЕННАЯ ФУНКЦИЯ: Фильтр _iidt как в PHP
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
