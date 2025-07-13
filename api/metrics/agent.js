export default async function handler(req, res) {
  try {
    const { apiKey, version = 3, loaderVersion } = req.query;
    
    if (!apiKey) {
      return res.status(400).send('API key is required');
    }
    
    // Создаем базовый URL для загрузки агента
    const loaderParam = loaderVersion ? `/loader_v${loaderVersion}.js` : '';
    const agentDownloadUrl = new URL(`https://fpcdn.io/v${version}/${apiKey}${loaderParam}`);
    
    // ПРАВИЛЬНЫЙ порядок: сначала копируем существующие параметры
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    originalUrl.searchParams.forEach((value, key) => {
      agentDownloadUrl.searchParams.append(key, value);
    });
    
    // Потом добавляем параметр мониторинга
    agentDownloadUrl.searchParams.append('ii', 'custom-proxy-integration/1.0.1/procdn');
    
    // Подготавливаем заголовки (убираем cookies)
    const headers = { ...req.headers };
    delete headers.cookie;
    
    // Запрашиваем агент от Fingerprint CDN (используем встроенный fetch)
    const response = await fetch(agentDownloadUrl.toString(), { 
      method: 'GET',
      headers: headers 
    });
    
    // Получаем тело ответа
    const responseBody = await response.arrayBuffer();
    
    // Устанавливаем заголовки ответа
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    
    // Устанавливаем безопасные параметры кеширования
    res.setHeader('cache-control', 'public, max-age=3600, s-maxage=60');
    
    // Возвращаем ответ
    res.status(response.status).send(Buffer.from(responseBody));
    
  } catch (error) {
    console.error('Agent download error:', error);
    res.status(500).send(`Agent download error: ${error.message}`);
  }
}
