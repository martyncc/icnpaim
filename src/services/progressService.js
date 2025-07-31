// services/progressService.js
const wordpressIntegration = require('./wordpressIntegration');

class ProgressService {
  constructor() {
    this.gradePostType = 'icn_grade';
  }

  /**
   * Actualizar progreso del estudiante
   */
  async updateProgress(userId, unitId, contentId, completed, score = 0) {
    try {
      console.log(`📊 Updating progress for user ${userId}, unit ${unitId}`);

      // Buscar progreso existente
      const existingProgress = await wordpressIntegration.searchPosts(this.gradePostType, {
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
          completed: completed,
          score: score,
          last_updated: new Date().toISOString(),
          completion_date: completed ? new Date().toISOString() : null
        }
      };

      let result;
      if (existingProgress && existingProgress.length > 0) {
        // Actualizar progreso existente
        const progressId = existingProgress[0].id;
        
        // Obtener datos actuales para mantener el historial
        const currentScore = await wordpressIntegration.getPostMeta(progressId, 'score') || 0;
        const currentCompleted = await wordpressIntegration.getPostMeta(progressId, 'completed') === 'true';
        
        // Solo actualizar si hay mejora
        if (score > currentScore || (completed && !currentCompleted)) {
          progressData.meta.previous_score = currentScore;
          progressData.meta.previous_completed = currentCompleted;
          result = await wordpressIntegration.updatePost(progressId, progressData);
        } else {
          result = existingProgress[0];
        }
      } else {
        // Crear nuevo registro de progreso
        result = await wordpressIntegration.createPost(this.gradePostType, progressData);
      }

      // Calcular y actualizar el porcentaje de completitud de la unidad
      await this.updateUnitCompletionPercentage(userId, unitId);

      // Verificar si se desbloquearon nuevas unidades
      await this.checkAndUnlockNextUnits(userId, unitId);

      console.log('✅ Progress updated successfully');
      return result;
    } catch (error) {
      console.error('Error updating progress:', error);
      throw error;
    }
  }

  /**
   * Obtener progreso completo del estudiante
   */
  async getStudentProgress(userId) {
    try {
      const allProgress = await wordpressIntegration.searchPosts(this.gradePostType, {
        meta_query: [
          {
            key: 'student_id',
            value: userId,
            compare: '='
          }
        ]
      });

      const progressByUnit = {};
      let totalScore = 0;
      let completedUnits = 0;

      for (const progress of allProgress) {
        const unitId = await wordpressIntegration.getPostMeta(progress.id, 'unit_id');
        const score = parseFloat(await wordpressIntegration.getPostMeta(progress.id, 'score')) || 0;
        const completed = await wordpressIntegration.getPostMeta(progress.id, 'completed') === 'true';
        const completionPercentage = parseInt(await wordpressIntegration.getPostMeta(progress.id, 'completion_percentage')) || 0;

        progressByUnit[unitId] = {
          unit_id: unitId,
          score: score,
          completed: completed,
          completion_percentage: completionPercentage,
          last_updated: await wordpressIntegration.getPostMeta(progress.id, 'last_updated'),
          completion_date: await wordpressIntegration.getPostMeta(progress.id, 'completion_date')
        };

        totalScore += score;
        if (completed) completedUnits++;
      }

      return {
        student_id: userId,
        progress_by_unit: progressByUnit,
        overall_stats: {
          total_units: Object.keys(progressByUnit).length,
          completed_units: completedUnits,
          average_score: Object.keys(progressByUnit).length > 0 ? totalScore / Object.keys(progressByUnit).length : 0,
          completion_percentage: Object.keys(progressByUnit).length > 0 ? (completedUnits / Object.keys(progressByUnit).length) * 100 : 0
        }
      };
    } catch (error) {
      console.error('Error getting student progress:', error);
      throw error;
    }
  }

  /**
   * Calcular porcentaje de completitud de una unidad
   */
  async updateUnitCompletionPercentage(userId, unitId) {
    try {
      // Obtener el contenido de la unidad para saber cuántos elementos tiene
      const unit = await wordpressIntegration.getPost(unitId);
      if (!unit) return;

      const unitContent = await wordpressIntegration.getPostMeta(unitId, 'unit_content');
      if (!unitContent) return;

      const content = JSON.parse(unitContent);
      const totalElements = content.length;

      if (totalElements === 0) return;

      // Contar elementos completados
      const completedElements = await wordpressIntegration.searchPosts(this.gradePostType, {
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
          },
          {
            key: 'completed',
            value: 'true',
            compare: '='
          }
        ]
      });

      const completionPercentage = Math.round((completedElements.length / totalElements) * 100);

      // Actualizar el registro de progreso principal de la unidad
      const unitProgress = await wordpressIntegration.searchPosts(this.gradePostType, {
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

      if (unitProgress && unitProgress.length > 0) {
        await wordpressIntegration.updatePostMeta(unitProgress[0].id, 'completion_percentage', completionPercentage);
        
        // Marcar unidad como completada si llega al 100%
        if (completionPercentage === 100) {
          await wordpressIntegration.updatePostMeta(unitProgress[0].id, 'completed', 'true');
          await wordpressIntegration.updatePostMeta(unitProgress[0].id, 'completion_date', new Date().toISOString());
        }
      }

      return completionPercentage;
    } catch (error) {
      console.error('Error updating unit completion percentage:', error);
      throw error;
    }
  }

