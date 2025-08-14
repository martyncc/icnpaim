// server/services/ltiService.js
const crypto = require('crypto');

// Endpoints de la plataforma (Blackboard) por ENV
const PLATFORM_ISS  = process.env.LTI_PLATFORM_ISS;          // ej: https://<bb>/learn
const PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS;         // ej: https://<bb>/learn/api/public/v1/oidc/jwks
const OIDC_AUTH     = process.env.LTI_PLATFORM_OIDC_AUTH;    // ej: https://<bb>/learn/api/public/v1/oidc/authorize

if (!PLATFORM_ISS || !PLATFORM_JWKS || !OIDC_AUTH) {
  console.warn('[LTI] Falta LTI_PLATFORM_ISS / LTI_PLATFORM_JWKS / LTI_PLATFORM_OIDC_AUTH en variables de entorno.');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function buildAuthUrl({ login_hint, lti_message_hint, target_link_uri, state, nonce, client_id }) {
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

  return `${OIDC_AUTH}?${params.toString()}`;
}

// jose v5 es ESM → import dinámico para convivir con CommonJS
async function verifyIdToken(idToken, { clientId, issuer = PLATFORM_ISS, jwksUri = PLATFORM_JWKS }) {
  if (!jwksUri) throw new Error('Missing jwksUri');
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const JWKS = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(idToken, JWKS, { issuer, audience: clientId });
  return payload;
}

// Si tu herramienta no firma tokens para la plataforma, puedes dejar esto vacío
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
