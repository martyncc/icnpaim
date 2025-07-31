# 📁 ESTRUCTURA COMPLETA DEL PROYECTO ICN PAIM

## 🎯 **PROPÓSITO GENERAL**
Plataforma LTI 1.3 que conecta Blackboard con WordPress para crear caminos de aprendizaje personalizados.

---

## 📂 **ESTRUCTURA DE ARCHIVOS**

```
/
├── package.json                 # Configuración principal del proyecto
├── .env                        # Variables de entorno (SECRETO)
├── functions.php               # Plugin WordPress para CPTs
├── README.md                   # Documentación del proyecto
├── 
├── server/                     # 🖥️ BACKEND NODE.JS
│   ├── index.js               # ⭐ SERVIDOR PRINCIPAL
│   └── services/              # Servicios modulares
│       ├── ltiService.js      # Manejo de LTI 1.3
│       ├── wordpressService.js # Integración con WordPress
│       └── courseService.js   # Gestión de cursos y progreso
│
└── client/                    # 🎨 FRONTEND REACT
    ├── package.json          # Dependencias del frontend
    ├── tailwind.config.js    # Configuración de Tailwind CSS
    ├── public/
    │   └── index.html        # HTML base de React
    └── src/
        ├── index.js          # Punto de entrada React
        ├── App.js            # Componente principal
        ├── App.css           # Estilos principales
        ├── index.css         # Estilos globales con Tailwind
        └── components/       # Componentes React
            ├── StudentDashboard.js  # Dashboard del estudiante
            ├── AdminDashboard.js    # Dashboard del admin
            └── UnitView.js          # Vista de unidades
```

---

## 🔧 **FUNCIÓN DE CADA ARCHIVO CLAVE**

### 📋 **package.json (RAÍZ)**
```json
{
  "main": "server/index.js",
  "scripts": {
    "dev": "concurrently \"npm run server\" \"npm run client\"",
    "server": "nodemon server/index.js",
    "client": "cd client && npm start",
    "build": "cd client && npm run build",
    "start": "node server/index.js"  ← ESTE ES EL QUE EJECUTAS
  }
}
```
**FUNCIÓN**: Define scripts y dependencias. El script `start` ejecuta el servidor principal.

---

### ⭐ **server/index.js (SERVIDOR PRINCIPAL)**
**FUNCIÓN**: Servidor Express que maneja TODA la aplicación
**RESPONSABILIDADES**:
- ✅ Recibe peticiones LTI de Blackboard
- ✅ Maneja autenticación y autorización
- ✅ Sirve API REST para el frontend
- ✅ Integra con WordPress
- ✅ Gestiona sesiones de usuario

**RUTAS PRINCIPALES**:
```javascript
POST /lti/login          // Login inicial desde Blackboard
POST /lti/launch         // Launch después de autenticación
GET  /.well-known/jwks.json  // Claves públicas para Blackboard
GET  /lti/health         // Estado del servidor
GET  /api/user           // Info del usuario autenticado
GET  /api/student/units  // Unidades del estudiante
POST /api/progress/update // Actualizar progreso
```

---

### 🔐 **server/services/ltiService.js**
**FUNCIÓN**: Maneja toda la lógica LTI 1.3
**RESPONSABILIDADES**:
- ✅ Genera y valida tokens JWT
- ✅ Maneja el flujo de autenticación con Blackboard
- ✅ Gestiona claves criptográficas (JWKS)
- ✅ Valida parámetros de seguridad (state, nonce)

---

### 🔗 **server/services/wordpressService.js**
**FUNCIÓN**: Integración con WordPress via API REST
**RESPONSABILIDADES**:
- ✅ Registra/actualiza usuarios desde LTI
- ✅ Crea y gestiona Custom Post Types
- ✅ Maneja metadatos de posts
- ✅ Autenticación con WordPress

---

### 📚 **server/services/courseService.js**
**FUNCIÓN**: Lógica de negocio para cursos y progreso
**RESPONSABILIDADES**:
- ✅ Crea cursos automáticamente desde Blackboard
- ✅ Genera unidades de ejemplo
- ✅ Gestiona progreso del estudiante
- ✅ Maneja caminos de aprendizaje

---

### 🎨 **client/src/App.js**
**FUNCIÓN**: Aplicación React principal
**RESPONSABILIDADES**:
- ✅ Enrutamiento entre dashboards
- ✅ Componente raíz de la SPA
- ✅ Maneja navegación entre vistas

---

### 📊 **client/src/components/StudentDashboard.js**
**FUNCIÓN**: Dashboard principal para estudiantes
**RESPONSABILIDADES**:
- ✅ Muestra progreso general
- ✅ Lista unidades disponibles/bloqueadas
- ✅ Permite iniciar/continuar unidades
- ✅ Interfaz responsive y atractiva

---

### 🛠️ **functions.php (WORDPRESS)**
**FUNCIÓN**: Plugin WordPress para ICN PAIM
**RESPONSABILIDADES**:
- ✅ Registra Custom Post Types (cursos, unidades, estudiantes, etc.)
- ✅ Habilita CORS para API REST
- ✅ Agrega campos personalizados a la API
- ✅ Crea menús de administración

---

## 🚨 **DIAGNÓSTICO DEL ERROR 503**

El error 503 puede ser por:

1. **Puerto ocupado**: El servidor intenta usar puerto 3333 pero está ocupado
2. **Dependencias faltantes**: `npm install` no ejecutado en server/
3. **Variables de entorno**: Archivo .env mal configurado
4. **Permisos**: Node.js no puede escribir logs o archivos temporales
5. **Memoria**: Servidor sin recursos suficientes

---

## 🔍 **COMANDOS DE DIAGNÓSTICO**

```bash
# Ver si el puerto está ocupado
netstat -tlnp | grep 3333

# Ver procesos Node.js
ps aux | grep node

# Ver logs del servidor (si los hay)
tail -f /path/to/logs

# Verificar dependencias
cd server && npm list

# Probar manualmente
cd server && node index.js
```

---

## 🎯 **FLUJO COMPLETO DE LA APLICACIÓN**

1. **Estudiante hace clic en Blackboard** → POST a `/lti/login`
2. **Servidor valida y redirige** → Blackboard autentica
3. **Blackboard envía token** → POST a `/lti/launch`
4. **Servidor valida token** → Crea/actualiza usuario en WordPress
5. **Redirige a dashboard** → `/student-dashboard`
6. **React carga dashboard** → Llama a APIs (`/api/user`, `/api/student/units`)
7. **Servidor consulta WordPress** → Devuelve datos
8. **Dashboard muestra contenido** → Estudiante interactúa

---

## 📝 **ARCHIVOS A REVISAR PARA DEBUGGING**

1. **server/index.js** - ¿Se ejecuta sin errores?
2. **.env** - ¿Están todas las variables?
3. **package.json** - ¿Script start correcto?
4. **server/services/ltiService.js** - ¿Client ID correcto?
5. **Logs del servidor** - ¿Qué error específico muestra?