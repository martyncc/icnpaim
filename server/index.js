// server/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Servicios (asegúrate de que existan)
const ltiService = require('./services/ltiService');
const wordpressService = require('./services/wordpressService');
const courseService = require('./services/courseService');

const app = express();

/* ========= ENTORNO ========= */
const PORT = process.env.PORT || 3333;
const BASE_HOST = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE_URL = `https://${BASE_HOST}`;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

const CLIENT_ID     = process.env.LTI_CLIENT_ID     || '89ef5212-b589-4f9c-b5b8-2fa6ad3e2006';
const DEPLOYMENT_ID = process.env.LTI_DEPLOYMENT_ID || '2b286722-4ef6-4dda-a756-eec5dca12441';
const REDIRECT_URI  = process.env.LTI_REDIRECT_URI  || `${BASE_URL}/lti/launch`;
const PLATFORM_ISS  = process.env.LTI_PLATFORM_ISS;   // issuer de Blackboard
const PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS;  // JWKS endpoint de Blackboard

/* ========= PROXY / LOGS / CORS / CSP ========= */
app.set('trust proxy', 1);

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

const allowedOrigins = new Set([
  `https://${BASE_HOST}`,
  'https://icnpaim.cl',
  'https://udla-staging.blackboard.com',
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

// Permite iframe desde Blackboard
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.blackboard.com https://udla-staging.blackboard.com https://icnpaim.cl https://lti.icnpaim.cl"
  );
  res.removeHeader('X-Frame-Options');
  next();
});

