// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const jwt = require('jsonwebtoken');

const ltiService = require('./services/ltiService');
const wordpressService = require('./services/wordpressService');
const courseService = require('./services/courseService');

const app = express();

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

if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// ================
// LTI ENDPOINTS
// ================
app.use('/lti', require('./routes/ltiRoutes'));

// ================
// API
// ================
app.use('/api', require('./routes/apiRoutes'));

// ================
// SPA Routes
// ================
app.get('/student-dashboard', (req, res) => {
  if (!req.session.authenticated) return res.redirect('/');
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  } else {
    res.redirect('http://localhost:3000/student-dashboard');
  }
});

app.get('/admin-dashboard', (req, res) => {
  if (!req.session.authenticated) return res.redirect('/');
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  } else {
    res.redirect('http://localhost:3000/admin-dashboard');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

app.get('/lti/launch', (req, res) => {
  // Mini HTML amigable para probar que Blackboard recibe algo útil
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Launch recibido</title>
        <style>
          body { font-family: sans-serif; background: #f9fafb; text-align: center; padding: 60px; }
          h1 { color: #4f46e5; }
          p { font-size: 18px; color: #1f2937; }
        </style>
      </head>
      <body>
        <h1>🚀 ¡Lanzamiento exitoso!</h1>
        <p>Tu conexión LTI fue recibida correctamente.</p>
        <p>Esto es contenido renderizado por el servidor como prueba.</p>
      </body>
    </html>
  `);
});

app.get('/lti/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    lti_config: {
      client_id: process.env.LTI_CLIENT_ID,
      deployment_id: process.env.LTI_DEPLOYMENT_ID,
      login_url: `${process.env.BASE_URL}/lti/login`,
      launch_url: `${process.env.BASE_URL}/lti/launch`,
      jwks_url: `${process.env.BASE_URL}/.well-known/jwks.json`
    },
    integrations: {
      wordpress: !!process.env.WORDPRESS_URL,
      mongodb: !!process.env.MONGO_URL
    }
  });
});

if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/lti/') || req.path.startsWith('/api/') || req.path.startsWith('/.well-known/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

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
