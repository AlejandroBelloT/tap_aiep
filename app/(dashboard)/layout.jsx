'use client';
/**
 * app/(dashboard)/layout.jsx
 *
 * Layout compartido por todos los dashboards.
 * Funciona como "ProtectedRoute":
 *   1. Verifica que haya sesión activa.
 *   2. Verifica que el rol del usuario coincida con la ruta que está visitando.
 *   3. Si no tiene permiso, redirige al dashboard correspondiente a su rol.
 *
 * También renderiza el sidebar de navegación adaptado al rol.
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_HOME, puede, getRolLabel } from '@/lib/roles';
import { useNotificaciones } from '@/hooks/useNotificaciones';

// Mapa de qué rutas puede acceder cada rol
const ACCESO_POR_ROL = {
    trabajador: ['/trabajador'],
    jefatura: ['/jefatura'],
    tens: ['/tens'],
    prevencionista: ['/prevencionista'],
    administrador: ['/admin'],
};

// Elementos del sidebar según rol
function buildNavItems(perfil) {
    if (!perfil) return [];
    const { rol } = perfil;
    const items = [];

    // ── TENS ───────────────────────────────────────────────
    if (rol === 'tens') {
        items.push({
            section: 'Gestión de Insumos',
            links: [
                { href: '/tens?tab=inventario', label: 'Inventario', icon: '🗂️' },
                { href: '/tens?tab=stock', label: 'Consultar Stock', icon: '🔍' },
                { href: '/tens?tab=compra', label: 'Solicitar Compra', icon: '🛒' },
                { href: '/tens?tab=recepcion-compra', label: 'Recepción de Compras', icon: '📦' },
            ],
        });
        items.push({
            section: 'Solicitudes de Trabajadores',
            links: [
                { href: '/tens?tab=solicitudes', label: 'Solicitudes Pendientes', icon: '📋', badgeKey: 'solicitudes-pendientes' },
            ],
        });
        items.push({
            section: 'Mis Insumos',
            links: [
                { href: '/tens?tab=recepciones', label: 'Mis Recepciones', icon: '📬', badgeKey: 'mis-recepciones' },
                { href: '/tens?tab=mis-solicitudes', label: 'Mis Solicitudes', icon: '📄', badgeKey: 'mis-solicitudes' },
            ],
        });
    }

    // ── Prevencionista ─────────────────────────────────────
    if (rol === 'prevencionista') {
        items.push({
            section: 'Gestión de Insumos',
            links: [
                { href: '/prevencionista?tab=inventario', label: 'Inventario', icon: '🗂️' },
                { href: '/prevencionista?tab=stock', label: 'Consultar Stock', icon: '🔍' },
                { href: '/prevencionista?tab=compra', label: 'Solicitar Compra', icon: '🛒' },
                { href: '/prevencionista?tab=recepcion-compra', label: 'Recepción de Compras', icon: '📦' },
            ],
        });
        items.push({
            section: 'Solicitudes de Trabajadores',
            links: [
                { href: '/prevencionista?tab=solicitudes', label: 'Solicitudes Pendientes', icon: '📋', badgeKey: 'solicitudes-pendientes' },
            ],
        });
        items.push({
            section: 'Mis Solicitudes de Insumos',
            links: [
                { href: '/prevencionista?tab=nueva', label: 'Crear Solicitud', icon: '➕' },
                { href: '/prevencionista?tab=mis-solicitudes', label: 'Mis Solicitudes', icon: '📄', badgeKey: 'mis-solicitudes' },
                { href: '/prevencionista?tab=recepciones', label: 'Mis Recepciones', icon: '✅', badgeKey: 'mis-recepciones' },
            ],
        });
    }

    // ── Jefatura ───────────────────────────────────────────
    if (rol === 'jefatura') {
        items.push({
            section: 'Mis Solicitudes de Insumos',
            links: [
                { href: '/jefatura?tab=nueva', label: 'Crear Solicitud', icon: '➕' },
                { href: '/jefatura?tab=mis-solicitudes', label: 'Mis Solicitudes', icon: '📄', badgeKey: 'mis-solicitudes' },
                { href: '/jefatura?tab=recepciones', label: 'Mis Recepciones', icon: '✅', badgeKey: 'mis-recepciones' },
            ],
        });
    }

    // ── Trabajador ─────────────────────────────────────────
    if (rol === 'trabajador') {
        items.push({
            section: 'Mis Insumos',
            links: [
                { href: '/trabajador?tab=recepciones', label: 'Mis Recepciones', icon: '📬', badgeKey: 'mis-recepciones' },
                { href: '/trabajador?tab=mis-solicitudes', label: 'Mis Solicitudes', icon: '📄', badgeKey: 'mis-solicitudes' },
            ],
        });
    }

    // ── Administración ─────────────────────────────────────
    if (puede(perfil.rol, 'puedeAdmin')) {
        items.push({
            section: 'Administración',
            links: [
                { href: '/admin', label: 'Panel general', icon: '🏠' },
                { href: '/admin?v=usuarios', label: 'Gestión usuarios', icon: '👥' },
                { href: '/admin?v=compras', label: 'Solicitudes de compra', icon: '🛒', badgeKey: 'compras-pendientes' },
                { href: '/admin?v=reportes', label: 'Reportes globales', icon: '📊' },
                { href: '/admin?v=insumos', label: 'Gestión de insumos', icon: '🧪' },
                { href: '/admin?v=inventario', label: 'Inventario', icon: '📦' },
                { href: '/admin?v=stock', label: 'Consultar stock', icon: '🔍' },
            ],
        });
        items.push({
            section: 'Mis Insumos',
            links: [
                { href: '/admin?v=recepciones', label: 'Mis Recepciones', icon: '📬', badgeKey: 'mis-recepciones' },
                { href: '/admin?v=mis-solicitudes', label: 'Mis Solicitudes', icon: '📄', badgeKey: 'mis-solicitudes' },
            ],
        });
    }

    return items;
}

// ── Componente Sidebar ──────────────────────────────────────
function Sidebar({ perfil, onSignOut, isOpen, onClose, badges }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const navItems = buildNavItems(perfil);

    const isActive = (href) => {
        const [hrefPath, hrefQuery] = href.split('?');
        if (pathname !== hrefPath && !pathname?.startsWith(hrefPath + '/')) return false;
        if (!hrefQuery) {
            // Sin query: activo solo cuando no hay ?v ni ?tab en la URL
            return !searchParams.get('v') && !searchParams.get('tab');
        }
        const hrefParams = new URLSearchParams(hrefQuery);
        if (hrefParams.get('v')) return hrefParams.get('v') === searchParams.get('v');
        if (hrefParams.get('tab')) return hrefParams.get('tab') === searchParams.get('tab');
        return false;
    };

    return (
        <>
            {/* Overlay móvil */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-20 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-30
          flex flex-col transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-sm">
                            GI
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-white leading-tight">Gestión de<br />Insumos</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
                        ✕
                    </button>
                </div>

                {/* Perfil */}
                <div className="px-4 py-4 border-b border-slate-700">
                    <p className="text-sm font-semibold text-white truncate">{perfil?.nombre}</p>
                    <span className="inline-block mt-1 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                        {getRolLabel(perfil?.rol)}
                    </span>
                    <p className="text-xs text-slate-400 mt-1 truncate">{perfil?.servicio}</p>
                </div>

                {/* Navegación */}
                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                    {navItems.map(({ section, links }) => (
                        <div key={section}>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1">
                                {section}
                            </p>
                            <ul className="space-y-0.5">
                                {links.map(({ href, label, icon, badgeKey }) => {
                                    const active = isActive(href);
                                    const badgeCount = badgeKey ? (badges?.[badgeKey] ?? 0) : 0;
                                    return (
                                        <li key={href}>
                                            <a
                                                href={href}
                                                className={`
                          flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition
                          ${active
                                                        ? 'bg-blue-600 text-white font-medium'
                                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
                        `}
                                            >
                                                <span className="text-base">{icon}</span>
                                                <span className="flex-1">{label}</span>
                                                {badgeCount > 0 && (
                                                    <span className="flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none animate-pulse">
                                                        {badgeCount > 99 ? '99+' : badgeCount}
                                                    </span>
                                                )}
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>

                {/* Cerrar sesión */}
                <div className="px-3 py-4 border-t border-slate-700">
                    <button
                        onClick={onSignOut}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300
                       hover:bg-red-600 hover:text-white transition"
                    >
                        <span>🚪</span>
                        Cerrar sesión
                    </button>
                </div>
            </aside>
        </>
    );
}

// ── Layout principal ────────────────────────────────────────
export default function DashboardLayout({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const { session, perfil, loading, signOut } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const badges = useNotificaciones(perfil);

    // Guard: verificar autenticación y acceso a la ruta
    useEffect(() => {
        // Esperar a que termine la inicialización
        if (loading) return;

        // Sin sesión activa → login
        if (!session && !perfil) {
            router.replace('/login');
            return;
        }

        // Hay sesión pero el perfil aún no cargó → esperar siguiente render
        if (session && !perfil) return;

        const rutasPermitidas = ACCESO_POR_ROL[perfil.rol] ?? [];
        const tieneAcceso = rutasPermitidas.some((r) => pathname?.startsWith(r));

        if (!tieneAcceso) {
            // Redirigir al dashboard correcto de su rol
            router.replace(ROLE_HOME[perfil.rol] ?? '/login');
        }
    }, [loading, session, perfil, pathname, router]);

    // Pantalla de carga mientras se verifica la sesión
    if (loading || !perfil) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 text-sm">Verificando sesión…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-slate-50">
            {/* Sidebar */}
            <Sidebar
                perfil={perfil}
                onSignOut={signOut}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                badges={badges}
            />

            {/* Contenido principal */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Topbar móvil */}
                <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="text-slate-600 hover:text-slate-900"
                        aria-label="Abrir menú"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <span className="font-semibold text-slate-800 text-sm">Gestión de Insumos</span>
                </header>

                {/* Página */}
                <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
