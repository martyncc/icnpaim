// services/wordpressIntegration.js
const axios = require('axios');

class WordPressIntegration {
  constructor() {
    this.baseURL = process.env.WORDPRESS_URL;
    this.username = process.env.WORDPRESS_API_USER;
    this.password = process.env.WORDPRESS_API_PASSWORD;
    this.auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
  }

  /**
   * Hacer petición autenticada a WordPress
   */
  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}/wp-json/wp/v2/${endpoint}`,
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        }
      };

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
   * Registrar o hacer login de usuario
   */
  async registerOrLoginUser(userInfo) {
    try {
      console.log('🔍 Checking/creating WordPress user...');
      
      // Primero buscar si el usuario ya existe
      const existingUsers = await this.makeRequest('GET', `users?search=${encodeURIComponent(userInfo.email)}`);
      
      if (existingUsers && existingUsers.length > 0) {
        const user = existingUsers[0];
        console.log('✅ Existing WordPress user found:', user.name);
        
        // Actualizar metadatos del usuario
        await this.updateUserMeta(user.id, {
          lti_user_id: userInfo.lti_id,
          lti_roles: JSON.stringify(userInfo.roles),
          last_lti_login: new Date().toISOString(),
          course_id: userInfo.course_id,
          platform_id: userInfo.platform_id
        });
        
        return user;
      }

      // Crear nuevo usuario
      const userData = {
        username: this.generateUsername(userInfo.email),
        email: userInfo.email,
        name: userInfo.name,
        password: this.generatePassword(),
        roles: this.mapLTIRolesToWP(userInfo.roles),
        meta: {
          lti_user_id: userInfo.lti_id,
          lti_roles: JSON.stringify(userInfo.roles),
          first_lti_login: new Date().toISOString(),
          last_lti_login: new Date().toISOString(),
          course_id: userInfo.course_id,
          platform_id: userInfo.platform_id
        }
      };

      const newUser = await this.makeRequest('POST', 'users', userData);
      console.log('✅ New WordPress user created:', newUser.name);
      
      return newUser;
    } catch (error) {
      console.error('Error in registerOrLoginUser:', error);
      throw error;
    }
  }

  /**
   * Crear post de cualquier tipo
   */
  async createPost(postType, postData) {
    try {
      const data = {
        title: postData.title,
        content: postData.content,
        status: postData.status || 'publish',
        type: postType,
        meta: postData.meta || {}
      };

      return await this.makeRequest('POST', `${postType}s`, data);
    } catch (error) {
      console.error(`Error creating ${postType}:`, error);
      throw error;
    }
  }

  /**
   * Actualizar post
   */
  async updatePost(postId, postData) {
    try {
      const data = {
        title: postData.title,
        content: postData.content,
        status: postData.status || 'publish',
        meta: postData.meta || {}
      };

      return await this.makeRequest('PUT', `posts/${postId}`, data);
    } catch (error) {
      console.error(`Error updating post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener post por ID
   */
  async getPost(postId) {
    try {
      return await this.makeRequest('GET', `posts/${postId}`);
    } catch (error) {
      console.error(`Error getting post ${postId}:`, error);
      return null;
    }
  }

  /**
   * Buscar posts con criterios específicos
   */
  async searchPosts(postType, criteria = {}) {
    try {
      let queryParams = `?per_page=100`;
      
      if (criteria.meta_query) {
        // Construir query para metadatos
        criteria.meta_query.forEach((meta, index) => {
          queryParams += `&meta_key=${meta.key}&meta_value=${meta.value}&meta_compare=${meta.compare || '='}`;
        });
      }

      const endpoint = postType === 'post' ? 'posts' : `${postType}s`;
      return await this.makeRequest('GET', `${endpoint}${queryParams}`);
    } catch (error) {
      console.error(`Error searching ${postType}s:`, error);
      return [];
    }
  }

  /**
   * Obtener metadato de post
   */
  async getPostMeta(postId, metaKey) {
    try {
      const response = await this.makeRequest('GET', `posts/${postId}/meta`);
      const meta = response.find(m => m.key === metaKey);
      return meta ? meta.value : null;
    } catch (error) {
      console.error(`Error getting post meta ${metaKey} for post ${postId}:`, error);
      return null;
    }
  }

  /**
   * Actualizar metadato de post
   */
  async updatePostMeta(postId, metaKey, metaValue) {
    try {
      const data = {
        key: metaKey,
        value: metaValue
      };
      
      return await this.makeRequest('POST', `posts/${postId}/meta`, data);
    } catch (error) {
      console.error(`Error updating post meta ${metaKey} for post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Actualizar metadatos de usuario
   */
  async updateUserMeta(userId, metaData) {
    try {
      for (const [key, value] of Object.entries(metaData)) {
        await this.makeRequest('POST', `users/${userId}/meta`, {
          key,
          value: typeof value === 'object' ? JSON.stringify(value) : value
        });
      }
      return true;
    } catch (error) {
      console.error(`Error updating user meta for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Generar nombre de usuario único
   */
  generateUsername(email) {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const timestamp = Date.now().toString().slice(-4);
    return `${base}_${timestamp}`;
  }

  /**
   * Generar contraseña temporal
   */
  generatePassword() {
    return Math.random().toString(36).slice(-12) + '!A1';
  }

  /**
   * Mapear roles de LTI a roles de WordPress
   */
  mapLTIRolesToWP(ltiRoles) {
    if (!ltiRoles || ltiRoles.length === 0) return ['subscriber'];

    for (const role of ltiRoles) {
      if (role.includes('Instructor') || role.includes('TeachingAssistant')) {
        return ['editor'];
      }
      if (role.includes('Administrator')) {
        return ['administrator'];
      }
      if (role.includes('Student') || role.includes('Learner')) {
        return ['subscriber'];
      }
    }

    return ['subscriber'];
  }

  /**
   * Crear Custom Post Types necesarios para ICN PAIM
   */
  async initializeCPTs() {
    try {
      console.log('🏗️ Initializing ICN PAIM Custom Post Types...');
      
      // Esta función debería ejecutarse una vez para configurar los CPTs
      // En un entorno real, esto se haría mediante un plugin de WordPress
      
      const cptDefinitions = {
        icn_unit: {
          labels: {
            name: 'Unidades ICN',
            singular_name: 'Unidad ICN'
          },
          public: true,
          has_archive: true,
          supports: ['title', 'editor', 'custom-fields'],
          menu_icon: 'dashicons-book-alt'
        },
        icn_pathway: {
          labels: {
            name: 'Caminos ICN',
            singular_name: 'Camino ICN'
          },
          public: true,
          has_archive: true,
          supports: ['title', 'editor', 'custom-fields'],
          menu_icon: 'dashicons-networking'
        },
        icn_course: {
          labels: {
            name: 'Cursos ICN',
            singular_name: 'Curso ICN'
          },
          public: true,
          has_archive: true,
          supports: ['title', 'editor', 'custom-fields'],
          menu_icon: 'dashicons-welcome-learn-more'
        },
        icn_student: {
          labels: {
            name: 'Estudiantes ICN',
            singular_name: 'Estudiante ICN'
          },
          public: false,
          show_ui: true,
          supports: ['title', 'custom-fields'],
          menu_icon: 'dashicons-groups'
        },
        icn_grade: {
          labels: {
            name: 'Calificaciones ICN',
            singular_name: 'Calificación ICN'
          },
          public: false,
          show_ui: true,
          supports: ['title', 'custom-fields'],
          menu_icon: 'dashicons-chart-bar'
        }
      };

      console.log('ℹ️ CPT definitions ready. Configure these in WordPress admin or via plugin.');
      return cptDefinitions;
    } catch (error) {
      console.error('Error initializing CPTs:', error);
      throw error;
    }
  }
}

module.exports = new WordPressIntegration();