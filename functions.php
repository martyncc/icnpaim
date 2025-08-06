<?php
/**
 * ICN PAIM - WordPress Functions
 * Configuración de Custom Post Types y funciones para LTI
 */

// Evitar acceso directo
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Registrar Custom Post Types para ICN PAIM
 */
function icn_paim_register_post_types() {
    
    // CPT: Cursos ICN
    register_post_type('icn_course', array(
        'labels' => array(
            'name' => 'Cursos ICN',
            'singular_name' => 'Curso ICN',
            'add_new' => 'Agregar Curso',
            'add_new_item' => 'Agregar Nuevo Curso',
            'edit_item' => 'Editar Curso',
            'new_item' => 'Nuevo Curso',
            'view_item' => 'Ver Curso',
            'search_items' => 'Buscar Cursos',
            'not_found' => 'No se encontraron cursos',
            'not_found_in_trash' => 'No hay cursos en la papelera'
        ),
        'public' => false,
        'show_ui' => true,
        'show_in_menu' => true,
        'menu_icon' => 'dashicons-welcome-learn-more',
        'menu_position' => 25,
        'supports' => array('title', 'editor', 'custom-fields'),
        'has_archive' => false,
        'rewrite' => false,
        'capability_type' => 'post',
        'show_in_rest' => true
    ));

    // CPT: Unidades ICN
    register_post_type('icn_unit', array(
        'labels' => array(
            'name' => 'Unidades ICN',
            'singular_name' => 'Unidad ICN',
            'add_new' => 'Agregar Unidad',
            'add_new_item' => 'Agregar Nueva Unidad',
            'edit_item' => 'Editar Unidad',
            'new_item' => 'Nueva Unidad',
            'view_item' => 'Ver Unidad',
            'search_items' => 'Buscar Unidades',
            'not_found' => 'No se encontraron unidades',
            'not_found_in_trash' => 'No hay unidades en la papelera'
        ),
        'public' => false,
        'show_ui' => true,
        'show_in_menu' => true,
        'menu_icon' => 'dashicons-book-alt',
        'menu_position' => 26,
        'supports' => array('title', 'editor', 'custom-fields'),
        'has_archive' => false,
        'rewrite' => false,
        'capability_type' => 'post',
        'show_in_rest' => true
    ));

    // CPT: Caminos de Aprendizaje
    register_post_type('icn_pathway', array(
        'labels' => array(
            'name' => 'Caminos ICN',
            'singular_name' => 'Camino ICN',
            'add_new' => 'Agregar Camino',
            'add_new_item' => 'Agregar Nuevo Camino',
            'edit_item' => 'Editar Camino',
            'new_item' => 'Nuevo Camino',
            'view_item' => 'Ver Camino',
            'search_items' => 'Buscar Caminos',
            'not_found' => 'No se encontraron caminos',
            'not_found_in_trash' => 'No hay caminos en la papelera'
        ),
        'public' => false,
        'show_ui' => true,
        'show_in_menu' => true,
        'menu_icon' => 'dashicons-networking',
        'menu_position' => 27,
        'supports' => array('title', 'editor', 'custom-fields'),
        'has_archive' => false,
        'rewrite' => false,
        'capability_type' => 'post',
        'show_in_rest' => true
    ));

    // CPT: Estudiantes ICN
    register_post_type('icn_student', array(
        'labels' => array(
            'name' => 'Estudiantes ICN',
            'singular_name' => 'Estudiante ICN',
            'add_new' => 'Agregar Estudiante',
            'add_new_item' => 'Agregar Nuevo Estudiante',
            'edit_item' => 'Editar Estudiante',
            'new_item' => 'Nuevo Estudiante',
            'view_item' => 'Ver Estudiante',
            'search_items' => 'Buscar Estudiantes',
            'not_found' => 'No se encontraron estudiantes',
            'not_found_in_trash' => 'No hay estudiantes en la papelera'
        ),
        'public' => false,
        'show_ui' => true,
        'show_in_menu' => true,
        'menu_icon' => 'dashicons-groups',
        'menu_position' => 28,
        'supports' => array('title', 'custom-fields'),
        'has_archive' => false,
        'rewrite' => false,
        'capability_type' => 'post',
        'show_in_rest' => true
    ));

    // CPT: Calificaciones/Progreso ICN
    register_post_type('icn_grade', array(
        'labels' => array(
            'name' => 'Calificaciones ICN',
            'singular_name' => 'Calificación ICN',
            'add_new' => 'Agregar Calificación',
            'add_new_item' => 'Agregar Nueva Calificación',
            'edit_item' => 'Editar Calificación',
            'new_item' => 'Nueva Calificación',
            'view_item' => 'Ver Calificación',
            'search_items' => 'Buscar Calificaciones',
            'not_found' => 'No se encontraron calificaciones',
            'not_found_in_trash' => 'No hay calificaciones en la papelera'
        ),
        'public' => false,
        'show_ui' => true,
        'show_in_menu' => true,
        'menu_icon' => 'dashicons-chart-bar',
        'menu_position' => 29,
        'supports' => array('title', 'custom-fields'),
        'has_archive' => false,
        'rewrite' => false,
        'capability_type' => 'post',
        'show_in_rest' => true
    ));
}
add_action('init', 'icn_paim_register_post_types');

/**
 * Habilitar CORS para API REST de WordPress
 */
function icn_paim_cors_headers() {
    header('Access-Control-Allow-Origin: https://icnpaim.cl');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Allow-Credentials: true');
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}
add_action('init', 'icn_paim_cors_headers');

/**
 * Agregar campos personalizados a la API REST
 */
