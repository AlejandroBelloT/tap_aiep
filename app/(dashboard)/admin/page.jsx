'use client';
/**
 * app/(dashboard)/admin/page.jsx
 *
 * Dashboard del Administrador.
 * La sección activa se controla desde el sidebar mediante ?v=<id>:
 *   ?v=usuarios   → TablaUsuarios (CRUD completo)
 *   ?v=reportes   → ReportesGlobales
 *   ?v=inventario → TablaInsumos en modo solo lectura
 *   ?v=stock      → ConsultarStock
 *   (sin ?v)      → Panel general con stats globales
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import StatsCard from '@/components/ui/StatsCard';
import TablaUsuarios from '@/components/admin/TablaUsuarios';
import ReportesGlobales from '@/components/admin/ReportesGlobales';
import TablaInsumos from '@/components/tens/TablaInsumos';
import ConsultarStock from '@/components/shared/ConsultarStock';
import SolicitudesCompraAdmin from '@/components/admin/SolicitudesCompraAdmin';
import FormInsumo from '@/components/admin/FormInsumo';
import MisRecepciones from '@/components/trabajador/MisRecepciones';
import TablaMisSolicitudes from '@/components/jefatura/TablaMisSolicitudes';

const TITULOS = {
    usuarios: { icono: '👥', titulo: 'Gestión de Usuarios' },
    reportes: { icono: '📊', titulo: 'Reportes Globales' },
    inventario: { icono: '📦', titulo: 'Inventario' },
    stock: { icono: '🔍', titulo: 'Consultar Stock' },
    compras: { icono: '🛒', titulo: 'Solicitudes de Compra' },
    insumos: { icono: '🧪', titulo: 'Gestión de Insumos' },
    recepciones: { icono: '📬', titulo: 'Mis Recepciones' },
    'mis-solicitudes': { icono: '📄', titulo: 'Mis Solicitudes' },
};

export default function AdminPage() {
    const { perfil } = useAuth();
    const searchParams = useSearchParams();
    const vista = searchParams.get('v'); // null = panel general

    const [stats, setStats] = useState({
        totalUsuarios: null,
        usuariosActivos: null,
        totalSolicitudes: null,
        pendientes: null,
        autorizadas: null,
        rechazadas: null,
        insumosBajoStock: null,
    });
    const [loadingStats, setLoadingStats] = useState(true);

    // Desglose de usuarios activos por rol
    const [desglose, setDesglose] = useState({
        trabajador: 0, jefatura: 0, tens: 0, prevencionista: 0, administrador: 0,
    });

    const cargarStats = async () => {
        setLoadingStats(true);

        const [
            { count: totalUsuarios },
            { count: usuariosActivos },
            { count: totalSolicitudes },
            { count: pendientes },
            { count: autorizadas },
            { count: rechazadas },
        ] = await Promise.all([
            supabase.from('usuarios').select('*', { count: 'exact', head: true }),
            supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('activo', true),
            supabase.from('solicitudes').select('*', { count: 'exact', head: true }),
            supabase.from('solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
            supabase.from('solicitudes').select('*', { count: 'exact', head: true }).in('estado', ['autorizada', 'despachada']),
            supabase.from('solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'rechazada'),
        ]);

        // Comparación columna-a-columna no soportada por PostgREST mediante filtros simples;
        // se obtienen las columnas relevantes y se filtra en el cliente.
        const { data: insumosRows } = await supabase.from('insumos').select('stock_actual, stock_minimo');
        const insumosBajoStock = insumosRows?.filter(i => i.stock_actual <= i.stock_minimo).length ?? 0;

        setStats({
            totalUsuarios: totalUsuarios ?? 0,
            usuariosActivos: usuariosActivos ?? 0,
            totalSolicitudes: totalSolicitudes ?? 0,
            pendientes: pendientes ?? 0,
            autorizadas: autorizadas ?? 0,
            rechazadas: rechazadas ?? 0,
            insumosBajoStock: insumosBajoStock ?? 0,
        });

        // Desglose por rol (usuarios activos)
        const { data: rows } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('activo', true);

        if (rows) {
            const d = { trabajador: 0, jefatura: 0, tens: 0, prevencionista: 0, administrador: 0 };
            rows.forEach(({ rol }) => { if (rol in d) d[rol]++; });
            setDesglose(d);
        }

        setLoadingStats(false);
    };

    useEffect(() => {
        cargarStats();
    }, []);

    // ── Vista de sección específica ─────────────────────────────────────────
    if (vista && TITULOS[vista]) {
        const { icono, titulo } = TITULOS[vista];

        return (
            <div className="p-4 md:p-6 space-y-5">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">
                        {icono} {titulo}
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Panel de Administración · usa el sidebar para cambiar de sección
                    </p>
                </div>

                {vista === 'usuarios' && <TablaUsuarios />}
                {vista === 'reportes' && <ReportesGlobales />}
                {vista === 'inventario' && (
                    <div>
                        <p className="text-sm text-slate-500 mb-4">
                            Vista del inventario actual. Usa el dashboard TENS para realizar ingresos o registrar mermas.
                        </p>
                        <TablaInsumos readOnly />
                    </div>
                )}
                {vista === 'stock' && <ConsultarStock />}
                {vista === 'compras' && <SolicitudesCompraAdmin />}
                {vista === 'insumos' && <FormInsumo />}
                {vista === 'recepciones' && <MisRecepciones compact={false} />}
                {vista === 'mis-solicitudes' && <TablaMisSolicitudes filtrarPor="trabajador_id" />}
            </div>
        );
    }

    // ── Vista inicio (dashboard principal) ──────────────────────────────────
    return (
        <div className="p-4 md:p-6 space-y-6">
            {/* Encabezado */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Panel de Administración</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Visión global del sistema · Hola,{' '}
                        <span className="font-medium text-slate-700">{perfil?.nombre}</span>
                    </p>
                </div>
                <button
                    onClick={cargarStats}
                    className="self-start sm:self-auto flex items-center gap-1.5 text-xs px-3 py-1.5
                     rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Actualizar stats
                </button>
            </div>

            {/* Stats globales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatsCard
                    label="Usuarios activos"
                    value={loadingStats ? '…' : `${stats.usuariosActivos} / ${stats.totalUsuarios}`}
                    icon="👥"
                    color="blue"
                    subtext={
                        loadingStats
                            ? ''
                            : `${desglose.trabajador} trab · ${desglose.jefatura} jef · ${desglose.tens} tens`
                    }
                />
                <StatsCard
                    label="Solicitudes totales"
                    value={loadingStats ? '…' : stats.totalSolicitudes}
                    icon="📋"
                    color="slate"
                    subtext={loadingStats ? '' : `${stats.rechazadas} rechazadas`}
                />
                <StatsCard
                    label="Solicitudes activas"
                    value={loadingStats ? '…' : (stats.pendientes + stats.autorizadas)}
                    icon="🔄"
                    color={!loadingStats && (stats.pendientes + stats.autorizadas) > 0 ? 'amber' : 'green'}
                    subtext={loadingStats ? '' : `${stats.pendientes} pend · ${stats.autorizadas} en proceso`}
                />
                <StatsCard
                    label="Insumos bajo stock"
                    value={loadingStats ? '…' : stats.insumosBajoStock}
                    icon="⚠️"
                    color={!loadingStats && stats.insumosBajoStock > 0 ? 'red' : 'green'}
                    subtext={stats.insumosBajoStock > 0 ? 'Requieren reposición' : 'Stock al día'}
                />
            </div>

            {/* Desglose por rol (chips) */}
            {!loadingStats && (
                <div className="flex flex-wrap gap-2">
                    {[
                        { rol: 'trabajador', label: 'Trabajadores', color: 'bg-slate-100  text-slate-600' },
                        { rol: 'jefatura', label: 'Jefaturas', color: 'bg-blue-100   text-blue-700' },
                        { rol: 'tens', label: 'TENS', color: 'bg-teal-100   text-teal-700' },
                        { rol: 'prevencionista', label: 'Prevencionistas', color: 'bg-purple-100 text-purple-700' },
                        { rol: 'administrador', label: 'Admins', color: 'bg-red-100    text-red-700' },
                    ].map(({ rol, label, color }) => (
                        <span key={rol} className={`text-xs font-medium px-3 py-1 rounded-full ${color}`}>
                            {desglose[rol]} {label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
