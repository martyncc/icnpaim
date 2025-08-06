require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

// Servicios
const ltiService = require('./services/ltiService');
const wordpressService = require('./services/wordpressService');
const courseService = require('./services/courseService');

const app = express();

// Middleware
app.use(cors({
  origin: [
    'https://udla-staging.blackboard.com',
    'https://blackboard.com',
    'https://icnpaim.cl',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'icnpaim-session-secret-2024',
  resave: false,
  saveUninitialized: false,
  name: 'icnpaim.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
  }
}));

// Servir archivos estáticos del build de React
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// ===================
// RUTAS LTI
// ===================

// Endpoint de login LTI - DEBE coincidir con Blackboard config
app.post('/lti/login', async (req, res) => {
  try {
    console.log('🔐 LTI Login Request received');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    // Validar que viene de Blackboard
    const { iss, login_hint, target_link_uri } = req.body;
    
    console.log('🔍 Validating parameters:');
    console.log('- iss:', iss);
    console.log('- client_id:', client_id);
    console.log('- deployment_id:', lti_deployment_id);
    console.log('- login_hint:', login_hint);
    
    if (!iss || !login_hint || !client_id) {
      console.log('❌ Missing required parameters');
      return res.status(400).json({ 
        error: 'Missing required LTI parameters',
        received: { iss, login_hint, client_id, lti_deployment_id }
      });
    }

    // Validar client_id
    if (client_id !== '48dd70cc-ab62-4fbd-ba91-d3d984644373') {
      console.log('❌ Invalid client_id:', client_id);
      return res.status(400).json({ error: 'Invalid client_id' });
    }

    // Generar state y nonce para seguridad
    const state = ltiService.generateState();
    const nonce = ltiService.generateNonce();
    
    // Guardar en sesión
    req.session.lti_state = state;
    req.session.lti_nonce = nonce;
    req.session.login_hint = login_hint;

    // Construir URL de autorización
    const authUrl = ltiService.buildAuthUrl({
      iss,
      login_hint,
      target_link_uri: 'https://icnpaim.cl/lti/launch',
      state,
      nonce,
      client_id
    });

    console.log('🔗 Redirecting to:', authUrl);
    res.redirect(authUrl);

  } catch (error) {
    console.error('❌ LTI Login Error:', error);
    res.status(500).json({ error: 'LTI Login failed' });
  }
});

// Endpoint de launch LTI - DEBE coincidir con Blackboard config
app.post('/lti/launch', async (req, res) => {
  try {
    console.log('🚀 LTI Launch Request:', req.body);
    
    const { id_token, state } = req.body;
    
    // Validar state
    if (state !== req.session.lti_state) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    // Decodificar y validar el JWT
    const tokenData = await ltiService.validateToken(id_token);
    console.log('✅ Token validated:', tokenData);

    // Extraer información del usuario y curso
    const userInfo = {
      lti_id: tokenData.sub,
      name: tokenData.name || tokenData.given_name + ' ' + tokenData.family_name,
      email: tokenData.email,
      roles: tokenData['https://purl.imsglobal.org/spec/lti/claim/roles'] || [],
      course_id: tokenData['https://purl.imsglobal.org/spec/lti/claim/context']?.id,
      course_name: tokenData['https://purl.imsglobal.org/spec/lti/claim/context']?.label,
      platform_id: tokenData.iss
    };

    console.log('👤 User Info:', userInfo);

    // Registrar/actualizar usuario en WordPress
    const wpUser = await wordpressService.registerOrLoginUser(userInfo);
    console.log('✅ WordPress user:', wpUser.name);

    // Crear/actualizar curso si existe
    let courseData = null;
    if (userInfo.course_id) {
      courseData = await courseService.createOrUpdateCourse({
        lti_course_id: userInfo.course_id,
        name: userInfo.course_name,
        wp_user_id: wpUser.id,
        platform_id: userInfo.platform_id
      });
    }

    // Guardar en sesión
    req.session.user = userInfo;
    req.session.wpUser = wpUser;
    req.session.course = courseData;
    req.session.authenticated = true;

    // Determinar rol y redireccionar
    const isStudent = userInfo.roles.some(role => 
      role.includes('Student') || role.includes('Learner')
    );

    if (isStudent) {
      res.redirect('/student-dashboard');
    } else {
      res.redirect('/admin-dashboard');
    }

  } catch (error) {
    console.error('❌ LTI Launch Error:', error);
    res.status(500).send(`
      <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
        <h2 style="color: #dc2626;">Error de Conexión LTI</h2>
        <p>No se pudo completar la conexión con Blackboard.</p>
        <p><strong>Error:</strong> ${error.message}</p>
        <a href="/lti/login" style="background: #4c51bf; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reintentar</a>
      </div>
    `);
  }
});

