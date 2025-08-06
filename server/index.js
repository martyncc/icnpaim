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

// Endpoint de login LTI - Manejar tanto GET como POST
app.get('/lti/login', async (req, res) => {
  try {
    console.log('🔐 LTI OIDC Login Request received');
    console.log('Query params:', req.query);
    
    // Extraer parámetros según documentación oficial de Blackboard
    const { 
      iss,           // issuer
      login_hint,    // opaque value - must be returned unaltered
      target_link_uri, // URI configured for this LTI link
      lti_message_hint, // opaque value - must be returned unaltered
      lti_deployment_id, // deployment ID
      client_id,     // client ID
      lti_storage_target // for use if cookies aren't possible
    } = req.query;
    
    console.log('🔍 Validating parameters:');
    console.log('- iss:', iss);
    console.log('- client_id:', client_id);
    console.log('- lti_deployment_id:', lti_deployment_id);
    console.log('- login_hint:', login_hint);
    console.log('- target_link_uri:', target_link_uri);
    console.log('- lti_message_hint:', lti_message_hint ? 'present' : 'missing');
    
    if (!iss || !login_hint || !client_id) {
      console.log('❌ Missing required parameters');
      return res.status(400).json({ 
        error: 'Missing required LTI parameters',
        received: { iss, login_hint, client_id, lti_deployment_id }
      });
    }

    // Validar client_id (debe coincidir con el registrado en Developer Portal)
    if (client_id !== '48dd70cc-ab62-4fbd-ba91-d3d984644373') {
      console.log('❌ Invalid client_id:', client_id);
      return res.status(400).json({ error: 'Invalid client_id' });
    }

    // Generar state y nonce para seguridad (según documentación)
    const state = ltiService.generateState();
    const nonce = ltiService.generateNonce();
    
    // Guardar state en cookie para verificar CSRF (según documentación)
    req.session.lti_state = state;
    req.session.lti_nonce = nonce;
    req.session.login_hint = login_hint;
    req.session.lti_message_hint = lti_message_hint;

    // IMPORTANTE: Usar el OIDC Authentication Request URI del Developer Portal
    // Según documentación: usar el endpoint OIDC de la instancia de Blackboard
    const oidcAuthUrl = 'https://udla-staging.blackboard.com/learn/api/public/v1/oauth2/authorize';
    
    // Construir URL según documentación oficial
    const redirectUri = target_link_uri || 'https://lti.icnpaim.cl/lti/launch';
    
    const authParams = new URLSearchParams({
      response_type: 'id_token',
      scope: 'openid',
      login_hint: login_hint,
      lti_message_hint: lti_message_hint || '',
      state: state,
      redirect_uri: encodeURIComponent(redirectUri), // DEBE estar encoded
      client_id: client_id,
      nonce: nonce,
    });

    const finalAuthUrl = `${oidcAuthUrl}?${authParams.toString()}`;

    console.log('🔗 Redirecting to Developer Portal OIDC auth:', finalAuthUrl);
    res.redirect(finalAuthUrl);

  } catch (error) {
    console.error('❌ LTI Login Error:', error);
    res.status(500).json({ error: 'LTI Login failed', details: error.message });
  }
});

