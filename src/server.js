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

console.log('🔧 Variables LTI cargadas:');
console.log('- CLIENT_ID:', LTI_CLIENT_ID);
console.log('- DEPLOYMENT_ID:', LTI_DEPLOYMENT_ID);
console.log('- PLATFORM_ISS:', LTI_PLATFORM_ISS);
console.log('- JWKS_URL:', LTI_PLATFORM_JWKS);
console.log('- AUTH_URL:', LTI_PLATFORM_OIDC_AUTH);
console.log('- TOKEN_URL:', LTI_PLATFORM_TOKEN_URL);

/* ===================== EXPRESS ===================== */
const app = express();
app.set('trust proxy', true);

// CORS más permisivo para LTI
app.use(cors({
  origin: [
    'https://udla-staging.blackboard.com',
    'https://blackboard.com',
    'https://*.blackboard.com',
    BASE,
    /https:\/\/.*\.blackboard\.com$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie']
}));

// Middleware de parsing ANTES de LTI
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de logging para debugging
app.use((req, res, next) => {
  if (req.path.includes('/lti/') || req.path.includes('/.well-known/')) {
    console.log(`\n🔍 ${req.method} ${req.originalUrl}`);
    console.log('Headers:', {
      'content-type': req.get('content-type'),
      'user-agent': req.get('user-agent')?.substring(0, 50),
      referer: req.get('referer'),
      origin: req.get('origin')
    });
    if (req.method === 'POST' && req.body) {
      console.log('Body keys:', Object.keys(req.body));
      if (req.body.id_token) {
        console.log('id_token presente (length):', req.body.id_token.length);
      }
    }
  }
  next();
});

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
      login_url: `${BASE}/login`,      // ✅ Sin /lti prefix
      launch_url: `${BASE}/`,          // ✅ Root como launch
      jwks_url: `${BASE}/.well-known/jwks.json`
    }
  });
});

app.get('/.well-known/health', (_req, res) => res.redirect(301, '/health'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

/* ===================== LTIJS CONFIGURACIÓN CORRECTA ===================== */
console.log('🚀 Configurando LTI Provider...');

// CONFIGURACIÓN CRÍTICA - Rutas simplificadas
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
    // ✅ Configuración simplificada que funciona mejor con Blackboard
    appUrl: '/',                         // Launch a root
    loginUrl: '/login',                  // Login simplificado
    keysetUrl: '/.well-known/jwks.json', // JWKS estándar
    staticPath: path.join(__dirname, '../client/build'),
    cookies: { 
      secure: NODE_ENV === 'production',
      sameSite: NODE_ENV === 'production' ? 'None' : 'Lax',
      httpOnly: false  // ✅ Importante para Blackboard
    },
    devMode: NODE_ENV === 'development',
    dynReg: {
      url: `${BASE}/.well-known/ltitoolconfiguration.json`,
      name: 'ICN PAIM LTI Tool',
      logo: `${BASE}/logo.png`,
      description: 'LTI Tool for ICN PAIM'
    }
  }
);

// Debug: Verificar configuración
console.log('📋 LTI Config verificada:');
console.log('   - Login URL:', `${BASE}/login`);
console.log('   - Launch URL:', `${BASE}/`);
console.log('   - JWKS URL:', `${BASE}/.well-known/jwks.json`);

/* ===================== LTI HANDLERS ===================== */

// OnConnect handler con mejor debugging
lti.onConnect(async (token, req, res) => {
  console.log('\n✅ LTI Launch successful!');
  console.log('User:', token.user?.name || 'Unknown');
  console.log('Platform:', token.platformInfo?.name || 'Unknown');
  console.log('Context:', token.context?.label || 'Unknown');
  console.log('Resource:', token.resourceLink?.title || 'Unknown');
  
  try {
    // Verificar que el token tiene la información necesaria
    if (!token.user || !token.user.sub) {
      console.warn('⚠️ Token incompleto:', token);
    }
    
    const staticPath = path.join(__dirname, '../client/build');
    const indexPath = path.join(staticPath, 'index.html');
    
    if (!fs.existsSync(indexPath)) {
      console.error('❌ index.html no encontrado en:', indexPath);
      return res.status(500).send(`
        <h1>App not found</h1>
        <p>Expected: ${indexPath}</p>
        <p>Try: npm run build in client folder</p>
      `);
    }
    
    return res.sendFile(indexPath);
  } catch (e) {
    console.error('❌ Error serving SPA:', e);
    return res.status(500).send('Failed to load application');
  }
});

