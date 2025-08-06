import React from 'react';
import { useParams } from 'react-router-dom';

const UnitView = () => {
  const { unitId } = useParams();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl p-8 shadow-xl">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Vista de Unidad</h1>
          <p className="text-gray-600">Contenido de la unidad {unitId} en desarrollo...</p>
          
          <div className="mt-8">
            <button 
              onClick={() => window.history.back()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              ← Volver al Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnitView;