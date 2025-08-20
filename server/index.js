require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const { Provider: LtiProvider } = require('ltijs');

// ===== Mini logger =====
const LOG_BUFFER_MAX = 200;
const logs = [];
function logEvent(type, message, meta) {
  const entry = { t: new Date().toISOString(), type, message, meta };
  logs.push(entry); if (logs.length > LOG_BUFFER_MAX) logs.shift();
  console.log(`[${entry.t}] [${type}] ${message}${meta ? ' | ' + JSON.stringify(meta) : ''}`);
}

// Servicios propios
const wordpressService = require('./services/wordpressService');
const courseService = require('./services/courseService');

const app = express();

/* ========= ENTORNO ========= */
const PORT = process.env.PORT || 3333;
const BASE_HOST = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE_URL = `https://${BASE_HOST}`;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
const DEBUG_TOKEN = process.env.DEBUG_TOKEN || null;

const LTI_CLIENT_ID = process.env.LTI_CLIENT_ID || '48dd70cc-ab62-4fbd-ba91-d3d984644373';
const LTI_DEPLOYMENT_ID = process.env.LTI_DEPLOYMENT_ID || '2b286722-4ef6-4dda-a756-eec5dca12441';
const LTI_ENCRYPTION_KEY = process.env.LTI_ENCRYPTION_KEY;

const LTI_PLATFORM_ISS = process.env.LTI_PLATFORM_ISS || 'https://udla-staging.blackboard.com';
const LTI_PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/jwks';
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/authorize';
const LTI_PLATFORM_TOKEN_URL = process.env.LTI_PLATFORM_TOKEN_URL || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/token';

const MONGO_URL = process.env.MONGO_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'icnpaim-session-secret-2024';

logEvent('ENV', 'Boot env', {
  PORT, BASE_HOST, BASE_URL,
  LTI_CLIENT_ID, LTI_DEPLOYMENT_ID,
  LTI_PLATFORM_ISS, LTI_PLATFORM_JWKS, LTI_PLATFORM_OIDC_AUTH, LTI_PLATFORM_TOKEN_URL,
  MONGO_URL_set: !!MONGO_URL, LTI_ENCRYPTION_KEY_set: !!LTI_ENCRYPTION_KEY,
  WORDPRESS_URL: process.env.WORDPRESS_URL || 'NOT SET'
});
if (!MONGO_URL || !LTI_ENCRYPTION_KEY) logEvent('CRITICAL', 'Faltan MONGO_URL o LTI_ENCRYPTION_KEY');

// ===== Infra básica
app.set('trust proxy', 1);
app.use((req, _res, next) => { logEvent('REQ', `${req.method} ${req.originalUrl}`); next(); });

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    try {
      const hostname = new URL(origin).hostname;
      if (origin === `https://${BASE_HOST}` || origin === 'https://icnpaim.cl' ||
          origin === 'https://udla-staging.blackboard.com' || origin === 'https://blackboard.com' ||
          /^.*\.blackboard\.com$/.test(hostname)) return cb(null, true);
    } catch {}
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With']
}));

app.use(helmet({
  frameguard: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'frame-ancestors': ["'self'", 'https://*.blackboard.com', 'https://udla-staging.blackboard.com', 'https://icnpaim.cl', 'https://lti.icnpaim.cl']
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex'); next(); });
app.use(['/lti/login','/lti/launch'], (_req, res, next) => { res.set('Cache-Control','no-store'); next(); });

/* ========= Parsers / session ========= */
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false, saveUninitialized: false, name: 'icnpaim.sid',
  cookie: { secure: isProd, httpOnly: true, sameSite: isProd ? 'none' : 'lax', maxAge: 24*60*60*1000 }
}));

const requireAuth = (req, res, next) => (!req.session?.authenticated || !req.session?.user)
  ? res.status(401).json({ error: 'Authentication required' }) : next();
