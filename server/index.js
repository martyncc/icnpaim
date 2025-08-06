require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();

// ===================
// MIDDLEWARE
// ===================

app.use(cors({
  origin: [
    'https://udla-staging.blackboard.com',
    'https://blackboard.com',
    'https://lti.icnpaim.cl',
    'https://lti.icnpaim.cl',
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

// Servir React build en producción
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// ===================
// UTILIDADES LTI
// ===================

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

function generateNonce() {
  return crypto.randomBytes(32).toString('hex');
}

// ===================
// RUTAS LTI 1.3
// ===================

// 1. OIDC Login - Blackboard inicia el flujo
app.get('/lti/login', (req, res) => {
  try {
    console.log('🔐 LTI OIDC Login iniciado');
    console.log('Parámetros recibidos:', req.query);
    
    const { 
      iss,
      login_hint,
      target_link_uri,
      lti_message_hint,
      lti_deployment_id,
      client_id
    } = req.query;
    
    // Validar parámetros requeridos
    if (!iss || !login_hint || !client_id) {
      return res.status(400).json({ 
        error: 'Faltan parámetros LTI requeridos',
        received: { iss, login_hint, client_id }
      });
    }

    // Generar state y nonce para seguridad
    const state = generateState();
    const nonce = generateNonce();
    
    // Guardar en sesión para validar después
    req.session.lti_state = state;
    req.session.lti_nonce = nonce;
    req.session.login_hint = login_hint;
    req.session.lti_message_hint = lti_message_hint;

    // Construir URL de autorización según documentación LTI 1.3
    const redirectUri = target_link_uri || 'https://lti.icnpaim.cl/lti/launch';
    const oidcAuthUrl = 'https://udla-staging.blackboard.com/learn/api/public/v1/oauth2/authorize';
    
    const authParams = new URLSearchParams({
      response_type: 'id_token',
      scope: 'openid',
      login_hint: login_hint,
      lti_message_hint: lti_message_hint || '',
      state: state,
      redirect_uri: encodeURIComponent(redirectUri),
      client_id: client_id,
      nonce: nonce
    });

    const finalAuthUrl = `${oidcAuthUrl}?${authParams.toString()}`;
    
    console.log('🔗 Redirigiendo a Blackboard OIDC:', finalAuthUrl);
    res.redirect(finalAuthUrl);

  } catch (error) {
    console.error('❌ Error en LTI Login:', error);
    res.status(500).json({ error: 'Error en login LTI', details: error.message });
  }
});

// 2. LTI Launch - Blackboard envía el JWT token
app.post('/lti/launch', (req, res) => {
  try {
    console.log('🚀 LTI Launch recibido');
    
    const { id_token, state } = req.body;
    
    if (!id_token) {
      return res.status(400).json({ error: 'Token JWT faltante' });
    }
    
    // Validar state para prevenir CSRF
    if (state !== req.session.lti_state) {
      console.log('❌ State inválido:', { received: state, expected: req.session.lti_state });
      return res.status(400).json({ error: 'State inválido' });
    }

    // Decodificar JWT (sin validar firma por ahora)
    const tokenData = jwt.decode(id_token, { complete: true });
    
    if (!tokenData || !tokenData.payload) {
      throw new Error('Token JWT inválido');
    }
    
    const payload = tokenData.payload;
    console.log('📋 JWT Payload recibido:', {
      iss: payload.iss,
      sub: payload.sub,
      aud: payload.aud,
      name: payload.name,
      email: payload.email
    });

    // Extraer información del usuario según LTI 1.3
    const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'];
    const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
    
    const userInfo = {
      lti_id: payload.sub,
      name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim() || 'Usuario',
      email: payload.email,
      roles: roles,
      course_id: context?.id,
      course_name: context?.label || context?.title,
      deployment_id: payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'],
      platform_id: payload.iss
    };

    console.log('👤 Usuario extraído:', {
      name: userInfo.name,
      email: userInfo.email,
      roles: userInfo.roles,
      course: userInfo.course_name
    });

    // Guardar en sesión
    req.session.user = userInfo;
    req.session.authenticated = true;

    // Determinar rol y redirigir
    const isStudent = userInfo.roles.some(role => 
      role.includes('Student') || 
      role.includes('Learner') ||
      role.includes('membership#Learner')
    );
    
    const isInstructor = userInfo.roles.some(role =>
      role.includes('Instructor') || 
      role.includes('TeachingAssistant') || 
      role.includes('Administrator') ||
      role.includes('membership#Instructor')
    );

    console.log('🎯 Roles detectados - Estudiante:', isStudent, 'Instructor:', isInstructor);

    if (isStudent) {
      res.redirect('/student-dashboard');
    } else if (isInstructor) {
      res.redirect('/admin-dashboard');
    } else {
      res.redirect('/');
    }

  } catch (error) {
    console.error('❌ Error en LTI Launch:', error);
    res.status(500).send(`
      <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
        <h2 style="color: #dc2626;">Error de Conexión LTI</h2>
        <p>No se pudo completar la conexión con Blackboard.</p>
        <p><strong>Error:</strong> ${error.message}</p>
        <a href="/" style="background: #4c51bf; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Volver al inicio</a>
      </div>
    `);
  }
});

// 3. JWKS Endpoint - Para que Blackboard valide nuestros tokens
app.get('/.well-known/jwks.json', (req, res) => {
  // Por ahora, JWKS vacío ya que no firmamos tokens
  res.json({
    keys: []
  });
});

// ===================
// API ENDPOINTS
// ===================

// Middleware de autenticación
const requireAuth = (req, res, next) => {
  if (!req.session.authenticated || !req.session.user) {
    return res.status(401).json({ error: 'Autenticación requerida' });
  }
  next();
};

// Obtener información del usuario autenticado
app.get('/api/user', requireAuth, (req, res) => {
  res.json({
    user: req.session.user,
    course: {
      id: req.session.user.course_id,
      name: req.session.user.course_name
    }
  });
});

// Obtener unidades del estudiante (mock por ahora)
app.get('/api/student/units', requireAuth, (req, res) => {
  // Mock data - después se conectará a WordPress
  const mockUnits = [
    {
      id: 1,
      title: 'Introducción al Curso',
      description: 'Bienvenida y objetivos del curso',
      type: 'lesson',
      duration: 15,
      difficulty: 'Principiante',
      unlocked: true,
      progress: { completion_percentage: 0, score: 0, completed: false }
    },
    {
      id: 2,
      title: 'Conceptos Fundamentales',
      description: 'Aprende los conceptos básicos',
      type: 'lesson',
      duration: 30,
      difficulty: 'Principiante',
      unlocked: false,
      progress: { completion_percentage: 0, score: 0, completed: false }
    }
  ];
  
  res.json(mockUnits);
});

// Actualizar progreso del estudiante (mock por ahora)
app.post('/api/progress/update', requireAuth, (req, res) => {
  const { unitId, contentId, completed, score } = req.body;
  
  console.log('📊 Actualizando progreso:', { unitId, contentId, completed, score });
  
  // Mock response - después se guardará en WordPress
  res.json({
    success: true,
    unitId,
    completed,
    score,
    timestamp: new Date().toISOString()
  });
});

// ===================
// RUTAS REACT SPA
// ===================

// Dashboard del estudiante
app.get('/student-dashboard', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/');
  }
  
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  } else {
    res.redirect('http://localhost:3000/student-dashboard');
  }
});

// Dashboard del administrador
app.get('/admin-dashboard', (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/');
  }
  
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  } else {
    res.redirect('http://localhost:3000/admin-dashboard');
  }
});

