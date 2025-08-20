// server/index.js — LTI 1.3 "limpio" sobre Express (sin ltijs)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Servicios propios
const ltiService = require('./services/ltiService');
const wordpressService = require('./services/wordpressService');
const courseService = require('./services/courseService');

const app = express();

/* ========= ENTORNO ========= */
const PORT = process.env.PORT || 3333;
const BASE_HOST = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE_URL = process.env.BASE_URL || `https://${BASE_HOST}`;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

const LTI_CLIENT_ID        = process.env.LTI_CLIENT_ID || '48dd70cc-ab62-4fbd-ba91-d3d984644373';
const LTI_DEPLOYMENT_ID    = process.env.LTI_DEPLOYMENT_ID || '2b286722-4ef6-4dda-a756-eec5dca12441';
const LTI_PLATFORM_ISS     = process.env.LTI_PLATFORM_ISS || 'https://udla-staging.blackboard.com';
const LTI_PLATFORM_JWKS    = process.env.LTI_PLATFORM_JWKS || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/jwks';
const LTI_PLATFORM_OIDC    = process.env.LTI_PLATFORM_OIDC_AUTH || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/authorize';
const LTI_PLATFORM_TOKEN   = process.env.LTI_PLATFORM_TOKEN_URL || 'https://udla-staging.blackboard.com/learn/api/lti/1.3/token';

const REDIRECT_URI = `${BASE_URL}/lti/launch`;

console.log('[ENV]', JSON.stringify({
  PORT, BASE_HOST, BASE_URL, isProd,
  LTI_CLIENT_ID, LTI_DEPLOYMENT_ID,
  LTI_PLATFORM_ISS, LTI_PLATFORM_JWKS, LTI_PLATFORM_OIDC, LTI_PLATFORM_TOKEN
}, null, 2));

/* ========= MIDDLEWARE ========= */
app.set('trust proxy', 1);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const allow = new Set([
      `https://${BASE_HOST}`,
      'https://lti.icnpaim.cl',
      'https://icnpaim.cl',
      'https://udla-staging.blackboard.com',
      'https://blackboard.com',
      'http://localhost:3000'
    ]);
    try {
      const hostname = new URL(origin).hostname;
      if (allow.has(origin) || /\.blackboard\.com$/.test(hostname)) return cb(null, true);
    } catch (_) {}
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With']
}));

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'icnpaim-session-secret-2024',
  resave: false,
  saveUninitialized: false,
  name: 'icnpaim.sid',
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

/* ========= STATIC (SPA) ========= */
const CLIENT_BUILD = path.join(__dirname, '../client/build');
const hasBuild = fs.existsSync(path.join(CLIENT_BUILD, 'index.html'));
if (isProd && hasBuild) {
  app.use(express.static(CLIENT_BUILD, { index: false }));
}

/* ========= UTILS / NORMALIZADORES ========= */
// evita 404 por barra final
app.all(['/lti/login/', '/lti/launch/'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = req.path.slice(0, -1) + qs;
  const code = req.method === 'POST' ? 307 : 302;
  return res.redirect(code, target);
});

// corrige el clásico typo fantasma: /lti/logi → /lti/login
app.all('/lti/logi', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(302, '/lti/login' + qs);
});

// favicon para que no rompa logs con 401
app.get('/favicon.ico', (_req, res) => res.status(204).end());

/* ========= HEALTH PUBLICO ========= */
app.get('/lti/health', (_req, res) => {
  res.json({
    status: 'OK',
    ts: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    base_url: BASE_URL,
    lti: {
      client_id: LTI_CLIENT_ID,
      deployment_id: LTI_DEPLOYMENT_ID,
      login_url: `${BASE_URL}/lti/login`,
      launch_url: `${BASE_URL}/lti/launch`,
      jwks_url: `${BASE_URL}/.well-known/jwks.json`,
      iss: LTI_PLATFORM_ISS
    }
  });
});

/* ========= LTI ROUTES ========= */
// GET login initiation (muchos LMS la usan)
app.get('/lti/login', async (req, res) => {
  try {
    console.log('[LTI][GET /lti/login] query:', req.query);
    const { iss, login_hint, lti_message_hint, client_id, lti_deployment_id, target_link_uri } = req.query;

    // valida mínimos
    if (!iss || !login_hint || !(client_id || LTI_CLIENT_ID)) {
      return res.status(400).json({ error: 'Missing required LTI parameters', received: { iss, login_hint, client_id } });
    }

    // genera state/nonce
    const state = ltiService.generateState();
    const nonce = ltiService.generateNonce();
    req.session.lti_state = state;
    req.session.lti_nonce = nonce;
    req.session.login_hint = login_hint;

    // construye URL de autorización
    const authUrl = ltiService.buildAuthUrl({
      iss,
      login_hint,
      lti_message_hint,
      target_link_uri: REDIRECT_URI,
      state,
      nonce,
      client_id: client_id || LTI_CLIENT_ID
    });

    console.log('[LTI] → redirect auth:', authUrl);
    return res.redirect(authUrl);
  } catch (e) {
    console.error('❌ GET /lti/login error:', e);
    return res.status(500).json({ error: 'LTI Login failed' });
  }
});

