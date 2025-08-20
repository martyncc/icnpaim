// server/index.js — Express afuera + ltijs adentro (rutas /lti/*)
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const lti = require('ltijs').Provider; // igual que el demo (no uses "new Provider")

/* ===== ENV ===== */
const PORT = process.env.PORT || 8080;
const BASE_HOST = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE_URL  = process.env.BASE_URL || `https://${BASE_HOST}`;

const LTI_KEY                = process.env.LTI_ENCRYPTION_KEY || process.env.LTI_KEY; // tu secreto
const MONGO_URL              = process.env.MONGO_URL;

const LTI_CLIENT_ID          = process.env.LTI_CLIENT_ID;
const LTI_DEPLOYMENT_ID      = process.env.LTI_DEPLOYMENT_ID; // informativo
const LTI_PLATFORM_ISS       = process.env.LTI_PLATFORM_ISS;        // https://udla-staging.blackboard.com
const LTI_PLATFORM_JWKS      = process.env.LTI_PLATFORM_JWKS;       // .../learn/api/lti/1.3/jwks
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH;  // .../learn/api/lti/1.3/authorize
const LTI_PLATFORM_TOKEN_URL = process.env.LTI_PLATFORM_TOKEN_URL;  // .../learn/api/lti/1.3/token

if (!LTI_KEY)        throw new Error('Falta LTI_ENCRYPTION_KEY/LTI_KEY');
if (!MONGO_URL)      throw new Error('Falta MONGO_URL');
if (!LTI_CLIENT_ID || !LTI_PLATFORM_ISS || !LTI_PLATFORM_JWKS || !LTI_PLATFORM_OIDC_AUTH || !LTI_PLATFORM_TOKEN_URL) {
  throw new Error('Faltan variables LTI de plataforma (CLIENT_ID/ISS/JWKS/OIDC/TOKEN)');
}

const STATIC_DIR = fs.existsSync(path.join(__dirname, '../client/build/index.html'))
  ? path.join(__dirname, '../client/build')
  : path.join(__dirname, './public');

/* ===== OUTER EXPRESS (público) ===== */
const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const allow = [
      `https://${BASE_HOST}`,
      'https://lti.icnpaim.cl',
      'https://icnpaim.cl',
      'https://udla-staging.blackboard.com',
      'https://blackboard.com',
      'http://localhost:3000'
    ];
    try {
      const ok = allow.includes(origin) || /\.blackboard\.com$/.test(new URL(origin).hostname);
      return cb(null, ok ? true : false);
    } catch { return cb(null, false); }
  },
  credentials: true
}));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// healthchecks PÚBLICOS (no pasan por el guard de ltijs)
app.get('/lti/health', (_req, res) => res.status(200).json({ status: 'OK', ts: new Date().toISOString() }));
app.get('/health',      (_req, res) => res.status(200).json({
  status: 'OK',
  ts: new Date().toISOString(),
  base_url: BASE_URL,
  lti: {
    client_id: LTI_CLIENT_ID,
    deployment_id: LTI_DEPLOYMENT_ID,
    login_url:  `${BASE_URL}/lti/login`,
    launch_url: `${BASE_URL}/lti/launch`,
    jwks_url:   `${BASE_URL}/.well-known/jwks.json`,
    iss: LTI_PLATFORM_ISS
  }
}));

// normalizadores y parches de rutas
app.all(['/lti/login/', '/lti/launch/'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = req.path.slice(0, -1) + qs;
  const code = req.method === 'POST' ? 307 : 302;
  return res.redirect(code, target);
});
app.all('/lti/logi', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(302, '/lti/login' + qs);
});
app.get('/favicon.ico', (_req, res) => res.status(204).end());

/* ===== LT IJS (serverless) ===== */
lti.setup(
  LTI_KEY,
  { url: MONGO_URL },
  {
    // ⚠️ aquí forzamos las rutas que Blackboard espera
    appUrl: '/lti/launch',                 // “launch” (post-auth) de la herramienta
    loginUrl: '/lti/login',                // OIDC login initiation
    keysetUrl: '/.well-known/jwks.json',   // JWKS público
    staticPath: STATIC_DIR,
    cookies: { secure: true, sameSite: 'None' },
    devMode: false
  }
);

// después del launch correcto mostramos tu SPA
lti.onConnect(async (_token, _req, res) => {
  try {
    return res.sendFile(path.join(STATIC_DIR, 'index.html'));
  } catch (e) {
    console.error('onConnect sendFile error:', e?.message);
    return res.status(500).send('Failed to load app');
  }
});

// (opcional) deep linking
lti.onDeepLinking(async (_token, _req, res) => lti.redirect(res, '/deeplink', { newResource: true }));

// logger de lo que llega a /lti (útil para verificar GET/POST/params)
let lastLti = null;
app.use('/lti', (req, _res, next) => {
  lastLti = {
    method: req.method,
    url: req.originalUrl,
    headers: {
      'content-type': req.get('content-type'),
      'user-agent': req.get('user-agent'),
      referer: req.get('referer'),
      origin: req.get('origin')
    },
    query: req.query,
    bodyKeys: req.method === 'POST' ? Object.keys(req.body || {}) : []
  };
  next();
});
app.get('/debug/last-lti', (_req, res) => res.json(lastLti || { note: 'no LTI hit yet' }));

// monta ltijs bajo /lti
(async () => {
  await lti.deploy({ serverless: true });
  app.use('/lti', lti.app);

  // registra plataformas (idempotente; si ya existe, ltijs lo ignora)
  const reg = async (url, name) => {
    try {
      await lti.registerPlatform({
        url,
        name,
        clientId: LTI_CLIENT_ID,
        authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
        accesstokenEndpoint:   LTI_PLATFORM_TOKEN_URL, // nombre correcto en ltijs
        authConfig: { method: 'JWK_SET', key: LTI_PLATFORM_JWKS }
      });
      console.log('[LTI] platform registered:', url);
    } catch (e) {
      console.warn('[LTI] registerPlatform warn:', url, e?.message);
    }
  };
  await reg(LTI_PLATFORM_ISS, 'UDLA Staging');
  await reg('https://blackboard.com', 'BB Global Issuer'); // por si ese iss asoma

  console.log('Ltijs mounted under /lti ✓');
})();

/* ===== STATIC y ROOT ===== */
if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  app.use(express.static(STATIC_DIR, { index: false }));
}
app.get('/', (_req, res) => {
  res.type('html').send(`
    <!doctype html><html><head><meta charset="utf-8"><title>ICN PAIM</title></head>
    <body style="font-family:system-ui;padding:24px">
      <h3>🚀 ICN PAIM</h3>
      <ul>
        <li>Login URL:  <code>${BASE_URL}/lti/login</code></li>
        <li>Launch URL: <code>${BASE_URL}/lti/launch</code></li>
        <li>JWKS URL:   <code>${BASE_URL}/.well-known/jwks.json</code></li>
        <li>Health:     <code>${BASE_URL}/lti/health</code> / <code>${BASE_URL}/health</code></li>
      </ul>
    </body></html>
  `);
});

/* ===== START ===== */
app.listen(PORT, () => {
  console.log(`LTI server listening on :${PORT}`);
  console.log(`Health: ${BASE_URL}/lti/health`);
  console.log(`Login : ${BASE_URL}/lti/login`);
  console.log(`Launch: ${BASE_URL}/lti/launch`);
  console.log(`JWKS  : ${BASE_URL}/.well-known/jwks.json`);
});
