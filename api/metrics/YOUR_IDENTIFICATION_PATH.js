
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const identificationUrl = new URL('https://api.fpjs.io');
    identificationUrl.search = req.url.split('?')[1] ?? '';

    const headers = new Headers(req.headers);
    delete headers['cookie'];

    // Add the _iidt cookie to the request headers if it exists
    const cookies = req.headers.cookie ? req.headers.cookie.split(';') : [];
    const _iidtCookie = cookies.find(cookie => cookie.trim().startsWith('_iidt='));
    if (_iidtCookie) {
      headers.set('cookie', _iidtCookie);
    }

    // Add Fingerprint-specific headers
    headers.set('FPJS-Proxy-Secret', process.env.FPJS_PROXY_SECRET);
    headers.set('FPJS-Proxy-Client-IP', req.headers['x-forwarded-for'] || req.connection.remoteAddress);
    headers.set('FPJS-Proxy-Forwarded-Host', req.headers.host);

    // Forward the request to the Fingerprint API
    const response = await fetch(identificationUrl, {
      method: 'POST',
      headers,
      body: req.body,
    });

    // Return the response
    const updatedHeaders = new Headers(response.headers);
    updatedHeaders.delete('strict-transport-security');
    res.status(response.status).set(updatedHeaders).send(await response.buffer());
  } catch (error) {
    res.status(500).send(`Identification error: ${error}`);
  }
}
