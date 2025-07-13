
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const randomPath = req.query.randomPathSegments.join('/');
    const browserCacheUrl = `https://api.fpjs.io/${randomPath}`;

    const headers = new Headers(req.headers);
    delete headers['cookie'];

    // Request the browser cache from Fingerprint API
    const response = await fetch(browserCacheUrl, { headers });

    res.status(response.status).send(await response.buffer());
  } catch (error) {
    res.status(500).send(`Browser cache request error: ${error}`);
  }
}
