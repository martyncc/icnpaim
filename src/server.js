// server.js
require('dotenv').config();
const express = require('express');
const lti = require('ltijs').Provider;
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const bodyParser = require('body-parser');

const wordpressIntegration = require('./services/wordpressIntegration');
const cptService = require('./services/cptService');
const progressService = require('./services/progressService');
const ErrorHandler = require('./utils/errorHandler');

const app = express();

// Configuración de CORS más específica para Blackboard
app.use(cors({ 
  origin: [
    'https://udla-staging.blackboard.com',
    'https://blackboard.com',
    'https://icnpaim.cl'
  ], 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'lti-session-secret-icnpaim-2024-fallback',
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

// Servir archivos estáticos
app.use('/lti/static', express.static(path.join(__dirname, '../public')));

const setupLTI = async () => {
  try {
    console.log('🔧 Setting up LTI Provider for ICN PAIM...');

    // Configuración del proveedor LTI
    await lti.setup(
      process.env.LTI_KEY,
      {
        url: process.env.MONGO_URL,
        connection: {
          user: process.env.MONGO_USER || '',
          pass: process.env.MONGO_PASS || ''
        }
      },
      {
        appRoute: '/lti',
        loginRoute: '/lti/login',
        keysetRoute: '/lti/.well-known/jwks.json',
        sessionTimeoutRoute: '/lti/session-timeout',
        invalidTokenRoute: '/lti/invalid-token',
        cookies: {
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'None',
          httpOnly: true
        },
        devMode: process.env.NODE_ENV !== 'production',
        staticPath: path.join(__dirname, '../public'),
        cors: true,
        serverless: false
      }
    );

    // IMPORTANTE: Desplegar ANTES de registrar plataformas
    const port = process.env.PORT || 3333;
    await lti.deploy({ port });
    console.log(`🚀 LTI Provider deployed on port ${port}`);

    // Registro de plataforma Blackboard
    await lti.registerPlatform({
      url: 'https://udla-staging.blackboard.com',
      name: 'Blackboard UDLA Staging',
      clientId: process.env.LTI_CLIENT_ID,
      authenticationEndpoint: process.env.LTI_PLATFORM_AUTH_URL,
      accesstokenEndpoint: process.env.LTI_PLATFORM_TOKEN_URL,
      authConfig: {
        method: 'JWK_SET',
        key: process.env.LTI_PLATFORM_JWKS_URL
      }
    });

    // Handler principal de conexión LTI
    lti.onConnect(async (token, req, res) => {
      try {
        console.log('=== LTI Connection Attempt ===');
        console.log('ISS:', token.iss);
        console.log('Client ID:', token.client_id);
        console.log('User:', token.name);
        console.log('Email:', token.email);
        console.log('Roles:', token.roles);
        console.log('Course ID:', token.course?.id);
        console.log('Course Name:', token.course?.label);

        // Extraer información del usuario y curso
        const userInfo = {
          lti_id: token.sub,
          name: token.name || 'Usuario Desconocido',
          email: token.email || '',
          roles: token.roles || [],
          course_id: token.course?.id || null,
          course_name: token.course?.label || 'Curso sin nombre',
          context_id: token.context?.id || null,
          context_label: token.context?.label || null,
          platform_id: token.iss
        };

        // Registrar o hacer login del usuario en WordPress
        const wpUser = await wordpressIntegration.registerOrLoginUser(userInfo);
        
        // Crear o actualizar el curso en el sistema
        let courseData = null;
        if (userInfo.course_id) {
          courseData = await courseService.createOrUpdateCourse({
            lti_course_id: userInfo.course_id,
            name: userInfo.course_name,
            context_id: userInfo.context_id,
            context_label: userInfo.context_label,
            wp_user_id: wpUser.id,
            platform_id: userInfo.platform_id
          });
        }

        // Crear o actualizar los CPTs necesarios
        await cptService.syncStudentData(userInfo, wpUser, courseData);

        // Guardar en sesión
        req.session.ltiUser = userInfo;
        req.session.wpUser = wpUser;
        req.session.courseData = courseData;

        // Determinar rol y redireccionar
        const isInstructor = userInfo.roles.some(role =>
          role.includes('Instructor') || 
          role.includes('TeachingAssistant') || 
          role.includes('Administrator')
        );

        const isStudent = userInfo.roles.some(role =>
          role.includes('Student') || 
          role.includes('Learner')
        );

        if (isInstructor) {
          return res.redirect('/lti/admin-dashboard');
        } else if (isStudent) {
          // Para estudiantes, redirigir al camino asignado
          return res.redirect('/lti/student-pathway');
        } else {
          return res.redirect('/lti/welcome');
        }

      } catch (error) {
        console.error('❌ LTI Connection Error:', error);
        return ErrorHandler.handleLTIError(error, req, res);
      }
    });

    // Handler de error para deep linking
    lti.onDeepLinking(async (token, req, res) => {
      console.log('Deep linking request received');
      return res.redirect('/lti/admin-dashboard');
    });

    console.log('✅ LTI Provider configured successfully');
    console.log(`🔗 Login URL: https://icnpaim.cl/lti/login`);
    console.log(`🚀 Launch URL: https://icnpaim.cl/lti`);
    console.log(`🔑 JWKS URL: https://icnpaim.cl/lti/.well-known/jwks.json`);

  } catch (error) {
    console.error('❌ LTI Setup Error:', error);
    throw error;
  }
};

// Rutas principales
app.get(['/lti', '/lti/'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/welcome.html'));
});

// Endpoint de diagnóstico
app.get('/lti/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    urls: {
      login: 'https://icnpaim.cl/lti/login',
      launch: 'https://icnpaim.cl/lti',
      jwks: 'https://icnpaim.cl/lti/.well-known/jwks.json'
    },
    mongodb: process.env.MONGO_URL ? 'configured' : 'not configured',
    wordpress: process.env.WORDPRESS_URL ? 'configured' : 'not configured'
  });
});

