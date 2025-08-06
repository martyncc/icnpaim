# 🚀 GUÍA DE DESPLIEGUE - ICN PAIM

## 📋 PASOS PARA RAILWAY

### 1. Preparar Repositorio Git
```bash
# Inicializar Git (si no está inicializado)
git init

# Agregar todos los archivos
git add .

# Hacer commit inicial
git commit -m "Initial commit - ICN PAIM LTI Tool"
```

### 2. Crear Repositorio en GitHub
1. Ve a https://github.com
2. Clic en "New repository"
3. Nombre: `icn-paim` (o el que prefieras)
4. Descripción: "ICN PAIM - Plataforma de Aprendizaje LTI"
5. Público o Privado (tu elección)
6. NO inicializar con README (ya tienes uno)
7. Clic en "Create repository"

### 3. Conectar Repositorio Local con GitHub
```bash
# Agregar remote origin (reemplaza con tu URL)
git remote add origin https://github.com/TU_USUARIO/icn-paim.git

# Subir código
git branch -M main
git push -u origin main
```

### 4. Configurar Railway
1. Ve a https://railway.app
2. Clic en "Start a New Project"
3. Selecciona "Deploy from GitHub repo"
4. Autoriza Railway a acceder a GitHub
5. Selecciona tu repositorio `icn-paim`
6. Railway detectará automáticamente que es Node.js

### 5. Configurar Variables de Entorno en Railway
En el dashboard de Railway, ve a la pestaña "Variables" y agrega:

```env
NODE_ENV=production
SESSION_SECRET=mi_session_secret_super_seguro_2024
WORDPRESS_URL=https://tudominio.com
WORDPRESS_API_USER=tu_usuario_wp
WORDPRESS_API_PASSWORD=tu_password_aplicacion_wp
```

### 6. Obtener URL de Railway
Railway te asignará una URL como:
`https://icn-paim-production-abc123.up.railway.app`

### 7. Configurar en Blackboard
Actualiza la configuración LTI en Blackboard con:

- **Login URL**: `https://tu-app.up.railway.app/lti/login`
- **Launch URL**: `https://tu-app.up.railway.app/lti/launch`
- **JWKS URL**: `https://tu-app.up.railway.app/.well-known/jwks.json`

### 8. Verificar Despliegue
1. Visita: `https://tu-app.up.railway.app/lti/health`
2. Deberías ver JSON con status "OK"
3. Visita: `https://tu-app.up.railway.app/`
4. Deberías ver la página de bienvenida

### 9. Probar desde Blackboard
1. Ve a tu curso en Blackboard
2. Haz clic en el enlace LTI de ICN PAIM
3. Deberías ser redirigido correctamente

## 🔧 Comandos Útiles

### Git
```bash
# Ver estado
git status

# Agregar cambios
git add .

# Hacer commit
git commit -m "Descripción del cambio"

# Subir cambios
git push origin main
```

### Railway CLI (opcional)
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Ver logs
railway logs

# Conectar proyecto existente
railway link
```

## 🚨 Solución de Problemas

### Error de Build
- Verifica que `package.json` tenga los scripts correctos
- Asegúrate de que todas las dependencias estén en `package.json`

### Error 503
- Revisa los logs en Railway dashboard
- Verifica variables de entorno
- Confirma que el puerto sea correcto

### Error de CORS
- Verifica que el dominio esté en la lista de CORS
- Confirma configuración HTTPS

## 📊 Monitoreo
Railway proporciona:
- 📈 Métricas de CPU y memoria
- 📋 Logs en tiempo real
- 🚨 Alertas automáticas
- 📊 Analytics de requests

¡Tu aplicación estará lista en menos de 10 minutos! 🎉