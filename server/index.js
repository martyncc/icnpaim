require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const { Provider } = require('ltijs');

// ===== Mini logger con buffer en memoria (para debug sin CloudWatch) =====
const LOG_BUFFER_MAX = 200;
const logs = [];
function logEvent(type, message, meta) {
  const entry = { t: new Date().toISOString(), type, message, meta };
  logs.push(entry);
  if (logs.length > LOG_BUFFER_MAX) logs.shift();
  const pretty = meta ? `${message} | ${JSON.stringify(meta)}` : message;
  console.log(`[${entry.t}] [${type}] ${pretty}`);
}

// Servicios propios (los sigues usando en onConnect)
const wordpressService = require('./services/wordpressService');
const courseService = require('./services/courseService');

const app = express();

/* ========= ENTORNO ========= */
const PORT = process.env.PORT || 3333;
const BASE_HOST = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE_URL = `https://${BASE_HOST}`;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
const DEBUG_TOKEN = process.env.DEBUG_TOKEN || null; // si lo pones, protege /debug/*

// LTI / Blackboard (usamos exactamente tus variables)
const LTI_CLIENT_ID = process.env.LTI_CLIENT_ID || '48dd70cc-ab62-4fbd-ba91-d3d984644373';
const LTI_DEPLOYMENT_ID = process.env.LTI_DEPLOYMENT_ID || '2b286722-4ef6-4dda-a756-eec5dca12441';
const LTI_ENCRYPTION_KEY = process.env.LTI_ENCRYPTION_KEY; // DEBES definirlo

const LTI_PLATFORM_ISS = process.env.LTI_PLATFORM_ISS || 'https://udla-staging.blackboard.com';
const LTI_PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/jwks';
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/authorize';
const LTI_PLATFORM_TOKEN_URL = process.env.LTI_PLATFORM_TOKEN_URL || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/token';

// Persistence para ltijs
const MONGO_URL = process.env.MONGO_URL; // requerido por ltijs

// Otros (tu proyecto)
const SESSION_SECRET = process.env.SESSION_SECRET || 'icnpaim-session-secret-2024';

// Validar variables críticas
logEvent('ENV', 'Boot env', {
  PORT,
  BASE_HOST,
  BASE_URL,
  LTI_CLIENT_ID,
  LTI_DEPLOYMENT_ID,
  LTI_PLATFORM_ISS,
  LTI_PLATFORM_JWKS,
  LTI_PLATFORM_OIDC_AUTH,
  LTI_PLATFORM_TOKEN_URL,
  MONGO_URL_set: !!MONGO_URL,
  LTI_ENCRYPTION_KEY_set: !!LTI_ENCRYPTION_KEY,
  WORDPRESS_URL: process.env.WORDPRESS_URL || 'NOT SET'
});

if (!LTI_PLATFORM_ISS || !LTI_PLATFORM_JWKS || !LTI_PLATFORM_OIDC_AUTH || !LTI_PLATFORM_TOKEN_URL) {
  logEvent('CRITICAL', 'Missing LTI platform configuration!', {});
}
if (!MONGO_URL || !LTI_ENCRYPTION_KEY) {
  logEvent('CRITICAL', 'MONGO_URL y/o LTI_ENCRYPTION_KEY faltan.', {});
}

/* ========= PROXY / LOGS / CORS / CSP ========= */
app.set('trust proxy', 1);

app.use((req, _res, next) => {
  logEvent('REQ', `${req.method} ${req.originalUrl}`);
  next();
});

const allowedOrigins = new Set([
  `https://${BASE_HOST}`,
  'https://icnpaim.cl',
  'https://udla-staging.blackboard.com',
  'https://blackboard.com',
  'http://localhost:3000'
]);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    try {
      const hostname = new URL(origin).hostname;
      if (allowedOrigins.has(origin) || /\.blackboard\.com$/.test(hostname)) return cb(null, true);
    } catch (_e) {}
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With']
}));

// Seguridad para iframe en Blackboard
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

// No cachear flujo LTI (rutas que manejará ltijs)
app.use(['/lti/login','/lti/launch'], (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ========= PARSERS / SESIÓN ========= */
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'icnpaim.sid',
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
    // domain: isProd ? '.icnpaim.cl' : undefined,
  }
}));

