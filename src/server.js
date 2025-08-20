require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');

// Configuración de variables de entorno
const PORT = process.env.PORT || 3333;
const BASE_HOST = process.env.BASE_HOST || `localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-here';

// Configuración LTI
const LTI_CLIENT_ID = process.env.LTI_CLIENT_ID || '48dd70cc-ab62-4fbd-ba91-d3d984644373';
const LTI_DEPLOYMENT_ID = process.env.LTI_DEPLOYMENT_ID || '2b286722-4ef6-4dda-a756-eec5dca12441';
const LTI_REDIRECT_URI = process.env.LTI_REDIRECT_URI || `https://${BASE_HOST}/lti/launch`;

// URLs de la plataforma Blackboard
const LTI_PLATFORM_ISS = process.env.LTI_PLATFORM_ISS || 'https://blackboard.com';
const LTI_PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/jwks';
const LTI_PLATFORM_OIDC_AUTH = process.env.LTI_PLATFORM_OIDC_AUTH || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/authorize';

// Configuración de WordPress
const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_API_USER = process.env.WORDPRESS_API_USER;
const WORDPRESS_API_PASSWORD = process.env.WORDPRESS_API_PASSWORD;

// Servicios
const ltiService = require('./services/ltiService');
const wordpressService = require('./services/wordpressService');
const courseService = require('./services/courseService');

console.log('🚀 Iniciando servidor ICN PAIM...');
console.log('🌐 Dominio:', `https://${BASE_HOST}`);
console.log('🔗 Login URL:', `https://${BASE_HOST}/lti/login`);
console.log('🚀 Launch URL:', `https://${BASE_HOST}/lti/launch`);
console.log('🔑 JWKS URL:', `https://${BASE_HOST}/.well-known/jwks.json`);

// Crear aplicación Express
const app = express();

// Configuración de seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"],
      frameAncestors: ["*"] // Permitir iframe desde cualquier dominio (necesario para LTI)
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configurado para LTI
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuración de sesiones
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// Directorio de archivos estáticos
const STATIC_DIR = fs.existsSync(path.join(__dirname, '../client/build/index.html'))
  ? path.join(__dirname, '../client/build')
  : path.join(__dirname, '../public');

console.log('📁 Directorio estático:', STATIC_DIR);
app.use(express.static(STATIC_DIR));

// ==================== RUTAS LTI ====================

// 1. Login Initiation - Blackboard inicia aquí
app.post('/lti/login', async (req, res) => {
  try {
    console.log('[LTI] POST /lti/login - Headers:', req.headers);
    console.log('[LTI] POST /lti/login - Body:', req.body);

    const { iss, login_hint, target_link_uri, lti_message_hint, client_id } = req.body;

    // Validar parámetros requeridos
    if (!iss || !login_hint || !client_id) {
      console.error('[LTI] Missing required parameters:', { iss, login_hint, client_id });
      return res.status(400).send('Missing required LTI parameters');
    }

    // Verificar client_id
    if (client_id !== LTI_CLIENT_ID) {
      console.error('[LTI] Invalid client_id:', client_id);
      return res.status(400).send('Invalid client_id');
    }

    // Generar state y nonce para seguridad
    const state = ltiService.generateState();
    const nonce = ltiService.generateNonce();

    // Guardar en sesión para validar después
    req.session.lti_state = state;
    req.session.lti_nonce = nonce;

    // Construir URL de autorización
    const authUrl = ltiService.buildAuthUrl({
      login_hint,
      lti_message_hint,
      target_link_uri: target_link_uri || LTI_REDIRECT_URI,
      state,
      nonce,
      client_id: LTI_CLIENT_ID
    });

    console.log('[LTI] Redirecting to auth URL:', authUrl);
    
    // Redirigir a Blackboard para autenticación
    return res.redirect(authUrl);

  } catch (error) {
    console.error('[LTI] Error in login:', error);
    return res.status(500).send('LTI Login Error: ' + error.message);
  }
});

