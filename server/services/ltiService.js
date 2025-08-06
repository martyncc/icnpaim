const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');

class LTIService {
  constructor() {
    // Configuración según Developer Portal de Blackboard
    this.clientId = '48dd70cc-ab62-4fbd-ba91-d3d984644373';
    this.deploymentId = '2b286722-4ef6-4dda-a756-eec5dca12441';
    
    // URLs oficiales según documentación
    this.oidcAuthUrl = 'https://udla-staging.blackboard.com/learn/api/public/v1/oauth2/authorize';
    this.platformTokenUrl = 'https://udla-staging.blackboard.com/learn/api/public/v1/oauth2/token';
    this.platformJwksUrl = 'https://udla-staging.blackboard.com/learn/api/public/v1/oauth2/jwks';
    this.issuer = 'https://blackboard.com';
    this.baseUrl = 'https://icnpaim.cl';
    
    // Generar par de llaves para firmar tokens
    this.keyPair = this.generateKeyPair();
  }

  /**
   * Generar state aleatorio para seguridad
   */
  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generar nonce aleatorio para seguridad
   */
  generateNonce() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generar par de llaves RSA para JWT
   */
  generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }

  /**
   * Obtener JWKS para Blackboard
   */
  getJWKS() {
    // Convertir clave pública a JWK format
    const publicKey = crypto.createPublicKey(this.keyPair.publicKey);
    const jwk = publicKey.export({ format: 'jwk' });
    
    return {
      keys: [{
        ...jwk,
        kid: 'icnpaim-key-1',
        alg: 'RS256',
        use: 'sig'
      }]
    };
  }

  /**
   * Construir URL de autorización según documentación oficial
   */
  buildAuthUrl({ login_hint, lti_message_hint, target_link_uri, state, nonce, client_id }) {
    // Según documentación: usar OIDC Authentication Request URI del Developer Portal
    const redirectUri = target_link_uri || `${this.baseUrl}/lti/launch`;
    
    const authParams = new URLSearchParams({
      response_type: 'id_token',
      scope: 'openid',
      login_hint: login_hint,
      lti_message_hint: lti_message_hint || '',
      state: state,
      redirect_uri: encodeURIComponent(redirectUri), // DEBE estar encoded
      client_id: client_id || this.clientId,
      nonce: nonce,
    });

    return `${this.oidcAuthUrl}?${authParams.toString()}`;
  }

  /**
   * Validar token JWT de Blackboard
   */
  async validateToken(idToken) {
    try {
      // Decodificar el header para obtener el kid
      const header = jwt.decode(idToken, { complete: true })?.header;
      if (!header || !header.kid) {
        throw new Error('Invalid token header');
      }

      // Obtener las claves públicas de Blackboard
      const jwks = await this.getJWKS();
      const key = jwks.keys.find(k => k.kid === header.kid);
      
      if (!key) {
        throw new Error('Key not found in JWKS');
      }

      // Convertir JWK a PEM
      const publicKey = this.jwkToPem(key);

      // Verificar y decodificar el token
      const decoded = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        audience: this.clientId,
        issuer: 'https://udla-staging.blackboard.com'
      });

      return decoded;
    } catch (error) {
      console.error('Token validation error:', error);
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Obtener JWKS de Blackboard
   */
  async getJWKS() {
    try {
      const response = await axios.get(this.platformJwksUrl, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error('JWKS fetch error:', error);
      throw new Error('Failed to fetch JWKS');
    }
  }

  /**
   * Convertir JWK a formato PEM
   */
  jwkToPem(jwk) {
    try {
      // Para RSA keys
      if (jwk.kty === 'RSA') {
        const n = Buffer.from(jwk.n, 'base64url');
        const e = Buffer.from(jwk.e, 'base64url');
        
        // Crear el ASN.1 structure para RSA public key
        const publicKeyDer = this.createRSAPublicKeyDER(n, e);
        const publicKeyPem = this.derToPem(publicKeyDer, 'PUBLIC KEY');
        
        return publicKeyPem;
      }
      
      throw new Error('Unsupported key type');
    } catch (error) {
      console.error('JWK to PEM conversion error:', error);
      throw new Error('Failed to convert JWK to PEM');
    }
  }

  /**
   * Crear DER encoding para RSA public key
   */
  createRSAPublicKeyDER(n, e) {
    // Simplified DER encoding - en producción usar una librería como node-jose
    const nLength = n.length;
    const eLength = e.length;
    
    // Esta es una implementación simplificada
    // En producción, usar node-jose o similar
    const der = Buffer.concat([
      Buffer.from([0x30]), // SEQUENCE
      Buffer.from([0x82]), // Length (long form)
      Buffer.from([(nLength + eLength + 20) >> 8, (nLength + eLength + 20) & 0xff]),
      Buffer.from([0x30, 0x0d]), // SEQUENCE
      Buffer.from([0x06, 0x09]), // OID
      Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]), // RSA OID
      Buffer.from([0x05, 0x00]), // NULL
      Buffer.from([0x03, 0x82]), // BIT STRING
      Buffer.from([(nLength + eLength + 10) >> 8, (nLength + eLength + 10) & 0xff]),
      Buffer.from([0x00]), // unused bits
      Buffer.from([0x30, 0x82]), // SEQUENCE
      Buffer.from([(nLength + eLength + 4) >> 8, (nLength + eLength + 4) & 0xff]),
      Buffer.from([0x02, 0x82]), // INTEGER (n)
      Buffer.from([nLength >> 8, nLength & 0xff]),
      n,
      Buffer.from([0x02]), // INTEGER (e)
      Buffer.from([eLength]),
      e
    ]);
    
    return der;
  }

  /**
   * Convertir DER a PEM
   */
  derToPem(der, type) {
    const base64 = der.toString('base64');
    const lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----\n`;
  }
}

module.exports = new LTIService();