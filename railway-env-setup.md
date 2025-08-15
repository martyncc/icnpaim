# 🚀 Configuración de Variables de Entorno en Railway

## 📋 Variables Requeridas para ICN PAIM

Copia y pega estas variables en Railway Dashboard → Variables:

```bash
# Configuración básica
NODE_ENV=production
PORT=3333
BASE_HOST=tu-app.up.railway.app
SESSION_SECRET=tu_session_secret_super_seguro_aqui

# Configuración LTI 1.3 (CRÍTICAS)
LTI_CLIENT_ID=48dd70cc-ab62-4fbd-ba91-d3d984644373
LTI_DEPLOYMENT_ID=2b286722-4ef6-4dda-a756-eec5dca12441
LTI_REDIRECT_URI=https://tu-app.up.railway.app/lti/launch

# URLs de Blackboard (REQUERIDAS)
LTI_PLATFORM_ISS=https://blackboard.com
LTI_PLATFORM_JWKS=https://udla-staging.blackboard.com/learn/api/public/v1/oidc/jwks
LTI_PLATFORM_OIDC_AUTH=https://udla-staging.blackboard.com/learn/api/public/v1/oidc/authorize

# Integración WordPress (OPCIONAL)
WORDPRESS_URL=https://tudominio.com
WORDPRESS_API_USER=tu_usuario_wp
WORDPRESS_API_PASSWORD=tu_password_wp_application
```

## 🔧 Pasos para Configurar en Railway

1. **Ve a tu proyecto en Railway**
2. **Click en "Variables" tab**
3. **Agrega cada variable una por una:**
   - Name: `LTI_CLIENT_ID`
   - Value: `48dd70cc-ab62-4fbd-ba91-d3d984644373`
   - Click "Add"
4. **Repite para todas las variables**
5. **Redeploy automático** se ejecutará

## ✅ Verificación

Después de configurar, visita:
- `https://tu-app.up.railway.app/lti/health`

Deberías ver todas las variables como `true` en `environment_variables`.

## 🚨 Variables Más Críticas

Si tienes tiempo limitado, configura al menos estas:

```bash
LTI_CLIENT_ID=48dd70cc-ab62-4fbd-ba91-d3d984644373
LTI_DEPLOYMENT_ID=2b286722-4ef6-4dda-a756-eec5dca12441
LTI_PLATFORM_ISS=https://blackboard.com
LTI_PLATFORM_JWKS=https://udla-staging.blackboard.com/learn/api/public/v1/oidc/jwks
LTI_PLATFORM_OIDC_AUTH=https://udla-staging.blackboard.com/learn/api/public/v1/oidc/authorize
```

## 🔍 Debugging

Si algo falla, el error ahora mostrará:
- ✅ Qué variables están configuradas
- ✅ Valores actuales (sin mostrar secretos)
- ✅ Request details completos