// Error handlers mejorados
lti.onInvalidToken((error, req, res) => {
  console.error('\n❌ Invalid LTI Token:', error.message);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);
  console.error('Body keys:', Object.keys(req.body || {}));
  
  res.status(401).json({ 
    error: 'Invalid LTI token',
    message: 'Authentication failed',
    details: error.message,
    timestamp: new Date().toISOString()
  });
});

// Handler para deep linking (opcional)
lti.onDeepLinking(async (token, req, res) => {
  console.log('🔗 Deep linking request received');
  return res.send('Deep linking not implemented yet');
});

/* ===================== RUTAS PÚBLICAS ADICIONALES ===================== */
app.get('/info', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>ICN PAIM LTI</title></head>
      <body>
        <h1>ICN PAIM LTI Provider</h1>
        <p>Status: ✅ Running</p>
        <ul>
          <li><a href="/health">Health Check</a></li>
          <li>LTI Login: <code>${BASE}/login</code></li>
          <li>LTI Launch: <code>${BASE}/</code></li>
          <li>JWKS: <code>${BASE}/.well-known/jwks.json</code></li>
        </ul>
        <h3>Configuration:</h3>
        <pre>${JSON.stringify({
          client_id: LTI_CLIENT_ID,
          deployment_id: LTI_DEPLOYMENT_ID,
          platform_iss: LTI_PLATFORM_ISS,
          environment: NODE_ENV
        }, null, 2)}</pre>
      </body>
    </html>
  `);
});

/* ===================== INICIALIZACIÓN ===================== */
async function initializeLTI() {
  try {
    console.log('🔄 Inicializando LTI Provider...');
    
    // Deploy LTI
    await lti.deploy({ serverless: true });
    console.log('✅ LTI Provider deployed');
    
    // Registrar plataforma ANTES de montar la app
    console.log('🔄 Registrando plataforma...');
    
    try {
      await lti.registerPlatform({
        url: LTI_PLATFORM_ISS,
        name: 'UDLA Blackboard',
        clientId: LTI_CLIENT_ID,
        authenticationEndpoint: LTI_PLATFORM_OIDC_AUTH,
        accesstokenEndpoint: LTI_PLATFORM_TOKEN_URL,
        authConfig: { 
          method: 'JWK_SET', 
          key: LTI_PLATFORM_JWKS 
        }
      });
      console.log('✅ Plataforma registrada:', LTI_PLATFORM_ISS);
    } catch (error) {
      console.warn('⚠️ Error registrando plataforma:', error.message);
      console.log('Continuando sin registro...');
    }
    
    // Montar LTI app DESPUÉS de configurar todo
    app.use(lti.app);
    console.log('✅ LTI app montada');
    
    // Iniciar servidor
    const server = app.listen(PORT, () => {
      console.log('\n🎉 LTI Server successfully initialized!');
      console.log('==========================================');
      console.log(`🌐 Environment: ${NODE_ENV}`);
      console.log(`🔗 Base URL: ${BASE}`);
      console.log(`📊 Health: ${BASE}/health`);
      console.log(`ℹ️  Info: ${BASE}/info`);
      console.log(`🔑 LTI Login: ${BASE}/login`);
      console.log(`🚀 LTI Launch: ${BASE}/`);
      console.log(`🔐 JWKS: ${BASE}/.well-known/jwks.json`);
      console.log('==========================================');
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🔄 SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize LTI:', error);
    process.exit(1);
  }
}

// Inicializar
initializeLTI();