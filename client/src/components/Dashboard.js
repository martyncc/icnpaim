import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, BookOpen, Clock, Award, Play, Lock } from 'lucide-react';
import axios from 'axios';

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUnits: 0,
    completedUnits: 0,
    averageScore: 0,
    timeSpent: 0
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // En una implementación real, estos datos vendrían de WordPress
      // Por ahora, usamos datos de ejemplo
      const sampleUnits = [
        {
          id: 1,
          title: 'Introducción al Curso',
          description: 'Bienvenida y objetivos del curso. Conoce qué aprenderás y cómo navegar por la plataforma.',
          type: 'lesson',
          duration: 15,
          difficulty: 'Principiante',
          unlocked: true,
          progress: { completed: false, percentage: 0, score: 0 }
        },
        {
          id: 2,
          title: 'Conceptos Fundamentales',
          description: 'Aprende los conceptos básicos que necesitas dominar para avanzar en el curso.',
          type: 'lesson',
          duration: 30,
          difficulty: 'Principiante',
          unlocked: true,
          progress: { completed: false, percentage: 0, score: 0 }
        },
        {
          id: 3,
          title: 'Aplicación Práctica',
          description: 'Aplica los conceptos aprendidos en ejercicios prácticos y casos reales.',
          type: 'exercise',
          duration: 45,
          difficulty: 'Intermedio',
          unlocked: false,
          progress: { completed: false, percentage: 0, score: 0 }
        },
        {
          id: 4,
          title: 'Evaluación Final',
          description: 'Demuestra todo lo que has aprendido en esta evaluación comprehensiva.',
          type: 'exam',
          duration: 60,
          difficulty: 'Avanzado',
          unlocked: false,
          progress: { completed: false, percentage: 0, score: 0 }
        }
      ];

      setUnits(sampleUnits);
      
      // Calcular estadísticas
      const totalUnits = sampleUnits.length;
      const completedUnits = sampleUnits.filter(unit => unit.progress.completed).length;
      const averageScore = sampleUnits.reduce((sum, unit) => sum + unit.progress.score, 0) / totalUnits;
      const timeSpent = sampleUnits.reduce((sum, unit) => sum + (unit.progress.completed ? unit.duration : 0), 0);

      setStats({
        totalUnits,
        completedUnits,
        averageScore: Math.round(averageScore),
        timeSpent
      });

    } catch (error) {
      console.error('Error cargando datos del dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const startUnit = (unitId) => {
    navigate(`/unit/${unitId}`);
  };

  const getUnitIcon = (type) => {
    const icons = {
      'lesson': '📖',
      'exercise': '💪',
      'exam': '📝',
      'video': '🎥',
      'quiz': '❓'
    };
    return icons[type] || '📖';
  };

  const overallProgress = stats.totalUnits > 0 ? Math.round((stats.completedUnits / stats.totalUnits) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-sm shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold text-blue-600">ICN PAIM</div>
              <div className="text-gray-600">|</div>
              <div className="text-gray-800">{user.course?.title || user.course?.label || 'Mi Curso'}</div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                <User className="w-5 h-5" />
              </div>
              <div className="text-gray-800">{user.name}</div>
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
              <BookOpen className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="text-3xl font-bold text-blue-600 mb-2">{stats.totalUnits}</div>
              <div className="text-gray-600 font-medium">Unidades Totales</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
              <Award className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="text-3xl font-bold text-green-600 mb-2">{stats.completedUnits}</div>
              <div className="text-gray-600 font-medium">Completadas</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
              <div className="text-3xl font-bold text-purple-600 mb-2">{stats.averageScore}%</div>
              <div className="text-gray-600 font-medium">Puntuación Promedio</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
              <Clock className="w-8 h-8 text-orange-600 mx-auto mb-2" />
              <div className="text-3xl font-bold text-orange-600 mb-2">{stats.timeSpent}min</div>
              <div className="text-gray-600 font-medium">Tiempo Dedicado</div>
            </div>
          </div>
          
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Progreso General</h3>
            <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              ></div>
            </div>
            <p className="text-center text-gray-600 mt-2">{overallProgress}% completado</p>
          </div>
        </div>

        {/* Units Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">Cargando unidades...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {units.map((unit) => {
              const isLocked = !unit.unlocked;
              const isCompleted = unit.progress.completed;
              const progress = unit.progress.percentage;

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
                      <button
                        onClick={() => startUnit(unit.id)}
                        className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200 flex items-center justify-center space-x-2"
                      >
                        <Play className="w-4 h-4" />
                        <span>{progress > 0 ? 'Continuar' : 'Comenzar'}</span>
                      </button>
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
        )}
      </div>
    </div>
  );
};

export default Dashboard;