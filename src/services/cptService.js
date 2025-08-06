// services/cptService.js
const wordpressIntegration = require('./wordpressIntegration');
const sampleData = require('../utils/sampleData');

class CPTService {
  constructor() {
    this.postTypes = {
      UNIT: 'icn_unit',
      PATHWAY: 'icn_pathway', 
      COURSE: 'icn_course',
      STUDENT: 'icn_student',
      GRADE: 'icn_grade'
    };
  }

  /**
   * Sincroniza los datos del estudiante desde Blackboard al sistema CPT
   */
  async syncStudentData(userInfo, wpUser, courseData) {
    try {
      console.log('🔄 Syncing student data to CPT...');
      
      // 1. Crear o actualizar estudiante
      const student = await this.createOrUpdateStudent(userInfo, wpUser);
      
      // 2. Crear o actualizar curso si existe
      if (courseData) {
        await this.createOrUpdateCourse(courseData, wpUser);
        
        // 3. Verificar si el curso tiene unidades, si no, crear datos de ejemplo
        const existingUnits = await wordpressIntegration.searchPosts(this.postTypes.UNIT, {
          meta_query: [
            {
              key: 'course_id',
              value: courseData.id,
              compare: '='
            }
          ]
        });
        
        if (!existingUnits || existingUnits.length === 0) {
          console.log('📚 No units found, creating sample data...');
          await sampleData.initializeCourseData(courseData.id, courseData.title, student.id);
        }
      }
      
      // 4. Asignar estudiante al curso
      if (student && courseData) {
        await this.assignStudentToCourse(student.id, courseData.id);
      }

      console.log('✅ Student data synced to CPT');
      return { student, course: courseData };
    } catch (error) {
      console.error('❌ Error syncing student data:', error);
      throw error;
    }
  }

  /**
   * Crear o actualizar estudiante en CPT
   */
  async createOrUpdateStudent(userInfo, wpUser) {
    try {
      // Buscar si el estudiante ya existe
      const existingStudent = await wordpressIntegration.searchPosts(this.postTypes.STUDENT, {
        meta_query: [
          {
            key: 'lti_user_id',
            value: userInfo.lti_id,
            compare: '='
          }
        ]
      });

      const studentData = {
        title: userInfo.name,
        content: `Estudiante: ${userInfo.name}`,
        status: 'publish',
        meta: {
          lti_user_id: userInfo.lti_id,
          email: userInfo.email,
          wp_user_id: wpUser.id,
          roles: JSON.stringify(userInfo.roles),
          platform_id: userInfo.platform_id,
          last_access: new Date().toISOString(),
          active: true
        }
      };

      if (existingStudent && existingStudent.length > 0) {
        // Actualizar estudiante existente
        const studentId = existingStudent[0].id;
        await wordpressIntegration.updatePost(studentId, studentData);
        return { id: studentId, ...studentData };
      } else {
        // Crear nuevo estudiante
        const newStudent = await wordpressIntegration.createPost(this.postTypes.STUDENT, studentData);
        return newStudent;
      }
    } catch (error) {
      console.error('Error creating/updating student:', error);
      throw error;
    }
  }

  /**
   * Crear o actualizar curso en CPT
   */
  async createOrUpdateCourse(courseData, wpUser) {
    try {
      const existingCourse = await wordpressIntegration.searchPosts(this.postTypes.COURSE, {
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
          context_id: courseData.context_id,
          context_label: courseData.context_label,
          platform_id: courseData.platform_id,
          instructor_id: wpUser.id,
          active: true,
          created_date: new Date().toISOString()
        }
      };

      if (existingCourse && existingCourse.length > 0) {
        const courseId = existingCourse[0].id;
        await wordpressIntegration.updatePost(courseId, coursePostData);
        return { id: courseId, ...coursePostData };
      } else {
        const newCourse = await wordpressIntegration.createPost(this.postTypes.COURSE, coursePostData);
        return newCourse;
      }
    } catch (error) {
      console.error('Error creating/updating course:', error);
      throw error;
    }
  }