// No cachear flujo LTI
app.use(['/lti/login','/lti/launch'], (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ========= PARSERS / SESIÓN ========= */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

// Bloquea accesos directos a /client/* y /public/* (legacy)
app.all(/^\/client(\/.*)?$/, (_req, res) => res.status(404).send('Not found'));
app.all(/^\/public(\/.*)?$/, (_req, res) => res.status(404).send('Not found'));

/* ========= LTI ROUTES ========= */

// GET a /lti/login y /lti/launch -> debugging info
app.get('/lti/login', (req, res) => {
  console.log('[DEBUG] GET request to /lti/login');
  console.log('Headers:', req.headers);
  console.log('Query params:', req.query);
  console.log('User-Agent:', req.get('User-Agent'));
  
  res.status(405).type('html').send(`
    <!DOCTYPE html>
    <html>
    <head><title>LTI Login Debug</title></head>
    <body>
      <h2>❌ Método incorrecto para LTI Login</h2>
      <p><strong>Error:</strong> Se recibió GET, se esperaba POST</p>
      <p><strong>URL solicitada:</strong> ${req.originalUrl}</p>
      <p><strong>User-Agent:</strong> ${req.get('User-Agent')}</p>
      <p><strong>Referer:</strong> ${req.get('Referer') || 'No referer'}</p>
      
      <h3>URLs correctas para Blackboard:</h3>
      <ul>
        <li><strong>Login URL:</strong> <code>${BASE_URL}/lti/login</code> (POST)</li>
        <li><strong>Launch URL:</strong> <code>${BASE_URL}/lti/launch</code> (POST)</li>
        <li><strong>JWKS URL:</strong> <code>${BASE_URL}/.well-known/jwks.json</code> (GET)</li>
      </ul>
      
      <h3>Debugging Info:</h3>
      <pre>${JSON.stringify({
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        query: req.query
      }, null, 2)}</pre>
    </body>
    </html>
  `);
});

app.get('/lti/launch', (req, res) => {
  console.log('[DEBUG] GET request to /lti/launch');
  console.log('Headers:', req.headers);
  console.log('Query params:', req.query);
  
  res.status(405).type('html').send(`
    <!DOCTYPE html>
    <html>
    <head><title>LTI Launch Debug</title></head>
    <body>
      <h2>❌ Método incorrecto para LTI Launch</h2>
      <p><strong>Error:</strong> Se recibió GET, se esperaba POST</p>
      <p><strong>URL solicitada:</strong> ${req.originalUrl}</p>
      
      <h3>Debugging Info:</h3>
      <pre>${JSON.stringify({
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        query: req.query
      }, null, 2)}</pre>
    </body>
    </html>
  `);
});

// 1) OIDC Login Initiation (POST)
app.post('/lti/login', async (req, res) => {
  try {
    console.log('[LTI] POST /lti/login - Headers:', req.headers);
    console.log('[LTI] POST /lti/login - Body:', req.body);
    console.log('[LTI] POST /lti/login - Content-Type:', req.get('Content-Type'));
    
    const { iss, login_hint, lti_message_hint } = req.body;
    console.log('[LTI] /lti/login parsed:', { 
      iss, 
      has_login_hint: !!login_hint,
      lti_message_hint: !!lti_message_hint,
      client_id: CLIENT_ID 
    });

    if (!iss || !login_hint) {
      console.log('[LTI] Missing required parameters');
      return res.status(400).json({ error: 'Missing required LTI parameters', received: { iss, login_hint } });
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
      client_id: CLIENT_ID
    });

    console.log('[LTI] Redirecting to OIDC Auth:', authUrl);
    return res.redirect(authUrl);
  } catch (error) {
    console.error('❌ LTI Login Error:', error);
    return res.status(500).json({ error: 'LTI Login failed' });
  }
});

// 2) LTI Launch (POST con id_token)
app.post('/lti/launch', async (req, res) => {
  try {
    console.log('[LTI] POST /lti/launch - Headers:', req.headers);
    console.log('[LTI] POST /lti/launch - Body keys:', Object.keys(req.body));
    console.log('[LTI] POST /lti/launch - Content-Type:', req.get('Content-Type'));
    
    const { id_token, state } = req.body;
    console.log('[LTI] /lti/launch received. id_token?', !!id_token, 'state:', state);
    console.log('[LTI] Session state:', req.session.lti_state);

    if (!id_token || !state || state !== req.session.lti_state) {
      console.log('[LTI] Invalid state or id_token', { 
        has_id_token: !!id_token, 
        received_state: state, 
        session_state: req.session.lti_state 
      });
      return res.status(400).send('Invalid state or id_token');
    }

    const payload = await ltiService.verifyIdToken(id_token, {
      clientId: CLIENT_ID,
      issuer: PLATFORM_ISS,
      jwksUri: PLATFORM_JWKS
    });

    const msgType = payload['https://purl.imsglobal.org/spec/lti/claim/message_type'];
    const deploymentId = payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];
    if (msgType !== 'LtiResourceLinkRequest') return res.status(400).send('Invalid message_type');
    if (deploymentId !== DEPLOYMENT_ID)       return res.status(400).send('Invalid deployment_id');
    if (payload.nonce !== req.session.lti_nonce) return res.status(400).send('Invalid nonce');

    const roles   = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'] || null;
    const rLink   = payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'] || null;

    const userBasics = {
      sub: payload.sub,
      name: payload.name || payload.given_name || 'Estudiante',
      email: payload.email || null,
      roles
    };

    // Vinculación opcional
    let wpUser = null;
    try { wpUser = await wordpressService.ensureUser(userBasics); }
    catch (e) { console.warn('⚠️ WP user linking failed:', e?.message); }

    let course = null;
    try { course = await courseService.initFromLTI(context, rLink, wpUser); }
    catch (e) { console.warn('⚠️ Course init failed:', e?.message); }

    // Sesión lista
    req.session.authenticated = true;
    req.session.user = userBasics;
    req.session.wpUser = wpUser;
    req.session.course = course;

    const isInstructor = roles.some(r => r.includes('Instructor') || r.includes('TeachingAssistant'));
    const dest = isInstructor ? '/admin-dashboard' : '/student-dashboard';
    const absolute = `${BASE_URL}${dest}`;
    console.log('[LTI] Redirecting to', absolute);

    return res.redirect(303, absolute); // POST->GET
  } catch (error) {
    console.error('❌ LTI Launch Error:', error);
    return res.status(400).send('LTI Launch failed');
  }
});