/* ========= HELPERS ========= */
const requireAuth = (req, res, next) => {
  if (!req.session?.authenticated || !req.session?.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};
const requireDebug = (req, res, next) => {
  if (!DEBUG_TOKEN) return res.status(403).json({ error: 'Debug disabled' });
  const token = req.get('x-debug-token');
  if (token !== DEBUG_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
};

// Bloquea accesos directos a /client/* y /public/* (legacy)
app.all(/^\/client(\/.*)?$/, (_req, res) => res.status(404).send('Not found'));
app.all(/^\/public(\/.*)?$/, (_req, res) => res.status(404).send('Not found'));

/* ========= LTIJS: Provider ========= */
const lti = new Provider(
  LTI_ENCRYPTION_KEY,
  { url: MONGO_URL },
  {
    appUrl: '/',                    // tu SPA vive en raíz
    loginUrl: '/lti/login',         // OIDC Login de la herramienta
    keysetUrl: '/.well-known/jwks.json',
    cookies: { secure: true, sameSite: 'None' }
  }
);

// Estado LTI para healthchecks
global.ltiReady = false;
global.ltiError = null;

// Inicialización asíncrona de ltijs y registro de la plataforma (tolerante a fallos)
(async () => {
  try {
    await lti.deploy({ serverless: true });
    app.use('/lti', lti.app); // monta rutas internas de ltijs (login/launch/jwks)

    await lti.registerPlatform({
      url: LTI_PLATFORM_ISS,                // issuer/plataforma
      name: 'UDLA Staging',
      clientId: LTI_CLIENT_ID,
      authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH, // OIDC auth request endpoint
      authTokenEndpoint: LTI_PLATFORM_TOKEN_URL,      // Token endpoint (para servicios LTI)
      keysetUrl: LTI_PLATFORM_JWKS                    // Public keyset URL de Blackboard
    });

    // Qué hacer cuando el launch fue validado
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

        // Integraciones opcionales (no rompas si fallan)
        let wpUser = null;
        try { wpUser = await wordpressService.ensureUser?.(userBasics); } catch (e) { logEvent('WARN', 'WP user linking failed', { error: e?.message }); }

        let course = null;
        try { course = await courseService.initFromLTI?.(context, resourceLink, wpUser); } catch (e) { logEvent('WARN', 'Course init failed', { error: e?.message }); }

        req.session.authenticated = true;
        req.session.user = userBasics;
        req.session.wpUser = wpUser;
        req.session.course = course;

        const isInstructor = roles.some(r => r.includes('Instructor') || r.includes('TeachingAssistant'));
        const dest = isInstructor ? '/admin-dashboard' : '/student-dashboard';
        logEvent('LTI', 'onConnect redirect', { dest, user: userBasics.sub, rolesCount: roles.length });
        return res.redirect(dest);
      } catch (err) {
        logEvent('ERROR', 'onConnect error', { error: err?.message });
        return res.status(400).send('LTI onConnect failed');
      }
    });

    global.ltiReady = true;
    logEvent('LTI', 'Inicializado ✅');
  } catch (err) {
    global.ltiError = err;
    global.ltiReady = false;
    logEvent('ERROR', 'LTI init failed', { error: err?.message || String(err) });
    // NO lanzamos el error para que el servidor escuche y el healthcheck responda 200
  }
})();

/* ========= HEALTH / DEBUG ========= */
app.get('/lti/live', (_req, res) => res.status(200).send('live'));
app.get('/lti/ready', (_req, res) => global.ltiReady ? res.status(200).send('ready') : res.status(503).send('not-ready'));

app.get('/lti/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    base_url: BASE_URL,
    base_host: BASE_HOST,
    railway_env: process.env.RAILWAY_ENVIRONMENT || 'not set',
    lti_ready: !!global.ltiReady,
    lti_error: global.ltiError ? (global.ltiError.message || String(global.ltiError)) : null,
    lti: {
      client_id: LTI_CLIENT_ID,
      deployment_id: LTI_DEPLOYMENT_ID,
      login_url: `${BASE_URL}/lti/login`,
      launch_url: `${BASE_URL}/lti/launch`,
      jwks_url: `${BASE_URL}/.well-known/jwks.json`,
      platform_iss: LTI_PLATFORM_ISS,
      platform_jwks: LTI_PLATFORM_JWKS,
      platform_oidc_auth: LTI_PLATFORM_OIDC_AUTH,
      platform_token_url: LTI_PLATFORM_TOKEN_URL
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
  });
});
app.get('/.well-known/health', (_req, res) => res.redirect(301, '/lti/health'));

// Debug endpoints (protegidos por DEBUG_TOKEN)
app.all('/debug/echo', requireDebug, (req, res) => {
  res.json({
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    query: req.query,
    body: req.body,
    time: new Date().toISOString()
  });
});
app.get('/debug/logs', requireDebug, (_req, res) => {
  res.json({ count: logs.length, logs });
});
app.get('/debug/env', requireDebug, (_req, res) => {
  // Nunca exponemos secretos en claro
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    BASE_HOST: process.env.BASE_HOST,
    BASE_URL,
    LTI_CLIENT_ID: process.env.LTI_CLIENT_ID,
    LTI_DEPLOYMENT_ID: process.env.LTI_DEPLOYMENT_ID,
    LTI_PLATFORM_ISS: process.env.LTI_PLATFORM_ISS,
    LTI_PLATFORM_JWKS: process.env.LTI_PLATFORM_JWKS,
    LTI_PLATFORM_OIDC_AUTH: process.env.LTI_PLATFORM_OIDC_AUTH,
    LTI_PLATFORM_TOKEN_URL: process.env.LTI_PLATFORM_TOKEN_URL,
    WORDPRESS_URL: process.env.WORDPRESS_URL,
    has: {
      LTI_ENCRYPTION_KEY: !!process.env.LTI_ENCRYPTION_KEY,
      MONGO_URL: !!process.env.MONGO_URL,
      SESSION_SECRET: !!process.env.SESSION_SECRET,
      DEBUG_TOKEN: !!process.env.DEBUG_TOKEN
    }
  });
});

