'use client';
/**
 * components/admin/ReportesGlobales.jsx
 *
 * Contenedor principal de reportes para el Administrador.
 * Sub-tabs:
 *   1. Solicitudes Globales  — listado completo con filtros
 *   2. Por Trabajador        — insumos entregados a un trabajador
 *   3. Entradas por Insumo   — movimientos tipo 'ingreso'
 *   4. Salidas por Insumo    — movimientos tipo despacho/merma/ajuste
 *   5. Entregas por Insumo   — historial detallado de quién recibió qué
 */
import { useEffect, useState, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import Badge from '@/components/ui/Badge';
import ReporteTrabajador from '@/components/admin/reportes/ReporteTrabajador';
import ReporteEntradasInsumo from '@/components/admin/reportes/ReporteEntradasInsumo';
import ReporteSalidasInsumo from '@/components/admin/reportes/ReporteSalidasInsumo';
import ReporteEntregasInsumo from '@/components/admin/reportes/ReporteEntregasInsumo';

const SUB_TABS = [
    { id: 'global', label: '📊 Solicitudes Globales' },
    { id: 'trabajador', label: '👤 Por Trabajador' },
    { id: 'entradas', label: '📥 Entradas' },
    { id: 'salidas', label: '📤 Salidas' },
    { id: 'entregas', label: '📦 Entregas' },
];

// ─────────────────────────────────────────────────────────
//  Sub-tab: Solicitudes Globales
// ─────────────────────────────────────────────────────────
const ESTADOS = ['pendiente', 'autorizada', 'despachada', 'recibida', 'rechazada'];

const fmt = (iso) =>
    iso
        ? new Intl.DateTimeFormat('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }).format(new Date(iso))
        : '—';

const fmtFecha = (iso) =>
    iso
        ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
        : '—';

/** Tarjeta de estadística simple */
function ReporteStat({ label, value, color }) {
    const colors = {
        blue: 'bg-blue-50   text-blue-700   border-blue-100',
        amber: 'bg-amber-50  text-amber-700  border-amber-100',
        purple: 'bg-purple-50 text-purple-700 border-purple-100',
        green: 'bg-green-50  text-green-700  border-green-100',
        red: 'bg-red-50    text-red-700    border-red-100',
        slate: 'bg-slate-50  text-slate-700  border-slate-100',
    };
    return (
        <div className={`rounded-xl border px-4 py-3 ${colors[color] ?? colors.slate}`}>
            <p className="text-xs font-medium opacity-70">{label}</p>
            <p className="text-2xl font-bold mt-0.5">{value}</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
//  Contenedor con sub-navegación
// ─────────────────────────────────────────────────────────
export default function ReportesGlobales() {
    const [subTab, setSubTab] = useState('global');

    return (
        <div className="space-y-5">
            {/* Sub-navegación */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
                {SUB_TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setSubTab(t.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${subTab === t.id
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Contenido del sub-tab activo */}
            {subTab === 'global' && <SolicitudesGlobalesTab />}
            {subTab === 'trabajador' && <ReporteTrabajador />}
            {subTab === 'entradas' && <ReporteEntradasInsumo />}
            {subTab === 'salidas' && <ReporteSalidasInsumo />}
            {subTab === 'entregas' && <ReporteEntregasInsumo />}
        </div>
    );
}
function SolicitudesGlobalesTab() {
    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [queryError, setQueryError] = useState(null);

    // Filtros
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [filtroDesde, setFiltroDesde] = useState('');
    const [filtroHasta, setFiltroHasta] = useState('');
    const [filtroBusqueda, setFiltroBusqueda] = useState('');

    const cargar = useCallback(async () => {
        setLoading(true);
        setQueryError(null);
        const { data, error } = await supabase
            .from('solicitudes')
            .select(`
        id,
        estado,
        cantidad,
        motivo,
        observaciones,
        created_at,
        updated_at,
        insumos ( nombre, codigo ),
        solicitante:usuarios!solicitante_id ( nombre ),
        trabajador:usuarios!trabajador_id  ( nombre ),
        gestionado_por:usuarios!gestionado_por ( nombre ),
        entregas ( fecha_despacho, fecha_recepcion )
      `)
            .order('created_at', { ascending: false });

        if (error) { setQueryError(error.message); setLoading(false); return; }
        setSolicitudes(data ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        startTransition(cargar);

        const ch = supabase
            .channel('admin-reportes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes' }, cargar)
            .subscribe();

        return () => supabase.removeChannel(ch);
    }, [cargar]);

    // ── Filtrado en memoria ───────────────────────────────────
    const filtradas = solicitudes.filter((s) => {
        if (filtroEstado !== 'todos' && s.estado !== filtroEstado) return false;

        if (filtroDesde) {
            const desde = new Date(filtroDesde);
            if (new Date(s.created_at) < desde) return false;
        }
        if (filtroHasta) {
            const hasta = new Date(filtroHasta);
            hasta.setHours(23, 59, 59, 999);
            if (new Date(s.created_at) > hasta) return false;
        }
        if (filtroBusqueda) {
            const q = filtroBusqueda.toLowerCase();
            const inNombre = s.insumos?.nombre?.toLowerCase().includes(q);
            const inCodigo = s.insumos?.codigo?.toLowerCase().includes(q);
            const inSolicitante = s.solicitante?.nombre?.toLowerCase().includes(q);
            const inTrabajador = s.trabajador?.nombre?.toLowerCase().includes(q);
            const inGestor = s.gestor?.nombre?.toLowerCase().includes(q);
            if (!inNombre && !inCodigo && !inSolicitante && !inTrabajador && !inGestor) return false;
        }
        return true;
    });

    // ── Estadísticas rápidas (sobre el conjunto filtrado) ────
    const stats = {
        total: filtradas.length,
        pendiente: filtradas.filter((s) => s.estado === 'pendiente').length,
        autorizada: filtradas.filter((s) => s.estado === 'autorizada').length,
        despachada: filtradas.filter((s) => s.estado === 'despachada').length,
        recibida: filtradas.filter((s) => s.estado === 'recibida').length,
        rechazada: filtradas.filter((s) => s.estado === 'rechazada').length,
    };

    const limpiarFiltros = () => {
        setFiltroEstado('todos');
        setFiltroDesde('');
        setFiltroHasta('');
        setFiltroBusqueda('');
    };

    return (
        <div className="space-y-5">
            {/* Stats resumen */}
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                <ReporteStat label="Total" value={stats.total} color="slate" />
                <ReporteStat label="Pendientes" value={stats.pendiente} color="amber" />
                <ReporteStat label="Autorizadas" value={stats.autorizada} color="blue" />
                <ReporteStat label="Despachadas" value={stats.despachada} color="purple" />
                <ReporteStat label="Recibidas" value={stats.recibida} color="green" />
                <ReporteStat label="Rechazadas" value={stats.rechazada} color="red" />
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Barra de filtros */}
                <div className="px-5 py-4 border-b border-slate-100 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Búsqueda */}
                        <input
                            type="text"
                            placeholder="Buscar insumo, solicitante, trabajador…"
                            value={filtroBusqueda}
                            onChange={(e) => setFiltroBusqueda(e.target.value)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                        />

                        {/* Estado */}
                        <select
                            value={filtroEstado}
                            onChange={(e) => setFiltroEstado(e.target.value)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="todos">Todos los estados</option>
                            {ESTADOS.map((e) => (
                                <option key={e} value={e} className="capitalize">{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                            ))}
                        </select>

                        {/* Desde */}
                        <label className="flex items-center gap-1.5 text-sm text-slate-500">
                            Desde
                            <input
                                type="date"
                                value={filtroDesde}
                                onChange={(e) => setFiltroDesde(e.target.value)}
                                className="text-sm px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>

                        {/* Hasta */}
                        <label className="flex items-center gap-1.5 text-sm text-slate-500">
                            Hasta
                            <input
                                type="date"
                                value={filtroHasta}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setFiltroHasta(e.target.value)}
                                className="text-sm px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>

                        {(filtroEstado !== 'todos' || filtroDesde || filtroHasta || filtroBusqueda) && (
                            <button
                                onClick={limpiarFiltros}
                                className="text-xs text-slate-400 hover:text-slate-600 underline"
                            >
                                Limpiar filtros
                            </button>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-slate-400">{filtradas.length} resultado{filtradas.length !== 1 ? 's' : ''}</span>
                            <button
                                onClick={cargar}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"
                                title="Recargar"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabla */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                                <th className="px-4 py-3 font-semibold">Insumo</th>
                                <th className="px-4 py-3 font-semibold text-center">Cant.</th>
                                <th className="px-4 py-3 font-semibold">Solicitante</th>
                                <th className="px-4 py-3 font-semibold">Trabajador</th>
                                <th className="px-4 py-3 font-semibold">Gestor TENS</th>
                                <th className="px-4 py-3 font-semibold text-center">Estado</th>
                                <th className="px-4 py-3 font-semibold">Creado</th>
                                <th className="px-4 py-3 font-semibold">Últ. movimiento</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                                        <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                                        Cargando registros…
                                    </td>
                                </tr>
                            ) : queryError ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-10 text-center text-red-500">
                                        ⚠️ Error al cargar datos: {queryError}
                                    </td>
                                </tr>
                            ) : filtradas.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                                        No se encontraron solicitudes con los filtros aplicados.
                                    </td>
                                </tr>
                            ) : (
                                filtradas.map((s) => {
                                    // Determinar la fecha del último evento
                                    const ultimaFecha =
                                        s.entregas?.fecha_recepcion ?? s.entregas?.fecha_despacho ?? s.updated_at ?? null;

                                    return (
                                        <tr key={s.id} className="hover:bg-slate-50 transition">
                                            {/* Insumo */}
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-slate-800 leading-tight">
                                                    {s.insumos?.nombre ?? '—'}
                                                </p>
                                                {s.insumos?.codigo && (
                                                    <p className="text-xs text-slate-400 font-mono">{s.insumos.codigo}</p>
                                                )}
                                            </td>

                                            {/* Cantidad */}
                                            <td className="px-4 py-3 text-center font-mono font-semibold text-slate-700">
                                                {s.cantidad}
                                            </td>

                                            {/* Solicitante */}
                                            <td className="px-4 py-3 text-slate-600 text-xs">
                                                {s.solicitante?.nombre ?? '—'}
                                            </td>

                                            {/* Trabajador */}
                                            <td className="px-4 py-3 text-slate-600 text-xs">
                                                {s.trabajador?.nombre ?? <span className="text-slate-300 italic">Sin asignar</span>}
                                            </td>

                                            {/* Gestor */}
                                            <td className="px-4 py-3 text-slate-600 text-xs">
                                                {s.gestionado_por?.nombre ?? <span className="text-slate-300 italic">—</span>}
                                            </td>

                                            {/* Estado */}
                                            <td className="px-4 py-3 text-center">
                                                <Badge estado={s.estado} />
                                                {s.estado === 'rechazada' && s.motivo && (
                                                    <p className="text-xs text-red-400 mt-0.5 max-w-30 truncate" title={s.motivo}>
                                                        {s.motivo}
                                                    </p>
                                                )}
                                            </td>

                                            {/* Creado */}
                                            <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                                                {fmt(s.created_at)}
                                            </td>

                                            {/* Último movimiento */}
                                            <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                                                {ultimaFecha
                                                    ? fmt(ultimaFecha)
                                                    : <span className="text-slate-300">—</span>
                                                }
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                {!loading && filtradas.length > 0 && (
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
                        <span>
                            Mostrando {filtradas.length} de {solicitudes.length} solicitudes
                        </span>
                        <span>
                            Tiempo real activo — actualiza automáticamente
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
