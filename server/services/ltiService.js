// server/services/ltiService.js - Servicio de debugging para LTI mejorado
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Endpoints de la plataforma (Blackboard)
const PLATFORM_ISS  = process.env.LTI_PLATFORM_ISS || 'https://udla-staging.blackboard.com';
const PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/jwks';
const OIDC_AUTH     = process.env.LTI_PLATFORM_OIDC_AUTH || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/authorize';
const TOKEN_URL     = process.env.LTI_PLATFORM_TOKEN_URL || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/token';
const CLIENT_ID     = process.env.LTI_CLIENT_ID;
const BASE_URL      = process.env.BASE_URL || 'https://lti.icnpaim.cl';

console.log('\n🔧 [LTI Service] Configuration loaded:');
console.log('- PLATFORM_ISS:', PLATFORM_ISS);
console.log('- PLATFORM_JWKS:', PLATFORM_JWKS);
console.log('- OIDC_AUTH:', OIDC_AUTH);
console.log('- TOKEN_URL:', TOKEN_URL);
console.log('- CLIENT_ID:', CLIENT_ID);
console.log('- BASE_URL:', BASE_URL);

// Función para debuggear requests LTI con más detalle
function debugLtiRequest(req, endpointName) {
  console.log(`\n🔍 [LTI Debug - ${endpointName}] ${new Date().toISOString()}`);
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('Path:', req.path);
  
  // Headers importantes para LTI
  const importantHeaders = [
    'content-type', 'user-agent', 'referer', 'origin', 
    'host', 'cookie', 'authorization'
  ];
  
  const headers = {};
  importantHeaders.forEach(header => {
    if (req.get(header)) {
      headers[header] = header === 'cookie' ? 
        req.get(header).substring(0, 100) + '...' : 
        req.get(header);
    }
  });
  
  console.log('Headers:', headers);
  
  if (req.method === 'GET') {
    console.log('Query params:', req.query);
  } else if (req.method === 'POST') {
    console.log('Body keys:', Object.keys(req.body || {}));
    
    // Debuggear parámetros LTI específicos
    if (req.body.login_hint) {
      console.log('login_hint:', req.body.login_hint);
    }
    if (req.body.lti_message_hint) {
      console.log('lti_message_hint:', req.body.lti_message_hint);
    }
    if (req.body.target_link_uri) {
      console.log('target_link_uri:', req.body.target_link_uri);
    }
    if (req.body.client_id) {
      console.log('client_id:', req.body.client_id);
    }
    if (req.body.id_token) {
      console.log('id_token (length):', req.body.id_token.length);
      // Decodificar header y payload del JWT sin verificar
      try {
        const tokenParts = req.body.id_token.split('.');
        if (tokenParts.length === 3) {
          const header = JSON.parse(Buffer.from(tokenParts[0], 'base64url').toString());
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString());
          
          console.log('Token header:', header);
          console.log('Token payload (claims):', {
            iss: payload.iss,
            aud: payload.aud,
            sub: payload.sub,
            exp: payload.exp,
            iat: payload.iat,
            nonce: payload.nonce,
            'https://purl.imsglobal.org/spec/lti/claim/message_type': payload['https://purl.imsglobal.org/spec/lti/claim/message_type'],
            'https://purl.imsglobal.org/spec/lti/claim/version': payload['https://purl.imsglobal.org/spec/lti/claim/version']
          });
        }
      } catch (e) {
        console.warn('Could not decode token:', e.message);
      }
    }
  }
  
  console.log('---'); // Separador
}

