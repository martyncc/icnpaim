// utils/sampleData.js
const wordpressIntegration = require('../services/wordpressIntegration');

class SampleDataCreator {
  constructor() {
    this.postTypes = {
      UNIT: 'icn_unit',
      PATHWAY: 'icn_pathway',
      COURSE: 'icn_course'
    };
  }

  /**
   * Crear unidades de ejemplo para un curso
   */
  async createSampleUnitsForCourse(courseId, courseName) {
    try {
      console.log(`🎯 Creating sample units for course: ${courseName}`);

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
              url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
              duration: 5
            },
            {
              type: 'text',
              title: 'Objetivos del Curso',
              content: 'En este curso aprenderás los conceptos fundamentales y desarrollarás habilidades prácticas.'
            },
            {
              type: 'quiz',
              title: 'Quiz de Orientación',
              questions: [
                {
                  question: '¿Cuál es el objetivo principal de este curso?',
                  options: ['Aprender conceptos básicos', 'Desarrollar habilidades', 'Ambas anteriores'],
                  correct: 2
                }
              ]
            }
          ]
        },
        {
          title: 'Conceptos Fundamentales',
          description: 'Aprende los conceptos básicos que necesitas dominar para avanzar en el curso.',
          type: 'lesson',
          duration: 30,
          difficulty: 'Principiante',
          prerequisites: [],
          content: [
            {
              type: 'text',
              title: 'Teoría Básica',
              content: 'Los conceptos fundamentales incluyen definiciones, principios y metodologías básicas.'
            },
            {
              type: 'interactive',
              title: 'Ejercicio Interactivo',
              description: 'Practica los conceptos con este ejercicio interactivo.'
            },
            {
              type: 'quiz',
              title: 'Evaluación de Conceptos',
              questions: [
                {
                  question: '¿Cuál es la definición correcta?',
                  options: ['Opción A', 'Opción B', 'Opción C'],
                  correct: 1
                }
              ]
            }
          ]
        },
        {
          title: 'Aplicación Práctica',
          description: 'Aplica los conceptos aprendidos en ejercicios prácticos y casos reales.',
          type: 'exercise',
          duration: 45,
          difficulty: 'Intermedio',
          prerequisites: ['unit_1'], // Se actualizará con IDs reales
          content: [
            {
              type: 'project',
              title: 'Proyecto Práctico',
              description: 'Desarrolla un proyecto que demuestre tu comprensión de los conceptos.'
            },
            {
              type: 'video',
              title: 'Tutorial Paso a Paso',
              url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
              duration: 20
            },
            {
              type: 'assignment',
              title: 'Entrega del Proyecto',
              description: 'Sube tu proyecto completado para evaluación.'
            }
          ]
        },
        {
          title: 'Evaluación Final',
          description: 'Demuestra todo lo que has aprendido en esta evaluación comprehensiva.',
          type: 'exam',
          duration: 60,
          difficulty: 'Avanzado',
          prerequisites: ['unit_1', 'unit_2'], // Se actualizará con IDs reales
          content: [
            {
              type: 'exam',
              title: 'Examen Final',
              description: 'Evaluación comprehensiva de todos los temas del curso.',
              questions: 25,
              time_limit: 60
            }
          ]
        }
      ];

      const createdUnits = [];
      
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
            unit_structure: JSON.stringify({
              sections: unitData.content.length,
              estimated_time: unitData.duration,
              completion_criteria: 'all_sections'
            }),
            prerequisites: JSON.stringify(unitData.prerequisites),
            active: true,
            created_date: new Date().toISOString(),
            order_index: i + 1
          }
        };

        const createdUnit = await wordpressIntegration.createPost(this.postTypes.UNIT, unitPostData);
        createdUnits.push(createdUnit);
        
        console.log(`✅ Created unit: ${unitData.title}`);
      }

      // Actualizar prerrequisitos con IDs reales
      await this.updatePrerequisites(createdUnits);

      return createdUnits;
    } catch (error) {
      console.error('Error creating sample units:', error);
      throw error;
    }
  }

  /**
   * Actualizar prerrequisitos con IDs reales
   */
  async updatePrerequisites(units) {
    try {
      // Unidad 3 requiere unidad 1
      if (units[2]) {
        await wordpressIntegration.updatePostMeta(
          units[2].id, 
          'prerequisites', 
          JSON.stringify([units[0].id])
        );
      }

      // Unidad 4 requiere unidades 1 y 2
      if (units[3]) {
        await wordpressIntegration.updatePostMeta(
          units[3].id, 
          'prerequisites', 
          JSON.stringify([units[0].id, units[1].id])
        );
      }

      console.log('✅ Prerequisites updated with real IDs');
    } catch (error) {
      console.error('Error updating prerequisites:', error);
    }
  }

  /**
   * Crear camino por defecto para un estudiante
   */
  async createDefaultPathwayForStudent(studentId, courseId, units) {
    try {
      const pathwayData = {
        title: `Camino de Aprendizaje - Estudiante ${studentId}`,
        content: 'Camino personalizado generado automáticamente basado en el curso.',
        status: 'publish',
        meta: {
          course_id: courseId,
          assigned_students: JSON.stringify([studentId]),
          units: JSON.stringify(units.map(unit => unit.id)),
          pathway_type: 'auto_generated',
          active: true,
          created_date: new Date().toISOString(),
          completion_criteria: JSON.stringify({
            required_units: units.length,
            passing_score: 70,
            time_limit: null
          })
        }
      };

      const pathway = await wordpressIntegration.createPost(this.postTypes.PATHWAY, pathwayData);
      console.log(`✅ Created pathway for student ${studentId}`);
      
      return pathway;
    } catch (error) {
      console.error('Error creating default pathway:', error);
      throw error;
    }
  }

  /**
   * Inicializar datos completos para un curso nuevo
   */
  async initializeCourseData(courseId, courseName, studentId = null) {
    try {
      console.log(`🚀 Initializing complete data for course: ${courseName}`);

      // Crear unidades de ejemplo
      const units = await this.createSampleUnitsForCourse(courseId, courseName);

      // Si hay un estudiante, crear su camino
      if (studentId) {
        const pathway = await this.createDefaultPathwayForStudent(studentId, courseId, units);
        return { units, pathway };
      }

      return { units };
    } catch (error) {
      console.error('Error initializing course data:', error);
      throw error;
    }
  }
}

module.exports = new SampleDataCreator();