// 2. Launch - Blackboard redirige aquí después de autenticación
app.post('/lti/launch', async (req, res) => {
  try {
    console.log('[LTI] POST /lti/launch - Headers:', req.headers);
    console.log('[LTI] POST /lti/launch - Body keys:', Object.keys(req.body));

    const { id_token, state } = req.body;

    // Validar state
    if (!state || state !== req.session.lti_state) {
      console.error('[LTI] Invalid state parameter');
      return res.status(400).send('Invalid state parameter');
    }

    if (!id_token) {
      console.error('[LTI] Missing id_token');
      return res.status(400).send('Missing id_token');
    }

    // Verificar y decodificar el token JWT
    console.log('[LTI] Verifying JWT token...');
    const tokenData = await ltiService.verifyIdToken(id_token, {
      clientId: LTI_CLIENT_ID,
      issuer: LTI_PLATFORM_ISS,
      jwksUri: LTI_PLATFORM_JWKS
    });

    console.log('[LTI] Token verified successfully');
    console.log('[LTI] User:', tokenData.name);
    console.log('[LTI] Course:', tokenData['https://purl.imsglobal.org/spec/lti/claim/context']?.title);

    // Extraer información del usuario y curso
    const userInfo = {
      lti_id: tokenData.sub,
      name: tokenData.name,
      email: tokenData.email,
      roles: tokenData['https://purl.imsglobal.org/spec/lti/claim/roles'] || [],
      platform_id: tokenData.iss,
      course_id: tokenData['https://purl.imsglobal.org/spec/lti/claim/context']?.id,
      course_name: tokenData['https://purl.imsglobal.org/spec/lti/claim/context']?.title
    };

    // Registrar/actualizar usuario en WordPress
    let wpUser = null;
    let courseData = null;

    if (WORDPRESS_URL) {
      try {
        console.log('[WordPress] Registering/updating user...');
        wpUser = await wordpressService.registerOrLoginUser(userInfo);
        
        if (userInfo.course_id && userInfo.course_name) {
          console.log('[WordPress] Creating/updating course...');
          courseData = await courseService.createOrUpdateCourse({
            lti_course_id: userInfo.course_id,
            name: userInfo.course_name,
            platform_id: userInfo.platform_id,
            wp_user_id: wpUser.id
          });
        }
      } catch (error) {
        console.error('[WordPress] Error:', error.message);
        // Continuar sin WordPress si hay error
      }
    }

    // Guardar información en sesión
    req.session.user = userInfo;
    req.session.wpUser = wpUser;
    req.session.course = courseData;
    req.session.authenticated = true;

    console.log('[LTI] Launch successful, serving React app');

    // Servir la aplicación React
    return res.sendFile(path.join(STATIC_DIR, 'index.html'));

  } catch (error) {
    console.error('[LTI] Error in launch:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error LTI</title></head>
      <body>
        <h1>Error de Conexión LTI</h1>
        <p>Error: ${error.message}</p>
        <p>Por favor, intenta acceder nuevamente desde Blackboard.</p>
      </body>
      </html>
    `);
  }
});

// 3. JWKS - Claves públicas para Blackboard
app.get('/.well-known/jwks.json', (req, res) => {
  try {
    console.log('[LTI] GET /.well-known/jwks.json');
    const jwks = ltiService.getJWKS();
    res.json(jwks);
  } catch (error) {
    console.error('[LTI] Error serving JWKS:', error);
    res.status(500).json({ error: 'Error serving JWKS' });
  }
});

// ==================== API ROUTES ====================

// Middleware de autenticación para API
const requireAuth = (req, res, next) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
};

// Información del usuario autenticado
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    user: req.session.user,
    wpUser: req.session.wpUser,
    course: req.session.course
  });
});

// Unidades del estudiante
app.get('/api/student/units', requireAuth, async (req, res) => {
  try {
    const userId = req.session.wpUser?.id;
    const courseId = req.session.course?.id;

    if (!userId || !courseId) {
      return res.json([]);
    }

    const units = await courseService.getActiveUnits(userId, courseId);
    res.json(units);
  } catch (error) {
    console.error('Error getting student units:', error);
    res.status(500).json({ error: 'Error loading units' });
  }
});

// Actualizar progreso
app.post('/api/progress/update', requireAuth, async (req, res) => {
  try {
    const { unitId, contentId, completed, score } = req.body;
    const userId = req.session.wpUser?.id;

    if (!userId) {
      return res.status(400).json({ error: 'User not found' });
    }

    const result = await courseService.updateProgress(userId, unitId, contentId, completed, score);
    res.json(result);
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({ error: 'Error updating progress' });
  }
});

// ==================== HEALTH & DEBUG ====================

// Health check
app.get('/lti/health', (req, res) => {
  const config = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    domain: `https://${BASE_HOST}`,
    urls: {
      login: `https://${BASE_HOST}/lti/login`,
      launch: `https://${BASE_HOST}/lti/launch`,
      jwks: `https://${BASE_HOST}/.well-known/jwks.json`
    },
    lti_config: {
      client_id: LTI_CLIENT_ID,
      deployment_id: LTI_DEPLOYMENT_ID,
      platform_iss: LTI_PLATFORM_ISS
    },
    environment_variables: {
      LTI_CLIENT_ID: !!LTI_CLIENT_ID,
      LTI_DEPLOYMENT_ID: !!LTI_DEPLOYMENT_ID,
      LTI_PLATFORM_ISS: !!LTI_PLATFORM_ISS,
      LTI_PLATFORM_JWKS: !!LTI_PLATFORM_JWKS,
      LTI_PLATFORM_OIDC_AUTH: !!LTI_PLATFORM_OIDC_AUTH,
      WORDPRESS_URL: !!WORDPRESS_URL,
      WORDPRESS_API_USER: !!WORDPRESS_API_USER,
      WORDPRESS_API_PASSWORD: !!WORDPRESS_API_PASSWORD
    }
  };

  res.json(config);
});

// Página principal (información del sistema)
app.get('/', (req, res) => {
  if (req.session.authenticated) {
    // Si está autenticado, servir React app
    return res.sendFile(path.join(STATIC_DIR, 'index.html'));
  }

  // Si no está autenticado, mostrar página de información
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ICN PAIM - LTI Tool</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
        .success { background: #d4edda; color: #155724; }
        .info { background: #d1ecf1; color: #0c5460; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>🚀 ICN PAIM - LTI Tool</h1>
      
      <div class="status success">
        ✅ Servidor funcionando correctamente
      </div>
      
      <div class="status info">
        ℹ️ Para acceder, usa el enlace LTI desde Blackboard
      </div>
      
      <h2>📋 Configuración para Blackboard:</h2>
      <pre>
Dominio: https://${BASE_HOST}
Login Initiation URL: https://${BASE_HOST}/lti/login
Tool Redirect URL: https://${BASE_HOST}/lti/launch
Tool JWKS URL: https://${BASE_HOST}/.well-known/jwks.json
Client ID: ${LTI_CLIENT_ID}
Deployment ID: ${LTI_DEPLOYMENT_ID}
      </pre>
      
      <h2>🔧 Enlaces de diagnóstico:</h2>
      <ul>
        <li><a href="/lti/health">Health Check</a></li>
        <li><a href="/.well-known/jwks.json">JWKS</a></li>
      </ul>
    </body>
    </html>
  `);
});

// Manejar rutas de React (SPA)
app.get('*', (req, res) => {
  if (req.session.authenticated) {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  } else {
    res.redirect('/');
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('🎉 Servidor ICN PAIM iniciado exitosamente');
  console.log(`🌐 Servidor corriendo en puerto ${PORT}`);
  console.log(`🔗 Dominio: https://${BASE_HOST}`);
  console.log('');
  console.log('📋 URLs para Blackboard:');
  console.log(`   Login URL: https://${BASE_HOST}/lti/login`);
  console.log(`   Launch URL: https://${BASE_HOST}/lti/launch`);
  console.log(`   JWKS URL: https://${BASE_HOST}/.well-known/jwks.json`);
  console.log('');
  console.log('🔧 Debug URLs:');
  console.log(`   Health: https://${BASE_HOST}/lti/health`);
  console.log(`   Home: https://${BASE_HOST}/`);
});