  /**
   * Verificar y desbloquear unidades siguientes
   */
  async checkAndUnlockNextUnits(userId, completedUnitId) {
    try {
      // Obtener el camino del estudiante
      const pathways = await wordpressIntegration.searchPosts('icn_pathway', {
        meta_query: [
          {
            key: 'assigned_students',
            value: `"${userId}"`,
            compare: 'LIKE'
          }
        ]
      });

      if (!pathways || pathways.length === 0) return;

      const pathway = pathways[0];
      const unitIds = JSON.parse(await wordpressIntegration.getPostMeta(pathway.id, 'units') || '[]');
      
      const completedUnitIndex = unitIds.indexOf(completedUnitId);
      if (completedUnitIndex === -1 || completedUnitIndex === unitIds.length - 1) return;

      // Verificar si la unidad está realmente completada al 100%
      const progress = await this.getUnitProgress(userId, completedUnitId);
      if (progress.completion_percentage < 100) return;

      // Desbloquear la siguiente unidad
      const nextUnitId = unitIds[completedUnitIndex + 1];
      await this.unlockUnit(userId, nextUnitId);

      console.log(`🔓 Unit ${nextUnitId} unlocked for user ${userId}`);
    } catch (error) {
      console.error('Error checking and unlocking next units:', error);
    }
  }

  /**
   * Desbloquear una unidad para el estudiante
   */
  async unlockUnit(userId, unitId) {
    try {
      // Crear registro de unidad desbloqueada
      const unlockData = {
        title: `Unidad desbloqueada - Usuario ${userId} - Unidad ${unitId}`,
        content: 'Unidad desbloqueada automáticamente',
        status: 'publish',
        meta: {
          student_id: userId,
          unit_id: unitId,
          unlocked: 'true',
          unlock_date: new Date().toISOString(),
          unlock_reason: 'prerequisite_completed'
        }
      };

      await wordpressIntegration.createPost('icn_grade', unlockData);
      return true;
    } catch (error) {
      console.error('Error unlocking unit:', error);
      throw error;
    }
  }

  /**
   * Obtener progreso de una unidad específica
   */
  async getUnitProgress(userId, unitId) {
    try {
      const progress = await wordpressIntegration.searchPosts(this.gradePostType, {
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

      if (progress && progress.length > 0) {
        const p = progress[0];
        return {
          unit_id: unitId,
          completion_percentage: parseInt(await wordpressIntegration.getPostMeta(p.id, 'completion_percentage')) || 0,
          score: parseFloat(await wordpressIntegration.getPostMeta(p.id, 'score')) || 0,
          completed: await wordpressIntegration.getPostMeta(p.id, 'completed') === 'true',
          last_updated: await wordpressIntegration.getPostMeta(p.id, 'last_updated'),
          completion_date: await wordpressIntegration.getPostMeta(p.id, 'completion_date')
        };
      }

      return {
        unit_id: unitId,
        completion_percentage: 0,
        score: 0,
        completed: false,
        last_updated: null,
        completion_date: null
      };
    } catch (error) {
      console.error('Error getting unit progress:', error);
      return null;
    }
  }

  /**
   * Generar reporte de progreso para administradores
   */
  async generateProgressReport(courseId = null) {
    try {
      let students = [];
      
      if (courseId) {
        // Obtener estudiantes del curso específico
        const course = await wordpressIntegration.getPost(courseId);
        const assignedStudents = await wordpressIntegration.getPostMeta(courseId, 'assigned_students');
        const studentIds = assignedStudents ? JSON.parse(assignedStudents) : [];
        
        for (const studentId of studentIds) {
          const student = await wordpressIntegration.getPost(studentId);
          if (student) {
            const progress = await this.getStudentProgress(studentId);
            students.push({
              student: student,
              progress: progress
            });
          }
        }
      } else {
        // Obtener todos los estudiantes
        const allStudents = await wordpressIntegration.searchPosts('icn_student', {
          meta_query: [
            {
              key: 'active',
              value: 'true',
              compare: '='
            }
          ]
        });

        for (const student of allStudents) {
          const progress = await this.getStudentProgress(student.id);
          students.push({
            student: student,
            progress: progress
          });
        }
      }

      return {
        course_id: courseId,
        generated_at: new Date().toISOString(),
        total_students: students.length,
        students: students,
        summary: this.calculateProgressSummary(students)
      };
    } catch (error) {
      console.error('Error generating progress report:', error);
      throw error;
    }
  }

  /**
   * Calcular resumen de progreso
   */
  calculateProgressSummary(studentsData) {
    if (studentsData.length === 0) {
      return {
        average_completion: 0,
        average_score: 0,
        students_completed: 0,
        completion_rate: 0
      };
    }

    let totalCompletion = 0;
    let totalScore = 0;
    let studentsCompleted = 0;

    studentsData.forEach(data => {
      const stats = data.progress.overall_stats;
      totalCompletion += stats.completion_percentage;
      totalScore += stats.average_score;
      if (stats.completion_percentage === 100) {
        studentsCompleted++;
      }
    });

    return {
      average_completion: Math.round(totalCompletion / studentsData.length),
      average_score: Math.round(totalScore / studentsData.length),
      students_completed: studentsCompleted,
      completion_rate: Math.round((studentsCompleted / studentsData.length) * 100)
    };
  }
}

module.exports = new ProgressService();