export default async function handler(req, res) {
  try {
    // Проверяем метод запроса
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Проверяем наличие прокси-секрета
    if (!process.env.FPJS_PROXY_SECRET) {
      throw new Error('FPJS_PROXY_SECRET environment variable is not set');
    }

    // Создаем URL для идентификации
    const identificationUrl = new URL('https://api.fpjs.io');
    
    // Переносим query параметры
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    identificationUrl.search = originalUrl.search;
    
    // Добавляем параметр мониторинга (обязательно!)
    identificationUrl.searchParams.append('ii', 'custom-proxy-integration/1.0/ingress');

    // Подготавливаем заголовки (убираем cookies)
    const headers = { ...req.headers };
    delete headers.cookie;

    // Обрабатываем cookies - оставляем только _iidt
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

    // Добавляем обязательные заголовки Fingerprint
    headers['FPJS-Proxy-Secret'] = process.env.FPJS_PROXY_SECRET;
    headers['FPJS-Proxy-Client-IP'] = getClientIP(req);
    headers['FPJS-Proxy-Forwarded-Host'] = req.headers.host;

    // Получаем тело запроса
    const body = await getRawBody(req);

    // Выполняем запрос к Fingerprint API (используем встроенный fetch)
    const response = await fetch(identificationUrl.toString(), {
      method: 'POST',
      headers: headers,
      body: body,
    });

    // Получаем тело ответа
    const responseBody = await response.arrayBuffer();

    // Устанавливаем заголовки ответа
    for (const [key, value] of response.headers.entries()) {
      // Пропускаем проблемные заголовки
      if (key.toLowerCase() !== 'strict-transport-security') {
        res.setHeader(key, value);
      }
    }

    // Возвращаем ответ
    res.status(response.status).send(Buffer.from(responseBody));

  } catch (error) {
    console.error('Identification error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Возвращаем ошибку в формате Fingerprint
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

// Вспомогательная функция для получения IP клиента
function getClientIP(req) {
  // Проверяем различные заголовки в порядке приоритета
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  const xRealIp = req.headers['x-real-ip'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  
  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  
  // Fallback для разработки (замените на ваш публичный IP)
  return '8.8.8.8';
}

// Вспомогательная функция для получения raw body
async function getRawBody(req) {
  if (req.body) {
    // Если body уже обработано
    if (typeof req.body === 'string') {
      return req.body;
    }
    if (Buffer.isBuffer(req.body)) {
      return req.body;
    }
    // Если это объект, преобразуем в JSON
    return JSON.stringify(req.body);
  }
  
  // Если body не обработано, читаем поток
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