// Endpoint para verificar configuración LTI
app.get('/lti/config', (req, res) => {
  res.json({
    client_id: process.env.LTI_CLIENT_ID,
    issuer: process.env.LTI_ISSUER,
    auth_url: process.env.LTI_PLATFORM_AUTH_URL,
    token_url: process.env.LTI_PLATFORM_TOKEN_URL,
    jwks_url: process.env.LTI_PLATFORM_JWKS_URL,
    tool_urls: {
      login: 'https://icnpaim.cl/lti/login',
      launch: 'https://icnpaim.cl/lti',
      jwks: 'https://icnpaim.cl/lti/.well-known/jwks.json'
    }
  });
});
app.get('/lti/welcome', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/welcome.html'));
});

app.get('/lti/test', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/test.html'));
});
// Middleware de autenticación
function requireAuth(req, res, next) {
  if (!req.session.ltiUser || !req.session.wpUser) {
    console.log('❌ Authentication required - redirecting to welcome');
    return res.redirect('/lti/welcome');
  }
  next();
}

function requireStudent(req, res, next) {
  const userRoles = req.session.ltiUser.roles || [];
  const isStudent = userRoles.some(role =>
    role.includes('Student') || role.includes('Learner')
  );
  if (!isStudent) {
    return res.status(403).json({ error: 'Acceso de estudiante requerido' });
  }
  next();
}

function requireAdmin(req, res, next) {
  const userRoles = req.session.ltiUser.roles || [];
  const isAdmin = userRoles.some(role =>
    role.includes('Instructor') || 
    role.includes('TeachingAssistant') || 
    role.includes('Administrator')
  );
  if (!isAdmin) {
    return res.status(403).json({ error: 'Acceso de administrador requerido' });
  }
  next();
}

// Rutas para estudiantes
app.get('/lti/student-pathway', requireAuth, requireStudent, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/student-pathway.html'));
});

app.get('/lti/student-dashboard', requireAuth, requireStudent, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/student-dashboard.html'));
});

