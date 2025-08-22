// server/index.js — LTI 1.3 con ltijs corregido
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// ltijs
const lti = require('ltijs').Provider;

/* ===================== ENV ===================== */
const PORT = process.env.PORT || 8080;
const HOST = process.env.BASE_HOST || 'lti.icnpaim.cl';
const BASE = process.env.BASE_URL || `https://${HOST}`;
const NODE_ENV = process.env.NODE_ENV || 'development';

const LTI_KEY = process.env.LTI_ENCRYPTION_KEY || process.env.LTI_KEY;
const MONGO_URL = process.env.MONGO_URL;

const LTI_CLIENT_ID = process.env.LTI_CLIENT_ID;
const LTI_DEPLOYMENT_ID = process.env.LTI_DEPLOYMENT_ID;
const LTI_PLATFORM_ISS = process.env.LTI_PLATFORM_ISS || 'https://udla-staging.blackboard.com';
const LTI_PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS;
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH;
const LTI_PLATFORM_TOKEN_URL = process.env.LTI_PLATFORM_TOKEN_URL;

// Validaciones
if (!LTI_KEY) throw new Error('Falta LTI_ENCRYPTION_KEY');
if (!MONGO_URL) throw new Error('Falta MONGO_URL');
if (!LTI_CLIENT_ID || !LTI_PLATFORM_JWKS || !LTI_PLATFORM_OIDC_AUTH || !LTI_PLATFORM_TOKEN_URL) {
  throw new Error('Faltan variables LTI de plataforma');
}

/* ===================== EXPRESS ===================== */
const app = express();
app.set('trust proxy', true);

// CORS
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Healthcheck público - DEBE estar ANTES de LTI
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    ts: new Date().toISOString(),
    environment: NODE_ENV,
    base_url: BASE,
    lti: {
      client_id: LTI_CLIENT_ID,
      deployment_id: LTI_DEPLOYMENT_ID,
      login_url: `${BASE}/lti/login`,
      launch_url: `${BASE}/lti/launch`,
      jwks_url: `${BASE}/.well-known/jwks.json`
    }
  });
});

app.get('/.well-known/health', (_req, res) => res.redirect(301, '/health'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

/* ===================== LTIJS CONFIGURACIÓN CORRECTA ===================== */
console.log('🚀 Configurando LTI Provider...');

// CONFIGURACIÓN CRÍTICA - Las rutas que Blackboard espera
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
    appUrl: '/lti/launch',               // ✅ Blackboard espera /lti/launch
    loginUrl: '/lti/login',              // ✅ Blackboard espera /lti/login  
    keysetUrl: '/.well-known/jwks.json', // ✅ Estándar LTI
    staticPath: path.join(__dirname, '../client/build'),
    cookies: { 
      secure: NODE_ENV === 'production',
      sameSite: 'None'
    },
    devMode: NODE_ENV === 'development'
  }
);

// Debug: Verificar configuración
console.log('📋 LTI Config verificada:');
console.log('   - Login URL:', '/lti/login');
console.log('   - Launch URL:', '/lti/launch');
console.log('   - JWKS URL:', '/.well-known/jwks.json');

// OnConnect handler
lti.onConnect(async (token, req, res) => {
  console.log('✅ LTI Launch successful for:', token.user?.name);
  try {
    const staticPath = path.join(__dirname, '../client/build');
    return res.sendFile(path.join(staticPath, 'index.html'));
  } catch (e) {
    console.error('❌ Error serving SPA:', e);
    return res.status(500).send('Failed to load application');
  }
});

// Error handlers
lti.onInvalidToken((error, req, res) => {
  console.error('❌ Invalid LTI Token:', error.message);
  res.status(401).json({ 
    error: 'Invalid LTI token',
    message: 'Authentication failed' 
  });
});

/* ===================== RUTAS PÚBLICAS ADICIONALES ===================== */
app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>ICN PAIM LTI</title></head>
      <body>
        <h1>ICN PAIM LTI Provider</h1>
        <p>Status: ✅ Running</p>
        <ul>
          <li><a href="/health">Health Check</a></li>
          <li>LTI Login: <code>${BASE}/lti/login</code></li>
          <li>LTI Launch: <code>${BASE}/lti/launch</code></li>
          <li>JWKS: <code>${BASE}/.well-known/jwks.json</code></li>
        </ul>
      </body>
    </html>
  `);
});

/* ===================== INICIALIZACIÓN ===================== */
async function initializeLTI() {
  try {
    // Deploy LTI
    await lti.deploy({ serverless: true });
    
    // Montar LTI DESPUÉS de las rutas públicas
    app.use(lti.app);
    
    // Registrar plataformas
    const platforms = [
      { url: 'https://blackboard.com', name: 'Blackboard Global' },
      { url: LTI_PLATFORM_ISS, name: 'UDLA Staging' }
    ];
    
    for (const platform of platforms) {
      try {
        await lti.registerPlatform({
          url: platform.url,
          name: platform.name,
          clientId: LTI_CLIENT_ID,
          authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
          accesstokenEndpoint: LTI_PLATFORM_TOKEN_URL,
          authConfig: { 
            method: 'JWK_SET', 
            key: LTI_PLATFORM_JWKS 
          }
        });
        console.log(`✅ Platform registered: ${platform.url}`);
      } catch (error) {
        console.warn(`⚠️  Failed to register ${platform.url}:`, error.message);
      }
    }
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log('\n🎉 LTI Server successfully initialized!');
      console.log('==========================================');
      console.log(`🌐 Environment: ${NODE_ENV}`);
      console.log(`🔗 Base URL: ${BASE}`);
      console.log(`📊 Health: ${BASE}/health`);
      console.log(`🔑 LTI Login: ${BASE}/lti/login`);
      console.log(`🚀 LTI Launch: ${BASE}/lti/launch`);
      console.log(`🔐 JWKS: ${BASE}/.well-known/jwks.json`);
      console.log('==========================================');
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize LTI:', error);
    process.exit(1);
  }
}

// Inicializar
initializeLTI();