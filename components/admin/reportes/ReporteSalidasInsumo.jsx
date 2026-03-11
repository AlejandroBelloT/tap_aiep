'use client';
/**
 * components/admin/reportes/ReporteSalidasInsumo.jsx
 *
 * Reporte de salidas de stock para un insumo en un período.
 * Agrupa por tipo de movimiento: despacho | merma | ajuste.
 * Fuente: tabla movimientos_stock WHERE tipo IN ('despacho','merma','ajuste')
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import PeriodSelector from './PeriodSelector';

function hoy() { return new Date().toISOString().split('T')[0]; }
function restarDias(d) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - d);
    return fecha.toISOString().split('T')[0];
}

const fmt = (iso) => iso
    ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—';

const TIPO_CONFIG = {
    despacho: { label: 'Despacho a trabajador', icon: '🚚', color: 'bg-blue-50 text-blue-700 border-blue-200', barColor: 'bg-blue-400' },
    merma: { label: 'Merma / Pérdida', icon: '⚠️', color: 'bg-red-50  text-red-700  border-red-200', barColor: 'bg-red-400' },
    ajuste: { label: 'Ajuste de inventario', icon: '⚙️', color: 'bg-amber-50 text-amber-700 border-amber-200', barColor: 'bg-amber-400' },
};

function exportarCSV(filas, insumoNombre) {
    const cols = ['Fecha', 'Tipo Salida', 'Cantidad', 'Stock Anterior', 'Stock Nuevo', 'Registrado por', 'Observaciones'];
    const rows = filas.map(m => [
        fmt(m.created_at),
        TIPO_CONFIG[m.tipo]?.label ?? m.tipo,
        m.cantidad,
        m.stock_anterior,
        m.stock_nuevo,
        m.usuario?.nombre ?? '',
        m.observaciones ?? '',
    ]);
    const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salidas_${insumoNombre?.replace(/\s+/g, '_') ?? 'insumo'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function ReporteSalidasInsumo() {
    const [catalogo, setCatalogo] = useState([]);
    const [catalogoCargado, setCatalogoCargado] = useState(false);
    const [insumoId, setInsumoId] = useState('');
    const [periodo, setPeriodo] = useState({ desde: restarDias(30), hasta: hoy() });
    const [filas, setFilas] = useState([]);
    const [totalRaw, setTotalRaw] = useState(0); // total antes del filtro cliente
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filtroTipo, setFiltroTipo] = useState('todos');
    const fetchId = useRef(0);
    const [inputInsumo, setInputInsumo] = useState('');
    const [dropAbierto, setDropAbierto] = useState(false);
    const dropRef = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropAbierto(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const cargarCatalogo = useCallback(async () => {
        if (catalogoCargado) return;
        const { data } = await supabase.from('insumos').select('id, nombre, unidad_medida').order('nombre');
        setCatalogo(data ?? []);
        setCatalogoCargado(true);
    }, [catalogoCargado]);

    const fetchData = useCallback((id, desde, hasta) => {
        if (!id) { setFilas([]); setTotalRaw(0); setFiltroTipo('todos'); setLoading(false); setError(null); return; }
        const myId = ++fetchId.current;
        setLoading(true);
        setError(null);
        // Usar fecha sin componente de hora para evitar problemas de zona horaria:
        // gte: inicio del día ("2026-02-03" → "2026-02-03T00:00:00")
        // lte: fin del día ("2026-03-05" → "2026-03-05T23:59:59")
        const dStr = `${desde}T00:00:00`;
        const hStr = `${hasta}T23:59:59`;
        supabase.from('movimientos_stock')
            .select('id, tipo, cantidad, stock_anterior, stock_nuevo, observaciones, created_at, usuario:usuarios(nombre)')
            .eq('insumo_id', id)
            .gte('created_at', dStr)
            .lte('created_at', hStr)
            .order('created_at', { ascending: false })
            .then(({ data, error: err }) => {
                if (myId !== fetchId.current) return;
                if (err) { setError(err.message); setLoading(false); return; }
                const todos = data ?? [];
                setTotalRaw(todos.length);
                setFilas(todos.filter(m => m.tipo !== 'ingreso'));
                setFiltroTipo('todos');
                setLoading(false);
            });
    }, []);

    const insumoSel = catalogo.find(i => i.id === insumoId);

    // Resumen agrupado por tipo (dinámico: toma los tipos que realmente existen en los datos)
    const tiposPresentes = [...new Set(filas.map(m => m.tipo))];
    const porTipo = tiposPresentes.map(tipo => ({
        tipo,
        cantidad: filas.filter(m => m.tipo === tipo).reduce((a, m) => a + m.cantidad, 0),
        registros: filas.filter(m => m.tipo === tipo).length,
    })).filter(g => g.registros > 0);

    const totalSalidas = filas.reduce((a, m) => a + m.cantidad, 0);
    const filasFiltradas = filtroTipo === 'todos' ? filas : filas.filter(m => m.tipo === filtroTipo);

    return (
        <div className="space-y-5">
            {/* Selector */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <span className="w-7 h-7 bg-red-100 text-red-600 rounded-lg flex items-center justify-center text-sm">📤</span>
                    Salidas de stock por insumo
                </h3>

                {/* Combobox buscable de insumos */}
                <div className="relative w-full max-w-md" ref={dropRef}>
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                        <input
                            type="text"
                            value={inputInsumo}
                            onFocus={() => { cargarCatalogo(); if (catalogo.length > 0) setDropAbierto(true); }}
                            onChange={e => {
                                const v = e.target.value;
                                setInputInsumo(v);
                                setDropAbierto(true);
                                cargarCatalogo();
                                if (!v) { setInsumoId(''); setFilas([]); setTotalRaw(0); }
                            }}
                            placeholder="Buscar insumo por nombre…"
                            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {insumoId && (
                            <button
                                onClick={() => { setInputInsumo(''); setInsumoId(''); setFilas([]); setTotalRaw(0); }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base leading-none"
                                title="Limpiar selección"
                            >✕</button>
                        )}
                    </div>
                    {dropAbierto && (() => {
                        const sugs = catalogo.filter(i => i.nombre.toLowerCase().includes(inputInsumo.toLowerCase()));
                        return sugs.length > 0 ? (
                            <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                                {sugs.slice(0, 12).map(i => (
                                    <li
                                        key={i.id}
                                        onMouseDown={e => { e.preventDefault(); setInputInsumo(i.nombre); setInsumoId(i.id); setDropAbierto(false); fetchData(i.id, periodo.desde, periodo.hasta); }}
                                        className={`px-3 py-2 cursor-pointer text-sm flex items-center justify-between hover:bg-blue-50
                                            ${i.id === insumoId ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700'}`}
                                    >
                                        <span>{i.nombre}</span>
                                        <span className="text-xs text-slate-400 ml-3 shrink-0">{i.unidad_medida}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : null;
                    })()}
                </div>

                <PeriodSelector desde={periodo.desde} hasta={periodo.hasta} onChange={p => { setPeriodo(p); fetchData(insumoId, p.desde, p.hasta); }} />

                {loading && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        Actualizando…
                    </div>
                )}
                {error && (
                    <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ Error: {error}</p>
                )}
            </div>

            {/* Resultados */}
            {insumoId && !loading && !error && (
                <div className="space-y-4">
                    {/* Tarjetas de resumen por tipo */}
                    {porTipo.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {porTipo.map(({ tipo, cantidad, registros }) => {
                                const cfg = TIPO_CONFIG[tipo];
                                return (
                                    <button
                                        key={tipo}
                                        type="button"
                                        onClick={() => setFiltroTipo(filtroTipo === tipo ? 'todos' : tipo)}
                                        className={`rounded-2xl border p-4 text-left transition
                                            ${filtroTipo === tipo ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
                                            ${cfg.color}`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">{cfg.icon}</span>
                                            <p className="text-xs font-semibold">{cfg.label}</p>
                                        </div>
                                        <p className="text-3xl font-bold">{cantidad}</p>
                                        <p className="text-xs mt-0.5 opacity-70">{insumoSel?.unidad_medida} · {registros} movimiento{registros !== 1 ? 's' : ''}</p>
                                    </button>
                                );
                            })}

                            {/* Total */}
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold text-slate-500 mb-1">Total salidas</p>
                                <p className="text-3xl font-bold text-slate-700">{totalSalidas}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{insumoSel?.unidad_medida} · {filas.length} movimientos</p>
                            </div>
                        </div>
                    )}

                    {/* Tabla */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div>
                                <h4 className="font-semibold text-slate-800">
                                    Detalle de salidas — {insumoSel?.nombre}
                                    {filtroTipo !== 'todos' && (
                                        <span className="ml-2 text-xs text-blue-600 font-normal">
                                            filtrando: {TIPO_CONFIG[filtroTipo]?.label}
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {periodo.desde} al {periodo.hasta} · {filasFiltradas.length} registro{filasFiltradas.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                            {filas.length > 0 && (
                                <button
                                    onClick={() => exportarCSV(filasFiltradas, insumoSel?.nombre)}
                                    className="px-3 py-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg font-medium transition"
                                >
                                    ⬇️ CSV
                                </button>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                                        <th className="px-5 py-3 font-semibold">Fecha</th>
                                        <th className="px-5 py-3 font-semibold">Tipo</th>
                                        <th className="px-5 py-3 font-semibold text-right">Cantidad</th>
                                        <th className="px-5 py-3 font-semibold text-right">Stock anterior</th>
                                        <th className="px-5 py-3 font-semibold text-right">Stock nuevo</th>
                                        <th className="px-5 py-3 font-semibold">Registrado por</th>
                                        <th className="px-5 py-3 font-semibold">Observaciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filasFiltradas.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-5 py-10 text-center">
                                                <p className="text-slate-400">No se encontraron salidas en el período seleccionado.</p>
                                                {totalRaw > 0 && (
                                                    <p className="text-xs text-amber-500 mt-1">
                                                        ({totalRaw} movimiento{totalRaw !== 1 ? 's' : ''} encontrado{totalRaw !== 1 ? 's' : ''} en la BD, todos son ingresos)
                                                    </p>
                                                )}
                                                {totalRaw === 0 && (
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        Si registraste mermas recientemente, ejecuta la migración <code className="bg-slate-100 px-1 rounded">006_fix_registrar_merma.sql</code> en Supabase.
                                                    </p>
                                                )}
                                            </td>
                                        </tr>
                                    ) : filasFiltradas.map(m => {
                                        const cfg = TIPO_CONFIG[m.tipo] ?? TIPO_CONFIG.ajuste;
                                        return (
                                            <tr key={m.id} className="hover:bg-slate-50 transition">
                                                <td className="px-5 py-3 text-xs text-slate-500">{fmt(m.created_at)}</td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                                                        {cfg.icon} {cfg.label}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-red-600">
                                                    -{m.cantidad}
                                                    <span className="text-xs text-slate-400 font-normal ml-0.5">{insumoSel?.unidad_medida}</span>
                                                </td>
                                                <td className="px-5 py-3 text-right text-xs text-slate-500">{m.stock_anterior}</td>
                                                <td className="px-5 py-3 text-right text-xs font-semibold text-slate-700">{m.stock_nuevo}</td>
                                                <td className="px-5 py-3 text-xs text-slate-600">{m.usuario?.nombre ?? '—'}</td>
                                                <td className="px-5 py-3 text-xs text-slate-400 italic">{m.observaciones ?? '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