/* ========= API PROTEGIDA ========= */
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    user: req.session.user,
    wpUser: req.session.wpUser,
    course: req.session.course
  });
});

app.get('/api/student/pathway', requireAuth, async (req, res) => {
  try {
    const userId = req.session.wpUser?.id;
    const courseId = req.session.course?.id;
    const pathway = await courseService.getStudentPathway(userId, courseId);
    res.json(pathway);
  } catch (error) {
    logEvent('ERROR', 'getStudentPathway failed', { error: error?.message });
    res.status(500).json({ error: 'Failed to fetch pathway' });
  }
});

app.get('/api/student/units', requireAuth, async (req, res) => {
  try {
    const userId = req.session.wpUser?.id;
    const courseId = req.session.course?.id;
    const units = await courseService.getActiveUnits(userId, courseId);
    res.json(units);
  } catch (error) {
    logEvent('ERROR', 'getActiveUnits failed', { error: error?.message });
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

app.post('/api/progress/update', requireAuth, async (req, res) => {
  try {
    const { unitId, contentId, completed, score } = req.body;
    const userId = req.session.wpUser?.id;
    const progress = await courseService.updateProgress(userId, unitId, contentId, completed, score);
    res.json(progress);
  } catch (error) {
    logEvent('ERROR', 'updateProgress failed', { error: error?.message });
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

/* ========= SPA EN RAÍZ ========= */
const clientBuildDir = path.join(__dirname, '../client/build');
logEvent('BOOT', 'build exists?', { exists: fs.existsSync(path.join(clientBuildDir, 'index.html')) });

// 1) estáticos (JS/CSS/img)
if (isProd) {
  app.use(express.static(clientBuildDir, { index: false }));
}

// 2) HTML de la SPA (rutas protegidas)
if (isProd) {
  app.get('/student-dashboard', requireAuth, (_req, res) => res.sendFile(path.join(clientBuildDir, 'index.html')));
  app.get('/admin-dashboard', requireAuth, (_req, res) => res.sendFile(path.join(clientBuildDir, 'index.html')));
  // Catch-all: todo lo que no sea /api o /lti o /.well-known -> SPA (protegida)
  app.get(/^\/(?!api\/|lti\/|\.well-known\/|debug\/).*/, requireAuth, (req, res) => {
    res.sendFile(path.join(clientBuildDir, 'index.html'));
  });
}

// Página mínima raíz (info, NO SPA)
app.get('/', (_req, res) => {
  res.type('html').send(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>ICN PAIM</title></head>
    <body>
      <h3>🚀 ICN PAIM - Servidor OK</h3>
      <p><strong>Base URL:</strong> ${BASE_URL}</p>
      <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
      <h4>📋 URLs para Blackboard:</h4>
      <ul>
        <li>Login URL: <code>${BASE_URL}/lti/login</code></li>
        <li>Launch URL: <code>${BASE_URL}/lti/launch</code></li>
        <li>JWKS URL: <code>${BASE_URL}/.well-known/jwks.json</code></li>
        <li>Health: <a href="${BASE_URL}/lti/health">${BASE_URL}/lti/health</a></li>
        <li>Ready: <a href="${BASE_URL}/lti/ready">${BASE_URL}/lti/ready</a> | Live: <a href="${BASE_URL}/lti/live">${BASE_URL}/lti/live</a></li>
      </ul>
      <h4>🔑 Credenciales LTI:</h4>
      <ul>
        <li><strong>Client ID:</strong> ${LTI_CLIENT_ID}</li>
        <li><strong>Deployment ID:</strong> ${LTI_DEPLOYMENT_ID}</li>
      </ul>
      <h4>🔧 Debug:</h4>
      <ul>
        <li>Logs (protegido): <code>GET ${BASE_URL}/debug/logs</code> con header <code>x-debug-token</code></li>
        <li>Echo (protegido): <code>ALL ${BASE_URL}/debug/echo</code> con header <code>x-debug-token</code></li>
      </ul>
    </body></html>
  `);
});

/* ========= ERRORES / START ========= */
app.use((error, _req, res, _next) => {
  logEvent('ERROR', 'Unhandled server error', { error: error?.message });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logEvent('BOOT', `ICN PAIM Server on :${PORT}`, {});
  logEvent('BOOT', `Login URL:  ${BASE_URL}/lti/login`);
  logEvent('BOOT', `Launch URL: ${BASE_URL}/lti/launch`);
});