// Endpoint JWKS - DEBE coincidir con Blackboard config
app.get('/.well-known/jwks.json', (req, res) => {
  try {
    const jwks = ltiService.getJWKS();
    res.json(jwks);
  } catch (error) {
    console.error('❌ JWKS Error:', error);
    res.status(500).json({ error: 'Failed to generate JWKS' });
  }
});

// ===================
// API ENDPOINTS
// ===================

// Middleware de autenticación
const requireAuth = (req, res, next) => {
  if (!req.session.authenticated || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Obtener información del usuario
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    user: req.session.user,
    wpUser: req.session.wpUser,
    course: req.session.course
  });
});

// Obtener camino del estudiante
app.get('/api/student/pathway', requireAuth, async (req, res) => {
  try {
    const userId = req.session.wpUser.id;
    const courseId = req.session.course?.id;
    
    const pathway = await courseService.getStudentPathway(userId, courseId);
    res.json(pathway);
  } catch (error) {
    console.error('Error fetching pathway:', error);
    res.status(500).json({ error: 'Failed to fetch pathway' });
  }
});

// Obtener unidades activas
app.get('/api/student/units', requireAuth, async (req, res) => {
  try {
    const userId = req.session.wpUser.id;
    const courseId = req.session.course?.id;
    
    const units = await courseService.getActiveUnits(userId, courseId);
    res.json(units);
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// Actualizar progreso
app.post('/api/progress/update', requireAuth, async (req, res) => {
  try {
    const { unitId, contentId, completed, score } = req.body;
    const userId = req.session.wpUser.id;
    
    const progress = await courseService.updateProgress(userId, unitId, contentId, completed, score);
    res.json(progress);
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// ===================
// RUTAS DE LA SPA
// ===================

// Rutas para el dashboard del estudiante
app.get('/student-dashboard', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/');
  }
  
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  } else {
    res.redirect('http://localhost:3000/student-dashboard');
  }
});

// Rutas para el dashboard del admin
app.get('/admin-dashboard', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/');
  }
  
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  } else {
    res.redirect('http://localhost:3000/admin-dashboard');
  }
});

// Página de inicio
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ICN PAIM - Plataforma de Aprendizaje</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; margin: 0; }
        .container { background: white; padding: 40px; border-radius: 20px; max-width: 600px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
        h1 { color: #4c51bf; margin-bottom: 20px; }
        .info { background: #f0f9ff; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .urls { text-align: left; background: #f8fafc; padding: 20px; border-radius: 10px; }
        code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 ICN PAIM</h1>
        <p>Plataforma de Aprendizaje Inteligente y Medición</p>
        
        <div class="info">
          <h3>✅ Servidor funcionando correctamente</h3>
          <p>Para acceder, usa el enlace LTI desde Blackboard</p>
        </div>
        
        <div class="urls">
          <h4>📋 URLs para configurar en Blackboard:</h4>
          <p><strong>Login URL:</strong><br><code>https://icnpaim.cl/lti/login</code></p>
          <p><strong>Launch URL:</strong><br><code>https://icnpaim.cl/lti/launch</code></p>
          <p><strong>JWKS URL:</strong><br><code>https://icnpaim.cl/.well-known/jwks.json</code></p>
          
          <h4>🔑 Credenciales Blackboard:</h4>
          <p><strong>Application Key:</strong> 89ef5212-b589-4f9c-b5b8-2fa6ad3e2006</p>
          <p><strong>Deployment ID:</strong> 2b286722-4ef6-4dda-a756-eec5dca12441</p>
        </div>
        
        <p><small>Timestamp: ${new Date().toLocaleString()}</small></p>
      </div>
    </body>
    </html>
  `);
});

// Endpoint de diagnóstico
app.get('/lti/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    lti_config: {
      client_id: '89ef5212-b589-4f9c-b5b8-2fa6ad3e2006',
      deployment_id: '2b286722-4ef6-4dda-a756-eec5dca12441',
      login_url: 'https://icnpaim.cl/lti/login',
      launch_url: 'https://icnpaim.cl/lti/launch',
      jwks_url: 'https://icnpaim.cl/.well-known/jwks.json'
    },
    integrations: {
      wordpress: process.env.WORDPRESS_URL ? 'configured' : 'not configured',
      mongodb: process.env.MONGO_URL ? 'configured' : 'not configured'
    }
  });
});

// Catch-all para React Router (solo en producción) test?
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Manejo de errores
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3333;
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : process.env.BASE_URL || 'https://icnpaim.cl';
app.listen(PORT, () => {
  console.log(`🚀 ICN PAIM Server running on port ${PORT}`);
  console.log(`🔗 Login URL: ${BASE_URL}/lti/login`);
  console.log(`🚀 Launch URL: ${BASE_URL}/lti/launch`);
  console.log(`🔑 JWKS URL: ${BASE_URL}/.well-known/jwks.json`);
  console.log(`📱 Dashboard: ${BASE_URL}/student-dashboard`);
});