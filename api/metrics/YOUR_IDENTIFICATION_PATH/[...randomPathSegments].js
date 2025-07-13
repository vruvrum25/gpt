export default async function handler(req, res) {
  try {
    // Извлекаем случайные сегменты пути
    const { randomPathSegments } = req.query;
    const randomPath = Array.isArray(randomPathSegments) 
      ? randomPathSegments.join('/') 
      : randomPathSegments;
    
    // Создаем URL для браузерного кеша
    const browserCacheUrl = new URL(`https://api.fpjs.io/${randomPath}`);
    
    // Добавляем query параметры из оригинального запроса
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    originalUrl.searchParams.forEach((value, key) => {
      if (key !== 'randomPathSegments') {
        browserCacheUrl.searchParams.append(key, value);
      }
    });
    
    // Подготавливаем заголовки (убираем cookies)
    const headers = { ...req.headers };
    delete headers.cookie;
    
    // Выполняем запрос к Fingerprint API (используем встроенный fetch)
    const response = await fetch(browserCacheUrl.toString(), {
      method: 'GET',
      headers: headers
    });
    
    // Получаем тело ответа как ArrayBuffer
    const buffer = await response.arrayBuffer();
    
    // Копируем заголовки ответа
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    
    // Возвращаем ответ с правильным статусом
    res.status(response.status).send(Buffer.from(buffer));
    
  } catch (error) {
    console.error('Browser cache request error:', error);
    res.status(500).send(`Browser cache request error: ${error.message}`);
  }
}