// Página de inicio
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <title>ICN PAIM - Plataforma de Aprendizaje</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh; margin: 0; padding: 40px; text-align: center;
        }
        .container { 
          background: white; padding: 40px; border-radius: 20px; 
          max-width: 600px; margin: 0 auto; 
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        h1 { color: #4c51bf; margin-bottom: 20px; }
        .status { background: #f0f9ff; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .config { background: #f8fafc; padding: 20px; border-radius: 10px; text-align: left; }
        code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 ICN PAIM</h1>
        <p><strong>Plataforma de Aprendizaje Inteligente y Medición</strong></p>
        
        <div class="status">
          <h3>✅ Sistema funcionando</h3>
          <p>Para acceder, usa el enlace LTI desde Blackboard Learn</p>
        </div>
        
        <div class="config">
          <h4>📋 Configuración LTI para Blackboard:</h4>
          <p><strong>Login URL:</strong><br><code>https://lti.icnpaim.cl/lti/login</code></p>
          <p><strong>Launch URL:</strong><br><code>https://lti.icnpaim.cl/lti/launch</code></p>
          <p><strong>JWKS URL:</strong><br><code>https://lti.icnpaim.cl/.well-known/jwks.json</code></p>
          
          <h4>🔑 Credenciales:</h4>
          <p><strong>Client ID:</strong> 48dd70cc-ab62-4fbd-ba91-d3d984644373</p>
          <p><strong>Deployment ID:</strong> 2b286722-4ef6-4dda-a756-eec5dca12441</p>
        </div>
        
        <p><small>Timestamp: ${new Date().toLocaleString()}</small></p>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Catch-all para React Router (solo en producción)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    // No interceptar rutas LTI o API
    if (req.path.startsWith('/lti/') || req.path.startsWith('/api/') || req.path.startsWith('/.well-known/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// ===================
// INICIAR SERVIDOR
// ===================

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🚀 ICN PAIM Server running on port ${PORT}`);
  console.log(`🔗 Login URL: https://lti.icnpaim.cl/lti/login`);
  console.log(`🚀 Launch URL: https://lti.icnpaim.cl/lti/launch`);
  console.log(`🔑 JWKS URL: https://lti.icnpaim.cl/.well-known/jwks.json`);
  console.log(`📱 Ready for LTI connections from Blackboard`);
});