// POST login initiation (algunos LMS lo hacen POST)
app.post('/lti/login', async (req, res, next) => {
  try {
    console.log('[LTI][POST /lti/login] body keys:', Object.keys(req.body || {}));

    // bridge: si te POSTean id_token aquí, reenvía a /lti/launch
    if (req.body && req.body.id_token) {
      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                                .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      return res.status(200).type('html').send(`<!doctype html><html><body>
        <form id="f" method="post" action="/lti/launch">
          <input type="hidden" name="id_token" value="${esc(req.body.id_token)}"/>
          <input type="hidden" name="state" value="${esc(req.body.state || '')}"/>
        </form>
        <script>document.getElementById('f').submit();</script>
      </body></html>`);
    }

    const { iss, login_hint, lti_message_hint, client_id, lti_deployment_id } = req.body || {};
    if (!iss || !login_hint || !(client_id || LTI_CLIENT_ID)) {
      return res.status(400).json({ error: 'Missing required LTI parameters', received: { iss, login_hint, client_id } });
    }

    const state = ltiService.generateState();
    const nonce = ltiService.generateNonce();
    req.session.lti_state = state;
    req.session.lti_nonce = nonce;
    req.session.login_hint = login_hint;

    const authUrl = ltiService.buildAuthUrl({
      iss,
      login_hint,
      lti_message_hint,
      target_link_uri: REDIRECT_URI,
      state,
      nonce,
      client_id: client_id || LTI_CLIENT_ID
    });

    console.log('[LTI] → redirect auth:', authUrl);
    return res.redirect(authUrl);
  } catch (e) {
    console.error('❌ POST /lti/login error:', e);
    return res.status(500).json({ error: 'LTI Login failed' });
  }
});

