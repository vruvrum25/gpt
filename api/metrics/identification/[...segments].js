export default async function handler(req, res) {
  try {
    // Проверяем метод запроса
    if (req.method !== 'GET') {
      return res.status(405).send('Method Not Allowed');
    }

    // Извлекаем динамические сегменты из query (Vercel автоматически создает этот параметр)
    const { segments } = req.query;
    
    // Обрабатываем сегменты - они приходят как массив от Vercel
    let randomPath = '';
    if (Array.isArray(segments)) {
      randomPath = segments.join('/');
    } else if (segments) {
      randomPath = segments;
    } else {
      return res.status(400).send('Missing path segments');
    }
    
    console.log('Dynamic segments:', segments);
    console.log('Random path:', randomPath);
    
    // Создаем URL для браузерного кеша
    const browserCacheUrl = new URL(`https://api.fpjs.io/${randomPath}`);
    
    // Добавляем query параметры из оригинального запроса
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    originalUrl.searchParams.forEach((value, key) => {
      // Не добавляем служебные параметры Vercel
      if (key !== 'segments') {
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
    
    res.status(500).send(`Browser cache request error: ${error.message}`);
  }
}
