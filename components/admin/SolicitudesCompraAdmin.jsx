'use client';
/**
 * components/admin/SolicitudesCompraAdmin.jsx
 *
 * Vista de administrador para gestionar solicitudes de compra.
 * - Lista por número de solicitud (SC-XXXX), clickeable
 * - Pantalla de detalle con datos completos
 * - Acciones: Aprobar / Rechazar (con campo de observaciones)
 */
import { useState, useEffect, useCallback, useMemo, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/* ── Helpers ──────────────────────────────────────────────── */
const URGENCIA_OPT = [
    { value: 'normal', label: 'Normal', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
    { value: 'urgente', label: 'Urgente', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    { value: 'critico', label: 'Crítico', cls: 'bg-red-100 text-red-700 border-red-200' },
];

const ESTADO_CFG = {
    pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: '⏳' },
    aprobada: { label: 'Aprobada', cls: 'bg-green-100 text-green-700 border-green-200', icon: '✅' },
    rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700 border-red-200', icon: '❌' },
};

function nroSC(n) { return `SC-${String(n).padStart(4, '0')}`; }

function totalEstimado(items) {
    const arr = Array.isArray(items) ? items : [];
    const total = arr.reduce((acc, it) => {
        const p = it.precio_estimado ?? 0;
        return acc + (Number(p) * Number(it.cantidad));
    }, 0);
    return total > 0
        ? `$${total.toLocaleString('es-CL')}`
        : null;
}

/* ============================================================
   COMPONENTE
   ============================================================ */
export default function SolicitudesCompraAdmin() {
    const { perfil, session } = useAuth();

    /* ── Data ──────────────────────────────────────────────── */
    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /* ── Filtros ───────────────────────────────────────────── */
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [busqueda, setBusqueda] = useState('');

    /* ── Vista detalle ─────────────────────────────────────── */
    const [detalle, setDetalle] = useState(null); // objeto solicitud seleccionada

    /* ── Acciones en detalle ───────────────────────────────── */
    const [accion, setAccion] = useState(null);  // 'aprobar' | 'rechazar'
    const [observaciones, setObservaciones] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [feedbackAcc, setFeedbackAcc] = useState(null);

    /* ── Carga ─────────────────────────────────────────────── */
    const cargar = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { data, error: err } = await supabase
            .from('solicitudes_compra')
            .select(`
                id, nro_solicitud, estado, urgencia,
                justificacion, proveedor_sugerido, items,
                observaciones_admin, fecha_revision, created_at,
                solicitante:usuarios!solicitudes_compra_solicitante_id_fkey(nombre, rol, servicio),
                revisadoPor:usuarios!solicitudes_compra_revisado_por_fkey(nombre)
            `)
            .order('created_at', { ascending: false });

        if (err) {
            setError(err.message);
        } else {
            startTransition(() => setSolicitudes(data ?? []));
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!session) return;
        startTransition(cargar);
    }, [session, cargar]);

    /* ── Filtrado ──────────────────────────────────────────── */
    const filtradas = useMemo(() => {
        return solicitudes.filter(sc => {
            if (filtroEstado !== 'todos' && sc.estado !== filtroEstado) return false;
            if (busqueda.trim()) {
                const q = busqueda.toLowerCase();
                return (
                    nroSC(sc.nro_solicitud).toLowerCase().includes(q) ||
                    (sc.solicitante?.nombre ?? '').toLowerCase().includes(q) ||
                    sc.justificacion.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [solicitudes, filtroEstado, busqueda]);

    /* ── Conteos ───────────────────────────────────────────── */
    const conteos = useMemo(() => ({
        pendientes: solicitudes.filter(s => s.estado === 'pendiente').length,
        aprobadas: solicitudes.filter(s => s.estado === 'aprobada').length,
        rechazadas: solicitudes.filter(s => s.estado === 'rechazada').length,
    }), [solicitudes]);

    /* ── Aprobar / Rechazar ────────────────────────────────── */
    const ejecutarAccion = async () => {
        if (!detalle || !accion || !perfil?.id) return;
        if (accion === 'rechazar' && !observaciones.trim()) return;
        setProcesando(true);
        setFeedbackAcc(null);

        const nuevoEstado = accion === 'aprobar' ? 'aprobada' : 'rechazada';
        const { error: err } = await supabase
            .from('solicitudes_compra')
            .update({
                estado: nuevoEstado,
                observaciones_admin: observaciones.trim() || null,
                revisado_por: perfil.id,
                fecha_revision: new Date().toISOString(),
            })
            .eq('id', detalle.id);

        if (err) {
            setFeedbackAcc({ type: 'error', msg: err.message });
        } else {
            setFeedbackAcc({
                type: 'ok',
                msg: nuevoEstado === 'aprobada'
                    ? '✅ Solicitud aprobada correctamente.'
                    : '❌ Solicitud rechazada.',
            });
            // Actualizar en lista local
            setSolicitudes(prev =>
                prev.map(s => s.id === detalle.id
                    ? {
                        ...s,
                        estado: nuevoEstado,
                        observaciones_admin: observaciones.trim() || null,
                        revisadoPor: { nombre: perfil.nombre },
                        fecha_revision: new Date().toISOString(),
                    }
                    : s
                )
            );
            setDetalle(prev => ({
                ...prev,
                estado: nuevoEstado,
                observaciones_admin: observaciones.trim() || null,
                revisadoPor: { nombre: perfil.nombre },
                fecha_revision: new Date().toISOString(),
            }));
            setAccion(null);
            setObservaciones('');
        }
        setProcesando(false);
    };

    const abrirDetalle = (sc) => {
        setDetalle(sc);
        setAccion(null);
        setObservaciones('');
        setFeedbackAcc(null);
    };

    /* ── Render: Vista detalle ─────────────────────────────── */
    if (detalle) {
        const est = ESTADO_CFG[detalle.estado] ?? ESTADO_CFG.pendiente;
        const urg = URGENCIA_OPT.find(u => u.value === detalle.urgencia) ?? URGENCIA_OPT[0];
        const total = totalEstimado(detalle.items);
        const esPendiente = detalle.estado === 'pendiente';

        return (
            <div className="space-y-5">
                {/* Encabezado detalle */}
                <div className="flex items-center gap-3">
                    <button onClick={() => setDetalle(null)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition" title="Volver">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            {nroSC(detalle.nro_solicitud)}
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${est.cls}`}>
                                {est.icon} {est.label}
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Enviada por <strong>{detalle.solicitante?.nombre ?? '—'}</strong>
                            {detalle.solicitante?.servicio && ` · ${detalle.solicitante.servicio}`}
                            {' · '}{new Date(detalle.created_at).toLocaleString('es-CL')}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Columna principal */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Datos generales */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
                            <h3 className="text-sm font-semibold text-slate-700 pb-1 border-b border-slate-100">Datos generales</h3>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-xs text-slate-500 mb-0.5">Urgencia</p>
                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${urg.cls}`}>{urg.label}</span>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-0.5">Proveedor sugerido</p>
                                    <p className="text-slate-800">{detalle.proveedor_sugerido || <span className="text-slate-400">No especificado</span>}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-xs text-slate-500 mb-0.5">Justificación</p>
                                    <p className="bg-slate-50 rounded-lg px-3 py-2 text-slate-800 text-sm">{detalle.justificacion}</p>
                                </div>
                            </div>
                        </div>

                        {/* Ítems */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-700">Ítems solicitados</h3>
                                {total && <p className="text-sm font-semibold text-slate-800">Total estimado: {total}</p>}
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider text-left">
                                        <th className="px-5 py-3 font-semibold">Insumo</th>
                                        <th className="px-5 py-3 font-semibold text-right">Cantidad</th>
                                        <th className="px-5 py-3 font-semibold">Unidad</th>
                                        <th className="px-5 py-3 font-semibold text-right">Precio est.</th>
                                        <th className="px-5 py-3 font-semibold text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {(detalle.items ?? []).map((it, i) => (
                                        <tr key={i} className="text-slate-700">
                                            <td className="px-5 py-3">
                                                <p className="font-medium">{it.nombre}</p>
                                                {it.codigo && <p className="text-xs font-mono text-slate-400">{it.codigo}</p>}
                                            </td>
                                            <td className="px-5 py-3 text-right font-semibold">{it.cantidad}</td>
                                            <td className="px-5 py-3 text-slate-500">{it.unidad_medida}</td>
                                            <td className="px-5 py-3 text-right text-slate-500">
                                                {it.precio_estimado != null ? `$${Number(it.precio_estimado).toLocaleString('es-CL')}` : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-right text-slate-700">
                                                {it.precio_estimado != null
                                                    ? `$${(Number(it.precio_estimado) * Number(it.cantidad)).toLocaleString('es-CL')}`
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Respuesta previa (si ya fue revisada) */}
                        {!esPendiente && (
                            <div className={`rounded-xl border p-4 ${est.cls}`}>
                                <p className="text-sm font-semibold mb-1">
                                    {est.icon} {detalle.estado === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada'}
                                    {detalle.revisadoPor?.nombre && ` por ${detalle.revisadoPor.nombre}`}
                                </p>
                                {detalle.fecha_revision && (
                                    <p className="text-xs opacity-70 mb-1">{new Date(detalle.fecha_revision).toLocaleString('es-CL')}</p>
                                )}
                                {detalle.observaciones_admin && (
                                    <p className="text-sm mt-1">{detalle.observaciones_admin}</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Columna acciones */}
                    <div className="space-y-4">
                        {esPendiente ? (
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 sticky top-4">
                                <h3 className="text-sm font-semibold text-slate-700">Resolver solicitud</h3>

                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 font-medium">Observaciones</label>
                                    <textarea
                                        value={observaciones}
                                        onChange={e => setObservaciones(e.target.value)}
                                        rows={4}
                                        placeholder={accion === 'rechazar'
                                            ? 'Indica el motivo del rechazo (obligatorio)…'
                                            : 'Notas adicionales para el solicitante (opcional)…'}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                                    />
                                </div>

                                {feedbackAcc && (
                                    <div className={`rounded-xl border px-4 py-3 text-sm ${feedbackAcc.type === 'ok'
                                        ? 'bg-green-50 border-green-200 text-green-700'
                                        : 'bg-red-50 border-red-200 text-red-700'}`}>
                                        {feedbackAcc.msg}
                                    </div>
                                )}

                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => { setAccion('aprobar'); setFeedbackAcc(null); }}
                                        disabled={procesando}
                                        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2
                                            ${accion === 'aprobar'
                                                ? 'bg-green-600 text-white shadow-sm'
                                                : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'}`}>
                                        ✅ Aprobar
                                    </button>
                                    <button
                                        onClick={() => { setAccion('rechazar'); setFeedbackAcc(null); }}
                                        disabled={procesando}
                                        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2
                                            ${accion === 'rechazar'
                                                ? 'bg-red-600 text-white shadow-sm'
                                                : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'}`}>
                                        ❌ Rechazar
                                    </button>
                                </div>

                                {accion && (
                                    <button
                                        onClick={ejecutarAccion}
                                        disabled={procesando || (accion === 'rechazar' && !observaciones.trim())}
                                        className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                        {procesando && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                        {procesando ? 'Guardando…' : `Confirmar ${accion === 'aprobar' ? 'aprobación' : 'rechazo'}`}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                <p className="text-sm text-slate-500 text-center">Esta solicitud ya fue revisada.</p>
                            </div>
                        )}

                        {/* Info del solicitante */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Solicitante</h3>
                            <p className="text-sm font-semibold text-slate-800">{detalle.solicitante?.nombre ?? '—'}</p>
                            {detalle.solicitante?.rol && (
                                <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">
                                    {detalle.solicitante.rol}
                                </span>
                            )}
                            {detalle.solicitante?.servicio && (
                                <p className="text-xs text-slate-500">{detalle.solicitante.servicio}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* ── Render: Lista ─────────────────────────────────────── */
    return (
        <div className="space-y-5">

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Pendientes', value: conteos.pendientes, cls: 'bg-amber-50 border-amber-100 text-amber-700', filtro: 'pendiente' },
                    { label: 'Aprobadas', value: conteos.aprobadas, cls: 'bg-green-50 border-green-100 text-green-700', filtro: 'aprobada' },
                    { label: 'Rechazadas', value: conteos.rechazadas, cls: 'bg-red-50 border-red-100 text-red-700', filtro: 'rechazada' },
                ].map(card => (
                    <button key={card.filtro}
                        onClick={() => setFiltroEstado(filtroEstado === card.filtro ? 'todos' : card.filtro)}
                        className={`rounded-xl border p-4 text-left transition hover:ring-2 hover:ring-offset-1 hover:ring-current
                            ${card.cls} ${filtroEstado === card.filtro ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
                        <p className="text-2xl font-bold">{card.value}</p>
                        <p className="text-xs mt-0.5 opacity-70">{card.label}</p>
                    </button>
                ))}
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Header + filtros */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-800 flex-1">Solicitudes de compra</h3>

                    {/* Buscador */}
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            placeholder="Buscar N°, solicitante…"
                            className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52 transition" />
                    </div>

                    {/* Filtro estado */}
                    <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="todos">Todos los estados</option>
                        <option value="pendiente">⏳ Pendientes</option>
                        <option value="aprobada">✅ Aprobadas</option>
                        <option value="rechazada">❌ Rechazadas</option>
                    </select>

                    <button onClick={() => { startTransition(cargar); }} title="Recargar"
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="mx-5 my-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        Error al cargar: {error}
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider text-left">
                                <th className="px-5 py-3 font-semibold">N° Solicitud</th>
                                <th className="px-5 py-3 font-semibold">Fecha</th>
                                <th className="px-5 py-3 font-semibold">Solicitante</th>
                                <th className="px-5 py-3 font-semibold">Urgencia</th>
                                <th className="px-5 py-3 font-semibold">Ítems</th>
                                <th className="px-5 py-3 font-semibold text-right">Total est.</th>
                                <th className="px-5 py-3 font-semibold text-center">Estado</th>
                                <th className="px-5 py-3 font-semibold text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                                    <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                                    Cargando solicitudes…
                                </td></tr>
                            ) : filtradas.length === 0 ? (
                                <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                                    {solicitudes.length === 0
                                        ? 'Aún no hay solicitudes de compra registradas.'
                                        : 'Sin resultados para los filtros aplicados.'}
                                </td></tr>
                            ) : filtradas.map(sc => {
                                const est = ESTADO_CFG[sc.estado] ?? ESTADO_CFG.pendiente;
                                const urg = URGENCIA_OPT.find(u => u.value === sc.urgencia) ?? URGENCIA_OPT[0];
                                const tot = totalEstimado(sc.items);
                                return (
                                    <tr key={sc.id}
                                        className={`transition ${sc.estado === 'pendiente' ? 'hover:bg-amber-50/40' : 'hover:bg-slate-50'}`}>
                                        <td className="px-5 py-3">
                                            <button
                                                onClick={() => abrirDetalle(sc)}
                                                className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline underline-offset-2 transition">
                                                {nroSC(sc.nro_solicitud)}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                                            {new Date(sc.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-5 py-3">
                                            <p className="text-slate-800 font-medium">{sc.solicitante?.nombre ?? '—'}</p>
                                            {sc.solicitante?.servicio && (
                                                <p className="text-xs text-slate-400">{sc.solicitante.servicio}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${urg.cls}`}>
                                                {urg.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-slate-600 text-xs">
                                            {Array.isArray(sc.items) ? `${sc.items.length} ítem${sc.items.length !== 1 ? 's' : ''}` : '—'}
                                        </td>
                                        <td className="px-5 py-3 text-right text-slate-700 font-medium text-xs">
                                            {tot ?? <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${est.cls}`}>
                                                {est.icon} {est.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            <button onClick={() => abrirDetalle(sc)}
                                                className="text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2 transition">
                                                {sc.estado === 'pendiente' ? 'Revisar' : 'Ver'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!loading && (
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                        <span>{filtradas.length} solicitud{filtradas.length !== 1 ? 'es' : ''}</span>
                        {conteos.pendientes > 0 && (
                            <span className="text-amber-600 font-medium">
                                ⏳ {conteos.pendientes} pendiente{conteos.pendientes !== 1 ? 's' : ''} de revisión
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
