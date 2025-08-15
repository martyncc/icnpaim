# 🔍 CHECKLIST DE DEBUGGING PARA LTI

## 1. ✅ VERIFICAR VARIABLES DE ENTORNO

Asegúrate de que estas variables estén configuradas en Railway:

```bash
# URLs de Blackboard (CRÍTICAS)
LTI_PLATFORM_ISS=https://udla-staging.blackboard.com/learn
LTI_PLATFORM_JWKS=https://udla-staging.blackboard.com/learn/api/public/v1/oidc/jwks  
LTI_PLATFORM_OIDC_AUTH=https://udla-staging.blackboard.com/learn/api/public/v1/oidc/authorize

# Tu dominio Railway
BASE_HOST=tu-app.up.railway.app
```

## 2. 🔧 VERIFICAR CONFIGURACIÓN EN BLACKBOARD

En Blackboard Admin → LTI Tool Providers, verifica:

- **Login URL:** `https://tu-app.up.railway.app/lti/login`
- **Launch URL:** `https://tu-app.up.railway.app/lti/launch`  
- **JWKS URL:** `https://tu-app.up.railway.app/.well-known/jwks.json`
- **Client ID:** `89ef5212-b589-4f9c-b5b8-2fa6ad3e2006`
- **Deployment ID:** `2b286722-4ef6-4dda-a756-eec5dca12441`

## 3. 📊 ENDPOINTS DE DEBUGGING

### Health Check
```
GET https://tu-app.up.railway.app/lti/health
```

### Página Principal (info completa)
```
GET https://tu-app.up.railway.app/
```

### JWKS (debe devolver JSON)
```
GET https://tu-app.up.railway.app/.well-known/jwks.json
```

## 4. 🚨 POSIBLES PROBLEMAS

### A) Error "Use POST from the LMS"
- **Causa:** Blackboard está haciendo GET en lugar de POST
- **Solución:** Verificar URLs en configuración Blackboard

### B) Variables de entorno faltantes
- **Síntoma:** Error "LTI_PLATFORM_OIDC_AUTH not configured"
- **Solución:** Agregar todas las variables LTI_PLATFORM_*

### C) CORS/CSP Issues
- **Síntoma:** Requests bloqueados en iframe
- **Solución:** Ya configurado en el código

### D) Session Issues
- **Síntoma:** State mismatch
- **Solución:** Verificar configuración de cookies

## 5. 📝 LOGS A REVISAR

En Railway logs, busca:

```
[LTI] POST /lti/login - Headers: ...
[LTI] POST /lti/login - Body: ...
[LTI Service] Building auth URL with: ...
[LTI Service] Generated auth URL: ...
```

## 6. 🧪 TESTING MANUAL

### Test 1: Health Check
```bash
curl https://tu-app.up.railway.app/lti/health
```

### Test 2: JWKS
```bash
curl https://tu-app.up.railway.app/.well-known/jwks.json
```

### Test 3: Simular POST Login (desde terminal)
```bash
curl -X POST https://tu-app.up.railway.app/lti/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "iss=https://udla-staging.blackboard.com/learn&login_hint=test&client_id=89ef5212-b589-4f9c-b5b8-2fa6ad3e2006"
```

## 7. 🔄 PASOS DE RESOLUCIÓN

1. **Verificar health check** → debe mostrar todas las URLs
2. **Revisar logs de Railway** → buscar errores específicos  
3. **Verificar configuración Blackboard** → URLs exactas
4. **Probar desde Blackboard** → ver logs en tiempo real
5. **Si persiste:** revisar variables de entorno una por una

## 8. 📞 CONTACTO CON BLACKBOARD ADMIN

Si el problema persiste, proporciona al admin de Blackboard:

- **Tool Provider Name:** ICN PAIM
- **Login URL:** `https://tu-app.up.railway.app/lti/login`
- **Launch URL:** `https://tu-app.up.railway.app/lti/launch`
- **JWKS URL:** `https://tu-app.up.railway.app/.well-known/jwks.json`
- **Client ID:** `89ef5212-b589-4f9c-b5b8-2fa6ad3e2006`
- **Deployment ID:** `2b286722-4ef6-4dda-a756-eec5dca12441`