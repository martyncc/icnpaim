// server/index.js — ltijs “demo-style” pero con tus variables y /lti/health abierto
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');

// ltijs: singleton, NO "new"
const lti = require('ltijs').Provider;

/* ===== ENV ===== */
const PORT = process.env.PORT || 3333;

// clave de cifrado (usa la tuya)
const ENCRYPTION_KEY = process.env.LTI_ENCRYPTION_KEY || process.env.LTI_KEY;

// Mongo: usa MONGO_URL directo; si no, podrías armarla como en el demo (DB_HOST/DB_NAME)
const MONGO_URL = process.env.MONGO_URL;

// Blackboard (tus vars)
const LTI_CLIENT_ID          = process.env.LTI_CLIENT_ID;
const LTI_PLATFORM_ISS       = process.env.LTI_PLATFORM_ISS;        // https://udla-staging.blackboard.com
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH;  // /learn/api/lti/1.3/authorize
const LTI_PLATFORM_TOKEN_URL = process.env.LTI_PLATFORM_TOKEN_URL;  // /learn/api/lti/1.3/token
const LTI_PLATFORM_JWKS      = process.env.LTI_PLATFORM_JWKS;       // /learn/api/lti/1.3/jwks

// sirve tu React build como estático (igual que el demo, pero con client/build)
const STATIC_DIR = fs.existsSync(path.join(__dirname, '../client/build/index.html'))
  ? path.join(__dirname, '../client/build')
  : path.join(__dirname, './public'); // fallback

/* ===== sanity check minimal ===== */
function must(name, v) { if (!v) throw new Error(`Falta ${name}`); }
must('ENCRYPTION_KEY', ENCRYPTION_KEY);
must('MONGO_URL', MONGO_URL);
must('LTI_CLIENT_ID', LTI_CLIENT_ID);
must('LTI_PLATFORM_ISS', LTI_PLATFORM_ISS);
must('LTI_PLATFORM_OIDC_AUTH', LTI_PLATFORM_OIDC_AUTH);
must('LTI_PLATFORM_TOKEN_URL', LTI_PLATFORM_TOKEN_URL);
must('LTI_PLATFORM_JWKS', LTI_PLATFORM_JWKS);

/* ===== ltijs setup =====
   OJO: NO seteo appUrl a /lti/launch. Lo dejo por defecto para que /lti/health no quede “protegido”.
*/
lti.setup(
  ENCRYPTION_KEY,
  { url: MONGO_URL },
  {
    staticPath: STATIC_DIR,
    cookies: {
      secure: true,        // prod + https
      sameSite: 'None'     // cross-site con *.blackboard.com
    },
    devMode: false,
    loginUrl: '/lti/login',
    keysetUrl: '/.well-known/jwks.json'
  }
);

/* ===== launch OK: entrega tu index.html (como el demo) ===== */
lti.onConnect(async (_token, _req, res) => {
  return res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

/* ===== deep linking (opcional, igual que demo) ===== */
lti.onDeepLinking(async (_token, _req, res) => {
  return lti.redirect(res, '/deeplink', { newResource: true });
});

/* ===== rutas públicas y utilidades EN el servidor ltijs ===== */
const router = express.Router();

// normaliza barra final en /lti/login/ y /lti/launch/
router.all(['/lti/login/', '/lti/launch/'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = req.path.slice(0, -1) + qs;
  const code = req.method === 'POST' ? 307 : 302;
  return res.redirect(code, target);
});

// puente: si por error POSTean id_token a /lti/login, reenvía como POST a /lti/launch
router.post('/lti/login', (req, res, next) => {
  const idt = req.body && req.body.id_token;
  if (!idt) return next();
  const state = req.body.state || '';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return res.status(200).type('html').send(`<!doctype html><html><body>
    <form id="f" method="post" action="/lti/launch">
      <input type="hidden" name="id_token" value="${esc(idt)}"/>
      <input type="hidden" name="state" value="${esc(state)}"/>
    </form>
    <script>document.getElementById('f').submit();</script>
  </body></html>`);
});

// HEALTHCHECKS PÚBLICOS (para Railway y humanos cansados)
router.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    ts: new Date().toISOString(),
    staticDir: STATIC_DIR,
    lti: {
      client_id: LTI_CLIENT_ID,
      iss: LTI_PLATFORM_ISS,
      loginUrl: '/lti/login',
      launchUrl: '/lti/launch',
      jwksUrl: '/.well-known/jwks.json'
    }
  });
});
// duplicados bajo /lti/* porque tu healthcheck usa /lti/health
router.get('/lti/health', (_req, res) => res.json({ status: 'OK', ts: new Date().toISOString() }));
router.get('/live', (_req, res) => res.send('live'));
router.get('/ready', (_req, res) => res.send('ready'));
router.get('/lti/live', (_req, res) => res.send('live'));
router.get('/lti/ready', (_req, res) => res.send('ready'));

// opcional: expón el build (por si entras directo sin launch)
router.get('/', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

// monta el router dentro del server de ltijs (exacto como hace el demo)
lti.app.use(express.json());
lti.app.use(express.urlencoded({ extended: true }));
lti.app.use(router);

/* ===== arranque y registro de plataformas ===== */
const bootstrap = async () => {
  await lti.deploy({ port: PORT });

  // UDLA staging
  try {
    await lti.registerPlatform({
      url: LTI_PLATFORM_ISS,
      name: 'UDLA Staging',
      clientId: LTI_CLIENT_ID,
      authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
      accesstokenEndpoint: LTI_PLATFORM_TOKEN_URL,               // nombre correcto
      authConfig: { method: 'JWK_SET', key: LTI_PLATFORM_JWKS }  // JWKS correcto
    });
  } catch (e) {
    console.log('[registerPlatform] UDLA:', e.message || e);
  }

  // issuer global (por si Blackboard manda iss=https://blackboard.com)
  try {
    await lti.registerPlatform({
      url: 'https://blackboard.com',
      name: 'Blackboard Global Issuer',
      clientId: LTI_CLIENT_ID,
      authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
      accesstokenEndpoint: LTI_PLATFORM_TOKEN_URL,
      authConfig: { method: 'JWK_SET', key: LTI_PLATFORM_JWKS }
    });
  } catch (e) {
    console.log('[registerPlatform] Global:', e.message || e);
  }

  console.log(`[BOOT] ltijs listo en :${PORT}`);
};

bootstrap();