// JWKS (si publicas tus claves de herramienta)
app.get('/.well-known/jwks.json', (_req, res) => {
  try {
    const jwks = ltiService.getJWKS();
    res.json(jwks);
  } catch (error) {
    console.error('❌ JWKS Error:', error);
    res.status(500).json({ error: 'Failed to generate JWKS' });
  }
});

// Healthcheck PÚBLICO (no debe pedir auth)
app.get('/lti/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    base_url: BASE_URL,
    base_host: BASE_HOST,
    lti: {
      client_id: CLIENT_ID, deployment_id: DEPLOYMENT_ID,
      login_url: `${BASE_URL}/lti/login`,
      launch_url: `${BASE_URL}/lti/launch`,
      jwks_url: `${BASE_URL}/.well-known/jwks.json`,
      platform_iss: PLATFORM_ISS,
      platform_jwks: PLATFORM_JWKS
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
    console.error('Error fetching pathway:', error);
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
    console.error('Error fetching units:', error);
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
    console.error('Error updating progress:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

/* ========= SPA EN RAÍZ ========= */
const clientBuildDir = path.join(__dirname, '../client/build');
console.log('[BOOT] build exists:', fs.existsSync(path.join(clientBuildDir, 'index.html')));

// 1) sirve estáticos (JS/CSS/img). Públicos está bien.
if (isProd) {
  app.use(express.static(clientBuildDir, { index: false }));
}

// 2) HTML de la SPA (rutas protegidas)
if (isProd) {
  app.get('/student-dashboard', requireAuth, (_req, res) => {
    console.log('[SPA] index for /student-dashboard');
    return res.sendFile(path.join(clientBuildDir, 'index.html'));
  });

  app.get('/admin-dashboard', requireAuth, (_req, res) => {
    console.log('[SPA] index for /admin-dashboard');
    return res.sendFile(path.join(clientBuildDir, 'index.html'));
  });

  // Catch-all: todo lo que no sea /api, /lti o /.well-known -> SPA (protegida)
  app.get(/^\/(?!api\/|lti\/|\.well-known\/).*/, requireAuth, (req, res) => {
    console.log('[SPA] index for', req.originalUrl);
    res.sendFile(path.join(clientBuildDir, 'index.html'));
  });
}

// Página mínima para raíz (solo info, NO SPA)
app.get('/', (_req, res) => {
  res.type('html').send(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>ICN PAIM</title></head>
    <body>
      <h3>🚀 ICN PAIM - Servidor OK</h3>
      <p><strong>Base URL:</strong> ${BASE_URL}</p>
      <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
      
      <h4>📋 URLs para Blackboard:</h4>
      <ul>
        <li>Login URL: <code>${BASE_URL}/lti/login</code> (POST only)</li>
        <li>Launch URL: <code>${BASE_URL}/lti/launch</code> (POST only)</li>
        <li>JWKS URL: <code>${BASE_URL}/.well-known/jwks.json</code> (GET)</li>
        <li>Health: <a href="${BASE_URL}/lti/health">${BASE_URL}/lti/health</a></li>
      </ul>
      
      <h4>🔑 Credenciales LTI:</h4>
      <ul>
        <li><strong>Client ID:</strong> ${CLIENT_ID}</li>
        <li><strong>Deployment ID:</strong> ${DEPLOYMENT_ID}</li>
      </ul>
      
      <h4>🔧 Debug:</h4>
      <ul>
        <li>Build detectado: ${fs.existsSync(path.join(clientBuildDir, 'index.html'))}</li>
        <li>Platform ISS: ${PLATFORM_ISS || 'NOT SET'}</li>
        <li>Platform JWKS: ${PLATFORM_JWKS || 'NOT SET'}</li>
      </ul>
    </body></html>
  `);
});

/* ========= ERRORES / START ========= */
app.use((error, _req, res, _next) => {
  console.error('Server Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 ICN PAIM Server on :${PORT}`);
  console.log(`🔗 Login URL:  ${BASE_URL}/lti/login`);
  console.log(`🚀 Launch URL: ${BASE_URL}/lti/launch`);
  console.log(`📱 Student:    ${BASE_URL}/student-dashboard`);
  console.log(`🛠️  Admin:      ${BASE_URL}/admin-dashboard`);
});
