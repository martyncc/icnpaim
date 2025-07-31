# 🔧 CONFIGURACIÓN CPANEL PARA ICN PAIM

## 📋 PASOS NECESARIOS EN CPANEL:

### 1. **Habilitar Node.js App**
- Ve a "Node.js Apps" en cPanel
- Crear nueva aplicación:
  - **Versión Node.js**: 18.x
  - **Directorio**: `/lti` (o `/icnpaim`)
  - **Archivo de inicio**: `server/index.js`
  - **Puerto**: 3333

### 2. **Configurar Variables de Entorno**
En la configuración de Node.js App, agregar:
```
WORDPRESS_URL=https://tudominio.com
WORDPRESS_API_USER=tu_usuario_wp
WORDPRESS_API_PASSWORD=tu_password_wp
SESSION_SECRET=tu_session_secret_super_seguro
NODE_ENV=production
PORT=3333
```

### 3. **Configurar Proxy Reverso**
En "Apache Configuration" o similar:
```apache
ProxyPass /lti/ http://localhost:3333/lti/
ProxyPassReverse /lti/ http://localhost:3333/lti/
ProxyPass /api/ http://localhost:3333/api/
ProxyPassReverse /api/ http://localhost:3333/api/
ProxyPass /.well-known/jwks.json http://localhost:3333/.well-known/jwks.json
ProxyPassReverse /.well-known/jwks.json http://localhost:3333/.well-known/jwks.json
```

### 4. **Permisos de Firewall**
- Asegurar que el puerto 3333 esté abierto internamente
- Configurar reglas de iptables si es necesario

## ⚠️ LIMITACIONES DE CPANEL:
- Muchos proveedores bloquean aplicaciones Node.js
- Proxy reverso puede no estar disponible
- Recursos limitados para aplicaciones persistentes