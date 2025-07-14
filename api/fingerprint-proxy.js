const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
const FINGERPRINT_API = 'https://eu.api.fpjs.io';

export default async function handler(req, res) {
  try {
    // Базовые CORS заголовки
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-fpjs-client-version',
      'Access-Control-Allow-Credentials': 'true'
    };
    
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const isIdentification = req.url.includes('identification');
    const isGet = req.method === 'GET';
    const isPost = req.method === 'POST';

    if (isIdentification && isGet) {
      return await handleGet(req, res);
    }
    
    if (isIdentification && isPost) {
      return await handlePost(req, res);
    }

    return res.status(404).json({ error: 'Unknown request type' });
  } catch (error) {
    return res.status(500).json({
      v: '2',
      error: { code: 'IntegrationFailed', message: error.message },
      requestId: `${Date.now()}.${Math.random().toString(36).substr(2, 6)}`
    });
  }
}

async function handleGet(req, res) {
  const randomPath = extractPath(req.url);
  const originalUrl = new URL(req.url, `http://${req.headers.host}`);
  const queryString = originalUrl.searchParams.toString();
  
  let targetUrl = `${FINGERPRINT_API}/${randomPath}`;
  if (queryString) targetUrl += `?${queryString}`;

  const headers = getCleanHeaders(req.headers);
  
  const response = await fetch(targetUrl, { method: 'GET', headers });
  const responseBody = await response.arrayBuffer();
  
  // Простая копия заголовков ответа
  response.headers.forEach((value, key) => {
    if (key !== 'transfer-encoding' && key !== 'strict-transport-security') {
      res.setHeader(key, value);
    }
  });

  return res.status(response.status).send(Buffer.from(responseBody));
}

async function handlePost(req, res) {
  const randomPath = extractPath(req.url);
  const originalUrl = new URL(req.url, `http://${req.headers.host}`);
  const queryString = originalUrl.searchParams.toString();
  
  let targetUrl = randomPath ? `${FINGERPRINT_API}/${randomPath}` : FINGERPRINT_API;
  targetUrl += queryString ? `?${queryString}&ii=custom-proxy-integration/1.0/ingress` : '?ii=custom-proxy-integration/1.0/ingress';

  const headers = getCleanHeaders(req.headers);
  
  // Добавляем только _iidt cookie
  const iidtCookie = req.headers.cookie?.match(/_iidt=([^;]+)/);
  if (iidtCookie) {
    headers['Cookie'] = `_iidt=${iidtCookie[1]}`;
  }

  // Прокси заголовки
  headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
  headers['FPJS-Proxy-Client-IP'] = getClientIp(req);
  headers['FPJS-Proxy-Forwarded-Host'] = req.headers['x-forwarded-host'] || req.headers.host;

  const body = await getRequestBody(req);
  
  const response = await fetch(targetUrl, { method: 'POST', headers, body });
  const responseBody = await response.arrayBuffer();
  
  // Простая копия заголовков ответа
  response.headers.forEach((value, key) => {
    if (key !== 'transfer-encoding' && key !== 'strict-transport-security') {
      res.setHeader(key, value);
    }
  });

  return res.status(response.status).send(Buffer.from(responseBody));
}

// Упрощенные вспомогательные функции
function getCleanHeaders(originalHeaders) {
  const headers = {};
  const exclude = ['host', 'connection', 'content-length', 'transfer-encoding', 'te', 'upgrade', 'cookie'];
  
  Object.entries(originalHeaders).forEach(([key, value]) => {
    if (!exclude.includes(key.toLowerCase()) && !key.toLowerCase().startsWith('x-vercel-')) {
      headers[key] = value;
    }
  });
  
  return headers;
}

function extractPath(url) {
  const scriptName = '/metrics/identification';
  if (url.startsWith(scriptName)) {
    const after = url.substring(scriptName.length);
    const qPos = after.indexOf('?');
    return (qPos === -1 ? after : after.substring(0, qPos)).replace(/^\/+|\/+$/g, '');
  }
  return '';
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '89.117.67.22';
}

async function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
