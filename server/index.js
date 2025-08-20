// server/index.js — estilo ltijs-demo, pero con tu config
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// ltijs: OJO → ES EL SINGLETON, no se instancia con new
const lti = require('ltijs').Provider;

/** ===== ENV ===== */
const PORT = process.env.PORT || 3333;

// Key de cifrado (usa cualquiera de las dos que tú tienes)
const ENCRYPTION_KEY = process.env.LTI_ENCRYPTION_KEY || process.env.LTI_KEY;

// Mongo: prioriza URL completa, si no existe arma estilo demo
const MONGO_URL = process.env.MONGO_URL || (
  process.env.DB_HOST && process.env.DB_NAME
    ? `mongodb://${process.env.DB_HOST}/${process.env.DB_NAME}?authSource=admin`
    : null
);
const MONGO_USER = process.env.DB_USER || process.env.MONGO_USER || '';
const MONGO_PASS = process.env.DB_PASS || process.env.MONGO_PASS || '';

// Blackboard (tus mismas variables)
const LTI_CLIENT_ID           = process.env.LTI_CLIENT_ID;
const LTI_PLATFORM_ISS        = process.env.LTI_PLATFORM_ISS;        // https://udla-staging.blackboard.com
const LTI_PLATFORM_OIDC_AUTH  = process.env.LTI_PLATFORM_OIDC_AUTH;  // /learn/api/lti/1.3/authorize
const LTI_PLATFORM_TOKEN_URL  = process.env.LTI_PLATFORM_TOKEN_URL;  // /learn/api/lti/1.3/token
const LTI_PLATFORM_JWKS       = process.env.LTI_PLATFORM_JWKS;       // /learn/api/lti/1.3/jwks

// Paths de estáticos (sirvo tu React build como hace el demo)
const STATIC_DIR = fs.existsSync(path.join(__dirname, '../client/build/index.html'))
  ? path.join(__dirname, '../client/build')
  : path.join(__dirname, './public'); // fallback por si no hay build

/** ===== VALIDACIÓN RÁPIDA ===== */
function must(name, val) { if (!val) throw new Error(`Falta ${name}`); }
must('ENCRYPTION_KEY (LTI_ENCRYPTION_KEY o LTI_KEY)', ENCRYPTION_KEY);
must('Mongo (MONGO_URL o DB_HOST/DB_NAME)', MONGO_URL);
must('LTI_CLIENT_ID', LTI_CLIENT_ID);
must('LTI_PLATFORM_ISS', LTI_PLATFORM_ISS);
must('LTI_PLATFORM_OIDC_AUTH', LTI_PLATFORM_OIDC_AUTH);
must('LTI_PLATFORM_TOKEN_URL', LTI_PLATFORM_TOKEN_URL);
must('LTI_PLATFORM_JWKS', LTI_PLATFORM_JWKS);

/** ===== SETUP ltijs =====
 * Igual que el demo: ltijs es el servidor Express. Nada de tu app externa.
 */
lti.setup(
  ENCRYPTION_KEY,
  // DB config: si tienes URL completa, úsala; si no, estilo demo con user/pass
  MONGO_URL.startsWith('mongodb')
    ? { url: MONGO_URL }
    : { url: MONGO_URL, connection: { user: MONGO_USER, pass: MONGO_PASS } },
  {
    // Sirve tu React build como en el demo
    staticPath: STATIC_DIR,

    // Como vas embebido en *.blackboard.com (otro dominio), cookies cross-site:
    cookies: {
      secure: true,       // en prod con HTTPS
      sameSite: 'None'    // imprescindible para cross-site
    },

    // En prod no uses devMode; si pruebas todo en http mismo dominio, podrías true
    devMode: false,

    // Ajusto rutas para calzar con lo que pusiste en Blackboard:
    loginUrl: '/lti/login',
    appUrl: '/lti/launch',              // (no se usa directamente aquí, pero queda consistente)
    keysetUrl: '/.well-known/jwks.json' // para que Blackboard encuentre tu JWKS
  }
);

/** ===== onConnect (igual que el demo) =====
 * NO redirijas con res.redirect; el demo te muestra: responde el index.html aquí.
 * Así evitas el drama de ltik en rutas “externas”.
 */
lti.onConnect(async (token, req, res) => {
  return res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

/** ===== Deep Linking (opcional, igual que demo) ===== */
lti.onDeepLinking(async (_token, _req, res) => {
  return lti.redirect(res, '/deeplink', { newResource: true });
});

/** ===== Rutas adicionales sobre el servidor de ltijs (como en el demo) ===== */
const express = require('express');
const router = express.Router();

// Healthchecks simples (fuera del guard de LTI)
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

// Por si Blackboard mete barra final en /lti/login/ o /lti/launch/
router.all(['/lti/login/', '/lti/launch/'], (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const tgt = req.path.slice(0, -1) + qs;
  const code = req.method === 'POST' ? 307 : 302;
  return res.redirect(code, tgt);
});

// Si por bug te postean id_token al login, lo puenteamos a /lti/launch (estilo seguro)
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

// Monta tus rutas en el server de ltijs (igual que el demo hace con routes)
lti.app.use(router);

/** ===== Arranque + registro de plataforma (como en el demo) ===== */
const bootstrap = async () => {
  await lti.deploy({ port: PORT });

  // Registra UDLA staging (issuer real)
  try {
    await lti.registerPlatform({
      url: LTI_PLATFORM_ISS,
      name: 'UDLA Staging',
      clientId: LTI_CLIENT_ID,
      authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
      accesstokenEndpoint: LTI_PLATFORM_TOKEN_URL,         // ← nombre correcto
      authConfig: { method: 'JWK_SET', key: LTI_PLATFORM_JWKS } // ← JWKS correcto
    });
  } catch (e) {
    // Si ya existe, ltijs lanza; está bien ignorarlo
    console.log('[registerPlatform] UDLA Staging:', e.message || e);
  }

  // Registra variante global (porque a veces Blackboard manda iss=https://blackboard.com)
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

  console.log('Ltijs demo-style ready on port', PORT);
};

bootstrap();
