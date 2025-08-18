require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const { Provider } = require('ltijs');

// Servicios propios (los sigues usando en onConnect)
const wordpressService = require('./services/wordpressService');
const courseService = require('./services/courseService');

const app = express();

/* ========= ENTORNO ========= */
const PORT = process.env.PORT || 3333;
const BASE_HOST = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE_URL = `https://${BASE_HOST}`;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

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
console.log('🔧 Environment Variables Check:');
console.log('- PORT:', PORT);
console.log('- BASE_HOST:', BASE_HOST);
console.log('- BASE_URL:', BASE_URL);
console.log('- LTI_CLIENT_ID:', LTI_CLIENT_ID);
console.log('- LTI_DEPLOYMENT_ID:', LTI_DEPLOYMENT_ID);
console.log('- LTI_PLATFORM_ISS:', LTI_PLATFORM_ISS);
console.log('- LTI_PLATFORM_JWKS:', LTI_PLATFORM_JWKS);
console.log('- LTI_PLATFORM_OIDC_AUTH:', LTI_PLATFORM_OIDC_AUTH);
console.log('- LTI_PLATFORM_TOKEN_URL:', LTI_PLATFORM_TOKEN_URL);
console.log('- MONGO_URL set?:', !!MONGO_URL);
console.log('- LTI_ENCRYPTION_KEY set?:', !!LTI_ENCRYPTION_KEY);
console.log('- WORDPRESS_URL:', process.env.WORDPRESS_URL || 'NOT SET');

if (!LTI_PLATFORM_ISS || !LTI_PLATFORM_JWKS || !LTI_PLATFORM_OIDC_AUTH || !LTI_PLATFORM_TOKEN_URL) {
  console.error('❌ CRITICAL: Missing LTI platform configuration!');
}
if (!MONGO_URL || !LTI_ENCRYPTION_KEY) {
  console.error('❌ CRITICAL: MONGO_URL y/o LTI_ENCRYPTION_KEY faltan.');
}

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
  }
}));

// No cachear flujo LTI (rutas que manejará ltijs)
app.use(['/lti/login','/lti/launch'], (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ========= PARSERS / SESIÓN ========= */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

// Inicialización asíncrona de ltijs y registro de la plataforma
(async () => {
  await lti.deploy({ serverless: true });
  app.use('/lti', lti.app); // monta rutas internas de ltijs (login/launch/jwks)

  await lti.registerPlatform({
    url: LTI_PLATFORM_ISS,                // issuer/plataforma (usas el tuyo)
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
      try { wpUser = await wordpressService.ensureUser?.(userBasics); } catch (e) { console.warn('⚠️ WP user linking failed:', e?.message); }

      let course = null;
      try { course = await courseService.initFromLTI?.(context, resourceLink, wpUser); } catch (e) { console.warn('⚠️ Course init failed:', e?.message); }

      req.session.authenticated = true;
      req.session.user = userBasics;
      req.session.wpUser = wpUser;
      req.session.course = course;

      const isInstructor = roles.some(r => r.includes('Instructor') || r.includes('TeachingAssistant'));
      const dest = isInstructor ? '/admin-dashboard' : '/student-dashboard';
      return res.redirect(dest);
    } catch (err) {
      console.error('❌ onConnect error:', err);
      return res.status(400).send('LTI onConnect failed');
    }
  });
})();

/* ========= HEALTH ========= */
app.get('/lti/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    base_url: BASE_URL,
    base_host: BASE_HOST,
    railway_env: process.env.RAILWAY_ENVIRONMENT || 'not set',
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

// 1) estáticos (JS/CSS/img)
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

  // Catch-all: todo lo que no sea /api o /lti o /.well-known -> SPA (protegida)
  app.get(/^\/(?!api\/|lti\/|\.well-known\/).*/, requireAuth, (req, res) => {
    console.log('[SPA] index for', req.originalUrl);
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
      </ul>
      
      <h4>🔑 Credenciales LTI:</h4>
      <ul>
        <li><strong>Client ID:</strong> ${LTI_CLIENT_ID}</li>
        <li><strong>Deployment ID:</strong> ${LTI_DEPLOYMENT_ID}</li>
      </ul>
      
      <h4>🔧 Debug:</h4>
      <ul>
        <li>Build detectado: ${fs.existsSync(path.join(clientBuildDir, 'index.html'))}</li>
        <li>Platform ISS: ${LTI_PLATFORM_ISS || 'NOT SET'}</li>
        <li>Platform JWKS: ${LTI_PLATFORM_JWKS || 'NOT SET'}</li>
      </ul>
    </body></html>
  `);
});

/* ========= ERRORES / START ========= falto algo jijis*/
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
