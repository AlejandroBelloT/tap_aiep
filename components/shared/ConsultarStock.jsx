'use client';
/**
 * components/shared/ConsultarStock.jsx
 *
 * Vista de consulta de stock.
 * - Buscador con dropdown de sugerencias en tiempo real
 * - Al seleccionar un insumo muestra tarjeta de detalle con stock
 * - Tabla completa con filtro de estado
 */
import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const ESTADO_STOCK = {
    critico: { label: 'Crítico', cls: 'bg-red-100 text-red-700 border-red-200', bar: 'bg-red-500' },
    bajo: { label: 'Bajo', cls: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-400' },
    ok: { label: 'Normal', cls: 'bg-green-100 text-green-700 border-green-200', bar: 'bg-green-400' },
    agotado: { label: 'Agotado', cls: 'bg-slate-100 text-slate-600 border-slate-200', bar: 'bg-slate-300' },
};

function estadoStock(ins) {
    if (ins.stock_actual === 0) return 'agotado';
    if (ins.stock_actual <= ins.stock_minimo * 0.5) return 'critico';
    if (ins.stock_actual <= ins.stock_minimo) return 'bajo';
    return 'ok';
}

export default function ConsultarStock() {
    const { session } = useAuth();

    const [insumos, setInsumos] = useState([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorCarga, setErrorCarga] = useState(null);
    const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

    /* ── Buscador con dropdown ───────────────────────────── */
    const [busqueda, setBusqueda] = useState('');
    const [dropdownAbierto, setDropdownAbierto] = useState(false);
    const [insumoSeleccionado, setInsumoSeleccionado] = useState(null);
    const wrapperRef = useRef(null);

    /* ── Filtro de tabla ─────────────────────────────────── */
    const [filtroEstado, setFiltroEstado] = useState('todos');

    /* ── Carga ───────────────────────────────────────────── */
    const cargar = useCallback(async (esManual = false) => {
        if (esManual) setRefreshing(true);

        const { data, error } = await supabase
            .from('insumos')
            .select('id, codigo, nombre, descripcion, unidad_medida, stock_actual, stock_minimo, activo')
            .order('nombre');

        if (error) {
            console.error('[ConsultarStock] Error cargando insumos:', error);
            setErrorCarga(error.message ?? 'Error al cargar insumos');
        } else {
            setErrorCarga(null);
            const activos = (data ?? []).filter(i => i.activo !== false);
            setInsumos(activos);
            setUltimaActualizacion(new Date());
            setInsumoSeleccionado(prev =>
                prev ? activos.find(i => i.id === prev.id) ?? null : null
            );
        }
        setInitialLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => {
        // Esperar a que la sesión esté disponible antes de consultar
        if (!session) {
            startTransition(() => setInitialLoading(false));
            return;
        }
        startTransition(cargar);
        const iv = setInterval(() => cargar(), 60_000);
        return () => clearInterval(iv);
    }, [session, cargar]);

    /* ── Cerrar dropdown al hacer clic fuera ─────────────── */
    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setDropdownAbierto(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    /* ── Sugerencias filtradas ───────────────────────────── */
    const sugerencias = useMemo(() => {
        const q = busqueda.toLowerCase().trim();
        if (!q) return [];
        return insumos
            .filter(ins =>
                ins.nombre.toLowerCase().includes(q) ||
                (ins.codigo ?? '').toLowerCase().includes(q) ||
                (ins.descripcion ?? '').toLowerCase().includes(q)
            )
            .slice(0, 8);
    }, [insumos, busqueda]);

    /* ── Tabla filtrada ──────────────────────────────────── */
    const tablaFiltrada = useMemo(() => {
        return insumos.filter(ins => {
            const estado = estadoStock(ins);
            return filtroEstado === 'todos' || filtroEstado === estado ||
                (filtroEstado === 'alerta' && (estado === 'critico' || estado === 'bajo' || estado === 'agotado'));
        });
    }, [insumos, filtroEstado]);

    const seleccionar = (ins) => {
        setInsumoSeleccionado(ins);
        setBusqueda(ins.nombre);
        setDropdownAbierto(false);
    };

    const limpiarSeleccion = () => {
        setInsumoSeleccionado(null);
        setBusqueda('');
    };

    const resumen = useMemo(() => ({
        total: insumos.length,
        agotados: insumos.filter(i => estadoStock(i) === 'agotado').length,
        criticos: insumos.filter(i => estadoStock(i) === 'critico').length,
        bajos: insumos.filter(i => estadoStock(i) === 'bajo').length,
    }), [insumos]);

    /* ─────────────────────────────────────────────────────── */
    /* RENDER                                                  */
    /* ─────────────────────────────────────────────────────── */
    return (
        <div className="space-y-5">

            {/* ── Error de carga ──────────────────── */}
            {errorCarga && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-red-700">Error al cargar insumos</p>
                        <p className="text-xs text-red-500 mt-0.5 break-all">{errorCarga}</p>
                    </div>
                    <button onClick={() => cargar(true)} className="ml-auto shrink-0 text-xs text-red-600 underline hover:no-underline">Reintentar</button>
                </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total insumos', value: resumen.total, cls: 'bg-blue-50 border-blue-100 text-blue-700' },
                    { label: 'Agotados', value: resumen.agotados, cls: 'bg-slate-50 border-slate-200 text-slate-600' },
                    { label: 'Stock crítico (≤50%)', value: resumen.criticos, cls: 'bg-red-50 border-red-100 text-red-700' },
                    { label: 'Stock bajo (≤ mínimo)', value: resumen.bajos, cls: 'bg-amber-50 border-amber-100 text-amber-700' },
                ].map(card => (
                    <div key={card.label} className={`rounded-xl border p-4 ${card.cls}`}>
                        <p className="text-2xl font-bold">{card.value}</p>
                        <p className="text-xs mt-0.5 opacity-70">{card.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Buscador de insumo ─────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <p className="text-sm font-medium text-slate-700">Consultar insumo específico</p>

                <div className="relative" ref={wrapperRef}>
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        value={busqueda}
                        onChange={e => {
                            setBusqueda(e.target.value);
                            setInsumoSeleccionado(null);
                            setDropdownAbierto(true);
                        }}
                        onFocus={() => sugerencias.length > 0 && setDropdownAbierto(true)}
                        placeholder="Escribe el nombre del insumo…"
                        className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    {busqueda && (
                        <button type="button" onClick={limpiarSeleccion}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}

                    {/* Dropdown de sugerencias */}
                    {dropdownAbierto && sugerencias.length > 0 && (
                        <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                            {sugerencias.map(ins => {
                                const est = estadoStock(ins);
                                const { cls } = ESTADO_STOCK[est];
                                return (
                                    <li key={ins.id}>
                                        <button type="button" onClick={() => seleccionar(ins)}
                                            className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-slate-800 truncate">{ins.nombre}</p>
                                                {ins.codigo && <p className="text-xs text-slate-400 font-mono">{ins.codigo}</p>}
                                            </div>
                                            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
                                                {ins.stock_actual} {ins.unidad_medida}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {dropdownAbierto && busqueda.length > 1 && sugerencias.length === 0 && !initialLoading && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 text-sm text-slate-400">
                            Sin coincidencias para &quot;{busqueda}&quot;
                        </div>
                    )}
                </div>

                {/* Tarjeta de detalle del insumo seleccionado */}
                {insumoSeleccionado && (() => {
                    const ins = insumoSeleccionado;
                    const est = estadoStock(ins);
                    const { label, cls, bar } = ESTADO_STOCK[est];
                    const pct = ins.stock_minimo > 0
                        ? Math.min(100, Math.round((ins.stock_actual / (ins.stock_minimo * 2)) * 100))
                        : ins.stock_actual > 0 ? 100 : 0;
                    return (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="font-semibold text-slate-800 text-base leading-tight">{ins.nombre}</p>
                                    {ins.codigo && <p className="text-xs text-slate-400 font-mono mt-0.5">{ins.codigo}</p>}
                                    {ins.descripcion && <p className="text-xs text-slate-500 mt-0.5">{ins.descripcion}</p>}
                                </div>
                                <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${cls}`}>{label}</span>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2.5 text-center">
                                    <p className="text-2xl font-bold text-slate-800">{ins.stock_actual}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{ins.unidad_medida}</p>
                                    <p className="text-xs text-slate-400">Stock actual</p>
                                </div>
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2.5 text-center">
                                    <p className="text-2xl font-bold text-slate-500">{ins.stock_minimo}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{ins.unidad_medida}</p>
                                    <p className="text-xs text-slate-400">Stock mínimo</p>
                                </div>
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2.5 text-center">
                                    <p className="text-2xl font-bold text-slate-800">{pct}%</p>
                                    <p className="text-xs text-slate-400 mt-0.5">del umbral</p>
                                    <p className="text-xs text-slate-400">Nivel</p>
                                </div>
                            </div>

                            <div>
                                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                    {est === 'agotado' && '⚠️ Sin stock disponible'}
                                    {est === 'critico' && '🔴 Stock crítico — requiere reposición urgente'}
                                    {est === 'bajo' && '🟡 Stock bajo — próximo al mínimo'}
                                    {est === 'ok' && '🟢 Stock en niveles normales'}
                                </p>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* ── Tabla completa ─────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-700 flex-1">Todos los insumos</p>
                    <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="todos">Todos los estados</option>
                        <option value="alerta">⚠️ Con alerta</option>
                        <option value="agotado">Agotado</option>
                        <option value="critico">Crítico</option>
                        <option value="bajo">Stock bajo</option>
                        <option value="ok">Normal</option>
                    </select>
                    <button onClick={() => cargar(true)} disabled={refreshing}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition shrink-0 disabled:opacity-40" title="Actualizar">
                        <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                                <th className="px-5 py-3 font-semibold">Código</th>
                                <th className="px-5 py-3 font-semibold">Nombre</th>
                                <th className="px-5 py-3 font-semibold">Descripción</th>
                                <th className="px-5 py-3 font-semibold">Unidad</th>
                                <th className="px-5 py-3 font-semibold text-right">Stock actual</th>
                                <th className="px-5 py-3 font-semibold text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {initialLoading ? (
                                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                                    <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                                    Cargando stock…
                                </td></tr>
                            ) : tablaFiltrada.length === 0 ? (
                                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                                    No hay insumos con el estado seleccionado.
                                </td></tr>
                            ) : tablaFiltrada.map(ins => {
                                const est = estadoStock(ins);
                                const { label, cls } = ESTADO_STOCK[est];
                                const esSeleccionado = insumoSeleccionado?.id === ins.id;
                                return (
                                    <tr key={ins.id}
                                        onClick={() => seleccionar(ins)}
                                        className={`cursor-pointer transition ${esSeleccionado ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50'}`}>
                                        <td className="px-5 py-3 text-xs font-mono text-slate-500">{ins.codigo ?? '—'}</td>
                                        <td className="px-5 py-3 font-medium text-slate-800">{ins.nombre}</td>
                                        <td className="px-5 py-3 text-xs text-slate-500">{ins.descripcion ?? '—'}</td>
                                        <td className="px-5 py-3 text-xs text-slate-500">{ins.unidad_medida}</td>
                                        <td className="px-5 py-3 text-right font-semibold text-slate-700">
                                            {ins.stock_actual}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
                                                {label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!initialLoading && (
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>{tablaFiltrada.length} insumo{tablaFiltrada.length !== 1 ? 's' : ''}</span>
                        {ultimaActualizacion && (
                            <span>Actualizado: {ultimaActualizacion.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