// Rutas para administradores
app.get('/lti/admin-dashboard', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

// API Routes
app.get('/lti/api/user-info', requireAuth, (req, res) => {
  res.json({
    ltiUser: req.session.ltiUser,
    wpUser: req.session.wpUser,
    courseData: req.session.courseData
  });
});

// API para obtener el camino del estudiante
app.get('/lti/api/student/pathway', requireAuth, requireStudent, async (req, res) => {
  try {
    const userId = req.session.wpUser.id;
    const courseId = req.session.courseData?.id;
    const pathway = await cptService.getStudentPathway(userId, courseId);
    res.json(pathway);
  } catch (error) {
    console.error('Error fetching student pathway:', error);
    res.status(500).json({ error: 'No se pudo obtener el camino del estudiante' });
  }
});

// API para obtener unidades activas
app.get('/lti/api/student/active-units', requireAuth, requireStudent, async (req, res) => {
  try {
    const userId = req.session.wpUser.id;
    const courseId = req.session.courseData?.id;
    const units = await cptService.getActiveUnits(userId, courseId);
    res.json(units);
  } catch (error) {
    console.error('Error fetching active units:', error);
    res.status(500).json({ error: 'No se pudieron obtener las unidades activas' });
  }
});

// API para obtener contenido de unidad
app.get('/lti/api/unit/:unitId/content', requireAuth, async (req, res) => {
  try {
    const content = await cptService.getUnitContent(req.params.unitId);
    res.json(content);
  } catch (error) {
    console.error('Error fetching unit content:', error);
    res.status(500).json({ error: 'No se pudo obtener el contenido de la unidad' });
  }
});

// API para actualizar progreso
app.post('/lti/api/progress/update', requireAuth, requireStudent, async (req, res) => {
  try {
    const { unitId, contentId, completed, score } = req.body;
    const userId = req.session.wpUser.id;
    const progress = await progressService.updateProgress(userId, unitId, contentId, completed, score);
    res.json(progress);
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({ error: 'No se pudo actualizar el progreso' });
  }
});

// API para obtener progreso del estudiante
app.get('/lti/api/student/progress', requireAuth, requireStudent, async (req, res) => {
  try {
    const userId = req.session.wpUser.id;
    const progress = await progressService.getStudentProgress(userId);
    res.json(progress);
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({ error: 'No se pudo obtener el progreso del estudiante' });
  }
});

// API para administradores - gestión de cursos
app.get('/lti/api/admin/courses', requireAuth, requireAdmin, async (req, res) => {
  try {
    const courses = await cptService.getAllCourses();
    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'No se pudieron obtener los cursos' });
  }
});

// API para administradores - gestión de estudiantes
app.get('/lti/api/admin/students', requireAuth, requireAdmin, async (req, res) => {
  try {
    const students = await cptService.getAllStudents();
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'No se pudieron obtener los estudiantes' });
  }
});

// Manejo de errores
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo salió mal'
  });
});

// Iniciar servidor
const startServer = async () => {
  try {
    console.log('🚀 Starting ICN PAIM LTI Tool...');
    await setupLTI();
    const port = process.env.PORT || 3333;
    console.log(`🚀 ICN PAIM LTI Tool ejecutándose en puerto ${port}`);
    console.log(`📚 Integración con WordPress lista`);
    console.log(`🎯 CPT ICN PAIM configurado`);
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    
    // En lugar de salir, intentar continuar con funcionalidad básica
    console.log('⚠️ Continuando con funcionalidad básica...');
    
    const basicApp = express();
    basicApp.use(express.static(path.join(__dirname, '../public')));
    
    basicApp.get('*', (req, res) => {
      res.send(`
        <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
          <h1>ICN PAIM - Modo de Mantenimiento</h1>
          <p>La plataforma está en proceso de configuración.</p>
          <p>Error: ${error.message}</p>
        </div>
      `);
    });
    
    const port = process.env.PORT || 3333;
    basicApp.listen(port, () => {
      console.log(`🔧 Servidor básico ejecutándose en puerto ${port}`);
    });
  }
};

startServer();