app.post('/lti/login', async (req, res) => {
  try {
    console.log('🔐 LTI OIDC Login POST Request received');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    
    // Extraer parámetros según documentación oficial
    const { 
      iss, 
      login_hint, 
      target_link_uri, 
      client_id, 
      lti_deployment_id,
      lti_message_hint,
      lti_storage_target
    } = req.body;
    
    console.log('🔍 Validating parameters:');
    console.log('- iss:', iss);
    console.log('- client_id:', client_id);
    console.log('- lti_deployment_id:', lti_deployment_id);
    console.log('- login_hint:', login_hint);
    console.log('- target_link_uri:', target_link_uri);
    
    if (!iss || !login_hint || !client_id) {
      console.log('❌ Missing required parameters');
      return res.status(400).json({ 
        error: 'Missing required LTI parameters',
        received: { iss, login_hint, client_id, lti_deployment_id }
      });
    }

    // Validar client_id (debe coincidir con el registrado)
    if (client_id !== '48dd70cc-ab62-4fbd-ba91-d3d984644373') {
      console.log('❌ Invalid client_id:', client_id);
      return res.status(400).json({ error: 'Invalid client_id' });
    }

    // Generar state y nonce según documentación
    const state = ltiService.generateState();
    const nonce = ltiService.generateNonce();
    
    // Guardar state en cookie para verificar CSRF
    req.session.lti_state = state;
    req.session.lti_nonce = nonce;
    req.session.login_hint = login_hint;
    req.session.lti_message_hint = lti_message_hint;

    // Usar OIDC Authentication Request URI del Developer Portal
    const oidcAuthUrl = 'https://udla-staging.blackboard.com/learn/api/public/v1/oauth2/authorize';
    const redirectUri = target_link_uri || 'https://lti.icnpaim.cl/lti/launch';
    
    const authParams = new URLSearchParams({
      response_type: 'id_token',
      scope: 'openid',
      login_hint: login_hint,
      lti_message_hint: lti_message_hint || '',
      state: state,
      redirect_uri: encodeURIComponent(redirectUri),
      client_id: client_id,
      nonce: nonce,
    });

    const finalAuthUrl = `${oidcAuthUrl}?${authParams.toString()}`;
    
    console.log('🔗 Redirecting to Developer Portal:', finalAuthUrl);
    res.redirect(finalAuthUrl);

  } catch (error) {
    console.error('❌ LTI Login Error:', error);
    res.status(500).json({ error: 'LTI Login failed', details: error.message });
  }
});

