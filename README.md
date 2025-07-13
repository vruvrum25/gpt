
# Fingerprint Proxy Integration

This is a custom proxy integration for FingerprintJS. It includes server-side API endpoints for:

- Agent download request
- Identification request
- Browser cache request

## Setup

1. Clone this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

## Environment Variables

Ensure to set the following environment variable on Vercel:

- `FPJS_PROXY_SECRET`: Your Fingerprint Proxy Secret.

