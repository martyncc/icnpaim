// server/services/ltiService.js - Servicio de debugging para LTI
const crypto = require('crypto');

// Endpoints de la plataforma (Blackboard)
const PLATFORM_ISS  = process.env.LTI_PLATFORM_ISS || 'https://blackboard.com';
const PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/jwks';
const OIDC_AUTH     = process.env.LTI_PLATFORM_OIDC_AUTH || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/authorize';
const TOKEN_URL     = process.env.LTI_PLATFORM_TOKEN_URL || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/token';
const CLIENT_ID     = process.env.LTI_CLIENT_ID;

console.log('[LTI Service Debug] Configuration loaded:');
console.log('- PLATFORM_ISS:', PLATFORM_ISS);
console.log('- PLATFORM_JWKS:', PLATFORM_JWKS);
console.log('- OIDC_AUTH:', OIDC_AUTH);
console.log('- TOKEN_URL:', TOKEN_URL);
console.log('- CLIENT_ID:', CLIENT_ID);

// Función para debuggear requests LTI
function debugLtiRequest(req, endpointName) {
  console.log(`\n[LTI Debug - ${endpointName}]`);
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('Headers:', {
    'content-type': req.get('content-type'),
    'user-agent': req.get('user-agent'),
    referer: req.get('referer'),
    origin: req.get('origin'),
    host: req.get('host')
  });
  
  if (req.method === 'GET') {
    console.log('Query params:', req.query);
  } else if (req.method === 'POST') {
    console.log('Body keys:', Object.keys(req.body || {}));
    // No loguear valores sensibles completos
    if (req.body.id_token) {
      console.log('id_token (truncated):', req.body.id_token.substring(0, 50) + '...');
    }
  }
}

// Función para verificar configuración LTI
function checkLtiConfig() {
  const missing = [];
  if (!CLIENT_ID) missing.push('LTI_CLIENT_ID');
  if (!PLATFORM_JWKS) missing.push('LTI_PLATFORM_JWKS');
  if (!OIDC_AUTH) missing.push('LTI_PLATFORM_OIDC_AUTH');
  if (!TOKEN_URL) missing.push('LTI_PLATFORM_TOKEN_URL');

  return {
    isValid: missing.length === 0,
    missing,
    config: {
      clientId: CLIENT_ID,
      jwksUri: PLATFORM_JWKS,
      oidcAuth: OIDC_AUTH,
      tokenUrl: TOKEN_URL,
      issuer: PLATFORM_ISS
    }
  };
}

// Función para simular el flujo OIDC (solo para debugging)
function simulateOidcFlow(originalParams) {
  console.log('\n[LTI Service] Simulating OIDC Flow:');
  console.log('Original params:', originalParams);
  
  const simulatedParams = {
    response_type: 'id_token',
    response_mode: 'form_post',
    scope: 'openid',
    client_id: CLIENT_ID,
    redirect_uri: originalParams.target_link_uri,
    login_hint: originalParams.login_hint,
    lti_message_hint: originalParams.lti_message_hint,
    nonce: crypto.randomBytes(16).toString('hex'),
    state: crypto.randomBytes(16).toString('hex'),
    prompt: 'none'
  };

  const authUrl = `${OIDC_AUTH}?${new URLSearchParams(simulatedParams).toString()}`;
  
  console.log('Simulated auth URL:', authUrl);
  return authUrl;
}

// Middleware para logging de LTI
function ltiLoggerMiddleware(req, res, next) {
  if (req.path.includes('/lti/')) {
    debugLtiRequest(req, req.path.split('/').pop());
  }
  next();
}

// Verificación manual de token (solo para debugging avanzado)
async function manualTokenVerify(idToken, jwksUri = PLATFORM_JWKS) {
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const JWKS = createRemoteJWKSet(new URL(jwksUri));
    
    // Decodificar sin verificar primero para debugging
    const decoded = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
    console.log('[Token Debug] Decoded payload:', decoded);
    
    // Ahora verificar
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: PLATFORM_ISS,
      audience: CLIENT_ID
    });
    
    return { success: true, payload };
  } catch (error) {
    console.error('[Token Debug] Verification failed:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  debugLtiRequest,
  checkLtiConfig,
  simulateOidcFlow,
  ltiLoggerMiddleware,
  manualTokenVerify,
  PLATFORM_ISS,
  PLATFORM_JWKS,
  OIDC_AUTH,
  TOKEN_URL,
  CLIENT_ID
};