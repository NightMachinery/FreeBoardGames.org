/* eslint-disable no-console */
import 'dotenv/config';
import next from 'next';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import csurf from 'csurf';
import cookieParser from 'cookie-parser';
import { setupLogging } from './logging';
import { generateSiteMapXML } from './sitemap';

const INTERNAL_BACKEND_TARGET = process.env.FBG_BACKEND_TARGET || 'http://localhost:3001';
const INTERNAL_BGIO_TARGET =
  process.env.FBG_BGIO_TARGET || firstUrl(process.env.BGIO_PRIVATE_SERVERS, 'http://127.0.0.1:8001');
const dev = process.env.NODE_ENV !== 'production';
const BABEL_ENV_IS_PROD = (process.env.BABEL_ENV || 'production') === 'production';
const APP_DIR = './';
const STATIC_DIR = APP_DIR + 'public/static/';

const PORT = process.env.SERVER_PORT || 3000;
const isProdChannel = process.env.CHANNEL === 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const csrfProtection = csurf({ cookie: true });

const DOMAIN = 'www.freeboardgames.org';
const URL = 'https://' + DOMAIN;

function proxyErrorHandler(err: Error & { code?: string }, req: express.Request, res: any) {
  const host = req.headers?.host || 'unknown-host';
  const code = err.code || 'UNKNOWN';
  const path = req.url || '';
  console.error(`[HPM] Proxy error while forwarding ${host}${path}: ${code}`);

  if (typeof res.writeHead === 'function') {
    if (!res.headersSent) {
      switch (code) {
        case 'ECONNRESET':
        case 'ENOTFOUND':
        case 'ECONNREFUSED':
        case 'ETIMEDOUT':
          res.writeHead(504);
          break;
        default:
          res.writeHead(500);
      }
    }
    if (!res.writableEnded) {
      res.end(`Error occurred while trying to proxy: ${host}${path}`);
    }
    return;
  }

  if (typeof res.destroy === 'function' && !res.destroyed) {
    res.destroy();
  }
}

generateSiteMapXML({
  host: URL,
  staticDir: STATIC_DIR,
});

app
  .prepare()
  .then(() => {
    const server = express();
    const graphqlProxy = createProxyMiddleware('/graphql', {
      target: INTERNAL_BACKEND_TARGET,
      changeOrigin: true,
      ws: true,
      onError: proxyErrorHandler,
    });
    const bgioProxy = createProxyMiddleware(['/socket.io', '/games'], {
      target: INTERNAL_BGIO_TARGET,
      changeOrigin: true,
      ws: true,
      onError: proxyErrorHandler,
    });
    server.disable('x-powered-by');
    server.use(cookieParser());
    setupLogging(server, 'fbg-web');

    server.get('/.well-known/assetlinks.json', (req, res) => {
      if (isProdChannel && isOfficialSite(req.hostname)) {
        const filePath = `${STATIC_DIR}/.well-known/assetlinks.json`;
        app.serveStatic(req, res, filePath);
      } else {
        res.sendStatus(404);
      }
    });

    server.get('/sitemap.xml', (req, res) => {
      const filePath = `${STATIC_DIR}/sitemap.xml`;
      app.serveStatic(req, res, filePath);
    });

    server.get('/robots.txt', (req, res) => {
      let filePath: string;
      if (isProdChannel && isOfficialSite(req.hostname)) {
        filePath = `${STATIC_DIR}/prodRobots.txt`;
      } else {
        filePath = `${STATIC_DIR}/restrictiveRobots.txt`;
      }
      app.serveStatic(req, res, filePath);
    });

    server.get('/sw.js', (req, res) => {
      if (BABEL_ENV_IS_PROD) {
        const filePath = `${STATIC_DIR}/sw.js`;
        app.serveStatic(req, res, filePath);
      } else {
        res.sendStatus(404);
      }
    });

    server.get('/manifest.json', (req, res) => {
      const filePath = `${STATIC_DIR}/manifest.json`;
      app.serveStatic(req, res, filePath);
    });

    server.get('/blog*', (req, res) => {
      res.redirect(301, '/docs');
    });

    server.use('/docs', express.static(`${STATIC_DIR}/docs`));

    server.use(graphqlProxy);
    server.use(bgioProxy);

    server.get('*', csrfProtection, (req, res) => {
      res.cookie('XSRF-TOKEN', (req as any).csrfToken());
      return handle(req, res);
    });

    const httpServer = server.listen(PORT, () => {
      console.log(`Listening on http://0.0.0.0:${PORT}`);
    });

    httpServer.on('upgrade', (req, socket, head) => {
      const reqUrl = req.url || '';
      if (reqUrl.startsWith('/graphql')) {
        (graphqlProxy as any).upgrade(req, socket, head);
        return;
      }
      if (reqUrl.startsWith('/socket.io') || reqUrl.startsWith('/games')) {
        (bgioProxy as any).upgrade(req, socket, head);
      }
    });
  })
  .catch((e) => {
    console.error(e.stack);
    process.exit(1);
  });

function isOfficialSite(rawHostname: string) {
  const hostname = rawHostname.toLowerCase();
  const officialSite = hostname === DOMAIN;
  return officialSite;
}

function firstUrl(rawServers: string | undefined, fallback: string) {
  if (!rawServers) {
    return fallback;
  }
  const firstServer = rawServers
    .split(',')
    .map((server) => server.trim())
    .find(Boolean);
  return firstServer || fallback;
}
