// utils/errorHandler.js
class ErrorHandler {
  static handleLTIError(error, req, res) {
    console.error('❌ LTI Error:', error);
    
    const errorMessages = {
      'PROVIDER_NOT_DEPLOYED': 'El proveedor LTI no está correctamente desplegado',
      'INVALID_TOKEN': 'Token LTI inválido o expirado',
      'PLATFORM_NOT_FOUND': 'Plataforma no registrada',
      'INVALID_SIGNATURE': 'Firma de seguridad inválida',
      'MISSING_CLAIMS': 'Faltan datos requeridos en el token LTI'
    };

    const userMessage = errorMessages[error.message] || 'Error de conexión LTI';
    
    return res.status(500).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error de Conexión - ICN PAIM</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .error-container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 2rem;
            max-width: 600px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          }
          .error-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
          }
          .error-title {
            color: #dc2626;
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
          }
          .error-message {
            color: #4a5568;
            margin-bottom: 2rem;
            line-height: 1.6;
          }
          .error-details {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem 0;
            font-family: monospace;
            font-size: 0.9rem;
            text-align: left;
            color: #2d3748;
          }
          .retry-button {
            background: linear-gradient(45deg, #4c51bf, #667eea);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 10px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.2s;
          }
          .retry-button:hover {
            transform: translateY(-1px);
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error-icon">⚠️</div>
          <h2 class="error-title">Error de Conexión LTI</h2>
          <p class="error-message">
            ${userMessage}. Por favor, intenta acceder nuevamente desde Blackboard.
          </p>
          <div class="error-details">
            <strong>Código de error:</strong> ${error.message}<br>
            <strong>Timestamp:</strong> ${new Date().toISOString()}
          </div>
          <a href="/lti" class="retry-button">🔄 Volver al inicio</a>
        </div>
      </body>
      </html>
    `);
  }

  static handleWordPressError(error, operation) {
    console.error(`❌ WordPress Error (${operation}):`, error);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    throw new Error(`WordPress ${operation} failed: ${error.message}`);
  }

  static handleDatabaseError(error, operation) {
    console.error(`❌ Database Error (${operation}):`, error);
    throw new Error(`Database ${operation} failed: ${error.message}`);
  }
}

module.exports = ErrorHandler;