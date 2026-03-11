'use client';
/**
 * components/shared/RecepcionCompra.jsx
 *
 * Permite a TENS y Prevencionista registrar la recepción física
 * de los insumos de una solicitud de compra aprobada.
 *
 * Flujo:
 *  1. Carga solicitudes_compra con estado = 'aprobada' y fecha_recepcion IS NULL
 *  2. El usuario selecciona una y ajusta las cantidades realmente recibidas
 *  3. Al confirmar:
 *       - Llama a registrar_ingreso_stock por cada ítem con cantidad > 0
 *       - Actualiza la solicitud a estado = 'recibida' con el detalle
 */
import { useEffect, useState, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';

/* ── helpers ── */
const fmtFecha = (iso) =>
    iso
        ? new Date(iso).toLocaleDateString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
        : '—';

const nroSC = (n) => `SC-${String(n).padStart(3, '0')}`;

export default function RecepcionCompra() {
    const { perfil } = useAuth();

    /* ── estado general ────────────────────── */
    const [pendientes, setPendientes] = useState([]);   // aprobadas sin recibir
    const [historial, setHistorial] = useState([]);   // ya recibidas
    const [insumos, setInsumos] = useState([]);   // catálogo para match
    const [loading, setLoading] = useState(true);
    const [alert, setAlert] = useState(null);

    /* ── estado del formulario activo ──────── */
    const [recibiendo, setRecibiendo] = useState(null);   // solicitud seleccionada
    const [cantidades, setCantidades] = useState({});     // { idx: cantidad }
    const [observaciones, setObservaciones] = useState('');
    const [guardando, setGuardando] = useState(false);

    /* ── carga ─────────────────────────────── */
    const perfilId = perfil?.id ?? null;
    const cargar = useCallback(async () => {
        if (!perfilId) return;
        setLoading(true);
        setAlert(null);

        // Solicitudes aprobadas pendientes de recepción
        // Solo filtramos por estado='aprobada'; cuando se recibe pasa a 'recibida'
        const { data: pend, error: errPend } = await supabase
            .from('solicitudes_compra')
            .select('id, nro_solicitud, items, urgencia, created_at, observaciones_admin')
            .eq('solicitante_id', perfilId)
            .eq('estado', 'aprobada')
            .order('created_at', { ascending: false });

        if (errPend) {
            setAlert({ type: 'error', msg: `Error al cargar compras aprobadas: ${errPend.message}` });
            setLoading(false);
            return;
        }

        // Historial de recepciones ya registradas
        // Columnas básicas que existen en migración 003; las nuevas (fecha_recepcion,
        // items_recibidos) las pedimos por separado para no romper si no hay migración 004
        const { data: hist } = await supabase
            .from('solicitudes_compra')
            .select('id, nro_solicitud, items, urgencia, created_at, fecha_recepcion, items_recibidos')
            .eq('solicitante_id', perfilId)
            .eq('estado', 'recibida')
            .order('created_at', { ascending: false })
            .limit(20);

        // Catálogo de insumos para hacer match por nombre/código
        const { data: ins } = await supabase
            .from('insumos')
            .select('id, nombre, codigo, unidad_medida, stock_actual')
            .eq('activo', true);

        setPendientes(pend ?? []);
        setHistorial(hist ?? []);
        setInsumos(ins ?? []);
        setLoading(false);
    }, [perfilId]);

    useEffect(() => {
        startTransition(cargar);
    }, [cargar]);

    /* ── abrir formulario de recepción ─────── */
    const abrirRecepcion = (sol) => {
        const init = {};
        (sol.items ?? []).forEach((item, i) => {
            init[i] = item.cantidad;
        });
        setCantidades(init);
        setObservaciones('');
        setRecibiendo(sol);
        setAlert(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cerrarRecepcion = () => {
        setRecibiendo(null);
        setCantidades({});
        setObservaciones('');
    };

    /* ── buscar insumo por código o nombre ─── */
    const buscarInsumo = (item) => {
        // 1. Por código exacto
        if (item.codigo) {
            const match = insumos.find(
                (i) => i.codigo?.toLowerCase() === item.codigo.toLowerCase()
            );
            if (match) return match;
        }
        // 2. Por nombre normalizado
        return insumos.find(
            (i) => i.nombre.toLowerCase().trim() === item.nombre.toLowerCase().trim()
        ) ?? null;
    };

    /* ── confirmar recepción ────────────────── */
    const confirmarRecepcion = async () => {
        setAlert(null);
        const items = recibiendo.items ?? [];
        const itemsRecibidos = items.map((item, i) => ({
            nombre: item.nombre,
            codigo: item.codigo ?? null,
            cantidad_solicitada: item.cantidad,
            cantidad_recibida: Number(cantidades[i] ?? 0),
            unidad_medida: item.unidad_medida,
        }));

        const alguno = itemsRecibidos.some((i) => i.cantidad_recibida > 0);
        if (!alguno) {
            setAlert({ type: 'error', msg: 'Debes ingresar al menos una cantidad recibida mayor a 0.' });
            return;
        }

        setGuardando(true);

        // ── PASO 1: cambiar estado PRIMERO ──────────────────────────────────────
        // Si esto falla (RLS, enum faltante, etc.) NO se toca el stock.
        // Usamos .select('id') para detectar bloqueo silencioso de RLS
        // (cuando RLS deniega, Supabase devuelve data:[] sin lanzar error).
        const { data: updatedRows, error: errSol } = await supabase
            .from('solicitudes_compra')
            .update({
                estado: 'recibida',
                fecha_recepcion: new Date().toISOString(),
                recibido_por: perfil?.id,
                items_recibidos: itemsRecibidos,
            })
            .eq('id', recibiendo.id)
            .select('id');

        // RLS bloqueó silenciosamente → 0 filas, sin error
        if (!errSol && (!updatedRows || updatedRows.length === 0)) {
            setGuardando(false);
            setAlert({
                type: 'error',
                msg: '⛔ Sin permiso para marcar esta solicitud como recibida. Ejecuta la migración 005_fix_rls_recepcion.sql en Supabase SQL Editor.',
            });
            return; // ← stock intacto
        }

        // Error real (p.ej. enum 'recibida' no existe → migración 004 pendiente)
        if (errSol) {
            setGuardando(false);
            const esEnum = errSol.message?.includes('invalid input value for enum') ||
                errSol.message?.includes('recibida');
            setAlert({
                type: 'error',
                msg: esEnum
                    ? '⛔ Falta ejecutar la migración 004_recepcion_compra.sql en Supabase SQL Editor. El stock NO fue modificado.'
                    : `⛔ Error al guardar la recepción: ${errSol.message}. El stock NO fue modificado.`,
            });
            return; // ← stock intacto
        }

        // ── PASO 2: estado actualizado → ahora sí sumamos al stock ─────────────
        const erroresStock = [];
        for (const item of itemsRecibidos) {
            if (item.cantidad_recibida <= 0) continue;
            const insumo = buscarInsumo(item);
            if (!insumo) {
                erroresStock.push(item.nombre);
                continue;
            }
            const { error } = await supabase.rpc('registrar_ingreso_stock', {
                p_insumo_id: insumo.id,
                p_cantidad: item.cantidad_recibida,
                p_usuario_id: perfil?.id,
                p_observaciones: `Recepción SC-${String(recibiendo.nro_solicitud).padStart(3, '0')}${observaciones ? ` · ${observaciones}` : ''}`,
            });
            if (error) {
                erroresStock.push(`${item.nombre} (${error.message})`);
            }
        }

        setGuardando(false);

        if (erroresStock.length > 0) {
            setAlert({
                type: 'warning',
                msg: `Recepción guardada. Pero estos insumos no se encontraron en el catálogo y su stock NO fue actualizado: ${erroresStock.join(', ')}. Corrígelo manualmente en Gestión de Inventario.`,
            });
        } else {
            setAlert({ type: 'success', msg: '✅ Recepción registrada y stock actualizado correctamente.' });
        }

        cerrarRecepcion();
        startTransition(cargar);
    };

    /* ── render ─────────────────────────────── */
    if (!perfil) {
        return <div className="text-center py-10 text-slate-400 text-sm">Cargando sesión…</div>;
    }

    if (loading) {
        return <div className="text-center py-10 text-slate-400 text-sm">Cargando compras aprobadas…</div>;
    }

    return (
        <div className="space-y-6">

            {/* Alerta global */}
            {alert && (
                <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />
            )}

            {/* ── Formulario de recepción ─────────────────── */}
            {recibiendo && (
                <div className="bg-white rounded-2xl border-2 border-green-400 shadow-sm overflow-hidden">
                    {/* Cabecera */}
                    <div className="px-5 py-4 bg-green-50 border-b border-green-200 flex items-start justify-between gap-4">
                        <div>
                            <h3 className="font-semibold text-green-800 text-base">
                                📦 Registrar recepción — {nroSC(recibiendo.nro_solicitud)}
                            </h3>
                            <p className="text-xs text-green-700 mt-0.5">
                                Ajusta las cantidades que realmente llegaron. Los insumos se sumarán al stock automáticamente.
                            </p>
                        </div>
                        <button
                            onClick={cerrarRecepcion}
                            className="shrink-0 text-green-600 hover:text-green-800 transition text-lg font-bold"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Tabla de ítems */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Insumo</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-center">Solicitado</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-center">Unidad</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-center">
                                        Cantidad recibida <span className="text-red-500">*</span>
                                    </th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-center hidden sm:table-cell">Stock actual</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {(recibiendo.items ?? []).map((item, i) => {
                                    const insumo = buscarInsumo(item);
                                    return (
                                        <tr key={i} className="hover:bg-slate-50/60 transition">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-slate-800">{item.nombre}</p>
                                                {item.codigo && (
                                                    <p className="text-xs text-slate-400 font-mono">{item.codigo}</p>
                                                )}
                                                {!insumo && (
                                                    <p className="text-xs text-amber-600 mt-0.5">
                                                        ⚠️ No encontrado en catálogo — stock no se actualizará
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center font-medium text-slate-700">
                                                {item.cantidad}
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-500 capitalize">
                                                {item.unidad_medida}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={item.cantidad * 2}
                                                    value={cantidades[i] ?? ''}
                                                    onChange={(e) =>
                                                        setCantidades((prev) => ({ ...prev, [i]: e.target.value }))
                                                    }
                                                    className="w-24 text-sm text-center px-2 py-1.5 rounded-lg border border-slate-200
                                                               bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500
                                                               hover:border-green-400 transition"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-500 hidden sm:table-cell">
                                                {insumo != null ? insumo.stock_actual : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Observaciones + Confirmar */}
                    <div className="px-5 py-4 border-t border-slate-100 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                                Observaciones de recepción <span className="text-slate-400">(opcional)</span>
                            </label>
                            <textarea
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                placeholder="Ej: Llegó 1 caja dañada, se aceptaron las otras…"
                                rows={2}
                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white
                                           text-slate-800 placeholder:text-slate-400 focus:outline-none
                                           focus:ring-2 focus:ring-green-500 resize-none"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={cerrarRecepcion}
                                className="px-4 py-2 rounded-xl text-sm border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarRecepcion}
                                disabled={guardando}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold
                                           bg-green-600 hover:bg-green-700 text-white transition
                                           disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {guardando ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10"
                                                stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Registrando…
                                    </>
                                ) : (
                                    '✅ Confirmar recepción'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Solicitudes pendientes de recepción ──────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div>
                        <h3 className="font-semibold text-slate-800">
                            Compras aprobadas — pendientes de recepción
                            {pendientes.length > 0 && (
                                <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-medium">
                                    {pendientes.length}
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Solicitudes aprobadas por el Administrador que aún no han sido recibidas físicamente.
                        </p>
                    </div>
                    <button
                        onClick={() => startTransition(cargar)}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"
                        title="Recargar"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {pendientes.length === 0 ? (
                    <div className="text-center py-10 px-6 text-slate-400 text-sm space-y-1">
                        <p className="text-base">🎉 Sin pendientes</p>
                        <p>No tienes solicitudes de compra aprobadas por recibir.</p>
                        <p className="text-xs text-slate-300 mt-2">
                            Aparecerán aquí una vez que el Administrador apruebe tus solicitudes de compra.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {pendientes.map((sol) => (
                            <div key={sol.id} className="px-5 py-4 hover:bg-slate-50/50 transition">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                    {/* Info solicitud */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-2">
                                            <span className="font-semibold text-slate-800 font-mono text-sm">
                                                {nroSC(sol.nro_solicitud)}
                                            </span>
                                            <Badge
                                                variant={
                                                    sol.urgencia === 'critico' ? 'error'
                                                        : sol.urgencia === 'urgente' ? 'warning'
                                                            : 'default'
                                                }
                                                label={sol.urgencia}
                                            />
                                            <span className="text-xs text-slate-400">{fmtFecha(sol.created_at)}</span>
                                        </div>

                                        {/* Ítems compactos */}
                                        <div className="flex flex-wrap gap-1.5">
                                            {(sol.items ?? []).map((item, i) => (
                                                <span key={i}
                                                    className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                                                    {item.nombre} × {item.cantidad} {item.unidad_medida}
                                                </span>
                                            ))}
                                        </div>

                                        {sol.observaciones_admin && (
                                            <p className="text-xs text-blue-600 mt-1.5 bg-blue-50 px-2 py-1 rounded-md inline-block">
                                                💬 Admin: {sol.observaciones_admin}
                                            </p>
                                        )}
                                    </div>

                                    {/* Botón */}
                                    <button
                                        onClick={() => abrirRecepcion(sol)}
                                        disabled={recibiendo?.id === sol.id}
                                        className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                                                   bg-green-600 hover:bg-green-700 text-white transition
                                                   disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        📦 Registrar recepción
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Historial de recepciones ─────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">Historial de recepciones</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Últimas 20 recepciones registradas.</p>
                </div>

                {historial.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                        Aún no hay recepciones registradas.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider">N° Solicitud</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Insumos recibidos</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Fecha recepción</th>
                                    <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {historial.map((sol) => (
                                    <tr key={sol.id} className="hover:bg-slate-50/60 transition">
                                        <td className="px-4 py-3">
                                            <span className="font-semibold text-slate-800 font-mono">
                                                {nroSC(sol.nro_solicitud)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            <div className="flex flex-wrap gap-1">
                                                {(sol.items_recibidos ?? sol.items ?? []).map((item, i) => (
                                                    <span key={i}
                                                        className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-md">
                                                        {item.nombre} ×{' '}
                                                        {item.cantidad_recibida ?? item.cantidad}{' '}
                                                        {item.unidad_medida}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 hidden sm:table-cell text-slate-500 text-xs">
                                            {fmtFecha(sol.fecha_recepcion)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Badge variant="success" label="Recibida" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
