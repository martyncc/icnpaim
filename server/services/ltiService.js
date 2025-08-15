// server/services/ltiService.js
const crypto = require('crypto');

// Endpoints de la plataforma (Blackboard) con valores por defecto
const PLATFORM_ISS  = process.env.LTI_PLATFORM_ISS || 'https://blackboard.com';
const PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/jwks';
const OIDC_AUTH     = process.env.LTI_PLATFORM_OIDC_AUTH || 'https://udla-staging.blackboard.com/learn/api/public/v1/oidc/authorize';

console.log('[LTI Service] Configuration loaded:');
console.log('- PLATFORM_ISS:', PLATFORM_ISS);
console.log('- PLATFORM_JWKS:', PLATFORM_JWKS);
console.log('- OIDC_AUTH:', OIDC_AUTH);

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function buildAuthUrl({ login_hint, lti_message_hint, target_link_uri, state, nonce, client_id }) {
  console.log('[LTI Service] Building auth URL with:', {
    login_hint: !!login_hint,
    lti_message_hint: !!lti_message_hint,
    target_link_uri,
    state,
    nonce,
    client_id,
    oidc_auth: OIDC_AUTH
  });
  
  if (!OIDC_AUTH) {
    throw new Error('LTI_PLATFORM_OIDC_AUTH not configured');
  }
  
  const params = new URLSearchParams({
    response_type: 'id_token',
    response_mode: 'form_post',
    scope: 'openid',
    prompt: 'none',
    client_id,
    redirect_uri: target_link_uri,  // nuestro /lti/launch
    state,
    nonce,
    login_hint
  });
  if (lti_message_hint) params.set('lti_message_hint', lti_message_hint);
  // Blackboard suele exigirlo explícito:
  params.set('target_link_uri', target_link_uri);

  const authUrl = `${OIDC_AUTH}?${params.toString()}`;
  console.log('[LTI Service] Generated auth URL:', authUrl);
  return authUrl;
}

// jose v5 es ESM → import dinámico para convivir con CommonJS
async function verifyIdToken(idToken, { clientId, issuer = PLATFORM_ISS, jwksUri = PLATFORM_JWKS }) {
  if (!jwksUri) throw new Error('Missing jwksUri');
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const JWKS = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(idToken, JWKS, { issuer, audience: clientId });
  return payload;
}

// Si tu herramienta no firma tokens para la plataforma, puedes dejar esto vacío kie pero jie
function getJWKS() {
  return { keys: [] };
}

module.exports = {
  generateState,
  generateNonce,
  buildAuthUrl,
  verifyIdToken,
  getJWKS
};
