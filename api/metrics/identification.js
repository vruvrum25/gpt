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
    
    // Обрабатываем preflight OPTIONS запрос
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // === КОНФИГИ ===
    const PROXY_SECRET = 'xhio4GIKdPYHuOoD4u3w';
    const FINGERPRINT_API = 'https://eu.api.fpjs.io';

    // === ФУНКЦИИ ===
    
    // Получение IP клиента
    function getClientIp() {
      console.log('=== IP Detection ===');
      
      const ipSources = [
        req.headers['cf-connecting-ip'],
        req.headers['x-real-ip'],
        req.headers['x-forwarded-for'],
        req.headers['x-vercel-forwarded-for']
      ];
      
      console.log('IP headers:', {
        'cf-connecting-ip': req.headers['cf-connecting-ip'],
        'x-real-ip': req.headers['x-real-ip'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-vercel-forwarded-for': req.headers['x-vercel-forwarded-for']
      });
      
      for (const ipSource of ipSources) {
        if (ipSource) {
          const ips = ipSource.split(',').map(ip => ip.trim());
          
          for (const ip of ips) {
            if (isValidPublicIP(ip)) {
              console.log('✅ Found valid public IP:', ip);
              return ip;
            } else {
              console.log('❌ Invalid/private IP:', ip);
            }
          }
        }
      }
      
      console.log('⚠️ No valid client IP found, using fallback');
      return '8.8.8.8';
    }

    // Валидация публичного IP
    function isValidPublicIP(ip) {
      if (!ip || typeof ip !== 'string') return false;
      
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipv4Regex.test(ip)) return false;
      
      const parts = ip.split('.').map(Number);
      
      if (parts[0] === 10) return false;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      if (parts[0] === 192 && parts[1] === 168) return false;
      if (parts[0] === 127) return false;
      if (parts[0] === 169 && parts[1] === 254) return false;
      if (parts[0] === 0) return false;
      
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

    // === ОПРЕДЕЛЯЕМ ПУТЬ ДЛЯ ПРОКСИРОВАНИЯ ===
    const scriptName = '/metrics/identification';
    const requestUri = req.url;
    
    let randomPath = '';
    if (requestUri.startsWith(scriptName)) {
      const after = requestUri.substring(scriptName.length);
      const qPos = after.indexOf('?');
      randomPath = qPos === -1 ? after : after.substring(0, qPos);
    }
    randomPath = randomPath.replace(/^\/+|\/+$/g, '');

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

    // === 🔧 ИСПРАВЛЕННЫЕ ЗАГОЛОВКИ ===
    const headers = {};

    // Строгая фильтрация заголовков - только разрешенные
    const allowedHeaders = [
      'accept',
      'accept-language',
      'user-agent',
      'referer',
      'origin'
    ];

    // Копируем только разрешенные заголовки
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      
      // Пропускаем все служебные заголовки
      if (lowerKey.startsWith('x-vercel-')) continue;
      if (lowerKey === 'cookie') continue;
      if (lowerKey === 'forwarded') continue;
      if (lowerKey === 'priority') continue;
      if (lowerKey.startsWith('sec-')) continue;
      if (['host', 'connection', 'content-length', 'accept-encoding'].includes(lowerKey)) continue;
      
      // Добавляем только если в списке разрешенных
      if (allowedHeaders.includes(lowerKey)) {
        headers[key] = value;
      }
    }

    // 🔧 КРИТИЧНО: Принудительно устанавливаем правильный Content-Type
    headers['Content-Type'] = 'application/json';

    // 🔧 КРИТИЧНО: Отключаем сжатие для избежания "иероглифов"
    headers['Accept-Encoding'] = 'identity';

    // Добавляем только _iidt cookie
    const cookieHeader = req.headers.cookie || '';
    const iidt = filterIidtCookie(cookieHeader);
    if (iidt) {
      headers['cookie'] = iidt;
    }

    // Добавляем прокси-заголовки для POST
    if (method === 'POST') {
      const clientIP = getClientIp();
      const hostValue = getHost();
      
      console.log('=== Proxy Headers Validation ===');
      console.log('Proxy Secret length:', PROXY_SECRET.length);
      console.log('Client IP:', clientIP);
      console.log('Host:', hostValue);
      console.log('Is IP public:', isValidPublicIP(clientIP));
      
      if (!PROXY_SECRET || PROXY_SECRET.length < 10) {
        throw new Error('Invalid proxy secret');
      }
      
      if (!clientIP || !isValidPublicIP(clientIP)) {
        console.error('❌ Invalid client IP:', clientIP);
        throw new Error(`Invalid client IP: ${clientIP}. Must be a valid public IP.`);
      }
      
      if (!hostValue) {
        throw new Error('Missing host header');
      }
      
      headers['FPJS-Proxy-Secret'] = PROXY_SECRET;
      headers['FPJS-Proxy-Client-IP'] = clientIP;
      headers['FPJS-Proxy-Forwarded-Host'] = hostValue;
      
      console.log('✅ Proxy headers set successfully');
    }

    console.log('=== Cleaned Request Headers ===');
    console.log('Content-Type:', headers['Content-Type']);
    console.log('Accept-Encoding:', headers['Accept-Encoding']);
    console.log('Total headers count:', Object.keys(headers).length);
    console.log('Proxy headers:', {
      'FPJS-Proxy-Secret': headers['FPJS-Proxy-Secret'] ? 'SET' : 'NOT SET',
      'FPJS-Proxy-Client-IP': headers['FPJS-Proxy-Client-IP'],
      'FPJS-Proxy-Forwarded-Host': headers['FPJS-Proxy-Forwarded-Host']
    });

    // === ПОЛУЧАЕМ ТЕЛО ЗАПРОСА ===
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
    
    console.log('=== Fingerprint API Response ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);

    // Специальная обработка 403 ошибки
    if (response.status === 403) {
      console.error('🚨 403 Forbidden - Proxy authentication failed');
      
      let errorBody = '';
      try {
        errorBody = await response.text();
        console.error('403 Error details:', errorBody);
        console.error('403 Error body (hex):', Buffer.from(errorBody).toString('hex'));
      } catch (e) {
        console.error('Could not read 403 error body:', e);
      }
      
      throw new Error(`Fingerprint API rejected proxy authentication (403). Check proxy secret and IP address.`);
    }

    // === ОБРАБАТЫВАЕМ ОТВЕТ ===
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
