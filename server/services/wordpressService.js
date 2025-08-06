const axios = require('axios');

/**
 * Servicio para conectar con WordPress como headless CMS
 * Se conecta solo para traer contenido, no maneja autenticación
 */
class WordPressService {
  constructor() {
    this.baseURL = process.env.WORDPRESS_URL || 'https://icnpaim.cl';
    this.username = process.env.WORDPRESS_API_USER;
    this.password = process.env.WORDPRESS_API_PASSWORD;
    
    if (this.username && this.password) {
      this.auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    }
  }

  /**
   * Hacer petición a WordPress REST API
   */
  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}/wp-json/wp/v2/${endpoint}`,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      // Agregar autenticación si está disponible
      if (this.auth) {
        config.headers['Authorization'] = `Basic ${this.auth}`;
      }

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`WordPress API Error (${method} ${endpoint}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Obtener unidades de un curso específico
   */
  async getCourseUnits(courseId) {
    try {
      // Buscar posts del tipo 'icn_unit' filtrados por course_id
      const units = await this.makeRequest('GET', `icn_unit?meta_key=course_id&meta_value=${courseId}&per_page=100`);
      
      return units.map(unit => ({
        id: unit.id,
        title: unit.title.rendered,
        description: unit.content.rendered,
        type: unit.meta?.unit_type || 'lesson',
        duration: unit.meta?.estimated_duration || 30,
        difficulty: unit.meta?.difficulty_level || 'Intermedio',
        order: unit.meta?.order_index || 0,
        content: unit.meta?.unit_content ? JSON.parse(unit.meta.unit_content) : []
      }));
    } catch (error) {
      console.error('Error fetching course units:', error);
      return [];
    }
  }

  /**
   * Obtener contenido de una unidad específica
   */
  async getUnitContent(unitId) {
    try {
      const unit = await this.makeRequest('GET', `icn_unit/${unitId}`);
      
      return {
        id: unit.id,
        title: unit.title.rendered,
        description: unit.content.rendered,
        content: unit.meta?.unit_content ? JSON.parse(unit.meta.unit_content) : [],
        structure: unit.meta?.unit_structure ? JSON.parse(unit.meta.unit_structure) : {},
        type: unit.meta?.unit_type || 'lesson',
        duration: unit.meta?.estimated_duration || 30,
        difficulty: unit.meta?.difficulty_level || 'Intermedio'
      };
    } catch (error) {
      console.error('Error fetching unit content:', error);
      throw error;
    }
  }

  /**
   * Obtener información de un curso
   */
  async getCourseInfo(courseId) {
    try {
      const courses = await this.makeRequest('GET', `icn_course?meta_key=lti_course_id&meta_value=${courseId}&per_page=1`);
      
      if (courses && courses.length > 0) {
        const course = courses[0];
        return {
          id: course.id,
          title: course.title.rendered,
          description: course.content.rendered,
          lti_course_id: course.meta?.lti_course_id,
          instructor_id: course.meta?.instructor_id,
          active: course.meta?.active === 'true'
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching course info:', error);
      return null;
    }
  }

  /**
   * Crear o actualizar curso desde LTI
   */
  async createOrUpdateCourse(courseData) {
    try {
      // Buscar curso existente
      const existingCourse = await this.getCourseInfo(courseData.lti_course_id);
      
      const postData = {
        title: courseData.name,
        content: `Curso: ${courseData.name}`,
        status: 'publish',
        meta: {
          lti_course_id: courseData.lti_course_id,
          platform_id: courseData.platform_id,
          instructor_id: courseData.instructor_id,
          active: 'true',
          created_date: new Date().toISOString()
        }
      };

      if (existingCourse) {
        // Actualizar curso existente
        await this.makeRequest('PUT', `icn_course/${existingCourse.id}`, postData);
        return { ...existingCourse, ...postData };
      } else {
        // Crear nuevo curso
        const newCourse = await this.makeRequest('POST', 'icn_course', postData);
        return newCourse;
      }
    } catch (error) {
      console.error('Error creating/updating course:', error);
      throw error;
    }
  }

  /**
   * Guardar progreso del estudiante
   */
  async saveStudentProgress(progressData) {
    try {
      const postData = {
        title: `Progreso - Usuario ${progressData.user_id} - Unidad ${progressData.unit_id}`,
        content: 'Registro de progreso del estudiante',
        status: 'publish',
        meta: {
          student_id: progressData.user_id,
          unit_id: progressData.unit_id,
          course_id: progressData.course_id,
          completion_percentage: progressData.completion_percentage,
          score: progressData.score,
          completed: progressData.completed ? 'true' : 'false',
          last_updated: new Date().toISOString()
        }
      };

      const progress = await this.makeRequest('POST', 'icn_grade', postData);
      return progress;
    } catch (error) {
      console.error('Error saving student progress:', error);
      throw error;
    }
  }

  /**
   * Obtener progreso del estudiante
   */
  async getStudentProgress(userId, courseId) {
    try {
      const progressRecords = await this.makeRequest('GET', 
        `icn_grade?meta_key=student_id&meta_value=${userId}&per_page=100`
      );
      
      const progressByUnit = {};
      
      progressRecords.forEach(record => {
        const unitId = record.meta?.unit_id;
        if (unitId) {
          progressByUnit[unitId] = {
            completion_percentage: parseInt(record.meta?.completion_percentage) || 0,
            score: parseFloat(record.meta?.score) || 0,
            completed: record.meta?.completed === 'true',
            last_updated: record.meta?.last_updated
          };
        }
      });

      return progressByUnit;
    } catch (error) {
      console.error('Error fetching student progress:', error);
      return {};
    }
  }

  /**
   * Verificar conexión con WordPress
   */
  async testConnection() {
    try {
      const response = await this.makeRequest('GET', 'posts?per_page=1');
      console.log('✅ WordPress connection successful');
      return true;
    } catch (error) {
      console.error('❌ WordPress connection failed:', error.message);
      return false;
    }
  }
}

module.exports = new WordPressService();