import React from 'react';

const ErrorScreen = ({ error, onRetry }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Error de Conexión
        </h2>
        <p className="text-gray-600 mb-6 leading-relaxed">
          {error || 'Ha ocurrido un error inesperado. Por favor, intenta nuevamente.'}
        </p>
        <div className="space-y-3">
          <button
            onClick={onRetry}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            🔄 Reintentar
          </button>
          <p className="text-sm text-gray-500">
            Si el problema persiste, contacta al administrador del curso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ErrorScreen;