// Endpoint de launch LTI - DEBE coincidir con Blackboard config
app.post('/lti/launch', async (req, res) => {
  try {
    console.log('🚀 LTI Launch Request received from Developer Portal');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body keys:', Object.keys(req.body));
    
    const { id_token, state } = req.body;
    
    if (!id_token) {
      console.log('❌ No id_token received');
      return res.status(400).json({ error: 'Missing id_token' });
    }
    
    // Validar state para prevenir CSRF (según documentación)
    if (state !== req.session.lti_state) {
      console.log('❌ State mismatch:', { received: state, expected: req.session.lti_state });
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    console.log('✅ State validated successfully');
    
    // Decodificar el JWT token según especificación LTI 1.3
    const jwt = require('jsonwebtoken');
    const tokenData = jwt.decode(id_token, { complete: true });
    
    if (!tokenData || !tokenData.payload) {
      throw new Error('Invalid JWT token structure');
    }
    
    console.log('📋 JWT Header:', tokenData.header);
    console.log('📋 JWT Algorithm:', tokenData.header.alg);
    console.log('📋 JWT Key ID:', tokenData.header.kid);
    
    const payload = tokenData.payload;
    
    // Validar claims requeridos según LTI 1.3 spec
    const requiredClaims = [
      'iss', 'sub', 'aud', 'exp', 'iat', 'nonce',
      'https://purl.imsglobal.org/spec/lti/claim/message_type',
      'https://purl.imsglobal.org/spec/lti/claim/version',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id'
    ];
    
    for (const claim of requiredClaims) {
      if (!payload[claim]) {
        console.log(`❌ Missing required claim: ${claim}`);
        throw new Error(`Missing required LTI claim: ${claim}`);
      }
    }
    
    // Validar nonce
    if (payload.nonce !== req.session.lti_nonce) {
      console.log('❌ Nonce mismatch:', { received: payload.nonce, expected: req.session.lti_nonce });
      throw new Error('Invalid nonce');
    }
    
    // Validar message_type
    const messageType = payload['https://purl.imsglobal.org/spec/lti/claim/message_type'];
    if (messageType !== 'LtiResourceLinkRequest') {
      console.log('❌ Invalid message type:', messageType);
      throw new Error('Invalid LTI message type');
    }
    
    // Validar version
    const version = payload['https://purl.imsglobal.org/spec/lti/claim/version'];
    if (version !== '1.3.0') {
      console.log('❌ Invalid LTI version:', version);
      throw new Error('Invalid LTI version');
    }
    
    console.log('✅ All LTI 1.3 claims validated');
    console.log('📋 LTI Claims:', {
      message_type: messageType,
      version: version,
      deployment_id: payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
      sub: payload.sub,
      iss: payload.iss,
      aud: payload.aud
    });

    // Extraer información del usuario según claims LTI 1.3
    const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'];
    const resourceLink = payload['https://purl.imsglobal.org/spec/lti/claim/resource_link'];
    const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    
    const userInfo = {
      lti_id: payload.sub,
      name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim() || 'Usuario',
      email: payload.email,
      roles: roles,
      course_id: context?.id,
      course_name: context?.label || context?.title,
      resource_link_id: resourceLink?.id,
      resource_link_title: resourceLink?.title,
      deployment_id: payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
      platform_id: payload.iss,
      target_link_uri: payload['https://purl.imsglobal.org/spec/lti/claim/target_link_uri']
    };

    console.log('👤 Extracted User Info:', {
      name: userInfo.name,
      email: userInfo.email,
      roles: userInfo.roles,
      course: userInfo.course_name,
      deployment_id: userInfo.deployment_id
    });

    // Integrar con WordPress (por ahora simulado)
    const wpUser = {
      id: 1,
      name: userInfo.name,
      email: userInfo.email
    };
    
    console.log('✅ WordPress user (simulated):', wpUser.name);

    // Crear/actualizar curso en el sistema
    let courseData = null;
    if (userInfo.course_id) {
      courseData = {
        id: userInfo.course_id,
        title: userInfo.course_name,
        lti_course_id: userInfo.course_id
      };
      console.log('📚 Course data:', courseData);
    }

    // Guardar datos en sesión para uso posterior
    req.session.user = userInfo;
    req.session.wpUser = wpUser;
    req.session.course = courseData;
    req.session.authenticated = true;

    // Determinar rol del usuario y redireccionar apropiadamente
    const isStudent = userInfo.roles.some(role => 
      role.includes('Student') || 
      role.includes('Learner') ||
      role === 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'
    );
    
    const isInstructor = userInfo.roles.some(role =>
      role.includes('Instructor') || 
      role.includes('TeachingAssistant') || 
      role.includes('Administrator') ||
      role === 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor' ||
      role === 'http://purl.imsglobal.org/vocab/lis/v2/membership#TeachingAssistant'
    );

    console.log('🎯 User roles:', userInfo.roles);
    console.log('🎯 Is student:', isStudent);
    console.log('🎯 Is instructor:', isInstructor);

    if (isStudent) {
      console.log('➡️ Redirecting to student dashboard');
      res.redirect('/student-dashboard');
    } else if (isInstructor) {
      console.log('➡️ Redirecting to admin dashboard');
      res.redirect('/admin-dashboard');
    } else {
      console.log('➡️ Redirecting to welcome page (unknown role)');
      res.redirect('/');
    }

  } catch (error) {
    console.error('❌ LTI Launch Error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).send(`
      <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
        <h2 style="color: #dc2626;">Error de Conexión LTI</h2>
        <p>No se pudo completar la conexión con Blackboard.</p>
        <p><strong>Error:</strong> ${error.message}</p>
        <details>
          <summary>Detalles técnicos</summary>
          <pre style="text-align: left; background: #f5f5f5; padding: 10px; font-size: 12px;">${error.stack}</pre>
        </details>
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

// Catch-all para React Router (solo en producción)
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  app.get('*', (req, res) => {
    // No interceptar rutas LTI
    if (req.path.startsWith('/lti/') || req.path.startsWith('/api/') || req.path.startsWith('/.well-known/')) {
      return res.status(404).json({ error: 'Not found' });
    }
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