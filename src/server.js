// server/index.js — LTI 1.3 con ltijs (rutas alineadas a Blackboard)
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const lti = require('ltijs').Provider;

/* ===================== ENV ===================== */
const PORT  = process.env.PORT || 8080;
const HOST  = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE  = process.env.BASE_URL || `https://${HOST}`;
const NODE_ENV = process.env.NODE_ENV || 'production';

const LTI_KEY   = process.env.LTI_ENCRYPTION_KEY || process.env.LTI_KEY;
const MONGO_URL = process.env.MONGO_URL;

const LTI_CLIENT_ID          = process.env.LTI_CLIENT_ID;
const LTI_DEPLOYMENT_ID      = process.env.LTI_DEPLOYMENT_ID || '';
const LTI_PLATFORM_ISS       = process.env.LTI_PLATFORM_ISS || 'https://udla-staging.blackboard.com';
const LTI_PLATFORM_JWKS      = process.env.LTI_PLATFORM_JWKS;      // https://.../learn/api/lti/1.3/jwks
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH; // https://.../learn/api/lti/1.3/authorize
const LTI_PLATFORM_TOKEN_URL = process.env.LTI_PLATFORM_TOKEN_URL; // https://.../learn/api/lti/1.3/token

// Blackboard también usa este issuer global en algunos flujos
const BB_GLOBAL_ISS = 'https://blackboard.com';

// sanity checks
if (!LTI_KEY) throw new Error('Falta LTI_ENCRYPTION_KEY / LTI_KEY');
if (!MONGO_URL) throw new Error('Falta MONGO_URL');
if (!LTI_CLIENT_ID || !LTI_PLATFORM_JWKS || !LTI_PLATFORM_OIDC_AUTH || !LTI_PLATFORM_TOKEN_URL) {
  throw new Error('Faltan variables LTI (CLIENT_ID/JWKS/OIDC/TOKEN)');
}

console.log('🔧 LTI ENV OK', {
  LTI_CLIENT_ID,
  LTI_DEPLOYMENT_ID,
  LTI_PLATFORM_ISS,
  LTI_PLATFORM_JWKS,
  LTI_PLATFORM_OIDC_AUTH,
  LTI_PLATFORM_TOKEN_URL
});

/* ===================== EXPRESS (outer app) ===================== */
const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const allowList = [
      `https://${HOST}`,
      'https://lti.icnpaim.cl',
      'https://icnpaim.cl',
      'https://udla-staging.blackboard.com',
      'https://blackboard.com',
      'http://localhost:3000'
    ];
    try {
      const hostname = new URL(origin).hostname;
      const ok = allowList.includes(origin) || /\.blackboard\.com$/.test(hostname);
      return cb(null, ok);
    } catch { return cb(null, false); }
  },
  credentials: true,
  methods: ['GET','POST','OPTIONS']
}));

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// No cache para rutas de flujo
app.use(['/lti/login','/lti/launch'], (_req, res, next) => { res.set('Cache-Control','no-store'); next(); });

// --- Healthchecks públicos (deben ir ANTES de montar ltijs)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    ts: new Date().toISOString(),
    env: NODE_ENV,
    base_url: BASE,
    lti: {
      client_id: LTI_CLIENT_ID,
      deployment_id: LTI_DEPLOYMENT_ID,
      login_url:  `${BASE}/lti/login`,
      launch_url: `${BASE}/lti/launch`,
      jwks_url:   `${BASE}/.well-known/jwks.json`
    }
  });
});
app.get('/.well-known/health', (_req, res) => res.redirect(301, '/health'));
app.get('/lti/health', (_req, res) => res.status(200).json({ status: 'OK', ts: new Date().toISOString() }));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// --- Normalizadores: barra final y typos (sí, Blackboard a veces pega raro)
app.all(['/lti/login/','/lti/launch/'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = req.path.slice(0, -1) + qs;
  const code = req.method === 'POST' ? 307 : 302;
  return res.redirect(code, target);
});
app.all('/lti/login', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(302, '/lti/login' + qs);
});

