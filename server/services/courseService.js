const wordpressService = require('./wordpressService');

class CourseService {
  constructor() {
    this.postTypes = {
      COURSE: 'icn_course',
      UNIT: 'icn_unit',
      PATHWAY: 'icn_pathway',
      STUDENT: 'icn_student',
      GRADE: 'icn_grade'
    };
  }

  /**
   * Crear o actualizar curso desde LTI
   */
  async createOrUpdateCourse(courseData) {
    try {
      console.log('🏫 Creating/updating course:', courseData.name);

      // Buscar curso existente por LTI ID
      const existingCourses = await wordpressService.searchPosts(this.postTypes.COURSE, {
        meta_query: [
          {
            key: 'lti_course_id',
            value: courseData.lti_course_id,
            compare: '='
          }
        ]
      });

      const coursePostData = {
        title: courseData.name,
        content: `Curso: ${courseData.name}`,
        status: 'publish',
        meta: {
          lti_course_id: courseData.lti_course_id,
          platform_id: courseData.platform_id,
          instructor_id: courseData.wp_user_id,
          active: true,
          created_date: new Date().toISOString()
        }
      };

      if (existingCourses && existingCourses.length > 0) {
        // Actualizar curso existente
        const courseId = existingCourses[0].id;
        await wordpressService.updatePost(courseId, coursePostData);
        return { id: courseId, ...coursePostData };
      } else {
        // Crear nuevo curso y unidades de ejemplo
        const newCourse = await wordpressService.createPost(this.postTypes.COURSE, coursePostData);
        
        // Crear unidades de ejemplo para el curso
        await this.createSampleUnits(newCourse.id, courseData.name);
        
        return newCourse;
      }
    } catch (error) {
      console.error('Error creating/updating course:', error);
      throw error;
    }
  }

  /**
   * Crear unidades de ejemplo para un curso
   */
  async createSampleUnits(courseId, courseName) {
    try {
      console.log('📚 Creating sample units for course:', courseName);

      const sampleUnits = [
        {
          title: 'Introducción al Curso',
          description: 'Bienvenida y objetivos del curso. Conoce qué aprenderás y cómo navegar por la plataforma.',
          type: 'lesson',
          duration: 15,
          difficulty: 'Principiante',
          content: [
            {
              type: 'video',
              title: 'Video de Bienvenida',
              description: 'Introducción al curso y objetivos de aprendizaje',
              duration: 5
            },
            {
              type: 'text',
              title: 'Objetivos del Curso',
              content: 'En este curso aprenderás los conceptos fundamentales y desarrollarás habilidades prácticas que te permitirán aplicar los conocimientos en situaciones reales.'
            },
            {
              type: 'quiz',
              title: 'Quiz de Orientación',
              description: 'Evaluación inicial para conocer tu nivel',
              questions: 3
            }
          ]
        },
        {
          title: 'Conceptos Fundamentales',
          description: 'Aprende los conceptos básicos que necesitas dominar para avanzar en el curso.',
          type: 'lesson',
          duration: 30,
          difficulty: 'Principiante',
          content: [
            {
              type: 'text',
              title: 'Teoría Básica',
              content: 'Los conceptos fundamentales incluyen definiciones, principios y metodologías básicas que forman la base del conocimiento.'
            },
            {
              type: 'interactive',
              title: 'Ejercicio Interactivo',
              description: 'Practica los conceptos con este ejercicio interactivo'
            },
            {
              type: 'quiz',
              title: 'Evaluación de Conceptos',
              description: 'Verifica tu comprensión de los conceptos básicos',
              questions: 5
            }
          ]
        },
        {
          title: 'Aplicación Práctica',
          description: 'Aplica los conceptos aprendidos en ejercicios prácticos y casos reales.',
          type: 'exercise',
          duration: 45,
          difficulty: 'Intermedio',
          content: [
            {
              type: 'project',
              title: 'Proyecto Práctico',
              description: 'Desarrolla un proyecto que demuestre tu comprensión de los conceptos'
            },
            {
              type: 'video',
              title: 'Tutorial Paso a Paso',
              description: 'Guía detallada para completar el proyecto',
              duration: 20
            },
            {
              type: 'assignment',
              title: 'Entrega del Proyecto',
              description: 'Sube tu proyecto completado para evaluación'
            }
          ]
        },
        {
          title: 'Evaluación Final',
          description: 'Demuestra todo lo que has aprendido en esta evaluación comprehensiva.',
          type: 'exam',
          duration: 60,
          difficulty: 'Avanzado',
          content: [
            {
              type: 'exam',
              title: 'Examen Final',
              description: 'Evaluación comprehensiva de todos los temas del curso',
              questions: 25,
              time_limit: 60
            }
          ]
        }
      ];

      for (let i = 0; i < sampleUnits.length; i++) {
        const unitData = sampleUnits[i];
        
        const unitPostData = {
          title: unitData.title,
          content: unitData.description,
          status: 'publish',
          meta: {
            course_id: courseId,
            unit_type: unitData.type,
            estimated_duration: unitData.duration,
            difficulty_level: unitData.difficulty,
            unit_content: JSON.stringify(unitData.content),
            active: true,
            created_date: new Date().toISOString(),
            order_index: i + 1,
            unlocked: i === 0 // Solo la primera unidad está desbloqueada inicialmente
          }
        };

        await wordpressService.createPost(this.postTypes.UNIT, unitPostData);
        console.log(`✅ Created unit: ${unitData.title}`);
      }

    } catch (error) {
      console.error('Error creating sample units:', error);
    }
  }

