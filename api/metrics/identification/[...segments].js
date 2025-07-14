export default async function handler(req, res) {
  try {
    // 🔧 CORS ЗАГОЛОВКИ
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true'); // 🔧 ДОБАВЛЕНО!

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    console.log('=== Browser Cache Request Debug ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Query params:', req.query);

    if (req.method !== 'GET') {
      return res.status(405).send('Method Not Allowed');
    }

    let randomPath = '';
    const { segments } = req.query;
    
    if (segments) {
      if (Array.isArray(segments)) {
        randomPath = segments.join('/');
      } else {
        randomPath = segments;
      }
      console.log('Found segments via query.segments:', segments);
    }

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

    console.log('Final random path:', randomPath);
    if (!randomPath) {
      console.error('No path segments found');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({
        error: 'Missing path segments',
        debug: {
          url: req.url,
          query: req.query,
          method: req.method
        }
      });
    }

    const browserCacheUrl = new URL(`https://eu.api.fpjs.io/${randomPath}`);
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    
    originalUrl.searchParams.forEach((value, key) => {
      if (!key.match(/^(segments|\d+)$/)) {
        browserCacheUrl.searchParams.append(key, value);
      }
    });

    console.log('Browser cache URL:', browserCacheUrl.toString());

    const headers = { ...req.headers };
    delete headers.cookie; // Удаляем cookies согласно документации

    const response = await fetch(browserCacheUrl.toString(), {
      method: 'GET',
      headers: headers
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const buffer = await response.arrayBuffer();

    // 🔧 КРИТИЧНО: Пропускаем ВСЕ заголовки, включая Set-Cookie
    for (const [key, value] of response.headers.entries()) {
      const lowerKey = key.toLowerCase();
      
      // Удаляем только проблематичные заголовки
      if (lowerKey === 'strict-transport-security') continue;
      if (lowerKey === 'transfer-encoding') continue;
      if (lowerKey.startsWith('content-encoding')) continue;
      
      // 🔧 ПРОПУСКАЕМ Set-Cookie заголовки!
      res.setHeader(key, value);
    }

    // Устанавливаем CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    res.status(response.status).send(Buffer.from(buffer));

  } catch (error) {
    console.error('Browser cache request error:', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      query: req.query
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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