const requireDebug = (req, res, next) => {
  if (!DEBUG_TOKEN) return res.status(403).json({ error: 'Debug disabled' });
  if (req.get('x-debug-token') !== DEBUG_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
};

app.all(/^\/client(\/.*)?$/, (_req, res)=>res.status(404).send('Not found'));
app.all(/^\/public(\/.*)?$/, (_req, res)=>res.status(404).send('Not found'));
app.get('/favicon.ico', (_req, res)=>res.sendStatus(204));

/* ========= Normalizadores / Puentes ANTES de ltijs ========= */
// /lti/login/ -> /lti/login   |  /lti/launch/ -> /lti/launch
app.all(['/lti/login/', '/lti/launch/'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = req.path.slice(0, -1) + qs;
  const code = req.method === 'POST' ? 307 : 302;
  return res.redirect(code, target);
});

// Si el id_token cae por error en /lti/login, lo reenvío a /lti/launch
app.post('/lti/login', (req, res, next) => {
  const idt = req.body?.id_token;
  if (!idt) return next();
  const state = req.body?.state || '';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  logEvent('LTI-BRIDGE','POST id_token en /lti/login; reenviando a /lti/launch',{ hasIdToken:true, hasState:!!state });
  return res.status(200).type('html').send(`<!doctype html><html><body>
    <form id="f" method="post" action="/lti/launch">
      <input type="hidden" name="id_token" value="${esc(idt)}"/>
      <input type="hidden" name="state" value="${esc(state)}"/>
    </form><script>document.getElementById('f').submit();</script></body></html>`);
});

// Si (rarísimo) llega GET /lti/launch?id_token=..., lo convierto a POST
app.get('/lti/launch', (req, res, next) => {
  const idt = req.query?.id_token;
  if (!idt) return next();
  const state = req.query?.state || '';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return res.status(200).type('html').send(`<!doctype html><html><body>
    <form id="f" method="post" action="/lti/launch">
      <input type="hidden" name="id_token" value="${esc(idt)}"/>
      <input type="hidden" name="state" value="${esc(state)}"/>
    </form><script>document.getElementById('f').submit();</script></body></html>`);
});

/* ========= LTIJS ========= */
const lti = new LtiProvider(LTI_ENCRYPTION_KEY, { url: MONGO_URL }, {
  appUrl: '/', loginUrl: '/lti/login', keysetUrl: '/.well-known/jwks.json',
  cookies: { secure: true, sameSite: 'None' }
});

let lastLtiReq = null;
app.use('/lti', (req, _res, next) => {
  const snap = {
    method: req.method, url: req.originalUrl,
    headers: { 'content-type': req.get('content-type'), 'user-agent': req.get('user-agent'),
      origin: req.get('origin'), referer: req.get('referer') },
    query: req.query
  };
  if (req.method === 'POST') snap.bodyKeys = Object.keys(req.body || {});
  lastLtiReq = snap; logEvent('LTI-IN','incoming /lti request', snap); next();
});

global.ltiReady = false; global.ltiError = null;

(async () => {
  try {
    await lti.deploy({ serverless: true });
    app.use('/lti', lti.app);

    const registerPlatform = async (url, name) => {
      try {
        await lti.registerPlatform({
          url, name, clientId: LTI_CLIENT_ID,
          authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
          authTokenEndpoint: LTI_PLATFORM_TOKEN_URL,
          keysetUrl: LTI_PLATFORM_JWKS
        });
        logEvent('LTI','Platform registered',{ url });
      } catch (e) {
        logEvent('WARN','registerPlatform failed/already exists',{ url, error: e?.message });
      }
    };
    await registerPlatform(LTI_PLATFORM_ISS, 'UDLA Staging');
    await registerPlatform('https://blackboard.com', 'Blackboard Global Issuer');

    lti.onConnect(async (token, req, res) => {
      try {
        const roles = token.userInfo?.roles || [];
        const context = token.platformContext?.context || null;
        const resourceLink = token.platformContext?.resource?.resourceLink || null;

        const userBasics = {
          sub: token.user,
          name: token.userInfo?.name || token.userInfo?.given_name || 'Estudiante',
          email: token.userInfo?.email || null,
          roles
        };

        let wpUser = null;
        try { wpUser = await wordpressService.ensureUser?.(userBasics); } catch (e) { logEvent('WARN','WP user linking failed',{ error: e?.message }); }

        let course = null;
        try { course = await courseService.initFromLTI?.(context, resourceLink, wpUser); } catch (e) { logEvent('WARN','Course init failed',{ error: e?.message }); }

        req.session.authenticated = true;
        req.session.user = userBasics;
        req.session.wpUser = wpUser;
        req.session.course = course;

        const isInstructor = roles.some(r => r.includes('Instructor') || r.includes('TeachingAssistant'));
        const dest = isInstructor ? '/admin-dashboard' : '/student-dashboard';
        logEvent('LTI','onConnect redirect',{ dest, user: userBasics.sub, rolesCount: roles.length });
        return res.redirect(dest);
      } catch (err) {
        logEvent('ERROR','onConnect error',{ error: err?.message });
        return res.status(400).send('LTI onConnect failed');
      }
    });

    global.ltiReady = true; logEvent('LTI','Inicializado ✅');
  } catch (err) {
    global.ltiError = err; global.ltiReady = false;
    logEvent('ERROR','LTI init failed',{ error: err?.message || String(err) });
  }
})();

/* ========= HEALTH / DEBUG ========= */
app.get('/lti/health', (_req, res)=>res.status(200).json({ status:'OK', moved:'/health' }));
app.get('/lti/live', (_req, res)=>res.status(200).send('live'));
app.get('/lti/ready', (_req, res)=>global.ltiReady ? res.status(200).send('ready') : res.status(503).send('not-ready'));
app.get('/live', (_req, res)=>res.status(200).send('live'));
app.get('/ready', (_req, res)=>global.ltiReady ? res.status(200).send('ready') : res.status(503).send('not-ready'));
app.get('/health', (_req, res) => res.json({
  status: 'OK', timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV || 'development', base_url: BASE_URL, base_host: BASE_HOST,
  railway_env: process.env.RAILWAY_ENVIRONMENT || 'not set',
  lti_ready: !!global.ltiReady,
  lti_error: global.ltiError ? (global.ltiError.message || String(global.ltiError)) : null,
  lti: {
    client_id: LTI_CLIENT_ID, deployment_id: LTI_DEPLOYMENT_ID,
    login_url: `${BASE_URL}/lti/login`, launch_url: `${BASE_URL}/lti/launch`,
    jwks_url: `${BASE_URL}/.well-known/jwks.json`,
    platform_iss: LTI_PLATFORM_ISS, platform_jwks: LTI_PLATFORM_JWKS,
    platform_oidc_auth: LTI_PLATFORM_OIDC_AUTH, platform_token_url: LTI_PLATFORM_TOKEN_URL
  },
  environment_variables: {
    LTI_CLIENT_ID: !!process.env.LTI_CLIENT_ID,
    LTI_DEPLOYMENT_ID: !!process.env.LTI_DEPLOYMENT_ID,
    LTI_PLATFORM_ISS: !!process.env.LTI_PLATFORM_ISS,
    LTI_PLATFORM_JWKS: !!process.env.LTI_PLATFORM_JWKS,
    LTI_PLATFORM_OIDC_AUTH: !!process.env.LTI_PLATFORM_OIDC_AUTH,
    LTI_PLATFORM_TOKEN_URL: !!process.env.LTI_PLATFORM_TOKEN_URL,
    WORDPRESS_URL: !!process.env.WORDPRESS_URL,
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    LTI_ENCRYPTION_KEY: !!process.env.LTI_ENCRYPTION_KEY,
    MONGO_URL: !!process.env.MONGO_URL
  }
}));
app.get('/.well-known/health', (_req, res)=>res.redirect(301, '/health'));

// Debug
app.all('/debug/echo', requireDebug, (req, res) => res.json({
  method: req.method, url: req.originalUrl, headers: req.headers,
  query: req.query, body: req.body, time: new Date().toISOString()
}));
app.get('/debug/logs', requireDebug, (_req, res)=>res.json({ count: logs.length, logs }));
app.get('/debug/env', requireDebug, (_req, res)=>res.json({
  NODE_ENV: process.env.NODE_ENV, BASE_HOST: process.env.BASE_HOST, BASE_URL,
  LTI_CLIENT_ID: process.env.LTI_CLIENT_ID, LTI_DEPLOYMENT_ID: process.env.LTI_DEPLOYMENT_ID,
  LTI_PLATFORM_ISS: process.env.LTI_PLATFORM_ISS, LTI_PLATFORM_JWKS: process.env.LTI_PLATFORM_JWKS,
  LTI_PLATFORM_OIDC_AUTH: process.env.LTI_PLATFORM_OIDC_AUTH, LTI_PLATFORM_TOKEN_URL: process.env.LTI_PLATFORM_TOKEN_URL,
  WORDPRESS_URL: process.env.WORDPRESS_URL,
  has: { LTI_ENCRYPTION_KEY: !!process.env.LTI_ENCRYPTION_KEY, MONGO_URL: !!process.env.MONGO_URL, SESSION_SECRET: !!process.env.SESSION_SECRET, DEBUG_TOKEN: !!process.env.DEBUG_TOKEN }
}));
app.get('/debug/last-lti', requireDebug, (_req, res)=>res.json(lastLtiReq || { note: 'No LTI request captured yet' }));

/* ========= SPA ========= */
const clientBuildDir = path.join(__dirname, '../client/build');
logEvent('BOOT','build exists?', { exists: fs.existsSync(path.join(clientBuildDir,'index.html')) });
if (isProd) app.use(express.static(clientBuildDir, { index: false }));
if (isProd) {
  app.get('/student-dashboard', requireAuth, (_req,res)=>res.sendFile(path.join(clientBuildDir,'index.html')));
  app.get('/admin-dashboard', requireAuth, (_req,res)=>res.sendFile(path.join(clientBuildDir,'index.html')));
  app.get(/^\/(?!api\/|lti\/|\.well-known\/|debug\/).*/, requireAuth, (req,res)=>res.sendFile(path.join(clientBuildDir,'index.html')));
}

// raíz info
app.get('/', (_req,res)=>res.type('html').send(`
<!doctype html><html><head><meta charset="utf-8"><title>ICN PAIM</title></head>
<body>
  <h3>🚀 ICN PAIM - Servidor OK</h3>
  <p><strong>Base URL:</strong> ${BASE_URL}</p>
  <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
  <h4>📋 URLs para Blackboard:</h4>
  <ul>
    <li>Login URL: <code>${BASE_URL}/lti/login</code></li>
    <li>Launch URL: <code>${BASE_URL}/lti/launch</code></li>
    <li>JWKS URL: <code>${BASE_URL}/.well-known/jwks.json</code></li>
    <li>Health: <a href="${BASE_URL}/health">${BASE_URL}/health</a></li>
    <li>Ready: <a href="${BASE_URL}/ready">${BASE_URL}/ready</a> | Live: <a href="${BASE_URL}/live">${BASE_URL}/live</a></li>
  </ul>
</body></html>`));

/* ========= Errores / Start ========= */
app.use((error, _req, res, _next) => {
  logEvent('ERROR','Unhandled server error',{ error: error?.message });
  res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, () => {
  logEvent('BOOT', `ICN PAIM Server on :${PORT}`);
  logEvent('BOOT', `Login URL:  ${BASE_URL}/lti/login`);
  logEvent('BOOT', `Launch URL: ${BASE_URL}/lti/launch`);
});
