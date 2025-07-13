export default async function handler(req, res) {
  try {
    // 🔧 ДОБАВЛЯЕМ CORS ЗАГОЛОВКИ
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    const { apiKey, version = 3, loaderVersion } = req.query;
    
    if (!apiKey) {
      return res.status(400).send('API key is required');
    }
    
    const loaderParam = loaderVersion ? `/loader_v${loaderVersion}.js` : '';
    const agentDownloadUrl = new URL(`https://fpcdn.io/v${version}/${apiKey}${loaderParam}`);
    
    const originalUrl = new URL(req.url, `http://${req.headers.host}`);
    originalUrl.searchParams.forEach((value, key) => {
      agentDownloadUrl.searchParams.append(key, value);
    });
    
    agentDownloadUrl.searchParams.append('ii', 'custom-proxy-integration/1.0.1/procdn');
    
    const headers = { ...req.headers };
    delete headers.cookie;
    
    const response = await fetch(agentDownloadUrl.toString(), { 
      method: 'GET',
      headers: headers 
    });
    
    const responseBody = await response.arrayBuffer();
    
    // 🔧 УСТАНАВЛИВАЕМ CORS И ДРУГИЕ ЗАГОЛОВКИ
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('cache-control', 'public, max-age=3600, s-maxage=60');
    
    res.status(response.status).send(Buffer.from(responseBody));
    
  } catch (error) {
    console.error('Agent download error:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).send(`Agent download error: ${error.message}`);
  }
}
