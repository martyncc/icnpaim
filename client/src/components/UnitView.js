import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, CheckCircle, Clock, BookOpen } from 'lucide-react';

const UnitView = ({ user }) => {
  const { unitId } = useParams();
  const navigate = useNavigate();
  const [unit, setUnit] = useState(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUnitData();
  }, [unitId]);

  const loadUnitData = async () => {
    try {
      setLoading(true);
      
      // En una implementación real, estos datos vendrían de WordPress
      const sampleUnit = {
        id: parseInt(unitId),
        title: 'Introducción al Curso',
        description: 'Bienvenida y objetivos del curso. Conoce qué aprenderás y cómo navegar por la plataforma.',
        type: 'lesson',
        duration: 15,
        difficulty: 'Principiante',
        sections: [
          {
            id: 1,
            type: 'video',
            title: 'Video de Bienvenida',
            content: {
              videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
              description: 'Introducción al curso y objetivos de aprendizaje',
              duration: 5
            }
          },
          {
            id: 2,
            type: 'text',
            title: 'Objetivos del Curso',
            content: {
              text: `
                <h3>Objetivos de Aprendizaje</h3>
                <p>En este curso aprenderás:</p>
                <ul>
                  <li>Conceptos fundamentales de la materia</li>
                  <li>Aplicación práctica de los conocimientos</li>
                  <li>Metodologías de trabajo efectivas</li>
                  <li>Evaluación y autoevaluación</li>
                </ul>
                <p>Al finalizar, serás capaz de aplicar estos conocimientos en situaciones reales.</p>
              `
            }
          },
          {
            id: 3,
            type: 'quiz',
            title: 'Quiz de Orientación',
            content: {
              questions: [
                {
                  question: '¿Cuál es el objetivo principal de este curso?',
                  options: [
                    'Aprender conceptos básicos',
                    'Desarrollar habilidades prácticas',
                    'Ambas anteriores'
                  ],
                  correct: 2
                },
                {
                  question: '¿Cómo se evalúa el progreso en este curso?',
                  options: [
                    'Solo exámenes finales',
                    'Evaluación continua',
                    'No hay evaluaciones'
                  ],
                  correct: 1
                }
              ]
            }
          }
        ]
      };

      setUnit(sampleUnit);
      setProgress(0);
    } catch (error) {
      console.error('Error cargando datos de la unidad:', error);
    } finally {
      setLoading(false);
    }
  };

  const nextSection = () => {
    if (currentSection < unit.sections.length - 1) {
      setCurrentSection(currentSection + 1);
      updateProgress();
    }
  };

  const prevSection = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const updateProgress = () => {
    const newProgress = Math.round(((currentSection + 1) / unit.sections.length) * 100);
    setProgress(newProgress);
  };

  const completeUnit = () => {
    // En una implementación real, aquí se actualizaría el progreso en WordPress
    console.log('Unidad completada');
    navigate('/dashboard');
  };

  const renderSection = (section) => {
    switch (section.type) {
      case 'video':
        return (
          <div className="space-y-4">
            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
              <iframe
                src={section.content.videoUrl}
                title={section.title}
                className="w-full h-full"
                frameBorder="0"
                allowFullScreen
              ></iframe>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700">{section.content.description}</p>
              <div className="flex items-center mt-2 text-sm text-gray-500">
                <Clock className="w-4 h-4 mr-1" />
                <span>{section.content.duration} minutos</span>
              </div>
            </div>
          </div>
        );

      case 'text':
        return (
          <div className="prose max-w-none">
            <div 
              dangerouslySetInnerHTML={{ __html: section.content.text }}
              className="text-gray-700 leading-relaxed"
            />
          </div>
        );

      case 'quiz':
        return <QuizSection questions={section.content.questions} onComplete={nextSection} />;

      default:
        return (
          <div className="text-center py-8">
            <p className="text-gray-500">Tipo de contenido no soportado</p>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Cargando contenido...</p>
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Unidad no encontrada</h2>
          <button 
            onClick={() => navigate('/dashboard')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentSectionData = unit.sections[currentSection];
  const isLastSection = currentSection === unit.sections.length - 1;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Volver</span>
              </button>
              <div className="text-gray-300">|</div>
              <div>
                <h1 className="text-lg font-semibold text-gray-800">{unit.title}</h1>
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <BookOpen className="w-4 h-4" />
                  <span>{unit.difficulty}</span>
                  <span>•</span>
                  <Clock className="w-4 h-4" />
                  <span>{unit.duration} min</span>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {currentSection + 1} de {unit.sections.length}
            </div>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${((currentSection + 1) / unit.sections.length) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {currentSectionData.title}
            </h2>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span className="capitalize">{currentSectionData.type}</span>
            </div>
          </div>

          <div className="mb-8">
            {renderSection(currentSectionData)}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center pt-6 border-t">
            <button
              onClick={prevSection}
              disabled={currentSection === 0}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            {isLastSection ? (
              <button
                onClick={completeUnit}
                className="flex items-center space-x-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Completar Unidad</span>
              </button>
            ) : (
              <button
                onClick={nextSection}
                className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <span>Siguiente</span>
                <Play className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// Componente para Quiz
const QuizSection = ({ questions, onComplete }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);

  const handleAnswer = (questionIndex, answerIndex) => {
    setAnswers({
      ...answers,
      [questionIndex]: answerIndex
    });
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setShowResults(true);
    }
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((question, index) => {
      if (answers[index] === question.correct) {
        correct++;
      }
    });
    return Math.round((correct / questions.length) * 100);
  };

  if (showResults) {
    const score = calculateScore();
    return (
      <div className="text-center py-8">
        <div className="text-6xl mb-4">
          {score >= 70 ? '🎉' : '📚'}
        </div>
        <h3 className="text-2xl font-bold text-gray-800 mb-2">
          {score >= 70 ? '¡Excelente!' : 'Sigue practicando'}
        </h3>
        <p className="text-gray-600 mb-4">
          Tu puntuación: {score}%
        </p>
        <button
          onClick={onComplete}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
        >
          Continuar
        </button>
      </div>
    );
  }

  const question = questions[currentQuestion];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-sm text-gray-500 mb-2">
          Pregunta {currentQuestion + 1} de {questions.length}
        </div>
        <h3 className="text-xl font-semibold text-gray-800">
          {question.question}
        </h3>
      </div>

      <div className="space-y-3">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleAnswer(currentQuestion, index)}
            className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
              answers[currentQuestion] === index
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="text-center">
        <button
          onClick={nextQuestion}
          disabled={answers[currentQuestion] === undefined}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {currentQuestion === questions.length - 1 ? 'Ver Resultados' : 'Siguiente Pregunta'}
        </button>
      </div>
    </div>
  );
};

export default UnitView;