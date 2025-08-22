// server/index.js — LTI 1.3 con ltijs, rutas correctas para Blackboard
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// ltijs: importa como en el repo demo (NO uses "new")
const lti = require('ltijs').Provider;

/* ===================== ENV ===================== */
const PORT  = process.env.PORT || 8080;
const HOST  = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE  = process.env.BASE_URL || `https://${HOST}`;

const LTI_KEY   = process.env.LTI_ENCRYPTION_KEY || process.env.LTI_KEY; // clave simétrica de ltijs
const MONGO_URL = process.env.MONGO_URL;

const LTI_CLIENT_ID          = process.env.LTI_CLIENT_ID;
const LTI_DEPLOYMENT_ID      = process.env.LTI_DEPLOYMENT_ID; // informativo
// Blackboard endpoints (usas los que ya tenías)
const LTI_PLATFORM_ISS       = process.env.LTI_PLATFORM_ISS || 'https://udla-staging.blackboard.com';
const LTI_PLATFORM_JWKS      = process.env.LTI_PLATFORM_JWKS;
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH;
const LTI_PLATFORM_TOKEN_URL = process.env.LTI_PLATFORM_TOKEN_URL;

// Blackboard a veces envía iss = https://blackboard.com (doc oficial)
const BB_GLOBAL_ISS = 'https://blackboard.com';

// sanity checks mínimos
if (!LTI_KEY)      throw new Error('Falta LTI_ENCRYPTION_KEY / LTI_KEY');
if (!MONGO_URL)    throw new Error('Falta MONGO_URL');
if (!LTI_CLIENT_ID || !LTI_PLATFORM_JWKS || !LTI_PLATFORM_OIDC_AUTH || !LTI_PLATFORM_TOKEN_URL) {
  throw new Error('Faltan variables LTI de plataforma (CLIENT_ID/JWKS/OIDC/TOKEN)');
}

/* ===================== EXPRESS OUTER ===================== */
const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const allow = [
      `https://${HOST}`,
      'https://lti.icnpaim.cl',
      'https://icnpaim.cl',
      'https://udla-staging.blackboard.com',
      'https://blackboard.com',
      'http://localhost:3000'
    ];
    try {
      const ok = allow.includes(origin) || /\.blackboard\.com$/.test(new URL(origin).hostname);
      return cb(null, ok);
    } catch { return cb(null, false); }
  },
  credentials: true,
  methods: ['GET','POST','OPTIONS']
}));

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// no-cache para endpoints del flujo
app.use(['/lti/login','/lti/launch'], (_req, res, next) => { res.set('Cache-Control','no-store'); next(); });

// -------- Healthchecks públicos (no pasan por guard de ltijs)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    ts: new Date().toISOString(),
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
// compat para checkers tercos
app.get('/.well-known/health', (_req, res) => res.redirect(301, '/health'));
app.get('/lti/health', (_req, res) => res.status(200).json({ status: 'OK', ts: new Date().toISOString() }));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// normalizadores de rutas (typos y barra final)
app.all(['/lti/login/','/lti/launch/'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = req.path.slice(0, -1) + qs;
  const code = req.method === 'POST' ? 307 : 302;
  return res.redirect(code, target);
});
app.all('/lti/logi', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(302, '/lti/login' + qs);
});

/* ===================== STATIC / SPA ===================== */
const STATIC_DIR =
  fs.existsSync(path.join(__dirname, '../client/build/index.html'))
    ? path.join(__dirname, '../client/build')
    : path.join(__dirname, './public');

if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  app.use(express.static(STATIC_DIR, { index: false }));
}

app.get('/', (_req, res) => {
  res.type('html').send(`
    <!doctype html><html><head><meta charset="utf-8"><title>ICN PAIM</title></head>
    <body style="font-family:system-ui;padding:24px">
      <h3>🚀 ICN PAIM</h3>
      <ul>
        <li>Login URL:  <code>${BASE}/lti/login</code></li>
        <li>Launch URL: <code>${BASE}/lti/launch</code></li>
        <li>JWKS URL:   <code>${BASE}/.well-known/jwks.json</code></li>
        <li>Health:     <code>${BASE}/health</code> / <code>${BASE}/lti/health</code></li>
      </ul>
    </body></html>
  `);
});

/* ===================== LTIJS ===================== */
// Configura ltijs para usar EXACTAMENTE las rutas que espera Blackboard.
// OJO: montaremos lti.app en ROOT, así que estas paths son ABSOLUTAS.
lti.setup(
  LTI_KEY,
  { url: MONGO_URL },
  {
    appUrl: '/lti/launch',               // dónde recibes el POST con id_token
    loginUrl: '/lti/login',              // OIDC login initiation
    keysetUrl: '/.well-known/jwks.json', // JWKS en estándar .well-known
    staticPath: STATIC_DIR,
    cookies: { secure: true, sameSite: 'None' },
    devMode: false
  }
);