  /**
   * Obtener camino del estudiante
   */
  async getStudentPathway(userId, courseId) {
    try {
      // Obtener unidades del curso
      const units = await wordpressService.searchPosts(this.postTypes.UNIT, {
        meta_query: [
          {
            key: 'course_id',
            value: courseId,
            compare: '='
          },
          {
            key: 'active',
            value: true,
            compare: '='
          }
        ]
      });

      // Obtener progreso del estudiante para cada unidad
      const unitsWithProgress = await Promise.all(
        units.map(async (unit) => {
          const progress = await this.getUnitProgress(userId, unit.id);
          return {
            ...unit,
            progress: progress
          };
        })
      );

      return {
        course_id: courseId,
        units: unitsWithProgress,
        total_units: units.length,
        completed_units: unitsWithProgress.filter(u => u.progress?.completed).length
      };

    } catch (error) {
      console.error('Error getting student pathway:', error);
      throw error;
    }
  }

  /**
   * Obtener unidades activas para el estudiante
   */
  async getActiveUnits(userId, courseId) {
    try {
      const pathway = await this.getStudentPathway(userId, courseId);
      
      return pathway.units.map(unit => ({
        id: unit.id,
        title: unit.title.rendered || unit.title,
        description: unit.content.rendered || unit.content,
        type: unit.meta?.unit_type || 'lesson',
        duration: unit.meta?.estimated_duration || 30,
        difficulty: unit.meta?.difficulty_level || 'Intermedio',
        unlocked: unit.meta?.unlocked || false,
        progress: unit.progress,
        content: unit.meta?.unit_content ? JSON.parse(unit.meta.unit_content) : []
      }));

    } catch (error) {
      console.error('Error getting active units:', error);
      return [];
    }
  }

  /**
   * Obtener progreso de una unidad
   */
  async getUnitProgress(userId, unitId) {
    try {
      const grades = await wordpressService.searchPosts(this.postTypes.GRADE, {
        meta_query: [
          {
            key: 'student_id',
            value: userId,
            compare: '='
          },
          {
            key: 'unit_id',
            value: unitId,
            compare: '='
          }
        ]
      });

      if (grades && grades.length > 0) {
        const grade = grades[0];
        return {
          completion_percentage: parseInt(grade.meta?.completion_percentage) || 0,
          score: parseFloat(grade.meta?.score) || 0,
          completed: grade.meta?.completed === 'true',
          last_accessed: grade.meta?.last_accessed,
          time_spent: parseInt(grade.meta?.time_spent) || 0
        };
      }

      return {
        completion_percentage: 0,
        score: 0,
        completed: false,
        last_accessed: null,
        time_spent: 0
      };

    } catch (error) {
      console.error('Error getting unit progress:', error);
      return null;
    }
  }

  /**
   * Actualizar progreso del estudiante
   */
  async updateProgress(userId, unitId, contentId, completed, score = 0) {
    try {
      console.log(`📊 Updating progress for user ${userId}, unit ${unitId}`);

      // Buscar progreso existente
      const existingProgress = await wordpressService.searchPosts(this.postTypes.GRADE, {
        meta_query: [
          {
            key: 'student_id',
            value: userId,
            compare: '='
          },
          {
            key: 'unit_id',
            value: unitId,
            compare: '='
          }
        ]
      });

      const progressData = {
        title: `Progreso - Usuario ${userId} - Unidad ${unitId}`,
        content: `Progreso del estudiante en la unidad`,
        status: 'publish',
        meta: {
          student_id: userId,
          unit_id: unitId,
          content_id: contentId,
          completed: completed.toString(),
          score: score.toString(),
          last_accessed: new Date().toISOString(),
          completion_percentage: completed ? '100' : '50'
        }
      };

      if (existingProgress && existingProgress.length > 0) {
        // Actualizar progreso existente
        const progressId = existingProgress[0].id;
        await wordpressService.updatePost(progressId, progressData);
      } else {
        // Crear nuevo registro de progreso
        await wordpressService.createPost(this.postTypes.GRADE, progressData);
      }

      console.log('✅ Progress updated successfully');
      return { success: true, completed, score };

    } catch (error) {
      console.error('Error updating progress:', error);
      throw error;
    }
  }
}

module.exports = new CourseService();