// LTI Launch: recibe id_token (form_post)
app.post('/lti/launch', async (req, res) => {
  try {
    console.log('[LTI][POST /lti/launch] body keys:', Object.keys(req.body || {}));
    const { id_token, state } = req.body || {};

    if (!id_token) return res.status(400).send('Missing id_token');
    if (!state || state !== req.session.lti_state) return res.status(400).send('Invalid state');
    if (!req.session.lti_nonce) return res.status(400).send('Missing nonce in session');

    // verifica token con tu servicio (soporta 2 variantes)
    const tokenData = ltiService.validateToken
      ? await ltiService.validateToken(id_token)
      : await ltiService.verifyIdToken(id_token, {
          clientId: LTI_CLIENT_ID,
          issuer: LTI_PLATFORM_ISS,
          jwksUri: LTI_PLATFORM_JWKS
        });

    // comprobaciones básicas LTI
    const msgType = tokenData['https://purl.imsglobal.org/spec/lti/claim/message_type'];
    const deploymentId = tokenData['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];
    if (msgType !== 'LtiResourceLinkRequest') return res.status(400).send('Invalid message_type');
    if (deploymentId && LTI_DEPLOYMENT_ID && deploymentId !== LTI_DEPLOYMENT_ID) {
      console.warn('[LTI] deployment mismatch', { received: deploymentId, expected: LTI_DEPLOYMENT_ID });
    }

    // datos de usuario/contexto
    const roles = tokenData['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    const context = tokenData['https://purl.imsglobal.org/spec/lti/claim/context'] || null;
    const resourceLink = tokenData['https://purl.imsglobal.org/spec/lti/claim/resource_link'] || null;

    const userBasics = {
      sub: tokenData.sub,
      name: tokenData.name || [tokenData.given_name, tokenData.family_name].filter(Boolean).join(' ') || 'Estudiante',
      email: tokenData.email || null,
      roles
    };

    // Integraciones opcionales (no rompas si fallan)
    let wpUser = null;
    try { wpUser = await wordpressService.registerOrLoginUser?.(userBasics); } catch (e) { console.warn('WP link fail:', e?.message); }

    let course = null;
    try { course = await courseService.createOrUpdateCourse?.({
      lti_course_id: context?.id,
      name: context?.label || context?.title,
      wp_user_id: wpUser?.id,
      platform_id: tokenData.iss,
      resource_link_id: resourceLink?.id
    }); } catch (e) { console.warn('Course init fail:', e?.message); }

    // sesión lista
    req.session.authenticated = true;
    req.session.user = userBasics;
    req.session.wpUser = wpUser;
    req.session.course = course;

    const isInstructor = roles.some(r => r.includes('Instructor') || r.includes('TeachingAssistant'));
    const dest = isInstructor ? '/admin-dashboard' : '/student-dashboard';
    return res.redirect(dest);
  } catch (error) {
    console.error('❌ LTI Launch Error:', error);
    return res.status(500).send(`
      <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
        <h2 style="color:#dc2626">Error de Conexión LTI</h2>
        <p>No se pudo completar la conexión con Blackboard.</p>
        <pre style="text-align:left;white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px">${(error && error.message) || String(error)}</pre>
      </div>
    `);
  }
});

// JWKS público (para registrar en Blackboard)
app.get('/.well-known/jwks.json', (_req, res) => {
  try {
    const jwks = ltiService.getJWKS();
    res.json(jwks);
  } catch (error) {
    console.error('❌ JWKS Error:', error);
    res.status(500).json({ error: 'Failed to generate JWKS' });
  }
});

/* ========= API PROTEGIDA ========= */
const requireAuth = (req, res, next) => {
  if (!req.session?.authenticated || !req.session?.user) return res.status(401).json({ error: 'Authentication required' });
  next();
};

app.get('/api/user', requireAuth, (req, res) => {
  res.json({ user: req.session.user, wpUser: req.session.wpUser, course: req.session.course });
});

app.get('/api/student/pathway', requireAuth, async (req, res) => {
  try {
    const pathway = await courseService.getStudentPathway?.(req.session.wpUser?.id, req.session.course?.id);
    res.json(pathway || {});
  } catch (e) {
    console.error('pathway error:', e);
    res.status(500).json({ error: 'Failed to fetch pathway' });
  }
});

app.get('/api/student/units', requireAuth, async (req, res) => {
  try {
    const units = await courseService.getActiveUnits?.(req.session.wpUser?.id, req.session.course?.id);
    res.json(units || []);
  } catch (e) {
    console.error('units error:', e);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

app.post('/api/progress/update', requireAuth, async (req, res) => {
  try {
    const { unitId, contentId, completed, score } = req.body;
    const progress = await courseService.updateProgress?.(req.session.wpUser?.id, unitId, contentId, completed, score);
    res.json(progress || {});
  } catch (e) {
    console.error('progress error:', e);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

/* ========= SPA ROUTES ========= */
app.get('/student-dashboard', requireAuth, (_req, res) => {
  if (isProd && hasBuild) return res.sendFile(path.join(CLIENT_BUILD, 'index.html'));
  return res.redirect('http://localhost:3000/student-dashboard');
});

app.get('/admin-dashboard', requireAuth, (_req, res) => {
  if (isProd && hasBuild) return res.sendFile(path.join(CLIENT_BUILD, 'index.html'));
  return res.redirect('http://localhost:3000/admin-dashboard');
});

// Home mínima con datos correctos (sin hardcodear keys random)
app.get('/', (_req, res) => {
  res.type('html').send(`
    <!doctype html><html><head><meta charset="utf-8"><title>ICN PAIM</title></head>
    <body style="font-family:system-ui;padding:32px">
      <h2>🚀 ICN PAIM</h2>
      <p><b>Base URL:</b> ${BASE_URL}</p>
      <h3>URLs LTI</h3>
      <ul>
        <li>Login URL: <code>${BASE_URL}/lti/login</code></li>
        <li>Launch URL: <code>${BASE_URL}/lti/launch</code></li>
        <li>JWKS URL: <code>${BASE_URL}/.well-known/jwks.json</code></li>
        <li>Health: <code>${BASE_URL}/lti/health</code></li>
      </ul>
      <h3>Credenciales</h3>
      <ul>
        <li>Client ID: <code>${LTI_CLIENT_ID}</code></li>
        <li>Deployment ID: <code>${LTI_DEPLOYMENT_ID}</code></li>
        <li>Issuer (ISS): <code>${LTI_PLATFORM_ISS}</code></li>
      </ul>
    </body></html>
  `);
});

// Catch-all de SPA SIN pisar LTI ni .well-known
if (isProd && hasBuild) {
  app.get(/^\/(?!lti\/|\.well-known\/|api\/).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_BUILD, 'index.html'));
  });
}

/* ========= ERRORES ========= */
app.use((err, _req, res, _next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ========= START ========= */
app.listen(PORT, () => {
  console.log(`🚀 ICN PAIM Server running on :${PORT}`);
  console.log(`🔗 Login URL:  ${BASE_URL}/lti/login`);
  console.log(`🚀 Launch URL: ${BASE_URL}/lti/launch`);
  console.log(`🔑 JWKS URL:   ${BASE_URL}/.well-known/jwks.json`);
  console.log(`❤️ Health:     ${BASE_URL}/lti/health`);
});
