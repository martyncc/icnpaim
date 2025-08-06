# 🚀 DESPLIEGUE EN RAILWAY - ICN PAIM

## 📋 PASOS PARA DESPLEGAR:

### 1. **Preparar el Repositorio**
```bash
# Si no tienes Git inicializado
git init
git add .
git commit -m "Initial commit - ICN PAIM LTI Tool"

# Crear repositorio en GitHub
# Subir código
git remote add origin https://github.com/tu-usuario/icn-paim.git
git push -u origin main
```

### 2. **Crear Cuenta en Railway**
- Ve a: https://railway.app
- Regístrate con GitHub
- Conecta tu repositorio

### 3. **Configurar Variables de Entorno en Railway**
En el dashboard de Railway, ve a Variables y agrega:

```env
NODE_ENV=production
PORT=3333
SESSION_SECRET=tu_session_secret_super_seguro_aqui
WORDPRESS_URL=https://tudominio.com
WORDPRESS_API_USER=tu_usuario_wp
WORDPRESS_API_PASSWORD=tu_password_wp_application
```

### 4. **Configurar el Dominio**
Railway te dará un dominio como: `https://icnpaim-production.up.railway.app`

### 5. **Actualizar URLs en Blackboard**
Cambia las URLs en la configuración LTI de Blackboard:

- **Login URL**: `https://tu-app.up.railway.app/lti/login`
- **Launch URL**: `https://tu-app.up.railway.app/lti/launch`  
- **JWKS URL**: `https://tu-app.up.railway.app/.well-known/jwks.json`

## ✅ **VENTAJAS DE RAILWAY:**

- ✅ **Despliegue automático** desde Git
- ✅ **HTTPS automático** con certificados SSL
- ✅ **Logs en tiempo real** para debugging
- ✅ **Variables de entorno** fáciles de configurar
- ✅ **Escalado automático** según demanda
- ✅ **Rollback fácil** a versiones anteriores
- ✅ **Monitoreo integrado** de performance

## 🔧 **COMANDOS ÚTILES:**

```bash
# Ver logs en tiempo real
railway logs

# Conectar a la base de datos (si usas Railway DB)
railway connect

# Ejecutar comandos en el servidor
railway run node --version

# Redeploy manual
railway up
```

## 📊 **MONITOREO:**

Railway te proporciona:
- 📈 Métricas de CPU y memoria
- 📋 Logs estructurados
- 🚨 Alertas automáticas
- 📊 Analytics de requests

## 💰 **COSTOS:**

- **Hobby Plan**: $5/mes
- **Pro Plan**: $20/mes (para producción)
- Incluye: 512MB RAM, 1GB storage, bandwidth ilimitado

## 🎯 **DESPUÉS DEL DESPLIEGUE:**

1. **Probar health check**: `https://tu-app.up.railway.app/lti/health`
2. **Verificar JWKS**: `https://tu-app.up.railway.app/.well-known/jwks.json`
3. **Probar desde Blackboard** con las nuevas URLs
4. **Configurar dominio personalizado** (opcional): `icnpaim.tudominio.com`

¡Railway es mucho más confiable que cPanel para aplicaciones Node.js!