// tras validar el launch, sirve tu SPA
lti.onConnect(async (_token, _req, res) => {
  try {
    return res.sendFile(path.join(STATIC_DIR, 'index.html'));
  } catch (e) {
    console.error('onConnect error:', e?.message);
    return res.status(500).send('Failed to load app');
  }
});

// pequeño logger de lo que entra a /lti (debug de flujo)
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
  next();
});
app.get('/debug/last-lti', (_req, res) => res.json(lastLtiHit || { note: 'no LTI request captured yet' }));

// Despliega ltijs en modo serverless y móntalo en la app raíz
(async () => {
  await lti.deploy({ serverless: true });
  app.use(lti.app); // importante: en ROOT, no en /lti

  // registra ambas variantes de issuer (idempotente)
  const register = async (url, name) => {
    try {
      await lti.registerPlatform({
        url,
        name,
        clientId: LTI_CLIENT_ID,
        authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
        accesstokenEndpoint:   LTI_PLATFORM_TOKEN_URL, // sí, "accesstokenEndpoint" va sin segunda 's'
        authConfig: { method: 'JWK_SET', key: LTI_PLATFORM_JWKS }
      });
      console.log('[LTI] Platform registered:', url);
    } catch (e) {
      console.warn('[LTI] registerPlatform warn:', url, e?.message);
    }
  };

  // emisor “documentado” por Learn
  await register(BB_GLOBAL_ISS, 'Blackboard Global Issuer');
  // emisor específico de tu instancia (por si Learn te lo manda así)
  await register(LTI_PLATFORM_ISS, 'UDLA Staging Issuer');

  console.log('Ltijs ready. Login:', `${BASE}/lti/login`, ' Launch:', `${BASE}/lti/launch`);
})();

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`LTI server listening on :${PORT}`);
  console.log(`Health: ${BASE}/health  |  ${BASE}/lti/health`);
  console.log(`Login : ${BASE}/lti/login`);
  console.log(`Launch: ${BASE}/lti/launch`);
  console.log(`JWKS  : ${BASE}/.well-known/jwks.json`);
});
// server/index.js — LTI 1.3 con ltijs, rutas correctas para Blackboard
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// ltijs: importa como en el repo demo (NO uses "new")
const lti = require('ltijs').Provider;

/* ===================== ENV ===================== */
const PORT  = process.env.PORT || 8080;
const HOST  = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE  = process.env.BASE_URL || `https://${HOST}`;

const LTI_KEY   = process.env.LTI_ENCRYPTION_KEY || process.env.LTI_KEY; // clave simétrica de ltijs
const MONGO_URL = process.env.MONGO_URL;

const LTI_CLIENT_ID          = process.env.LTI_CLIENT_ID;
const LTI_DEPLOYMENT_ID      = process.env.LTI_DEPLOYMENT_ID; // informativo
// Blackboard endpoints (usas los que ya tenías)
const LTI_PLATFORM_ISS       = process.env.LTI_PLATFORM_ISS || 'https://udla-staging.blackboard.com';
const LTI_PLATFORM_JWKS      = process.env.LTI_PLATFORM_JWKS;
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH;
const LTI_PLATFORM_TOKEN_URL = process.env.LTI_PLATFORM_TOKEN_URL;

// Blackboard a veces envía iss = https://blackboard.com (doc oficial)
const BB_GLOBAL_ISS = 'https://blackboard.com';

// sanity checks mínimos
if (!LTI_KEY)      throw new Error('Falta LTI_ENCRYPTION_KEY / LTI_KEY');
if (!MONGO_URL)    throw new Error('Falta MONGO_URL');
if (!LTI_CLIENT_ID || !LTI_PLATFORM_JWKS || !LTI_PLATFORM_OIDC_AUTH || !LTI_PLATFORM_TOKEN_URL) {
  throw new Error('Faltan variables LTI de plataforma (CLIENT_ID/JWKS/OIDC/TOKEN)');
}

/* ===================== EXPRESS OUTER ===================== */
const app = express();
app.set('trust proxy', 1);

