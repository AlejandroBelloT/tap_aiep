'use client';
/**
 * components/jefatura/TablaMisSolicitudes.jsx
 *
 * Tabla con el estado en tiempo real de todas las solicitudes
 * creadas por el usuario actualmente autenticado (solicitante_id = perfil.id).
 * Incluye filtro por estado y suscripción realtime.
 */
import { useEffect, useState, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Badge from '@/components/ui/Badge';

const fmt = (iso) =>
    iso
        ? new Intl.DateTimeFormat('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }).format(new Date(iso))
        : '—';

// Deriva un estado representativo del pedido a partir de sus ítems
function estadoPedido(items) {
    if (items.every(i => i.estado === 'rechazada')) return 'rechazada';
    if (items.every(i => i.estado === 'recibida')) return 'recibida';
    if (items.every(i => ['despachada', 'recibida'].includes(i.estado))) return 'despachada';
    if (items.some(i => i.estado === 'autorizada') && !items.some(i => i.estado === 'pendiente')) return 'autorizada';
    return 'pendiente';
}

// Fila de pedido expandible (solo lectura)
function FilaPedido({ pedido, expandido, onToggle }) {
    const estado = estadoPedido(pedido.items);
    const rechazados = pedido.items.filter(i => i.estado === 'rechazada').length;
    const total = pedido.items.length;
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
                <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(pedido.fecha)}</td>
                <td className="px-5 py-3">
                    <p className="text-slate-700 text-sm">{pedido.trabajador?.nombre ?? '—'}</p>
                    {pedido.trabajador?.servicio && <p className="text-xs text-slate-400">{pedido.trabajador.servicio}</p>}
                </td>
                <td className="px-5 py-3 text-sm text-slate-600">{pedido.solicitante?.nombre ?? '—'}</td>
                <td className="px-5 py-3 text-center">
                    <span className="font-semibold text-slate-700 text-sm">{total}</span>
                    {rechazados > 0 && (
                        <span className="ml-1 text-xs text-red-500">({rechazados} rech.)</span>
                    )}
                </td>
                <td className="px-5 py-3"><Badge estado={estado} /></td>
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
                                        <th className="py-2 pr-4 font-semibold">Gestionado por</th>
                                        <th className="py-2 font-semibold">Actualizado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pedido.items.map(item => (
                                        <tr key={item.id} className="hover:bg-white transition">
                                            <td className="py-2 pr-4">
                                                <p className="font-medium text-slate-700">{item.insumo?.nombre}</p>
                                                <p className="text-xs text-slate-400">{item.insumo?.unidad_medida}</p>
                                            </td>
                                            <td className="py-2 pr-4 text-center font-semibold text-slate-700">{item.cantidad}</td>
                                            <td className="py-2 pr-4">
                                                <Badge estado={item.estado} />
                                                {item.estado === 'rechazada' && item.observaciones && (
                                                    <p className="text-xs text-red-500 mt-0.5">💬 {item.observaciones}</p>
                                                )}
                                            </td>
                                            <td className="py-2 pr-4 text-xs text-slate-500">{item.gestor?.nombre ?? '—'}</td>
                                            <td className="py-2 text-xs text-slate-400 whitespace-nowrap">{fmt(item.updated_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

/**
 * filtrarPor: 'solicitante_id' (default, para jefatura/prev)
 *             'trabajador_id'  (para trabajador — ve solicitudes donde él es el receptor)
 */
export default function TablaMisSolicitudes({ filtrarPor = 'solicitante_id' }) {
    const { perfil } = useAuth();

    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroEstado, setFiltroEstado] = useState('todas');
    const [errorMsg, setErrorMsg] = useState(null);
    const [expandidos, setExpandidos] = useState(new Set());

    const perfilId = perfil?.id;
    const cargar = useCallback(async () => {
        if (!perfilId) return;
        setLoading(true);

        const { data, error } = await supabase
            .from('solicitudes')
            .select(`
                id, pedido_id, estado, cantidad, motivo, observaciones, created_at, updated_at,
                insumo:insumos(nombre, unidad_medida),
                trabajador:usuarios!solicitudes_trabajador_id_fkey(nombre, servicio),
                solicitante:usuarios!solicitudes_solicitante_id_fkey(nombre),
                gestor:usuarios!solicitudes_gestionado_por_fkey(nombre),
                pedido:pedidos(id, nro_correlativo, motivo)
            `)
            .eq(filtrarPor, perfilId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[TablaMisSolicitudes]', error);
            setErrorMsg(`${error.message} (${error.code ?? 'sin código'})`);
        } else {
            setErrorMsg(null);
            setSolicitudes(data ?? []);
        }
        setLoading(false);
    }, [perfilId, filtrarPor]);

    useEffect(() => {
        startTransition(cargar);

        const channel = supabase
            .channel(`mis-solicitudes-${filtrarPor}-${perfilId}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'solicitudes',
                filter: `${filtrarPor}=eq.${perfilId}`,
            }, cargar)
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [cargar, perfilId]);

    // Agrupar solicitudes por pedido
    const todosPedidos = (() => {
        const mapa = new Map();
        solicitudes.forEach(s => {
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

    // Filtrar pedidos por estado derivado
    const pedidosFiltrados = filtroEstado === 'todas'
        ? todosPedidos
        : todosPedidos.filter(p => estadoPedido(p.items) === filtroEstado);

    // Contadores para tabs (basados en el estado derivado de cada pedido)
    const contadores = {
        pendiente: todosPedidos.filter(p => estadoPedido(p.items) === 'pendiente').length,
        autorizada: todosPedidos.filter(p => estadoPedido(p.items) === 'autorizada').length,
        despachada: todosPedidos.filter(p => estadoPedido(p.items) === 'despachada').length,
        recibida: todosPedidos.filter(p => estadoPedido(p.items) === 'recibida').length,
        rechazada: todosPedidos.filter(p => estadoPedido(p.items) === 'rechazada').length,
    };

    const FILTROS = [
        { value: 'todas', label: 'Todas' },
        { value: 'pendiente', label: 'Pendientes' },
        { value: 'autorizada', label: 'Autorizadas' },
        { value: 'despachada', label: 'Despachadas' },
        { value: 'recibida', label: 'Recibidas' },
        { value: 'rechazada', label: 'Rechazadas' },
    ];

    const toggleExpandido = (id) => {
        setExpandidos(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Mis Solicitudes</h3>
                <button
                    onClick={cargar}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition self-end sm:self-auto"
                    title="Actualizar"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            {/* Filtros por estado */}
            <div className="flex flex-wrap gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                {FILTROS.map(({ value, label }) => {
                    const isActive = filtroEstado === value;
                    const count = value === 'todas' ? todosPedidos.length : contadores[value];
                    return (
                        <button
                            key={value}
                            onClick={() => setFiltroEstado(value)}
                            className={`text-xs px-3 py-1 rounded-full font-medium transition border
                                ${isActive
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                                }`}
                        >
                            {label}
                            {count > 0 && (
                                <span className={`ml-1 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>({count})</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-slate-500 uppercase tracking-wider bg-white border-b border-slate-50">
                            <th className="px-5 py-3 font-semibold">Pedido</th>
                            <th className="px-5 py-3 font-semibold">Fecha</th>
                            <th className="px-5 py-3 font-semibold">Trabajador</th>
                            <th className="px-5 py-3 font-semibold">Solicitante</th>
                            <th className="px-5 py-3 font-semibold text-center">Ítems</th>
                            <th className="px-5 py-3 font-semibold">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                                    <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                                    Cargando…
                                </td>
                            </tr>
                        ) : errorMsg ? (
                            <tr>
                                <td colSpan={6} className="px-5 py-10 text-center">
                                    <p className="text-red-600 font-medium text-sm">Error al cargar solicitudes:</p>
                                    <p className="text-red-400 text-xs mt-1 font-mono">{errorMsg}</p>
                                    <button onClick={cargar} className="mt-3 text-xs text-blue-600 underline">Reintentar</button>
                                </td>
                            </tr>
                        ) : pedidosFiltrados.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                                    {filtroEstado === 'todas'
                                        ? 'No hay solicitudes aún.'
                                        : `No hay pedidos con estado "${filtroEstado}".`}
                                </td>
                            </tr>
                        ) : (
                            pedidosFiltrados.map((pedido) => (
                                <FilaPedido
                                    key={pedido.id}
                                    pedido={pedido}
                                    expandido={expandidos.has(pedido.id)}
                                    onToggle={() => toggleExpandido(pedido.id)}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            {!loading && (
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
                    {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''}
                    {filtroEstado !== 'todas' && ` con estado "${filtroEstado}"`}
                </div>
            )}
        </div>
    );
}