/* ===================== STATIC / SPA ===================== */
const BUILD_DIR =
  fs.existsSync(path.join(__dirname, '../client/build/index.html'))
    ? path.join(__dirname, '../client/build')
    : path.join(__dirname, './public');

if (fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
  app.use(express.static(BUILD_DIR, { index: false }));
}

app.get('/', (_req, res) => {
  res.type('html').send(`
    <!doctype html><html><head><meta charset="utf-8"><title>ICN PAIM</title>
    <style>body{font-family:system-ui;padding:24px;}</style></head>
    <body>
      <h3>🚀 ICN PAIM</h3>
      <ul>
        <li>Login URL:  <code>${BASE}/lti/login</code></li>
        <li>Launch URL: <code>${BASE}/lti/launch</code></li>
        <li>JWKS URL:   <code>${BASE}/.well-known/jwks.json</code></li>
        <li>Health:     <code>${BASE}/health</code></li>
      </ul>
    </body></html>
  `);
});

/* ===================== LTIJS ===================== */
// Configura EXACTAMENTE lo que registraste en Blackboard:
lti.setup(
  LTI_KEY,
  { url: MONGO_URL },
  {
    appUrl: '/lti/launch',               // POST con id_token
    loginUrl: '/lti/login',              // OIDC login initiation
    keysetUrl: '/.well-known/jwks.json', // JWKS estándar
    staticPath: BUILD_DIR,
    cookies: { secure: true, sameSite: 'None' },
    devMode: false
  }
);

// Log de entrada de cualquier cosa bajo /lti (debug amable)
let lastLtiHit = null;
app.use('/lti', (req, _res, next) => {
  lastLtiHit = {
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
  console.log('[LTI-IN]', JSON.stringify(lastLtiHit));
  next();
});
app.get('/debug/last-lti', (_req, res) => res.json(lastLtiHit || { note: 'no LTI request captured yet' }));

// Al validar el launch, sirve la SPA
lti.onConnect(async (_token, _req, res) => {
  try {
    return res.sendFile(path.join(BUILD_DIR, 'index.html'));
  } catch (e) {
    console.error('onConnect error:', e?.message);
    return res.status(500).send('Failed to load app');
  }
});

lti.onInvalidToken((err, req, res) => {
  console.error('❌ Invalid LTI Token @', req.originalUrl, err?.message);
  return res.status(401).json({
    status: 401,
    error: 'Unauthorized',
    details: { description: err?.message || 'Invalid token' }
  });
});

// Despliegue y registro de plataformas
(async () => {
  await lti.deploy({ serverless: true });
  app.use(lti.app); // monta ltijs en root

  const register = async (url, name) => {
    try {
      await lti.registerPlatform({
        url,
        name,
        clientId: LTI_CLIENT_ID,
        authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
        accesstokenEndpoint:   LTI_PLATFORM_TOKEN_URL, // (sí, sin 2ª 's')
        authConfig: { method: 'JWK_SET', key: LTI_PLATFORM_JWKS }
      });
      console.log('[LTI] Platform registered:', url);
    } catch (e) {
      console.warn('[LTI] registerPlatform warn:', url, e?.message);
    }
  };

  await register(BB_GLOBAL_ISS, 'Blackboard Global Issuer');
  await register(LTI_PLATFORM_ISS, 'UDLA Staging Issuer');

  console.log('Ltijs listo. Login:', `${BASE}/lti/login`, ' Launch:', `${BASE}/lti/launch`);
})();

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`🌐 Listening on :${PORT}`);
  console.log(`Health: ${BASE}/health`);
  console.log(`Login : ${BASE}/lti/login`);
  console.log(`Launch: ${BASE}/lti/launch`);
  console.log(`JWKS  : ${BASE}/.well-known/jwks.json`);
});
