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

    // 🔧 УЛУЧШЕННАЯ ФУНКЦИЯ ПОЛУЧЕНИЯ IP
    function getClientIp() {
      console.log('=== IP Detection Debug ===');
      
      // Все возможные заголовки с IP
      const ipHeaders = {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
        'cf-connecting-ip': req.headers['cf-connecting-ip'],
        'x-vercel-forwarded-for': req.headers['x-vercel-forwarded-for'],
        'true-client-ip': req.headers['true-client-ip']
      };
      
      console.log('Available IP headers:', ipHeaders);
      
      // Проверяем заголовки в порядке приоритета
      for (const [headerName, headerValue] of Object.entries(ipHeaders)) {
        if (headerValue) {
          const ips = headerValue.split(',').map(ip => ip.trim());
          console.log(`${headerName} IPs:`, ips);
          
          for (const ip of ips) {
            if (isValidPublicIP(ip)) {
              console.log(`✅ Found valid public IP from ${headerName}:`, ip);
              return ip;
            } else {
              console.log(`❌ Invalid/private IP from ${headerName}:`, ip);
            }
          }
        }
      }
      
      // 🔧 КРИТИЧНО: Замените на ваш реальный публичный IP!
      const fallbackIP = '89.117.67.22'; // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ IP!
      console.log('⚠️ Using fallback IP:', fallbackIP);
      return fallbackIP;
    }

    // 🔧 ФУНКЦИЯ ПРОВЕРКИ ПУБЛИЧНОГО IP
    function isValidPublicIP(ip) {
      if (!ip || typeof ip !== 'string') return false;
      
      // Базовая проверка IPv4
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipv4Regex.test(ip)) return false;
      
      const parts = ip.split('.').map(Number);
      
      // Исключаем приватные диапазоны
      if (parts[0] === 10) return false; // 10.0.0.0/8
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false; // 172.16.0.0/12
      if (parts[0] === 192 && parts[1] === 168) return false; // 192.168.0.0/16
      if (parts[0] === 127) return false; // 127.0.0.0/8
      if (parts[0] === 169 && parts[1] === 254) return false; // 169.254.0.0/16
      if (parts[0] === 0) return false; // 0.0.0.0/8
      
      return true;
    }

    function getHost() {
      return req.headers.host || '';
    }

    function filterIidtCookie(cookie) {
      if (!cookie) return '';
      const match = cookie.match(/_iidt=([^;]+)/);
      return match ? `_iidt=${match[1]}` : '';
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

    // Подготавливаем заголовки
    const headers = {};

    // Копируем заголовки (исключаем проблемные)
    const excludeHeaders = ['cookie', 'host', 'connection', 'content-length'];
    for (const [key, value] of Object.entries(req.headers)) {
      if (!excludeHeaders.includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    // Добавляем только _iidt cookie
    const cookieHeader = req.headers.cookie || '';
    const iidt = filterIidtCookie(cookieHeader);
    if (iidt) {
      headers['cookie'] = iidt;
    }

    // 🔧 КРИТИЧНО: Добавляем прокси-заголовки для POST
    if (method === 'POST') {
      const clientIP = getClientIp();
      const hostValue = getHost();
      
      console.log('=== Proxy Headers Validation ===');
      console.log('Client IP:', clientIP);
      console.log('Host:', hostValue);
      console.log('Proxy Secret length:', PROXY_SECRET.length);
      console.log('Is IP valid public:', isValidPublicIP(clientIP));
      
      // Проверяем что все значения корректны
      if (!clientIP || !isValidPublicIP(clientIP)) {
        throw new Error(`Invalid client IP: ${clientIP}. Must be a valid public IP address.`);
      }
      
      if (!hostValue) {
        throw new Error('Missing host header');
      }
      
      if (!PROXY_SECRET || PROXY_SECRET.length < 10) {
        throw new Error('Invalid proxy secret');
      }
      
      // Устанавливаем прокси-заголовки
      headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
      headers['FPJS-Proxy-Client-IP'] = clientIP;
      headers['FPJS-Proxy-Forwarded-Host'] = hostValue;
      
      console.log('✅ All proxy headers set correctly');
    }

    console.log('Final request headers:', JSON.stringify(headers, null, 2));

    // Получаем тело запроса
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
    
    console.log('=== Fingerprint API Response ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    // 🔧 ОБРАБОТКА 403 ОШИБКИ С ДЕТАЛЬНОЙ ДИАГНОСТИКОЙ
    if (response.status === 403) {
      console.error('🚨 403 Forbidden Error - Proxy authentication failed');
      console.error('Check these in Fingerprint Dashboard:');
      console.error('1. Proxy secret is valid and active');
      console.error('2. Workspace has proxy integration enabled');
      console.error('3. IP whitelist (if configured)');
      
      const errorBody = await response.text();
      console.error('403 Error body:', errorBody);
      
      throw new Error(`Fingerprint API authentication failed (403). Check proxy secret and IP address in logs.`);
    }

    // Обрабатываем успешный ответ
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
    console.error('Stack:', error.stack);
    
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