// CORS simplificado para healthchecks
app.use(cors({
  origin: true, // Permite todos los origins para healthchecks
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// no-cache para endpoints del flujo
app.use(['/lti/login','/lti/launch'], (_req, res, next) => { res.set('Cache-Control','no-store'); next(); });

// -------- Healthchecks públicos (deben estar ANTES de montar ltijs)
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    ts: new Date().toISOString(),
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

// compat para checkers tercos
app.get('/.well-known/health', (_req, res) => res.redirect(301, '/health'));

// Este endpoint será protegido por LTI - NO usarlo para healthcheck público
app.get('/lti/health', (_req, res) => {
  res.status(200).json({ 
    status: 'LTI_AUTH_REQUIRED',
    message: 'This endpoint requires LTI authentication',
    ts: new Date().toISOString()
  });
});

app.get('/favicon.ico', (_req, res) => res.status(204).end());

// normalizadores de rutas (typos y barra final)
app.all(['/lti/login/','/lti/launch/'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = req.path.slice(0, -1) + qs;
  const code = req.method === 'POST' ? 307 : 302;
  return res.redirect(code, target);
});
app.all('/lti/logi', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(302, '/lti/login' + qs);
});

/* ===================== STATIC / SPA ===================== */
const STATIC_DIR =
  fs.existsSync(path.join(__dirname, '../client/build/index.html'))
    ? path.join(__dirname, '../client/build')
    : path.join(__dirname, './public');

if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  app.use(express.static(STATIC_DIR, { index: false }));
}

app.get('/', (_req, res) => {
  res.type('html').send(`
    <!doctype html><html><head><meta charset="utf-8"><title>ICN PAIM</title></head>
    <body style="font-family:system-ui;padding:24px">
      <h3>🚀 ICN PAIM</h3>
      <ul>
        <li>Login URL:  <code>${BASE}/lti/login</code></li>
        <li>Launch URL: <code>${BASE}/lti/launch</code></li>
        <li>JWKS URL:   <code>${BASE}/.well-known/jwks.json</code></li>
        <li>Health:     <code>${BASE}/health</code> / <code>${BASE}/lti/health</code></li>
      </ul>
    </body></html>
  `);
});

// Debug endpoint
app.get('/debug/config', (req, res) => {
  res.json({
    baseUrl: BASE,
    clientId: LTI_CLIENT_ID,
    deploymentId: LTI_DEPLOYMENT_ID,
    platform: {
      iss: LTI_PLATFORM_ISS,
      jwks: LTI_PLATFORM_JWKS,
      oidc: LTI_PLATFORM_OIDC_AUTH,
      token: LTI_PLATFORM_TOKEN_URL
    },
    urls: {
      login: `${BASE}/lti/login`,
      launch: `${BASE}/lti/launch`,
      jwks: `${BASE}/.well-known/jwks.json`,
      health: `${BASE}/health`
    }
  });
});

/* ===================== LTIJS ===================== */
// Configura ltijs para usar EXACTAMENTE las rutas que espera Blackboard.
lti.setup(
  LTI_KEY,
  { 
    url: MONGO_URL,
    connection: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  {
    appUrl: '/lti/launch',               // dónde recibes el POST con id_token
    loginUrl: '/lti/login',              // OIDC login initiation
    keysetUrl: '/.well-known/jwks.json', // JWKS en estándar .well-known
    staticPath: STATIC_DIR,
    cookies: { 
      secure: true, 
      sameSite: 'None',
      domain: HOST
    },
    devMode: process.env.NODE_ENV === 'development',
    tokenMaxAge: 3600
  }
);

// tras validar el launch, sirve tu SPA
lti.onConnect(async (_token, _req, res) => {
  try {
    return res.sendFile(path.join(STATIC_DIR, 'index.html'));
  } catch (e) {
    console.error('onConnect error:', e?.message);
    return res.status(500).send('Failed to load app');
  }
});

// Handler para errores de token LTI
lti.onInvalidToken((err, req, res) => {
  console.error('Invalid LTI token:', err);
  res.status(401).json({ 
    error: 'Invalid LTI token',
    message: err.message 
  });
});

// pequeño logger de lo que entra a /lti (debug de flujo)
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
  next();
});
app.get('/debug/last-lti', (_req, res) => res.json(lastLtiHit || { note: 'no LTI request captured yet' }));

// Middleware de errores
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Despliega ltijs y móntalo en la app raíz
(async () => {
  await lti.deploy({ serverless: true });
  
  // Monta ltijs DESPUÉS de todas las rutas públicas
  app.use(lti.app);

  // registra ambas variantes de issuer (idempotente)
  const register = async (url, name) => {
    try {
      await lti.registerPlatform({
        url,
        name,
        clientId: LTI_CLIENT_ID,
        authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
        accesstokenEndpoint:   LTI_PLATFORM_TOKEN_URL,
        authConfig: { method: 'JWK_SET', key: LTI_PLATFORM_JWKS }
      });
      console.log('[LTI] Platform registered:', url);
    } catch (e) {
      console.warn('[LTI] registerPlatform warn:', url, e?.message);
    }
  };

  // emisor "documentado" por Learn
  await register(BB_GLOBAL_ISS, 'Blackboard Global Issuer');
  // emisor específico de tu instancia
  await register(LTI_PLATFORM_ISS, 'UDLA Staging Issuer');

  console.log('Ltijs ready. Login:', `${BASE}/lti/login`, ' Launch:', `${BASE}/lti/launch`);
})();

/* ===================== START ===================== */
app.listen(PORT, () => {
  console.log(`LTI server listening on :${PORT}`);
  console.log(`Health: ${BASE}/health  |  Public healthcheck endpoint`);
  console.log(`Login : ${BASE}/lti/login`);
  console.log(`Launch: ${BASE}/lti/launch`);
  console.log(`JWKS  : ${BASE}/.well-known/jwks.json`);
  console.log(`Env   : ${process.env.NODE_ENV || 'development'}`);
});