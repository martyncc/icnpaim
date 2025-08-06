const wordpressService = require('./wordpressService');

/**
 * Servicio para manejar lógica de cursos y progreso
 * Actúa como capa intermedia entre el backend y WordPress
 */
class CourseService {
  constructor() {
    this.cache = new Map(); // Cache simple para mejorar performance
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Obtener unidades activas para un estudiante
   */
  async getStudentUnits(userId, courseId) {
    try {
      const cacheKey = `units_${courseId}`;
      const cached = this.cache.get(cacheKey);
      
      // Usar cache si está disponible y no ha expirado
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        console.log('📦 Using cached units for course:', courseId);
        return await this.addProgressToUnits(cached.data, userId);
      }

      console.log('🔍 Fetching units from WordPress for course:', courseId);
      
      // Obtener unidades desde WordPress
      const units = await wordpressService.getCourseUnits(courseId);
      
      // Guardar en cache
      this.cache.set(cacheKey, {
        data: units,
        timestamp: Date.now()
      });

      // Agregar progreso del estudiante
      return await this.addProgressToUnits(units, userId);
    } catch (error) {
      console.error('Error fetching student units:', error);
      
      // Fallback a datos mock si WordPress falla
      return this.getMockUnits();
    }
  }

  /**
   * Agregar información de progreso a las unidades
   */
  async addProgressToUnits(units, userId) {
    try {
      // Obtener progreso del estudiante desde WordPress
      const progressData = await wordpressService.getStudentProgress(userId);
      
      return units.map((unit, index) => {
        const progress = progressData[unit.id] || {
          completion_percentage: 0,
          score: 0,
          completed: false,
          last_updated: null
        };

        // Lógica de desbloqueo: primera unidad siempre desbloqueada
        // Las siguientes se desbloquean cuando la anterior está completada
        let unlocked = index === 0; // Primera unidad siempre desbloqueada
        
        if (index > 0) {
          const previousUnit = units[index - 1];
          const previousProgress = progressData[previousUnit.id];
          unlocked = previousProgress && previousProgress.completed;
        }

        return {
          ...unit,
          unlocked,
          progress
        };
      });
    } catch (error) {
      console.error('Error adding progress to units:', error);
      
      // Si falla, devolver unidades sin progreso
      return units.map((unit, index) => ({
        ...unit,
        unlocked: index === 0,
        progress: {
          completion_percentage: 0,
          score: 0,
          completed: false,
          last_updated: null
        }
      }));
    }
  }

  /**
   * Actualizar progreso del estudiante
   */
  async updateStudentProgress(userId, unitId, courseId, progressData) {
    try {
      console.log('📊 Updating progress:', { userId, unitId, courseId, progressData });

      // Guardar en WordPress
      const savedProgress = await wordpressService.saveStudentProgress({
        user_id: userId,
        unit_id: unitId,
        course_id: courseId,
        completion_percentage: progressData.completion_percentage || 0,
        score: progressData.score || 0,
        completed: progressData.completed || false
      });

      // Limpiar cache para forzar actualización
      this.cache.delete(`units_${courseId}`);

      console.log('✅ Progress updated successfully');
      return savedProgress;
    } catch (error) {
      console.error('Error updating student progress:', error);
      throw error;
    }
  }

  /**
   * Obtener contenido detallado de una unidad
   */
  async getUnitContent(unitId) {
    try {
      const cacheKey = `unit_content_${unitId}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached.data;
      }

      const content = await wordpressService.getUnitContent(unitId);
      
      this.cache.set(cacheKey, {
        data: content,
        timestamp: Date.now()
      });

      return content;
    } catch (error) {
      console.error('Error fetching unit content:', error);
      throw error;
    }
  }

  /**
   * Sincronizar curso desde LTI con WordPress
   */
  async syncCourseFromLTI(ltiData) {
    try {
      console.log('🔄 Syncing course from LTI:', ltiData.course_name);

      const courseData = {
        lti_course_id: ltiData.course_id,
        name: ltiData.course_name,
        platform_id: ltiData.platform_id,
        instructor_id: ltiData.instructor_id || 1
      };

      const course = await wordpressService.createOrUpdateCourse(courseData);
      
      console.log('✅ Course synced successfully:', course.title);
      return course;
    } catch (error) {
      console.error('Error syncing course from LTI:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas del estudiante
   */
  async getStudentStats(userId, courseId) {
    try {
      const units = await this.getStudentUnits(userId, courseId);
      
      const totalUnits = units.length;
      const completedUnits = units.filter(unit => unit.progress.completed).length;
      const totalScore = units.reduce((sum, unit) => sum + unit.progress.score, 0);
      const averageScore = totalUnits > 0 ? totalScore / totalUnits : 0;
      const overallProgress = totalUnits > 0 ? (completedUnits / totalUnits) * 100 : 0;

      return {
        total_units: totalUnits,
        completed_units: completedUnits,
        average_score: Math.round(averageScore),
        overall_progress: Math.round(overallProgress),
        units: units
      };
    } catch (error) {
      console.error('Error fetching student stats:', error);
      throw error;
    }
  }

  /**
   * Datos mock para desarrollo/fallback
   */
  getMockUnits() {
    return [
      {
        id: 1,
        title: 'Introducción al Curso',
        description: 'Bienvenida y objetivos del curso. Conoce qué aprenderás y cómo navegar por la plataforma.',
        type: 'lesson',
        duration: 15,
        difficulty: 'Principiante',
        order: 1,
        unlocked: true,
        progress: { completion_percentage: 0, score: 0, completed: false },
        content: [
          { type: 'video', title: 'Video de Bienvenida', duration: 5 },
          { type: 'text', title: 'Objetivos del Curso' },
          { type: 'quiz', title: 'Quiz de Orientación', questions: 3 }
        ]
      },
      {
        id: 2,
        title: 'Conceptos Fundamentales',
        description: 'Aprende los conceptos básicos que necesitas dominar para avanzar en el curso.',
        type: 'lesson',
        duration: 30,
        difficulty: 'Principiante',
        order: 2,
        unlocked: false,
        progress: { completion_percentage: 0, score: 0, completed: false },
        content: [
          { type: 'text', title: 'Teoría Básica' },
          { type: 'interactive', title: 'Ejercicio Interactivo' },
          { type: 'quiz', title: 'Evaluación de Conceptos', questions: 5 }
        ]
      },
      {
        id: 3,
        title: 'Aplicación Práctica',
        description: 'Aplica los conceptos aprendidos en ejercicios prácticos y casos reales.',
        type: 'exercise',
        duration: 45,
        difficulty: 'Intermedio',
        order: 3,
        unlocked: false,
        progress: { completion_percentage: 0, score: 0, completed: false },
        content: [
          { type: 'project', title: 'Proyecto Práctico' },
          { type: 'video', title: 'Tutorial Paso a Paso', duration: 20 },
          { type: 'assignment', title: 'Entrega del Proyecto' }
        ]
      }
    ];
  }

  /**
   * Limpiar cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Cache cleared');
  }
}

module.exports = new CourseService();