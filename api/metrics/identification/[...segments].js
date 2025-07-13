export default async function handler(req, res) {
  try {
    console.log('=== Browser Cache Request Debug ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Query params:', req.query);
    
    // Проверяем метод запроса
    if (req.method !== 'GET') {
      return res.status(405).send('Method Not Allowed');
    }

    // Получаем сегменты разными способами
    let randomPath = '';
    
    // Способ 1: Проверяем параметр segments (стандартный способ Vercel)
    const { segments } = req.query;
    
    if (segments) {
      if (Array.isArray(segments)) {
        randomPath = segments.join('/');
      } else {
        randomPath = segments;
      }
      console.log('Found segments via query.segments:', segments);
    }
    
    // Способ 2: Если segments нет, извлекаем из URL вручную
    if (!randomPath) {
      const fullPath = req.url;
      const basePrefix = '/metrics/identification/';
      
      if (fullPath.startsWith(basePrefix)) {
        const pathAfterBase = fullPath.substring(basePrefix.length);
        const [extractedPath] = pathAfterBase.split('?');
        randomPath = extractedPath;
        console.log('Extracted path from URL:', extractedPath);
      }
    }
    
    // Способ 3: Проверяем другие возможные параметры
    if (!randomPath) {
      // Vercel иногда создает параметры с числовыми ключами
      const queryKeys = Object.keys(req.query);
      const segmentKeys = queryKeys.filter(key => key.match(/^\d+$/));
      
      if (segmentKeys.length > 0) {
        segmentKeys.sort((a, b) => parseInt(a) - parseInt(b));
        randomPath = segmentKeys.map(key => req.query[key]).join('/');
        console.log('Found segments via numeric keys:', randomPath);
      }
    }
    
    console.log('Final random path:', randomPath);
    
    if (!randomPath) {
      console.error('No path segments found');
      return res.status(400).json({
        error: 'Missing path segments',
        debug: {
          url: req.url,
          query: req.query,
          method: req.method
        }
      });
    }
    
    // Создаем URL для браузерного кеша
    const browserCacheUrl = new URL(`https://api.fpjs.io/${randomPath}`);
    
    // Добавляем query параметры из оригинального запроса
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    originalUrl.searchParams.forEach((value, key) => {
      // Не добавляем служебные параметры
      if (!key.match(/^(segments|\d+)$/)) {
        browserCacheUrl.searchParams.append(key, value);
      }
    });
    
    console.log('Browser cache URL:', browserCacheUrl.toString());
    
    // Подготавливаем заголовки (убираем cookies)
    const headers = { ...req.headers };
    delete headers.cookie;
    
    // Выполняем запрос к Fingerprint API
    const response = await fetch(browserCacheUrl.toString(), {
      method: 'GET',
      headers: headers
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      console.error('Fingerprint API error:', response.status, response.statusText);
    }
    
    // Получаем тело ответа как ArrayBuffer
    const buffer = await response.arrayBuffer();
    
    // Копируем заголовки ответа
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    
    // ВАЖНО: Никогда не кешируем browser cache ответы!
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    // Возвращаем ответ с правильным статусом
    res.status(response.status).send(Buffer.from(buffer));
    
  } catch (error) {
    console.error('Browser cache request error:', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      query: req.query
    });
    
    res.status(500).json({
      error: 'Browser cache request error',
      message: error.message,
      debug: {
        url: req.url,
        query: req.query
      }
    });
  }
}