function icn_paim_add_meta_to_rest() {
    $post_types = ['icn_course', 'icn_unit', 'icn_pathway', 'icn_student', 'icn_grade'];
    
    foreach ($post_types as $post_type) {
        register_rest_field($post_type, 'meta', array(
            'get_callback' => function($post) {
                return get_post_meta($post['id']);
            },
            'update_callback' => function($meta_value, $post) {
                foreach ($meta_value as $key => $value) {
                    update_post_meta($post->ID, $key, $value);
                }
            },
            'schema' => array(
                'description' => 'Meta fields',
                'type' => 'object'
            )
        ));
    }
}
add_action('rest_api_init', 'icn_paim_add_meta_to_rest');

/**
 * Permitir autenticación básica para API REST
 */
function icn_paim_basic_auth($user) {
    if (!empty($user)) {
        return $user;
    }

    if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
        return $user;
    }

    $auth = $_SERVER['HTTP_AUTHORIZATION'];
    if (strpos($auth, 'Basic ') !== 0) {
        return $user;
    }

    $credentials = base64_decode(substr($auth, 6));
    if (!$credentials) {
        return $user;
    }

    list($username, $password) = explode(':', $credentials, 2);
    
    $user = wp_authenticate($username, $password);
    
    if (is_wp_error($user)) {
        return null;
    }

    return $user;
}
add_filter('determine_current_user', 'icn_paim_basic_auth', 20);

/**
 * Agregar menú de administración ICN PAIM
 */
function icn_paim_admin_menu() {
    add_menu_page(
        'ICN PAIM Dashboard',
        'ICN PAIM',
        'manage_options',
        'icn-paim-dashboard',
        'icn_paim_dashboard_page',
        'dashicons-welcome-learn-more',
        30
    );
    
    add_submenu_page(
        'icn-paim-dashboard',
        'Configuración LTI',
        'Config LTI',
        'manage_options',
        'icn-paim-lti-config',
        'icn_paim_lti_config_page'
    );
}
add_action('admin_menu', 'icn_paim_admin_menu');

/**
 * Página del dashboard de ICN PAIM
 */
function icn_paim_dashboard_page() {
    ?>
    <div class="wrap">
        <h1>ICN PAIM Dashboard</h1>
        <div class="card">
            <h2>Estado de la Integración LTI</h2>
            <p><strong>Dominio:</strong> https://icnpaim.cl</p>
            <p><strong>Login URL:</strong> https://icnpaim.cl/lti/login</p>
            <p><strong>Launch URL:</strong> https://icnpaim.cl/lti/launch</p>
            <p><strong>JWKS URL:</strong> https://icnpaim.cl/.well-known/jwks.json</p>
        </div>
        
        <div class="card">
            <h2>Estadísticas</h2>
            <?php
            $courses = wp_count_posts('icn_course');
            $units = wp_count_posts('icn_unit');
            $students = wp_count_posts('icn_student');
            $grades = wp_count_posts('icn_grade');
            ?>
            <p><strong>Cursos:</strong> <?php echo $courses->publish; ?></p>
            <p><strong>Unidades:</strong> <?php echo $units->publish; ?></p>
            <p><strong>Estudiantes:</strong> <?php echo $students->publish; ?></p>
            <p><strong>Registros de Progreso:</strong> <?php echo $grades->publish; ?></p>
        </div>
    </div>
    <?php
}

/**
 * Página de configuración LTI
 */
function icn_paim_lti_config_page() {
    ?>
    <div class="wrap">
        <h1>Configuración LTI</h1>
        <div class="card">
            <h2>Datos para Blackboard</h2>
            <table class="form-table">
                <tr>
                    <th>Application Key</th>
                    <td><code>89ef5212-b589-4f9c-b5b8-2fa6ad3e2006</code></td>
                </tr>
                <tr>
                    <th>Deployment ID</th>
                    <td><code>2b286722-4ef6-4dda-a756-eec5dca12441</code></td>
                </tr>
                <tr>
                    <th>Login URL</th>
                    <td><code>https://icnpaim.cl/lti/login</code></td>
                </tr>
                <tr>
                    <th>Launch URL</th>
                    <td><code>https://icnpaim.cl/lti/launch</code></td>
                </tr>
                <tr>
                    <th>JWKS URL</th>
                    <td><code>https://icnpaim.cl/.well-known/jwks.json</code></td>
                </tr>
            </table>
        </div>
    </div>
    <?php
}

/**
 * Función helper para logging de ICN PAIM
 */
function icn_paim_log($message, $data = null) {
    if (WP_DEBUG && WP_DEBUG_LOG) {
        $log_message = '[ICN PAIM] ' . $message;
        if ($data) {
            $log_message .= ' - Data: ' . print_r($data, true);
        }
        error_log($log_message);
    }
}

/**
 * Crear tablas personalizadas si es necesario
 */
function icn_paim_create_tables() {
    global $wpdb;
    
    // Aquí puedes agregar creación de tablas personalizadas si las necesitas
    // Por ahora usamos solo CPTs y meta fields
}
register_activation_hook(__FILE__, 'icn_paim_create_tables');

/**
 * Limpiar datos al desactivar (opcional)
 */
function icn_paim_cleanup() {
    // Opcional: limpiar datos al desactivar el plugin
    // Por seguridad, comentado por defecto
    /*
    $post_types = ['icn_course', 'icn_unit', 'icn_pathway', 'icn_student', 'icn_grade'];
    foreach ($post_types as $post_type) {
        $posts = get_posts(array('post_type' => $post_type, 'numberposts' => -1));
        foreach ($posts as $post) {
            wp_delete_post($post->ID, true);
        }
    }
    */
}
// register_deactivation_hook(__FILE__, 'icn_paim_cleanup');

?>