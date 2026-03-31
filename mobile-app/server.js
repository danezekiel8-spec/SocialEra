const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 4100);
const BACKEND_ORIGIN = String(process.env.SOCIALERA_BACKEND_ORIGIN || 'http://localhost:5001').trim().replace(/\/+$/, '');
const backendUrl = new URL(BACKEND_ORIGIN);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function serveConfig(res) {
  const payload = `window.SOCIALERA_APP_CONFIG = ${JSON.stringify({
    apiBase: '/api',
    assetBase: '/',
    backendOrigin: BACKEND_ORIGIN
  })};\n`;

  res.writeHead(200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function proxyRequest(req, res, requestUrl) {
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, backendUrl);
  const transport = target.protocol === 'https:' ? https : http;
  const headers = {
    ...req.headers,
    host: target.host
  };

  const proxyReq = transport.request(
    target,
    {
      method: req.method,
      headers
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    sendJson(res, 502, {
      error: 'Unable to reach the SocialEra backend',
      detail: error.message
    });
  });

  if (req.method === 'GET' || req.method === 'HEAD') {
    proxyReq.end();
    return;
  }

  req.pipe(proxyReq);
}

function resolveFilePath(pathname) {
  const relativePath = pathname.replace(/^\/+/, '') || 'index.html';
  const normalizedPath = path.normalize(relativePath);
  const filePath = path.join(ROOT_DIR, normalizedPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    return null;
  }

  return filePath;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, file) => {
    if (error) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream'
    });
    res.end(file);
  });
}

function serveStatic(req, res, requestUrl) {
  if (requestUrl.pathname === '/config.js') {
    serveConfig(res);
    return;
  }

  const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const filePath = resolveFilePath(requestedPath);

  if (!filePath) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      serveFile(res, filePath);
      return;
    }

    const fallbackPath = resolveFilePath('/index.html');

    if (!fallbackPath) {
      sendJson(res, 500, { error: 'Missing application shell' });
      return;
    }

    serveFile(res, fallbackPath);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);

  if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/assets/')) {
    proxyRequest(req, res, requestUrl);
    return;
  }

  serveStatic(req, res, requestUrl);
});

server.listen(PORT, () => {
  console.log(`SocialEra mobile app running at http://localhost:${PORT}`);
  console.log(`Proxying backend requests to ${BACKEND_ORIGIN}`);
});
