import React from 'react';

const LoadingScreen = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="relative mb-8">
          <div className="w-20 h-20 border-4 border-white/30 rounded-full animate-spin border-t-white mx-auto"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-2xl">📚</div>
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-2">ICN PAIM</h2>
        <p className="text-blue-100">Cargando tu plataforma de aprendizaje...</p>
        <div className="mt-4 flex justify-center space-x-1">
          <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;