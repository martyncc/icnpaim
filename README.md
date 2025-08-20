# ICN PAIM - Aplicación React LTI.js

Una aplicación web moderna que integra React con LTI.js para conectarse con WordPress y crear experiencias de aprendizaje personalizadas.

## 🚀 Características

- ✅ **Integración LTI 1.3** completa con Blackboard Learn
- ✅ **Aplicación React** moderna y responsive
- ✅ **Sincronización automática** con WordPress
- ✅ **Dashboard interactivo** para estudiantes
- ✅ **Sistema de progreso** en tiempo real
- ✅ **Contenido multimedia** (videos, quizzes, textos)
- ✅ **Diseño responsive** para móviles y desktop

## 📋 Requisitos Previos

- Node.js 16+ 
- MongoDB (local o en la nube)
- WordPress con API REST habilitada
- Acceso a Blackboard Learn para configurar LTI

## 🔧 Instalación

1. **Clonar el repositorio**
```bash
git clone <tu-repositorio>
cd icn-paim-ltijs
```

2. **Instalar dependencias**
```bash
npm install
cd client && npm install && cd ..
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

4. **Iniciar en desarrollo**
```bash
npm run dev
```

## ⚙️ Configuración

### Variables de Entorno

Copia `.env.example` a `.env` y configura:

```env
# Servidor
NODE_ENV=development
PORT=3333

# MongoDB
MONGO_URL=mongodb://localhost:27017/ltijs

# LTI
LTI_KEY=tu_clave_secreta
CLIENT_ID=48dd70cc-ab62-4fbd-ba91-d3d984644373

# Blackboard
PLATFORM_URL=https://blackboard.com
AUTH_ENDPOINT=https://tu-blackboard.com/learn/api/public/v1/oidc/authorize
TOKEN_ENDPOINT=https://tu-blackboard.com/learn/api/public/v1/oidc/token
JWKS_ENDPOINT=https://tu-blackboard.com/learn/api/public/v1/oidc/jwks

# WordPress
WORDPRESS_URL=https://tudominio.com
WORDPRESS_USER=tu_usuario
WORDPRESS_PASSWORD=tu_password_aplicacion
```

### Configuración en Blackboard

1. Ve a **Admin Panel → LTI Tool Providers**
2. Registra una nueva herramienta con:
   - **Login URL**: `https://tu-dominio.com/login`
   - **Launch URL**: `https://tu-dominio.com/`
   - **JWKS URL**: `https://tu-dominio.com/keys`
   - **Client ID**: El que configuraste en `.env`

### Configuración en WordPress

1. Instala el plugin incluido en `functions.php`
2. Crea un usuario de aplicación para la API REST
3. Habilita los Custom Post Types necesarios

## 🏗️ Estructura del Proyecto

```
/
├── server/
│   └── index.js          # Servidor LTI.js principal
├── client/
│   ├── src/
│   │   ├── components/   # Componentes React
│   │   ├── App.js        # Aplicación principal
│   │   └── index.js      # Punto de entrada
│   └── package.json      # Dependencias del cliente
├── functions.php         # Plugin WordPress
├── package.json          # Dependencias del servidor
└── README.md
```

## 🎯 Uso

### Para Estudiantes

1. Accede desde tu curso en Blackboard
2. Serás redirigido automáticamente al dashboard
3. Navega por las unidades disponibles
4. Completa el contenido a tu ritmo
5. Tu progreso se guarda automáticamente

### Para Instructores

1. Accede desde Blackboard con rol de instructor
2. Ve el dashboard administrativo
3. Gestiona cursos y estudiantes
4. Revisa reportes de progreso

## 🔌 API Endpoints

- `GET /api/user` - Información del usuario autenticado
- `GET /api/health` - Estado del servidor
- `POST /login` - Endpoint de login LTI
- `GET /keys` - Claves públicas JWKS

## 🚀 Despliegue

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm run build
npm start
```

### Docker (opcional)
```bash
docker build -t icn-paim .
docker run -p 3333:3333 icn-paim
```

## 🔧 Personalización

### Agregar Nuevos Tipos de Contenido

1. Edita `client/src/components/UnitView.js`
2. Agrega el nuevo tipo en `renderSection()`
3. Crea el componente correspondiente

### Modificar el Dashboard

1. Edita `client/src/components/Dashboard.js`
2. Personaliza las estadísticas y layout
3. Agrega nuevas funcionalidades

### Integrar con Otros LMS

1. Modifica `server/index.js`
2. Ajusta los endpoints de la plataforma
3. Actualiza la configuración LTI

## 🐛 Solución de Problemas

### Error de Conexión LTI
- Verifica las URLs en Blackboard
- Revisa los logs del servidor
- Confirma que MongoDB esté corriendo

### Error de WordPress
- Verifica las credenciales de API
- Confirma que el plugin esté activo
- Revisa los permisos de usuario

### Error de Build
- Limpia node_modules: `rm -rf node_modules && npm install`
- Verifica las versiones de Node.js
- Revisa los logs de build

## 📚 Documentación Adicional

- [LTI.js Documentation](https://cvmcosta.me/ltijs/)
- [WordPress REST API](https://developer.wordpress.org/rest-api/)
- [React Documentation](https://reactjs.org/docs/)

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles.

## 📞 Soporte

Para soporte técnico:
- Crea un issue en GitHub
- Contacta al equipo de desarrollo
- Revisa la documentación

---

**ICN PAIM** - Plataforma de Aprendizaje Inteligente y Medición