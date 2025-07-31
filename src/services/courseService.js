// services/courseService.js
const wordpressIntegration = require('./wordpressIntegration');

class CourseService {
  constructor() {
    this.coursePostType = 'icn_course';
    this.unitPostType = 'icn_unit';
  }

  /**
   * Crear o actualizar curso desde LTI
   */
  async createOrUpdateCourse(courseData) {
    try {
      console.log('🏫 Creating/updating course:', courseData.name);

      // Buscar curso existente por LTI ID
      const existingCourses = await wordpressIntegration.searchPosts(this.coursePostType, {
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
          instructor_id: courseData.wp_user_id,
          active: true,
          created_date: new Date().toISOString()
        }
      };

      if (existingCourses && existingCourses.length > 0) {
        // Actualizar curso existente
        const courseId = existingCourses[0].id;
        await wordpressIntegration.updatePost(courseId, coursePostData);
        return { id: courseId, ...coursePostData };
      } else {
        // Crear nuevo curso
        const newCourse = await wordpressIntegration.createPost(this.coursePostType, coursePostData);
        return newCourse;
      }
    } catch (error) {
      console.error('Error creating/updating course:', error);
      throw error;
    }
  }

  /**
   * Obtener cursos del usuario
   */
  async getUserCourses(userId) {
    try {
      return await wordpressIntegration.searchPosts(this.coursePostType, {
        meta_query: [
          {
            key: 'instructor_id',
            value: userId,
            compare: '='
          },
          {
            key: 'active',
            value: true,
            compare: '='
          }
        ]
      });
    } catch (error) {
      console.error('Error fetching user courses:', error);
      throw error;
    }
  }

  /**
   * Obtener unidades del curso
   */
  async getCourseUnits(courseId) {
    try {
      return await wordpressIntegration.searchPosts(this.unitPostType, {
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
    } catch (error) {
      console.error('Error fetching course units:', error);
      throw error;
    }
  }

  /**
   * Obtener contenido de unidad
   */
  async getUnitContent(unitId) {
    try {
      const unit = await wordpressIntegration.getPost(unitId);
      if (!unit) {
        throw new Error('Unit not found');
      }

      const content = await wordpressIntegration.getPostMeta(unitId, 'unit_content');
      return {
        id: unit.id,
        title: unit.title,
        description: unit.content,
        content: content ? JSON.parse(content) : []
      };
    } catch (error) {
      console.error('Error fetching unit content:', error);
      throw error;
    }
  }

  /**
   * Habilitar unidad
   */
  async enableUnit(unitId) {
    try {
      await wordpressIntegration.updatePostMeta(unitId, 'active', true);
      return { success: true, unitId };
    } catch (error) {
      console.error('Error enabling unit:', error);
      throw error;
    }
  }

  /**
   * Crear curso
   */
  async createCourse(courseData) {
    try {
      const postData = {
        title: courseData.title,
        content: courseData.description || '',
        status: 'publish',
        meta: {
          active: true,
          created_date: new Date().toISOString(),
          ...courseData.meta
        }
      };

      return await wordpressIntegration.createPost(this.coursePostType, postData);
    } catch (error) {
      console.error('Error creating course:', error);
      throw error;
    }
  }
}

module.exports = new CourseService();