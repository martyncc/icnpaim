import React, { useState, useEffect } from 'react';
import { BookOpen, Clock, Award, TrendingUp, Play, Lock, CheckCircle } from 'lucide-react';
import axios from 'axios';

const StudentDashboard = () => {
  const [user, setUser] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Cargar información del usuario
      const userResponse = await axios.get('/api/user');
      setUser(userResponse.data);

      // Cargar unidades del estudiante
      const unitsResponse = await axios.get('/api/student/units');
      setUnits(unitsResponse.data);

    } catch (error) {
      console.error('Error loading dashboard:', error);
      setError('Error al cargar el dashboard. Por favor, recarga la página.');
    } finally {
      setLoading(false);
    }
  };

  const startUnit = async (unitId) => {
    try {
      await axios.post('/api/progress/update', {
        unitId: unitId,
        contentId: 'unit_start',
        completed: false,
        score: 0
      });

      // Redirigir a la vista de la unidad
      window.location.href = `/unit/${unitId}`;
    } catch (error) {
      console.error('Error starting unit:', error);
      alert('Error al iniciar la unidad. Por favor, intenta nuevamente.');
    }
  };

  const getUnitIcon = (type) => {
    const icons = {
      'lesson': '📖',
      'video': '🎥',
      'quiz': '❓',
      'exercise': '💪',
      'project': '🛠️',
      'exam': '📝'
    };
    return icons[type] || '📖';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Cargando tu camino de aprendizaje...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const totalUnits = units.length;
  const completedUnits = units.filter(unit => unit.progress?.completed).length;
  const averageScore = units.reduce((sum, unit) => sum + (unit.progress?.score || 0), 0) / totalUnits || 0;
  const overallProgress = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-sm shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold text-blue-600">ICN PAIM</div>
              <div className="text-gray-600">|</div>
              <div className="text-gray-800">{user?.course?.title || 'Mi Curso'}</div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                {user?.user?.name?.charAt(0) || 'U'}
              </div>
              <div className="text-gray-800">{user?.user?.name || 'Usuario'}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            ¡Bienvenido a tu Camino de Aprendizaje!
          </h1>
          <p className="text-xl text-blue-100">
            Progresa a tu ritmo y desbloquea nuevos contenidos
          </p>
        </div>

        {/* Progress Overview */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 mb-8 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
              <div className="text-3xl font-bold text-blue-600 mb-2">{totalUnits}</div>
              <div className="text-gray-600 font-medium">Unidades Totales</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
              <div className="text-3xl font-bold text-green-600 mb-2">{completedUnits}</div>
              <div className="text-gray-600 font-medium">Completadas</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
              <div className="text-3xl font-bold text-purple-600 mb-2">{Math.round(averageScore)}%</div>
              <div className="text-gray-600 font-medium">Puntuación Promedio</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
              <div className="text-3xl font-bold text-orange-600 mb-2">
                {units.reduce((sum, unit) => sum + (unit.progress?.time_spent || 0), 0)}h
              </div>
              <div className="text-gray-600 font-medium">Tiempo Dedicado</div>
            </div>
          </div>
          
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Progreso General</h3>
            <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-500 relative overflow-hidden"
                style={{ width: `${overallProgress}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
              </div>
            </div>
            <p className="text-center text-gray-600 mt-2">{overallProgress}% completado</p>
          </div>
        </div>

        {/* Units Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {units.map((unit, index) => {
            const isLocked = !unit.unlocked && index > 0;
            const isCompleted = unit.progress?.completed;
            const progress = unit.progress?.completion_percentage || 0;

            return (
              <div 
                key={unit.id} 
                className={`bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-xl transition-all duration-300 hover:shadow-2xl ${
                  isLocked ? 'opacity-60' : 'hover:-translate-y-1'
                }`}
              >
                {/* Unit Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white text-xl">
                      {getUnitIcon(unit.type)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg">{unit.title}</h3>
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>{unit.duration} min</span>
                        <span>•</span>
                        <span>{unit.difficulty}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl">
                    {isCompleted ? '✅' : isLocked ? '🔒' : '⭐'}
                  </div>
                </div>

                {/* Unit Description */}
                <p className="text-gray-600 mb-4 line-clamp-3">{unit.description}</p>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-right text-sm text-gray-500 mt-1">{progress}% completado</p>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2">
                  {!isLocked ? (
                    <>
                      <button
                        onClick={() => startUnit(unit.id)}
                        className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200 flex items-center justify-center space-x-2"
                      >
                        <Play className="w-4 h-4" />
                        <span>{progress > 0 ? 'Continuar' : 'Comenzar'}</span>
                      </button>
                      {progress > 0 && (
                        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                          📚 Revisar
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 text-center">
                      <button disabled className="w-full bg-gray-300 text-gray-500 px-4 py-2 rounded-lg cursor-not-allowed flex items-center justify-center space-x-2">
                        <Lock className="w-4 h-4" />
                        <span>Bloqueada</span>
                      </button>
                      <p className="text-xs text-gray-500 mt-2">
                        Completa las unidades anteriores
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {units.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-2xl font-bold text-white mb-2">No hay unidades disponibles</h2>
            <p className="text-blue-100">Aún no se han asignado unidades a tu camino de aprendizaje.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;