  /**
   * Obtener el camino (pathway) asignado al estudiante
   */
  async getStudentPathway(userId, courseId) {
    try {
      // Buscar el camino asignado al estudiante para el curso específico
      const pathways = await wordpressIntegration.searchPosts(this.postTypes.PATHWAY, {
        meta_query: [
          {
            key: 'assigned_students',
            value: `"${userId}"`,
            compare: 'LIKE'
          },
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

      if (pathways && pathways.length > 0) {
        const pathway = pathways[0];
        
        // Obtener las unidades del camino
        const units = await this.getPathwayUnits(pathway.id);
        
        return {
          id: pathway.id,
          title: pathway.title,
          description: pathway.content,
          units: units,
          progress: await this.getPathwayProgress(userId, pathway.id)
        };
      }

      // Si no tiene un camino asignado, crear uno por defecto
      return await this.createDefaultPathway(userId, courseId);
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
      
      if (!pathway || !pathway.units) {
        return [];
      }

      // Filtrar unidades activas basadas en el progreso del estudiante
      const activeUnits = [];
      
      for (const unit of pathway.units) {
        const isUnlocked = await this.isUnitUnlocked(userId, unit.id);
        if (isUnlocked) {
          const unitWithContent = await this.getUnitContent(unit.id);
          activeUnits.push({
            ...unitWithContent,
            unlocked: true,
            progress: await this.getUnitProgress(userId, unit.id)
          });
        } else {
          activeUnits.push({
            ...unit,
            unlocked: false,
            locked_reason: 'Completa las unidades anteriores para desbloquear'
          });
        }
      }

      return activeUnits;
    } catch (error) {
      console.error('Error getting active units:', error);
      throw error;
    }
  }

  /**
   * Obtener contenido de una unidad
   */
  async getUnitContent(unitId) {
    try {
      const unit = await wordpressIntegration.getPost(unitId);
      
      if (!unit) {
        throw new Error('Unidad no encontrada');
      }

      // Obtener el contenido estructurado de la unidad
      const content = await wordpressIntegration.getPostMeta(unitId, 'unit_content');
      const structure = await wordpressIntegration.getPostMeta(unitId, 'unit_structure');

      return {
        id: unit.id,
        title: unit.title,
        description: unit.content,
        content: content ? JSON.parse(content) : [],
        structure: structure ? JSON.parse(structure) : {},
        type: await wordpressIntegration.getPostMeta(unitId, 'unit_type') || 'lesson',
        duration: await wordpressIntegration.getPostMeta(unitId, 'estimated_duration') || 30,
        difficulty: await wordpressIntegration.getPostMeta(unitId, 'difficulty_level') || 'intermediate'
      };
    } catch (error) {
      console.error('Error getting unit content:', error);
      throw error;
    }
  }

  /**
   * Verificar si una unidad está desbloqueada para el estudiante
   */
  async isUnitUnlocked(userId, unitId) {
    try {
      // Obtener los prerrequisitos de la unidad
      const prerequisites = await wordpressIntegration.getPostMeta(unitId, 'prerequisites');
      
      if (!prerequisites) {
        return true; // Sin prerrequisitos = desbloqueada
      }

      const prereqIds = JSON.parse(prerequisites);
      
      // Verificar que todos los prerrequisitos estén completados
      for (const prereqId of prereqIds) {
        const progress = await this.getUnitProgress(userId, prereqId);
        if (!progress || progress.completion_percentage < 100) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking unit unlock status:', error);
      return false;
    }
  }

  /**
   * Obtener progreso de una unidad específica
   */
  async getUnitProgress(userId, unitId) {
    try {
      const grades = await wordpressIntegration.searchPosts(this.postTypes.GRADE, {
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
          unit_id: unitId,
          completion_percentage: parseInt(await wordpressIntegration.getPostMeta(grade.id, 'completion_percentage')) || 0,
          score: parseFloat(await wordpressIntegration.getPostMeta(grade.id, 'score')) || 0,
          last_accessed: await wordpressIntegration.getPostMeta(grade.id, 'last_accessed'),
          time_spent: parseInt(await wordpressIntegration.getPostMeta(grade.id, 'time_spent')) || 0
        };
      }

      return {
        unit_id: unitId,
        completion_percentage: 0,
        score: 0,
        last_accessed: null,
        time_spent: 0
      };
    } catch (error) {
      console.error('Error getting unit progress:', error);
      return null;
    }
  }

  /**
   * Crear un camino por defecto para el estudiante
   */
  async createDefaultPathway(userId, courseId) {
    try {
      // Obtener unidades disponibles para el curso
      const availableUnits = await wordpressIntegration.searchPosts(this.postTypes.UNIT, {
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

      const pathwayData = {
        title: `Camino por defecto - Usuario ${userId}`,
        content: 'Camino de aprendizaje generado automáticamente',
        status: 'publish',
        meta: {
          course_id: courseId,
          assigned_students: JSON.stringify([userId]),
          units: JSON.stringify(availableUnits.map(unit => unit.id)),
          active: true,
          created_date: new Date().toISOString(),
          pathway_type: 'default'
        }
      };

      const pathway = await wordpressIntegration.createPost(this.postTypes.PATHWAY, pathwayData);
      
      return {
        id: pathway.id,
        title: pathway.title,
        description: pathway.content,
        units: availableUnits,
        progress: 0
      };
    } catch (error) {
      console.error('Error creating default pathway:', error);
      throw error;
    }
  }

  /**
   * Asignar estudiante a curso
   */
  async assignStudentToCourse(studentId, courseId) {
    try {
      // Obtener estudiantes ya asignados al curso
      const existingStudents = await wordpressIntegration.getPostMeta(courseId, 'assigned_students');
      let studentIds = existingStudents ? JSON.parse(existingStudents) : [];
      
      if (!studentIds.includes(studentId)) {
        studentIds.push(studentId);
        await wordpressIntegration.updatePostMeta(courseId, 'assigned_students', JSON.stringify(studentIds));
      }

      return true;
    } catch (error) {
      console.error('Error assigning student to course:', error);
      throw error;
    }
  }

  /**
   * Obtener todos los cursos (para administradores)
   */
  async getAllCourses() {
    try {
      return await wordpressIntegration.searchPosts(this.postTypes.COURSE, {
        meta_query: [
          {
            key: 'active',
            value: true,
            compare: '='
          }
        ]
      });
    } catch (error) {
      console.error('Error getting all courses:', error);
      throw error;
    }
  }

  /**
   * Obtener todos los estudiantes (para administradores)
   */
  async getAllStudents() {
    try {
      return await wordpressIntegration.searchPosts(this.postTypes.STUDENT, {
        meta_query: [
          {
            key: 'active',
            value: true,
            compare: '='
          }
        ]
      });
    } catch (error) {
      console.error('Error getting all students:', error);
      throw error;
    }
  }

  /**
   * Obtener unidades de un camino
   */
  async getPathwayUnits(pathwayId) {
    try {
      const unitIds = await wordpressIntegration.getPostMeta(pathwayId, 'units');
      if (!unitIds) return [];

      const ids = JSON.parse(unitIds);
      const units = [];

      for (const id of ids) {
        const unit = await wordpressIntegration.getPost(id);
        if (unit) {
          units.push(unit);
        }
      }

      return units;
    } catch (error) {
      console.error('Error getting pathway units:', error);
      return [];
    }
  }

  /**
   * Obtener progreso del camino
   */
  async getPathwayProgress(userId, pathwayId) {
    try {
      const units = await this.getPathwayUnits(pathwayId);
      if (units.length === 0) return 0;

      let totalProgress = 0;
      for (const unit of units) {
        const progress = await this.getUnitProgress(userId, unit.id);
        totalProgress += progress.completion_percentage;
      }

      return Math.round(totalProgress / units.length);
    } catch (error) {
      console.error('Error getting pathway progress:', error);
      return 0;
    }
  }
}

module.exports = new CPTService();// services/cptService.js
const wordpressIntegration = require('./wordpressIntegration');
const sampleData = require('../utils/sampleData');

class CPTService {
  constructor() {
    this.postTypes = {
      UNIT: 'icn_unit',
      PATHWAY: 'icn_pathway', 
      COURSE: 'icn_course',
      STUDENT: 'icn_student',
      GRADE: 'icn_grade'
    };
  }

  /**
   * Sincroniza los datos del estudiante desde Blackboard al sistema CPT
   */
  async syncStudentData(userInfo, wpUser, courseData) {
    try {
      console.log('🔄 Syncing student data to CPT...');
      
      // 1. Crear o actualizar estudiante
      const student = await this.createOrUpdateStudent(userInfo, wpUser);
      
      // 2. Crear o actualizar curso si existe
      if (courseData) {
        await this.createOrUpdateCourse(courseData, wpUser);
        
        // 3. Verificar si el curso tiene unidades, si no, crear datos de ejemplo
        const existingUnits = await wordpressIntegration.searchPosts(this.postTypes.UNIT, {
          meta_query: [
            {
              key: 'course_id',
              value: courseData.id,
              compare: '='
            }
          ]
        });
        
        if (!existingUnits || existingUnits.length === 0) {
          console.log('📚 No units found, creating sample data...');
          await sampleData.initializeCourseData(courseData.id, courseData.title, student.id);
        }
      }
      
      // 4. Asignar estudiante al curso
      if (student && courseData) {
        await this.assignStudentToCourse(student.id, courseData.id);
      }

      console.log('✅ Student data synced to CPT');
      return { student, course: courseData };
    } catch (error) {
      console.error('❌ Error syncing student data:', error);
      throw error;
    }
  }

  /**
   * Crear o actualizar estudiante en CPT
   */
  async createOrUpdateStudent(userInfo, wpUser) {
    try {
      // Buscar si el estudiante ya existe
      const existingStudent = await wordpressIntegration.searchPosts(this.postTypes.STUDENT, {
        meta_query: [
          {
            key: 'lti_user_id',
            value: userInfo.lti_id,
            compare: '='
          }
        ]
      });

      const studentData = {
        title: userInfo.name,
        content: `Estudiante: ${userInfo.name}`,
        status: 'publish',
        meta: {
          lti_user_id: userInfo.lti_id,
          email: userInfo.email,
          wp_user_id: wpUser.id,
          roles: JSON.stringify(userInfo.roles),
          platform_id: userInfo.platform_id,
          last_access: new Date().toISOString(),
          active: true
        }
      };

      if (existingStudent && existingStudent.length > 0) {
        // Actualizar estudiante existente
        const studentId = existingStudent[0].id;
        await wordpressIntegration.updatePost(studentId, studentData);
        return { id: studentId, ...studentData };
      } else {
        // Crear nuevo estudiante
        const newStudent = await wordpressIntegration.createPost(this.postTypes.STUDENT, studentData);
        return newStudent;
      }
    } catch (error) {
      console.error('Error creating/updating student:', error);
      throw error;
    }
  }

  /**
   * Crear o actualizar curso en CPT
   */
  async createOrUpdateCourse(courseData, wpUser) {
    try {
      const existingCourse = await wordpressIntegration.searchPosts(this.postTypes.COURSE, {
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
          context_id: courseData.context_id,
          context_label: courseData.context_label,
          platform_id: courseData.platform_id,
          instructor_id: wpUser.id,
          active: true,
          created_date: new Date().toISOString()
        }
      };

      if (existingCourse && existingCourse.length > 0) {
        const courseId = existingCourse[0].id;
        await wordpressIntegration.updatePost(courseId, coursePostData);
        return { id: courseId, ...coursePostData };
      } else {
        const newCourse = await wordpressIntegration.createPost(this.postTypes.COURSE, coursePostData);
        return newCourse;
      }
    } catch (error) {
      console.error('Error creating/updating course:', error);
      throw error;
    }
  }

  /**
   * Obtener el camino (pathway) asignado al estudiante
   */
  async getStudentPathway(userId, courseId) {
    try {
      // Buscar el camino asignado al estudiante para el curso específico
      const pathways = await wordpressIntegration.searchPosts(this.postTypes.PATHWAY, {
        meta_query: [
          {
            key: 'assigned_students',
            value: `"${userId}"`,
            compare: 'LIKE'
          },
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

      if (pathways && pathways.length > 0) {
        const pathway = pathways[0];
        
        // Obtener las unidades del camino
        const units = await this.getPathwayUnits(pathway.id);
        
        return {
          id: pathway.id,
          title: pathway.title,
          description: pathway.content,
          units: units,
          progress: await this.getPathwayProgress(userId, pathway.id)
        };
      }

      // Si no tiene un camino asignado, crear uno por defecto
      return await this.createDefaultPathway(userId, courseId);
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
      
      if (!pathway || !pathway.units) {
        return [];
      }

      // Filtrar unidades activas basadas en el progreso del estudiante
      const activeUnits = [];
      
      for (const unit of pathway.units) {
        const isUnlocked = await this.isUnitUnlocked(userId, unit.id);
        if (isUnlocked) {
          const unitWithContent = await this.getUnitContent(unit.id);
          activeUnits.push({
            ...unitWithContent,
            unlocked: true,
            progress: await this.getUnitProgress(userId, unit.id)
          });
        } else {
          activeUnits.push({
            ...unit,
            unlocked: false,
            locked_reason: 'Completa las unidades anteriores para desbloquear'
          });
        }
      }

      return activeUnits;
    } catch (error) {
      console.error('Error getting active units:', error);
      throw error;
    }
  }

  /**
   * Obtener contenido de una unidad
   */
  async getUnitContent(unitId) {
    try {
      const unit = await wordpressIntegration.getPost(unitId);
      
      if (!unit) {
        throw new Error('Unidad no encontrada');
      }

      // Obtener el contenido estructurado de la unidad
      const content = await wordpressIntegration.getPostMeta(unitId, 'unit_content');
      const structure = await wordpressIntegration.getPostMeta(unitId, 'unit_structure');

      return {
        id: unit.id,
        title: unit.title,
        description: unit.content,
        content: content ? JSON.parse(content) : [],
        structure: structure ? JSON.parse(structure) : {},
        type: await wordpressIntegration.getPostMeta(unitId, 'unit_type') || 'lesson',
        duration: await wordpressIntegration.getPostMeta(unitId, 'estimated_duration') || 30,
        difficulty: await wordpressIntegration.getPostMeta(unitId, 'difficulty_level') || 'intermediate'
      };
    } catch (error) {
      console.error('Error getting unit content:', error);
      throw error;
    }
  }

  /**
   * Verificar si una unidad está desbloqueada para el estudiante
   */
  async isUnitUnlocked(userId, unitId) {
    try {
      // Obtener los prerrequisitos de la unidad
      const prerequisites = await wordpressIntegration.getPostMeta(unitId, 'prerequisites');
      
      if (!prerequisites) {
        return true; // Sin prerrequisitos = desbloqueada
      }

      const prereqIds = JSON.parse(prerequisites);
      
      // Verificar que todos los prerrequisitos estén completados
      for (const prereqId of prereqIds) {
        const progress = await this.getUnitProgress(userId, prereqId);
        if (!progress || progress.completion_percentage < 100) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking unit unlock status:', error);
      return false;
    }
  }

  /**
   * Obtener progreso de una unidad específica
   */
  async getUnitProgress(userId, unitId) {
    try {
      const grades = await wordpressIntegration.searchPosts(this.postTypes.GRADE, {
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
          unit_id: unitId,
          completion_percentage: parseInt(await wordpressIntegration.getPostMeta(grade.id, 'completion_percentage')) || 0,
          score: parseFloat(await wordpressIntegration.getPostMeta(grade.id, 'score')) || 0,
          last_accessed: await wordpressIntegration.getPostMeta(grade.id, 'last_accessed'),
          time_spent: parseInt(await wordpressIntegration.getPostMeta(grade.id, 'time_spent')) || 0
        };
      }

      return {
        unit_id: unitId,
        completion_percentage: 0,
        score: 0,
        last_accessed: null,
        time_spent: 0
      };
    } catch (error) {
      console.error('Error getting unit progress:', error);
      return null;
    }
  }

  /**
   * Crear un camino por defecto para el estudiante
   */
  async createDefaultPathway(userId, courseId) {
    try {
      // Obtener unidades disponibles para el curso
      const availableUnits = await wordpressIntegration.searchPosts(this.postTypes.UNIT, {
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

      const pathwayData = {
        title: `Camino por defecto - Usuario ${userId}`,
        content: 'Camino de aprendizaje generado automáticamente',
        status: 'publish',
        meta: {
          course_id: courseId,
          assigned_students: JSON.stringify([userId]),
          units: JSON.stringify(availableUnits.map(unit => unit.id)),
          active: true,
          created_date: new Date().toISOString(),
          pathway_type: 'default'
        }
      };

      const pathway = await wordpressIntegration.createPost(this.postTypes.PATHWAY, pathwayData);
      
      return {
        id: pathway.id,
        title: pathway.title,
        description: pathway.content,
        units: availableUnits,
        progress: 0
      };
    } catch (error) {
      console.error('Error creating default pathway:', error);
      throw error;
    }
  }

  /**
   * Asignar estudiante a curso
   */
  async assignStudentToCourse(studentId, courseId) {
    try {
      // Obtener estudiantes ya asignados al curso
      const existingStudents = await wordpressIntegration.getPostMeta(courseId, 'assigned_students');
      let studentIds = existingStudents ? JSON.parse(existingStudents) : [];
      
      if (!studentIds.includes(studentId)) {
        studentIds.push(studentId);
        await wordpressIntegration.updatePostMeta(courseId, 'assigned_students', JSON.stringify(studentIds));
      }

      return true;
    } catch (error) {
      console.error('Error assigning student to course:', error);
      throw error;
    }
  }

  /**
   * Obtener todos los cursos (para administradores)
   */
  async getAllCourses() {
    try {
      return await wordpressIntegration.searchPosts(this.postTypes.COURSE, {
        meta_query: [
          {
            key: 'active',
            value: true,
            compare: '='
          }
        ]
      });
    } catch (error) {
      console.error('Error getting all courses:', error);
      throw error;
    }
  }

  /**
   * Obtener todos los estudiantes (para administradores)
   */
  async getAllStudents() {
    try {
      return await wordpressIntegration.searchPosts(this.postTypes.STUDENT, {
        meta_query: [
          {
            key: 'active',
            value: true,
            compare: '='
          }
        ]
      });
    } catch (error) {
      console.error('Error getting all students:', error);
      throw error;
    }
  }

  /**
   * Obtener unidades de un camino
   */
  async getPathwayUnits(pathwayId) {
    try {
      const unitIds = await wordpressIntegration.getPostMeta(pathwayId, 'units');
      if (!unitIds) return [];

      const ids = JSON.parse(unitIds);
      const units = [];

      for (const id of ids) {
        const unit = await wordpressIntegration.getPost(id);
        if (unit) {
          units.push(unit);
        }
      }

      return units;
    } catch (error) {
      console.error('Error getting pathway units:', error);
      return [];
    }
  }

  /**
   * Obtener progreso del camino
   */
  async getPathwayProgress(userId, pathwayId) {
    try {
      const units = await this.getPathwayUnits(pathwayId);
      if (units.length === 0) return 0;

      let totalProgress = 0;
      for (const unit of units) {
        const progress = await this.getUnitProgress(userId, unit.id);
        totalProgress += progress.completion_percentage;
      }

      return Math.round(totalProgress / units.length);
    } catch (error) {
      console.error('Error getting pathway progress:', error);
      return 0;
    }
  }
}

module.exports = new CPTService();