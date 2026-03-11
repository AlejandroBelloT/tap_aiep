'use client';
/**
 * components/tens/SolicitudesPendientes.jsx
 *
 * Gestión de solicitudes de trabajadores — compartido por TENS y Prevencionista.
 * Acciones disponibles según estado:
 *   - Autorizar  (pendiente → autorizada)
 *   - Despachar  (autorizada → despachada + descuenta stock, TRANSACCIÓN ATÓMICA)
 *   - Rechazar   (pendiente o autorizada → rechazada)
 *
 * Filtro por pestañas de estado:
 *   Todas | Pendientes | Autorizadas | Despachadas | Recibidas | Rechazadas
 */
import { useEffect, useState, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Badge from '@/components/ui/Badge';
import Alert from '@/components/ui/Alert';
import Modal from '@/components/ui/Modal';

// Formatea fecha
const fmt = (iso) =>
    iso
        ? new Intl.DateTimeFormat('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }).format(new Date(iso))
        : '—';

// Definición de pestañas de filtro
const TABS_ESTADO = [
    { key: 'activos', label: 'Activas', color: 'amber' },
    { key: 'pendiente', label: 'Pendientes', color: 'amber' },
    { key: 'autorizada', label: 'Autorizadas', color: 'blue' },
    { key: 'despachada', label: 'Despachadas', color: 'purple' },
    { key: 'recibida', label: 'Recibidas', color: 'green' },
    { key: 'rechazada', label: 'Rechazadas', color: 'red' },
    { key: 'todos', label: 'Todas', color: 'slate' },
];

const TAB_COLOR = {
    amber: { active: 'bg-amber-500 text-white border-amber-500', badge: 'bg-amber-100 text-amber-700' },
    blue: { active: 'bg-blue-600 text-white border-blue-600', badge: 'bg-blue-100 text-blue-700' },
    purple: { active: 'bg-purple-600 text-white border-purple-600', badge: 'bg-purple-100 text-purple-700' },
    green: { active: 'bg-green-600 text-white border-green-600', badge: 'bg-green-100 text-green-700' },
    red: { active: 'bg-red-500 text-white border-red-500', badge: 'bg-red-100 text-red-700' },
    slate: { active: 'bg-slate-700 text-white border-slate-700', badge: 'bg-slate-100 text-slate-600' },
};

// Modal de confirmación genérico
function ConfirmModal({ open, title, message, confirmLabel, confirmColor = 'blue', onConfirm, onCancel, loading }) {
    return (
        <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-sm">
            <p className="text-slate-600 text-sm mb-5">{message}</p>
            <div className="flex gap-3">
                <button
                    onClick={onConfirm}
                    disabled={loading}
                    className={`flex-1 py-2.5 text-white font-semibold rounded-lg transition disabled:opacity-60
                      flex items-center justify-center gap-2
                      ${confirmColor === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {loading
                        ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /></>
                        : confirmLabel}
                </button>
                <button
                    onClick={onCancel}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition text-sm font-medium"
                >
                    Cancelar
                </button>
            </div>
        </Modal>
    );
}

// Deriva un estado representativo del pedido a partir de sus ítems
function estadoPedido(items) {
    if (items.every(i => i.estado === 'rechazada')) return 'rechazada';
    if (items.every(i => i.estado === 'recibida')) return 'recibida';
    if (items.every(i => ['despachada', 'recibida'].includes(i.estado))) return 'despachada';
    if (items.some(i => i.estado === 'autorizada') && !items.some(i => i.estado === 'pendiente')) return 'autorizada';
    return 'pendiente';
}

// Fila de pedido expandible con acciones
function FilaPedido({ pedido, expandido, onToggle, onAutorizar, onDespachar, onRechazar, accionLoading, tabActiva }) {
    const estado = estadoPedido(pedido.items);
    const rechazados = pedido.items.filter(i => i.estado === 'rechazada').length;
    const total = pedido.items.length;
    const mostrarAcciones = ['activos', 'pendiente', 'autorizada', 'todos'].includes(tabActiva);
    return (
        <>
            <tr onClick={onToggle} className="hover:bg-slate-50 transition cursor-pointer select-none">
                <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                        <span className={`text-slate-400 text-xs transition-transform inline-block ${expandido ? 'rotate-90' : ''}`}>▶</span>
                        <div>
                            <p className="font-semibold text-slate-800">
                                {pedido.nro ? `Pedido #${pedido.nro}` : 'Pedido sin número'}
                            </p>
                            {pedido.motivo && (
                                <p className="text-xs text-slate-400 truncate max-w-xs" title={pedido.motivo}>{pedido.motivo}</p>
                            )}
                        </div>
                    </div>
                </td>
                <td className="px-5 py-3">
                    <p className="text-slate-700 text-sm">{pedido.trabajador?.nombre ?? '—'}</p>
                    {pedido.trabajador?.servicio && <p className="text-xs text-slate-400">{pedido.trabajador.servicio}</p>}
                </td>
                <td className="px-5 py-3 text-sm text-slate-600">{pedido.solicitante?.nombre ?? '—'}</td>
                <td className="px-5 py-3 text-center">
                    <span className="font-semibold text-slate-700 text-sm">{total}</span>
                    {rechazados > 0 && <span className="ml-1 text-xs text-red-500">({rechazados} rech.)</span>}
                </td>
                <td className="px-5 py-3"><Badge estado={estado} /></td>
                <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{pedido.fecha ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(pedido.fecha)) : '—'}</td>
            </tr>
            {expandido && (
                <tr>
                    <td colSpan={6} className="px-0 py-0 bg-slate-50">
                        <div className="px-14 py-3 border-y border-slate-100">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-200">
                                        <th className="py-2 pr-4 font-semibold">Insumo</th>
                                        <th className="py-2 pr-4 font-semibold text-center">Cant.</th>
                                        <th className="py-2 pr-4 font-semibold">Estado</th>
                                        <th className="py-2 pr-4 font-semibold">Gestor</th>
                                        {mostrarAcciones && <th className="py-2 font-semibold">Acciones</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pedido.items.map(item => {
                                        const enProceso = accionLoading === item.id;
                                        const sinStock = item.insumo?.stock_actual < item.cantidad;
                                        return (
                                            <tr key={item.id} className={`hover:bg-white transition ${enProceso ? 'opacity-50' : ''}`}>
                                                <td className="py-2 pr-4">
                                                    <p className="font-medium text-slate-700">{item.insumo?.nombre}</p>
                                                    <p className="text-xs text-slate-400">{item.insumo?.unidad_medida}</p>
                                                    {sinStock && item.estado === 'autorizada' && (
                                                        <p className="text-xs text-orange-600 mt-0.5">⚠ Stock insuf. ({item.insumo.stock_actual})</p>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-4 text-center font-semibold text-slate-700">{item.cantidad}</td>
                                                <td className="py-2 pr-4">
                                                    <Badge estado={item.estado} />
                                                    {item.estado === 'rechazada' && item.observaciones && (
                                                        <p className="text-xs text-red-500 mt-0.5">💬 {item.observaciones}</p>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-4 text-xs text-slate-500">{item.gestor?.nombre ?? '—'}</td>
                                                {mostrarAcciones && (
                                                    <td className="py-2" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {item.estado === 'pendiente' && (
                                                                <button
                                                                    onClick={() => onAutorizar(item)}
                                                                    disabled={enProceso}
                                                                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg font-medium transition disabled:opacity-50"
                                                                >✓ Autorizar</button>
                                                            )}
                                                            {item.estado === 'autorizada' && (
                                                                <button
                                                                    onClick={() => onDespachar(item)}
                                                                    disabled={enProceso || sinStock}
                                                                    title={sinStock ? 'Stock insuficiente' : ''}
                                                                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >🚀 Despachar</button>
                                                            )}
                                                            {['pendiente', 'autorizada'].includes(item.estado) && (
                                                                <button
                                                                    onClick={() => onRechazar(item)}
                                                                    disabled={enProceso}
                                                                    className="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-medium transition disabled:opacity-50"
                                                                >✕ Rechazar</button>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

export default function SolicitudesPendientes() {
    const { perfil } = useAuth();

    // Todos los registros (sin filtro en servidor; filtramos en cliente por pestaña)
    const [todas, setTodas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState(null);
    const [accionLoading, setAccionLoading] = useState(null);

    // Modal rechazo
    const [modalRechazo, setModalRechazo] = useState({ open: false, solicitud: null });
    const [motivoRechazo, setMotivoRechazo] = useState('');

    // Modal despacho (confirmación)
    const [modalDespacho, setModalDespacho] = useState({ open: false, solicitud: null });

    // Pestaña activa de filtro
    const [tabActiva, setTabActiva] = useState('activos');

    // Búsqueda de texto libre
    const [busqueda, setBusqueda] = useState('');

    // Pedidos expandidos
    const [expandidos, setExpandidos] = useState(new Set());

    const cargar = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('solicitudes')
            .select(`
                id, pedido_id, estado, cantidad, motivo, observaciones, created_at, updated_at,
                insumo:insumos(id, nombre, stock_actual, unidad_medida),
                solicitante:usuarios!solicitudes_solicitante_id_fkey(id, nombre, rol),
                trabajador:usuarios!solicitudes_trabajador_id_fkey(id, nombre, servicio),
                gestor:usuarios!solicitudes_gestionado_por_fkey(id, nombre),
                pedido:pedidos(id, nro_correlativo, motivo)
            `)
            .order('created_at', { ascending: false });

        if (!error) setTodas(data ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        startTransition(cargar);

        const channel = supabase
            .channel('solicitudes-realtime-tens')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes' }, () => cargar())
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [cargar]);

    // ── AUTORIZAR ──────────────────────────────────────────────
    const autorizar = async (solicitud) => {
        setFeedback(null);
        setAccionLoading(solicitud.id);

        const { error } = await supabase.rpc('autorizar_solicitud', {
            p_solicitud_id: solicitud.id,
            p_tens_id: perfil.id,
        });

        setAccionLoading(null);

        if (error) {
            setFeedback({ type: 'error', message: `Error al autorizar: ${error.message}` });
        } else {
            setFeedback({ type: 'success', message: `Solicitud de "${solicitud.insumo.nombre}" autorizada.` });
            cargar();
        }
    };

    // ── DESPACHAR (transacción atómica) ───────────────────────
    const despachar = async () => {
        const solicitud = modalDespacho.solicitud;
        setFeedback(null);
        setAccionLoading(solicitud.id);
        setModalDespacho({ open: false, solicitud: null });

        const { data, error } = await supabase.rpc('despachar_insumo', {
            p_solicitud_id: solicitud.id,
            p_tens_id: perfil.id,
        });

        setAccionLoading(null);

        if (error) {
            setFeedback({ type: 'error', message: `Error al despachar: ${error.message}` });
        } else {
            setFeedback({
                type: 'success',
                message: `✅ Insumo despachado. Stock de "${solicitud.insumo.nombre}": ${data.stock_anterior} → ${data.stock_nuevo} unidades.`,
            });
            cargar();
        }
    };

    // ── RECHAZAR ──────────────────────────────────────────────
    const rechazar = async () => {
        const solicitud = modalRechazo.solicitud;
        setFeedback(null);
        setAccionLoading(solicitud.id);
        setModalRechazo({ open: false, solicitud: null });

        const { error } = await supabase.rpc('rechazar_solicitud', {
            p_solicitud_id: solicitud.id,
            p_tens_id: perfil.id,
            p_observaciones: motivoRechazo || 'Sin motivo especificado',
        });

        setAccionLoading(null);
        setMotivoRechazo('');

        if (error) {
            setFeedback({ type: 'error', message: `Error al rechazar: ${error.message}` });
        } else {
            setFeedback({ type: 'info', message: `Solicitud rechazada.` });
            cargar();
        }
    };

    // ── Contadores por estado (para badges en pestañas) ───────
    const conteo = {
        pendiente: todas.filter(s => s.estado === 'pendiente').length,
        autorizada: todas.filter(s => s.estado === 'autorizada').length,
        despachada: todas.filter(s => s.estado === 'despachada').length,
        recibida: todas.filter(s => s.estado === 'recibida').length,
        rechazada: todas.filter(s => s.estado === 'rechazada').length,
    };
    const conteoActivos = conteo.pendiente + conteo.autorizada;

    const conteoTab = (key) => {
        if (key === 'activos') return conteoActivos;
        if (key === 'todos') return todas.length;
        return conteo[key] ?? 0;
    };

    // La columna Acciones solo se muestra en pestañas donde puede haber acciones
    const toggleExpandido = (id) => {
        setExpandidos(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // Agrupar todas las solicitudes por pedido
    const todosPedidos = (() => {
        const mapa = new Map();
        todas.forEach(s => {
            const clave = s.pedido_id ?? `sin-pedido-${s.id}`;
            if (!mapa.has(clave)) {
                mapa.set(clave, {
                    id: clave,
                    nro: s.pedido?.nro_correlativo ?? null,
                    motivo: s.pedido?.motivo ?? s.motivo ?? null,
                    trabajador: s.trabajador,
                    solicitante: s.solicitante,
                    fecha: s.created_at,
                    items: [],
                });
            }
            mapa.get(clave).items.push(s);
        });
        return [...mapa.values()];
    })();

    // ── Solicitudes filtradas por pestaña activa + búsqueda ───
    const pedidosFiltrados = todosPedidos.filter(p => {
        // filtro de estado sobre los ítems del pedido
        if (tabActiva === 'activos') {
            if (!p.items.some(i => ['pendiente', 'autorizada'].includes(i.estado))) return false;
        } else if (tabActiva !== 'todos') {
            if (!p.items.some(i => i.estado === tabActiva)) return false;
        }
        // filtro de búsqueda
        if (busqueda.trim()) {
            const q = busqueda.toLowerCase();
            return (
                p.trabajador?.nombre?.toLowerCase().includes(q) ||
                p.solicitante?.nombre?.toLowerCase().includes(q) ||
                p.trabajador?.servicio?.toLowerCase().includes(q) ||
                p.items.some(i => i.insumo?.nombre?.toLowerCase().includes(q))
            );
        }
        return true;
    });

    return (
        <>
            {/* Alerta de feedback */}
            {feedback && (
                <Alert type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

                {/* ── Pestañas de estado ──────────────────────────── */}
                <div className="flex items-center gap-1 px-4 pt-4 pb-0 flex-wrap border-b border-slate-100">
                    {TABS_ESTADO.map(({ key, label, color }) => {
                        const isActive = tabActiva === key;
                        const cnt = conteoTab(key);
                        const colors = TAB_COLOR[color];
                        return (
                            <button
                                key={key}
                                onClick={() => setTabActiva(key)}
                                className={`
                                    flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-t-lg border-b-2 transition
                                    ${isActive
                                        ? `${colors.active} border-b-2`
                                        : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'}
                                `}
                            >
                                {label}
                                {cnt > 0 && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-white/25 text-white' : colors.badge}`}>
                                        {cnt}
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    {/* Botón recargar alineado a la derecha */}
                    <div className="ml-auto pb-1">
                        <button onClick={cargar} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition" title="Recargar">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Barra de búsqueda ───────────────────────────── */}
                <div className="px-4 py-3 border-b border-slate-100">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                        <input
                            type="text"
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            placeholder="Buscar por insumo, trabajador, solicitante o servicio…"
                            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                        />
                        {busqueda && (
                            <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Tabla ───────────────────────────────────────── */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                                <th className="px-5 py-3 font-semibold">Pedido</th>
                                <th className="px-5 py-3 font-semibold">Trabajador</th>
                                <th className="px-5 py-3 font-semibold">Solicitante</th>
                                <th className="px-5 py-3 font-semibold text-center">Ítems</th>
                                <th className="px-5 py-3 font-semibold">Estado</th>
                                <th className="px-5 py-3 font-semibold">Fecha</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                                        <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                                        Cargando solicitudes…
                                    </td>
                                </tr>
                            ) : pedidosFiltrados.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-10 text-center">
                                        <p className="text-slate-400">
                                            {busqueda
                                                ? `Sin resultados para "${busqueda}".`
                                                : tabActiva === 'activos'
                                                    ? '✅ No hay solicitudes pendientes ni autorizadas.'
                                                    : `No hay pedidos con estado "${tabActiva === 'todos' ? 'ninguno' : tabActiva}".`}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                pedidosFiltrados.map((pedido) => (
                                    <FilaPedido
                                        key={pedido.id}
                                        pedido={pedido}
                                        expandido={expandidos.has(pedido.id)}
                                        onToggle={() => toggleExpandido(pedido.id)}
                                        onAutorizar={autorizar}
                                        onDespachar={(s) => setModalDespacho({ open: true, solicitud: s })}
                                        onRechazar={(s) => { setMotivoRechazo(''); setModalRechazo({ open: true, solicitud: s }); }}
                                        accionLoading={accionLoading}
                                        tabActiva={tabActiva}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                {!loading && (
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                        <span>
                            {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''}
                            {busqueda && ` para "${busqueda}"`}
                        </span>
                        {conteoActivos > 0 && tabActiva !== 'activos' && (
                            <button
                                onClick={() => setTabActiva('activos')}
                                className="text-amber-600 font-medium hover:underline"
                            >
                                {conteoActivos} solicitud{conteoActivos !== 1 ? 'es' : ''} activa{conteoActivos !== 1 ? 's' : ''} pendiente{conteoActivos !== 1 ? 's' : ''} de acción
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Modal: Confirmar despacho */}
            <ConfirmModal
                open={modalDespacho.open}
                title="Confirmar despacho"
                message={
                    modalDespacho.solicitud
                        ? `¿Confirmas el despacho de ${modalDespacho.solicitud.cantidad} unidad(es) de "${modalDespacho.solicitud.insumo?.nombre}" para ${modalDespacho.solicitud.trabajador?.nombre}? Se descontará el stock automáticamente.`
                        : ''
                }
                confirmLabel="🚀 Confirmar despacho"
                confirmColor="blue"
                loading={accionLoading === modalDespacho.solicitud?.id}
                onConfirm={despachar}
                onCancel={() => setModalDespacho({ open: false, solicitud: null })}
            />

            {/* Modal: Rechazar con motivo */}
            <Modal
                open={modalRechazo.open}
                onClose={() => setModalRechazo({ open: false, solicitud: null })}
                title="Rechazar solicitud"
                maxWidth="max-w-md"
            >
                {modalRechazo.solicitud && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                            Estás rechazando la solicitud de{' '}
                            <strong>{modalRechazo.solicitud.insumo?.nombre}</strong>{' '}
                            para <strong>{modalRechazo.solicitud.trabajador?.nombre}</strong>.
                        </p>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Motivo del rechazo <span className="text-slate-400">(opcional)</span>
                            </label>
                            <textarea
                                value={motivoRechazo}
                                onChange={(e) => setMotivoRechazo(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 resize-none
                           focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                                placeholder="Ej: Stock insuficiente, solicitud duplicada, insumo no disponible…"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={rechazar}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition"
                            >
                                Confirmar rechazo
                            </button>
                            <button
                                onClick={() => setModalRechazo({ open: false, solicitud: null })}
                                className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition text-sm font-medium"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
