const axios = require('axios');

class WordPressService {
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
      
      // Buscar si el usuario ya existe
      const existingUsers = await this.makeRequest('GET', `users?search=${encodeURIComponent(userInfo.email)}`);
      
      if (existingUsers && existingUsers.length > 0) {
        const user = existingUsers[0];
        console.log('✅ Existing WordPress user found:', user.name);
        
        // Actualizar última conexión
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
   * Buscar posts con criterios específicos
   */
  async searchPosts(postType, criteria = {}) {
    try {
      let queryParams = `?per_page=100`;
      
      if (criteria.meta_query) {
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
}

module.exports = new WordPressService();