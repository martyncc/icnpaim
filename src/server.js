require('dotenv').config();
const path = require('path');
const fs = require('fs');
const lti = require('ltijs').Provider;

// Configuración de variables de entorno
const PORT = process.env.PORT || 3333;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/ltijs';
const LTI_KEY = process.env.LTI_KEY || 'LTIKEY';

// Configuración de la plataforma (Blackboard)
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://blackboard.com';
const CLIENT_ID = process.env.CLIENT_ID || '48dd70cc-ab62-4fbd-ba91-d3d984644373';
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID || '2b286722-4ef6-4dda-a756-eec5dca12441';
const AUTH_ENDPOINT = process.env.AUTH_ENDPOINT || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/authorize';
const TOKEN_ENDPOINT = process.env.TOKEN_ENDPOINT || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/token';
const JWKS_ENDPOINT = process.env.JWKS_ENDPOINT || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/jwks';

// Configuración de WordPress
const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USER = process.env.WORDPRESS_USER;
const WORDPRESS_PASSWORD = process.env.WORDPRESS_PASSWORD;

// Directorio de archivos estáticos (React build)
const STATIC_DIR = fs.existsSync(path.join(__dirname, '../client/build/index.html'))
  ? path.join(__dirname, '../client/build')
  : path.join(__dirname, '../public');

console.log('🚀 Iniciando servidor LTI.js...');
console.log('📁 Directorio estático:', STATIC_DIR);

// Configuración de LTI.js
lti.setup(
  LTI_KEY,
  { url: MONGO_URL },
  {
    staticPath: STATIC_DIR,
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
    },
    devMode: process.env.NODE_ENV !== 'production'
  }
);

// Manejo de conexión exitosa (launch)
lti.onConnect(async (token, req, res) => {
  try {
    console.log('✅ Conexión LTI exitosa');
    console.log('👤 Usuario:', token.userInfo.name);
    console.log('📚 Curso:', token.platformContext.label);

    // Extraer información del token
    const userInfo = {
      id: token.userInfo.sub,
      name: token.userInfo.name,
      email: token.userInfo.email,
      roles: token.userInfo.roles,
      course: {
        id: token.platformContext.id,
        label: token.platformContext.label,
        title: token.platformContext.title
      },
      platform: token.iss
    };

    // Guardar información en la sesión
    req.session.userInfo = userInfo;
    req.session.authenticated = true;

    // Sincronizar con WordPress si está configurado
    if (WORDPRESS_URL) {
      try {
        await syncWithWordPress(userInfo);
        console.log('✅ Sincronización con WordPress exitosa');
      } catch (error) {
        console.error('❌ Error sincronizando con WordPress:', error.message);
      }
    }

    // Servir la aplicación React
    return res.sendFile(path.join(STATIC_DIR, 'index.html'));
  } catch (error) {
    console.error('❌ Error en onConnect:', error);
    return res.status(500).send('Error de conexión LTI');
  }
});

// Manejo de Deep Linking (opcional)
lti.onDeepLinking(async (token, req, res) => {
  console.log('🔗 Deep Linking request');
  return lti.redirect(res, '/deeplink', { newResource: true });
});

// Función para sincronizar con WordPress
async function syncWithWordPress(userInfo) {
  if (!WORDPRESS_URL || !WORDPRESS_USER || !WORDPRESS_PASSWORD) {
    throw new Error('Configuración de WordPress incompleta');
  }

  const axios = require('axios');
  const auth = Buffer.from(`${WORDPRESS_USER}:${WORDPRESS_PASSWORD}`).toString('base64');

  try {
    // Buscar o crear usuario en WordPress
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/users`, {
      headers: { 'Authorization': `Basic ${auth}` },
      params: { search: userInfo.email }
    });

    if (response.data.length === 0) {
      // Crear nuevo usuario
      await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/users`, {
        username: generateUsername(userInfo.email),
        email: userInfo.email,
        name: userInfo.name,
        password: generatePassword(),
        roles: mapLTIRoles(userInfo.roles)
      }, {
        headers: { 'Authorization': `Basic ${auth}` }
      });
      console.log('👤 Usuario creado en WordPress');
    } else {
      console.log('👤 Usuario existente en WordPress');
    }

    // Crear o actualizar curso si no existe
    if (userInfo.course) {
      await createOrUpdateCourse(userInfo.course, auth);
    }

  } catch (error) {
    console.error('Error en WordPress API:', error.response?.data || error.message);
    throw error;
  }
}

// Funciones auxiliares
function generateUsername(email) {
  return email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now().toString().slice(-4);
}

function generatePassword() {
  return Math.random().toString(36).slice(-12) + '!A1';
}

function mapLTIRoles(roles) {
  if (!roles || roles.length === 0) return ['subscriber'];
  
  for (const role of roles) {
    if (role.includes('Instructor')) return ['editor'];
    if (role.includes('Administrator')) return ['administrator'];
  }
  return ['subscriber'];
}

async function createOrUpdateCourse(courseInfo, auth) {
  const axios = require('axios');
  
  try {
    // Buscar curso existente
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/icn_course`, {
      headers: { 'Authorization': `Basic ${auth}` },
      params: { search: courseInfo.label }
    });

    if (response.data.length === 0) {
      // Crear nuevo curso
      await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/icn_course`, {
        title: courseInfo.title || courseInfo.label,
        content: `Curso: ${courseInfo.title || courseInfo.label}`,
        status: 'publish',
        meta: {
          lti_course_id: courseInfo.id,
          course_label: courseInfo.label,
          created_date: new Date().toISOString()
        }
      }, {
        headers: { 'Authorization': `Basic ${auth}` }
      });
      console.log('📚 Curso creado en WordPress');
    }
  } catch (error) {
    console.error('Error creando curso:', error.response?.data || error.message);
  }
}

// Rutas adicionales
lti.app.get('/api/user', (req, res) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  res.json(req.session.userInfo);
});

lti.app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    wordpress: WORDPRESS_URL ? 'configurado' : 'no configurado'
  });
});

// Inicializar servidor
const setup = async () => {
  try {
    // Desplegar LTI.js
    await lti.deploy({ port: PORT });

    // Registrar plataforma Blackboard
    await lti.registerPlatform({
      url: PLATFORM_URL,
      name: 'Blackboard Learn',
      clientId: CLIENT_ID,
      authenticationEndpoint: AUTH_ENDPOINT,
      accesstokenEndpoint: TOKEN_ENDPOINT,
      authConfig: { method: 'JWK_SET', key: JWKS_ENDPOINT }
    });

    console.log('🎉 Servidor LTI.js iniciado exitosamente');
    console.log(`🌐 Servidor corriendo en puerto ${PORT}`);
    console.log(`🔗 Login URL: http://localhost:${PORT}/login`);
    console.log(`🚀 Launch URL: http://localhost:${PORT}/`);
    console.log(`🔑 JWKS URL: http://localhost:${PORT}/keys`);
    
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
};

setup();