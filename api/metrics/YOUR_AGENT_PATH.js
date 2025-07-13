
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const { apiKey, version = 3, loaderVersion } = req.query;
    const loaderParam = loaderVersion ? `/loader_v${loaderVersion}.js` : '';
    const agentDownloadUrl = `https://fpcdn.io/v${version}/${apiKey}${loaderParam}`;

    // Prepare the headers
    const headers = { ...req.headers };
    delete headers['cookie'];

    // Create URL and append necessary parameters
    const agentUrl = new URL(agentDownloadUrl);
    agentUrl.searchParams.append('ii', 'custom-proxy-integration/1.0.1/procdn');
    agentUrl.search = req.url.split('?')[1];

    // Request agent file from the Fingerprint CDN
    const response = await fetch(agentUrl, { headers });
    const updatedHeaders = new Headers(response.headers);
    updatedHeaders.set('cache-control', 'public, max-age=3600, s-maxage=60');
    updatedHeaders.delete('content-encoding');
    updatedHeaders.delete('transfer-encoding');

    res.status(response.status).set(headers).send(await response.buffer());
  } catch (error) {
    res.status(500).send(`Agent download error: ${error}`);
  }
}
