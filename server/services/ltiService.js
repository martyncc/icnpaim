// server/services/ltiService.jss
const crypto = require('crypto');
const { createRemoteJWKSet, jwtVerify } = require('jose'); // v5

// Endpoints de la PLATAFORMA (Blackboard) desde variables de entorno
const PLATFORM_ISS  = process.env.LTI_PLATFORM_ISS;          // ej: https://blackboard.example.com/learn
const PLATFORM_JWKS = process.env.LTI_PLATFORM_JWKS;         // ej: https://.../oidc/jwks
const OIDC_AUTH     = process.env.LTI_PLATFORM_OIDC_AUTH;    // ej: https://.../oidc/authorize

if (!PLATFORM_ISS || !PLATFORM_JWKS || !OIDC_AUTH) {
  console.warn('[LTI] Falta configurar LTI_PLATFORM_ISS / LTI_PLATFORM_JWKS / LTI_PLATFORM_OIDC_AUTH en variables de entorno.');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

// Construye URL de autorización OIDC para iniciar el launch (login-init)
function buildAuthUrl({ login_hint, lti_message_hint, target_link_uri, state, nonce, client_id }) {
  const params = new URLSearchParams({
    response_type: 'id_token',
    response_mode: 'form_post',
    scope: 'openid',
    prompt: 'none',
    client_id,
    redirect_uri: target_link_uri, // nuestro /lti/launch
    state,
    nonce,
    login_hint
  });

  if (lti_message_hint) params.set('lti_message_hint', lti_message_hint);

  // Blackboard suele requerirlo explícito:
  params.set('target_link_uri', target_link_uri);

  return `${OIDC_AUTH}?${params.toString()}`;
}

// Verifica el id_token devuelto por la plataforma en /lti/launch
async function verifyIdToken(idToken, { clientId, issuer = PLATFORM_ISS, jwksUri = PLATFORM_JWKS }) {
  if (!jwksUri) throw new Error('Missing jwksUri');
  const JWKS = createRemoteJWKSet(new URL(jwksUri));
  const { payload, protectedHeader } = await jwtVerify(idToken, JWKS, {
    issuer,
    audience: clientId
  });

  // Validaciones mínimas de OIDC ya están en jwtVerify (iss, aud, exp, nbf).
  // La validación de 'nonce' la haces en server comparando con la sesión.

  // Revisa que traiga los claims LTI esperables (no lanzamos error aquí;
  // el server hace el check duro y responde 400 si algo no cuadra).
  if (!payload['https://purl.imsglobal.org/spec/lti/claim/message_type']) {
    console.warn('[LTI] id_token sin message_type LTI');
  }

  return payload;
}

// Si tu herramienta no emite sus propios JWTs, no necesitas publicar JWKS.
// Devolvemos un set vacío para no romper el endpoint.
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
