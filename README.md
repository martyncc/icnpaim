# 🚀 ICN PAIM - Plataforma de Aprendizaje Inteligente

## 📋 Descripción
Herramienta LTI 1.3 que conecta Blackboard Learn con WordPress para crear caminos de aprendizaje personalizados.

## 🏗️ Arquitectura
- **Backend**: Node.js + Express
- **Frontend**: React + Tailwind CSS
- **CMS**: WordPress (Custom Post Types)
- **Integración**: LTI 1.3 con Blackboard Learn

## 🔧 Configuración Local

### Prerrequisitos
- Node.js 16+
- npm o yarn
- WordPress con API REST habilitada

### Instalación
```bash
# Instalar dependencias del servidor
npm install

# Instalar dependencias del cliente
cd client && npm install && cd ..

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones

# Ejecutar en desarrollo
npm run dev
```

## 🚀 Despliegue en Railway

### Variables de Entorno Requeridas
```env
NODE_ENV=production
PORT=3333
SESSION_SECRET=tu_session_secret_super_seguro
WORDPRESS_URL=https://tudominio.com
WORDPRESS_API_USER=tu_usuario_wp
WORDPRESS_API_PASSWORD=tu_password_wp
```

### URLs para Blackboard
- **Login URL**: `https://tu-app.up.railway.app/lti/login`
- **Launch URL**: `https://tu-app.up.railway.app/lti/launch`
- **JWKS URL**: `https://tu-app.up.railway.app/.well-known/jwks.json`

### Credenciales LTI
- **Application Key**: `89ef5212-b589-4f9c-b5b8-2fa6ad3e2006`
- **Deployment ID**: `2b286722-4ef6-4dda-a756-eec5dca12441`

## 📊 Endpoints

### LTI
- `POST /lti/login` - Inicio de sesión LTI
- `POST /lti/launch` - Lanzamiento de la aplicación
- `GET /.well-known/jwks.json` - Claves públicas JWKS

### API
- `GET /api/user` - Información del usuario
- `GET /api/student/units` - Unidades del estudiante
- `POST /api/progress/update` - Actualizar progreso

### Diagnóstico
- `GET /lti/health` - Estado del servidor
- `GET /` - Página de bienvenida

## 🔐 Seguridad
- Validación JWT de tokens LTI
- Sesiones seguras con cookies
- CORS configurado para dominios autorizados
- Middleware de autenticación en rutas protegidas

## 📱 Características
- ✅ Responsive design
- ✅ Progreso en tiempo real
- ✅ Caminos de aprendizaje personalizados
- ✅ Contenido multimedia
- ✅ Sistema de desbloqueo de unidades
- ✅ Dashboards diferenciados por rol

## 🛠️ Desarrollo
```bash
# Servidor en desarrollo
npm run server

# Cliente en desarrollo
npm run client

# Ambos simultáneamente
npm run dev
```

## 📝 Licencia
MIT License - Ver archivo LICENSE para más detalles.