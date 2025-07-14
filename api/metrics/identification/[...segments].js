export default async function handler(req, res) {
  try {
    console.log('=== Browser Cache Request Debug ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Query params:', req.query);
    console.log('Headers:', req.headers);

    // 🔧 CORS заголовки - устанавливаем сразу
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-fpjs-client-version');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      console.error('❌ Invalid method:', req.method);
      return res.status(405).send('Method Not Allowed');
    }

    // 🔧 УЛУЧШЕННОЕ извлечение random path
    let randomPath = '';
    
    // Попытка 1: Из query параметров
    const { segments } = req.query;
    if (segments) {
      if (Array.isArray(segments)) {
        randomPath = segments.join('/');
      } else {
        randomPath = segments;
      }
      console.log('✅ Found segments via query.segments:', segments);
    }

    // Попытка 2: Из URL path
    if (!randomPath) {
      const fullPath = req.url;
      const basePrefix = '/metrics/identification/';
      
      if (fullPath.startsWith(basePrefix)) {
        const pathAfterBase = fullPath.substring(basePrefix.length);
        const [extractedPath] = pathAfterBase.split('?');
        randomPath = extractedPath;
        console.log('✅ Extracted path from URL:', extractedPath);
      }
    }

    // Попытка 3: Альтернативный парсинг из URL
    if (!randomPath) {
      const urlParts = req.url.split('/');
      const identificationIndex = urlParts.indexOf('identification');
      if (identificationIndex >= 0 && identificationIndex < urlParts.length - 1) {
        const pathSegments = urlParts.slice(identificationIndex + 1);
        // Удаляем query параметры из последнего сегмента
        if (pathSegments.length > 0) {
          pathSegments[pathSegments.length - 1] = pathSegments[pathSegments.length - 1].split('?')[0];
        }
        randomPath = pathSegments.filter(segment => segment.length > 0).join('/');
        console.log('✅ Alternative path extraction:', randomPath);
      }
    }

    console.log('🎯 Final random path:', randomPath);

    if (!randomPath || randomPath === '') {
      console.error('❌ No path segments found');
      return res.status(400).json({
        error: 'Missing path segments',
        debug: {
          url: req.url,
          query: req.query,
          method: req.method,
          fullUrl: `http://${req.headers.host}${req.url}`
        }
      });
    }

    // 🔧 Формируем URL для browser cache request
    const browserCacheUrl = new URL(`https://eu.api.fpjs.io/${randomPath}`);
    
    // Добавляем query параметры, исключая служебные
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    originalUrl.searchParams.forEach((value, key) => {
      // Исключаем служебные параметры Vercel/Next.js
      if (!key.match(/^(segments|\d+|__nextjs|__vercel)$/)) {
        browserCacheUrl.searchParams.append(key, value);
      }
    });

    console.log('🌐 Browser cache URL:', browserCacheUrl.toString());

    // 🔧 ПРАВИЛЬНАЯ подготовка заголовков
    const headers = {};
    
    // Копируем необходимые заголовки, исключая cookie и служебные
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      
      // Пропускаем служебные и проблематичные заголовки
      if (lowerKey.startsWith('x-vercel-')) continue;
      if (lowerKey.startsWith('x-forwarded-')) continue;
      if (lowerKey.startsWith('x-real-')) continue;
      if (lowerKey === 'forwarded') continue;
      if (lowerKey === 'cookie') continue; // Удаляем cookies согласно документации
      if (lowerKey === 'host') continue;
      if (lowerKey === 'connection') continue;
      if (lowerKey === 'content-length') continue;

      // Разрешенные заголовки
      const allowedHeaders = [
        'user-agent',
        'accept',
        'accept-encoding',
        'accept-language',
        'referer',
        'origin',
        'sec-ch-ua',
        'sec-ch-ua-platform',
        'sec-ch-ua-mobile',
        'sec-fetch-site',
        'sec-fetch-mode',
        'sec-fetch-dest',
        'content-type',
        'authorization'
      ];

      if (allowedHeaders.includes(lowerKey)) {
        headers[key] = value;
      }
    }

    console.log('📤 Request headers being sent:', headers);

    // 🔧 Выполняем запрос к Fingerprint API
    console.log('🚀 Making request to Fingerprint API...');
    const response = await fetch(browserCacheUrl.toString(), {
      method: 'GET',
      headers: headers
    });

    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));

    // 🔧 КРИТИЧНО: Детальное логирование Set-Cookie заголовков
    console.log('=== Response Headers Analysis ===');
    for (const [key, value] of response.headers.entries()) {
      console.log(`Header: ${key} = ${value}`);
      if (key.toLowerCase().includes('cookie')) {
        console.log(`🍪 COOKIE HEADER FOUND: ${key}: ${value}`);
      }
    }

    // Получаем тело ответа
    const buffer = await response.arrayBuffer();
    console.log('📥 Response body length:', buffer.byteLength);

    // 🔧 КРИТИЧНО: Правильная передача заголовков ответа
    console.log('=== Setting Response Headers ===');
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      
      // Удаляем только проблематичные заголовки
      if (lowerKey === 'transfer-encoding') {
        console.log(`❌ Skipping header: ${key}`);
        continue;
      }
      if (lowerKey.startsWith('content-encoding')) {
        console.log(`❌ Skipping header: ${key}`);
        continue;
      }
      
      console.log(`✅ Setting header: ${key} = ${value}`);
      res.setHeader(key, value);
    }

    // 🔧 ДОПОЛНИТЕЛЬНАЯ проверка и принудительная установка Set-Cookie
    const setCookieHeaders = [];
    
    // Способ 1: Стандартный заголовок
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      setCookieHeaders.push(setCookieHeader);
      console.log('🍪 Found Set-Cookie header (method 1):', setCookieHeader);
    }

    // Способ 2: Через getSetCookie() если доступен
    if (typeof response.headers.getSetCookie === 'function') {
      const setCookieArray = response.headers.getSetCookie();
      if (setCookieArray && setCookieArray.length > 0) {
        setCookieHeaders.push(...setCookieArray);
        console.log('🍪 Found Set-Cookie headers (method 2):', setCookieArray);
      }
    }

    // Способ 3: Поиск всех заголовков с cookie
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === 'set-cookie' && !setCookieHeaders.includes(value)) {
        setCookieHeaders.push(value);
        console.log('🍪 Found Set-Cookie header (method 3):', value);
      }
    }

    // Принудительно устанавливаем все найденные Set-Cookie заголовки
    if (setCookieHeaders.length > 0) {
      console.log('🍪 Setting Set-Cookie headers:', setCookieHeaders);
      setCookieHeaders.forEach((cookieValue, index) => {
        if (index === 0) {
          res.setHeader('Set-Cookie', cookieValue);
        } else {
          // Для множественных cookie заголовков
          const existing = res.getHeader('Set-Cookie');
          if (Array.isArray(existing)) {
            existing.push(cookieValue);
            res.setHeader('Set-Cookie', existing);
          } else {
            res.setHeader('Set-Cookie', [existing, cookieValue]);
          }
        }
      });
    } else {
      console.log('❌ No Set-Cookie headers found in response');
    }

    // 🔧 Устанавливаем необходимые заголовки для browser cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Vary', 'Origin');

    // Убираем HSTS если есть (для HTTP совместимости)
    res.removeHeader('strict-transport-security');

    console.log('✅ Response processed successfully');
    console.log('📤 Final response headers:', res.getHeaders());

    // Отправляем ответ
    res.status(response.status).send(Buffer.from(buffer));

  } catch (error) {
    console.error('=== Browser Cache Request Error ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('URL:', req.url);
    console.error('Query:', req.query);
    console.error('Method:', req.method);
    
    // Устанавливаем CORS заголовки для ошибки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Content-Type', 'application/json');
    
    res.status(500).json({
      error: 'Browser cache request error',
      message: error.message,
      debug: {
        url: req.url,
        query: req.query,
        method: req.method,
        timestamp: new Date().toISOString()
      }
    });
  }
}
