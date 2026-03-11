/**
 * lib/roles.js
 * Jerarquía y permisos de roles del sistema.
 *
 * Orden jerárquico (de menor a mayor):
 *   trabajador → jefatura → tens → prevencionista → administrador
 *
 * Modelo acumulativo:
 *   - trabajador      → puede CONFIRMAR recepciones
 *   - jefatura        → puede SOLICITAR + todo de trabajador
 *   - tens            → puede GESTIONAR inventario/despachos + todo de trabajador
 *   - prevencionista  → puede todo de jefatura + todo de tens + trabajador
 *   - administrador   → puede todo + CRUD usuarios + reportes globales
 */

// Ruta raíz del dashboard por rol (para redirecciones post-login)
export const ROLE_HOME = {
    trabajador: '/trabajador',
    jefatura: '/jefatura',
    tens: '/tens',
    prevencionista: '/prevencionista',
    administrador: '/admin',
};

// ────────────────────────────────────────────────────────────
// Capacidades por rol (acumulativas)
// ────────────────────────────────────────────────────────────
const CAPACIDADES = {
    // Puede confirmar recepciones de insumos que le fueron despachados
    puedeRecibirInsumos: ['trabajador', 'jefatura', 'tens', 'prevencionista', 'administrador'],

    // Puede crear solicitudes de insumos para trabajadores
    puedeSolicitar: ['jefatura', 'prevencionista', 'administrador'],

    // Puede ver, autorizar y despachar solicitudes; registrar ingresos/mermas
    puedeGestionar: ['tens', 'prevencionista', 'administrador'],

    // Acceso al panel de administración (CRUD usuarios, reportes globales)
    puedeAdmin: ['administrador'],
};

/**
 * Verifica si un rol tiene una capacidad determinada.
 * @param {string} rol
 * @param {keyof typeof CAPACIDADES} capacidad
 */
export function puede(rol, capacidad) {
    if (!rol || !CAPACIDADES[capacidad]) return false;
    return CAPACIDADES[capacidad].includes(rol);
}

/**
 * Devuelve todas las capacidades activas de un rol.
 * @param {string} rol
 * @returns {string[]}
 */
export function getCapacidades(rol) {
    return Object.entries(CAPACIDADES)
        .filter(([, roles]) => roles.includes(rol))
        .map(([cap]) => cap);
}

/**
 * Devuelve el label legible del rol.
 * @param {string} rol
 */
export function getRolLabel(rol) {
    const labels = {
        trabajador: 'Trabajador',
        jefatura: 'Jefatura',
        tens: 'TENS / Prevencionista',
        prevencionista: 'Prevencionista',
        administrador: 'Administrador',
    };
    return labels[rol] ?? rol;
}

/**
 * Todos los roles disponibles para formularios de selección.
 */
export const ROLES = [
    { value: 'trabajador', label: 'Trabajador' },
    { value: 'jefatura', label: 'Jefatura' },
    { value: 'tens', label: 'TENS' },
    { value: 'prevencionista', label: 'Prevencionista' },
    { value: 'administrador', label: 'Administrador' },
];