// Función para verificar configuración LTI completa
function checkLtiConfig() {
  const requiredVars = {
    'LTI_CLIENT_ID': CLIENT_ID,
    'LTI_PLATFORM_JWKS': PLATFORM_JWKS,
    'LTI_PLATFORM_OIDC_AUTH': OIDC_AUTH,
    'LTI_PLATFORM_TOKEN_URL': TOKEN_URL,
    'LTI_PLATFORM_ISS': PLATFORM_ISS
  };
  
  const missing = [];
  const config = {};
  
  Object.entries(requiredVars).forEach(([key, value]) => {
    if (!value) {
      missing.push(key);
    } else {
      config[key.toLowerCase().replace('lti_platform_', '').replace('lti_', '')] = value;
    }
  });

  // Verificar URLs
  const urlChecks = {};
  if (PLATFORM_JWKS) {
    urlChecks.jwks_accessible = isValidUrl(PLATFORM_JWKS);
  }
  if (OIDC_AUTH) {
    urlChecks.oidc_auth_accessible = isValidUrl(OIDC_AUTH);
  }
  if (TOKEN_URL) {
    urlChecks.token_url_accessible = isValidUrl(TOKEN_URL);
  }

  return {
    isValid: missing.length === 0,
    missing,
    config,
    urlChecks,
    recommendations: generateRecommendations(missing, config)
  };
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function generateRecommendations(missing, config) {
  const recommendations = [];
  
  if (missing.length > 0) {
    recommendations.push(`Faltan variables de entorno: ${missing.join(', ')}`);
  }
  
  if (config.client_id && !config.client_id.includes('blackboard')) {
    recommendations.push('El CLIENT_ID debería ser proporcionado por Blackboard');
  }
  
  if (config.jwks && !config.jwks.includes('jwks')) {
    recommendations.push('Verificar que la URL JWKS sea correcta');
  }
  
  return recommendations;
}

// Middleware mejorado para logging de LTI
function ltiLoggerMiddleware(req, res, next) {
  // Solo loggear rutas LTI importantes
  const ltiPaths = ['/login', '/launch', '/.well-known/jwks.json', '/'];
  
  if (ltiPaths.some(path => req.path === path || req.path.includes('/lti/'))) {
    debugLtiRequest(req, req.path.split('/').pop() || 'root');
  }
  next();
}

// Función para generar OIDC Authorization URL correcta
function generateOidcAuthUrl(loginParams) {
  console.log('\n🔗 [LTI Service] Generating OIDC Auth URL...');
  console.log('Login params received:', loginParams);
  
  const authParams = {
    response_type: 'id_token',
    response_mode: 'form_post',
    scope: 'openid',
    client_id: CLIENT_ID,
    redirect_uri: loginParams.target_link_uri || BASE_URL,
    login_hint: loginParams.login_hint,
    lti_message_hint: loginParams.lti_message_hint,
    nonce: crypto.randomBytes(16).toString('hex'),
    state: crypto.randomBytes(16).toString('hex'),
    prompt: 'none'
  };

  // Filtrar parámetros undefined
  Object.keys(authParams).forEach(key => {
    if (authParams[key] === undefined) {
      delete authParams[key];
    }
  });

  const authUrl = `${OIDC_AUTH}?${new URLSearchParams(authParams).toString()}`;
  
  console.log('Generated auth URL:', authUrl.substring(0, 200) + '...');
  console.log('Auth params:', authParams);
  
  return authUrl;
}

// Verificación manual de token mejorada
async function verifyIdToken(idToken, jwksUri = PLATFORM_JWKS) {
  console.log('\n🔐 [Token Verification] Starting...');
  
  try {
    // Primero decodificar sin verificar para debugging
    const decoded = jwt.decode(idToken, { complete: true });
    
    if (!decoded) {
      throw new Error('Token no se pudo decodificar');
    }
    
    console.log('Token header:', decoded.header);
    console.log('Token payload:', {
      iss: decoded.payload.iss,
      aud: decoded.payload.aud,
      sub: decoded.payload.sub,
      exp: new Date(decoded.payload.exp * 1000),
      iat: new Date(decoded.payload.iat * 1000),
      messageType: decoded.payload['https://purl.imsglobal.org/spec/lti/claim/message_type'],
      version: decoded.payload['https://purl.imsglobal.org/spec/lti/claim/version']
    });
    
    // Verificar claims básicos
    const now = Math.floor(Date.now() / 1000);
    if (decoded.payload.exp < now) {
      throw new Error(`Token expirado: ${new Date(decoded.payload.exp * 1000)}`);
    }
    
    if (decoded.payload.aud !== CLIENT_ID) {
      throw new Error(`Audience incorrecto: esperado ${CLIENT_ID}, recibido ${decoded.payload.aud}`);
    }
    
    if (decoded.payload.iss !== PLATFORM_ISS) {
      console.warn(`Issuer diferente: esperado ${PLATFORM_ISS}, recibido ${decoded.payload.iss}`);
    }
    
    console.log('✅ Token verification passed basic checks');
    
    return { 
      success: true, 
      payload: decoded.payload,
      header: decoded.header 
    };
    
  } catch (error) {
    console.error('❌ [Token Verification] Failed:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// Función para validar el estado de la configuración LTI
function validateLtiSetup() {
  const config = checkLtiConfig();
  
  console.log('\n🔍 [LTI Validation] Checking setup...');
  console.log('Config valid:', config.isValid);
  
  if (!config.isValid) {
    console.error('❌ Missing configuration:', config.missing);
    config.recommendations.forEach(rec => console.warn('⚠️', rec));
  } else {
    console.log('✅ LTI configuration appears valid');
  }
  
  return config;
}

// Función helper para testing
function createTestLtiRequest(overrides = {}) {
  return {
    login_hint: 'test-user-123',
    lti_message_hint: 'test-message-hint',
    target_link_uri: BASE_URL,
    client_id: CLIENT_ID,
    ...overrides
  };
}

module.exports = {
  debugLtiRequest,
  checkLtiConfig,
  ltiLoggerMiddleware,
  generateOidcAuthUrl,
  verifyIdToken,
  validateLtiSetup,
  createTestLtiRequest,
  
  // Constantes
  PLATFORM_ISS,
  PLATFORM_JWKS,
  OIDC_AUTH,
  TOKEN_URL,
  CLIENT_ID,
  BASE_URL
};