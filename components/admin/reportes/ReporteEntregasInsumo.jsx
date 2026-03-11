'use client';
/**
 * components/admin/reportes/ReporteEntregasInsumo.jsx
 *
 * Historial de entregas de un insumo: cuándo se entregó, a quién y cuánto.
 * Fuente: solicitudes JOIN entregas WHERE insumo_id = X AND estado IN ('despachada','recibida')
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

function exportarCSV(filas, insumoNombre) {
    const cols = ['Fecha Despacho', 'Trabajador', 'Servicio', 'Cantidad', 'Solicitante', 'Estado', 'Fecha Recepción', 'Observaciones'];
    const rows = filas.map(s => [
        fmt(s.fecha_despacho ?? s.created_at),
        s.trabajador?.nombre ?? '',
        s.trabajador?.servicio ?? '',
        s.cantidad,
        s.solicitante?.nombre ?? '',
        s.estado,
        fmt(s.fecha_recepcion),
        s.observaciones ?? '',
    ]);
    const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `entregas_${insumoNombre?.replace(/\s+/g, '_') ?? 'insumo'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function ReporteEntregasInsumo() {
    const [catalogo, setCatalogo] = useState([]);
    const [catalogoCargado, setCatalogoCargado] = useState(false);
    const [insumoId, setInsumoId] = useState('');
    const [periodo, setPeriodo] = useState({ desde: restarDias(30), hasta: hoy() });
    const [filas, setFilas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
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
        if (!id) { setFilas([]); setLoading(false); setError(null); return; }
        const myId = ++fetchId.current;
        setLoading(true);
        setError(null);
        const dStr = `${desde}T00:00:00`;
        const hStr = `${hasta}T23:59:59`;
        supabase.from('solicitudes')
            .select(`
                id, estado, cantidad, motivo, observaciones, created_at, updated_at,
                trabajador:usuarios!solicitudes_trabajador_id_fkey(nombre, servicio, rol),
                solicitante:usuarios!solicitudes_solicitante_id_fkey(nombre),
                entrega:entregas!entregas_solicitud_id_fkey(fecha_despacho, fecha_recepcion, observaciones)
            `)
            .eq('insumo_id', id)
            .in('estado', ['despachada', 'recibida'])
            .gte('updated_at', dStr)
            .lte('updated_at', hStr)
            .order('updated_at', { ascending: false })
            .then(({ data, error: err }) => {
                if (myId !== fetchId.current) return;
                if (err) { setError(err.message); setLoading(false); return; }
                const toObj = (e) => Array.isArray(e) ? (e[0] ?? null) : e;
                setFilas((data ?? []).map(s => {
                    const ent = toObj(s.entrega);
                    return {
                        ...s,
                        fecha_despacho: ent?.fecha_despacho ?? s.updated_at ?? null,
                        fecha_recepcion: ent?.fecha_recepcion ?? null,
                    };
                }));
                setLoading(false);
            });
    }, []);

    const insumoSel = catalogo.find(i => i.id === insumoId);

    // Resumen: top 5 trabajadores que más recibieron este insumo
    const porTrabajador = filas.reduce((acc, s) => {
        const nombre = s.trabajador?.nombre ?? 'Desconocido';
        if (!acc[nombre]) acc[nombre] = { cantidad: 0, pedidos: 0, servicio: s.trabajador?.servicio ?? '' };
        acc[nombre].cantidad += s.cantidad;
        acc[nombre].pedidos += 1;
        return acc;
    }, {});
    const topTrabajadores = Object.entries(porTrabajador)
        .sort((a, b) => b[1].cantidad - a[1].cantidad)
        .slice(0, 6);

    const totalEntregado = filas.reduce((a, s) => a + s.cantidad, 0);
    const recibidas = filas.filter(s => s.estado === 'recibida').length;

    return (
        <div className="space-y-5">
            {/* Selector */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <span className="w-7 h-7 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center text-sm">📋</span>
                    Historial de entregas por insumo
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
                                if (!v) { setInsumoId(''); setFilas([]); }
                            }}
                            placeholder="Buscar insumo por nombre…"
                            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {insumoId && (
                            <button
                                onClick={() => { setInputInsumo(''); setInsumoId(''); setFilas([]); }}
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

                <div className="flex items-center gap-3 flex-wrap">
                    <PeriodSelector desde={periodo.desde} hasta={periodo.hasta} onChange={p => { setPeriodo(p); fetchData(insumoId, p.desde, p.hasta); }} />
                    {insumoId && (
                        <button
                            onClick={() => fetchData(insumoId, periodo.desde, periodo.hasta)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium transition"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Actualizar
                        </button>
                    )}
                </div>

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
                    {/* Stats rápidos */}
                    {filas.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
                                <p className="text-3xl font-bold text-purple-700">{filas.length}</p>
                                <p className="text-xs text-purple-500 mt-0.5">Despachos totales</p>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                                <p className="text-3xl font-bold text-blue-700">{totalEntregado}</p>
                                <p className="text-xs text-blue-500 mt-0.5">{insumoSel?.unidad_medida} entregadas</p>
                            </div>
                            <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                                <p className="text-3xl font-bold text-green-700">{recibidas}</p>
                                <p className="text-xs text-green-500 mt-0.5">confirmadas recibidas</p>
                            </div>
                        </div>
                    )}

                    {/* Top receptores */}
                    {topTrabajadores.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <h4 className="font-semibold text-slate-700 text-sm mb-3">
                                👥 Top receptores — {insumoSel?.nombre}
                            </h4>
                            <div className="space-y-2">
                                {topTrabajadores.map(([nombre, d], i) => {
                                    const pct = totalEntregado > 0 ? Math.round((d.cantidad / totalEntregado) * 100) : 0;
                                    return (
                                        <div key={nombre} className="flex items-center gap-3">
                                            <span className="text-xs text-slate-400 w-4 shrink-0 text-right">{i + 1}</span>
                                            <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0">
                                                {nombre.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <p className="text-xs font-medium text-slate-700 truncate">{nombre}</p>
                                                    <p className="text-xs text-slate-500 shrink-0 ml-2">
                                                        <span className="font-semibold text-slate-700">{d.cantidad}</span> {insumoSel?.unidad_medida} ({pct}%)
                                                    </p>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-purple-400 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                                {d.servicio && <p className="text-xs text-slate-400 mt-0.5">{d.servicio}</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tabla detalle */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div>
                                <h4 className="font-semibold text-slate-800">
                                    Detalle de entregas — {insumoSel?.nombre}
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {periodo.desde} al {periodo.hasta} · {filas.length} entrega{filas.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                            {filas.length > 0 && (
                                <button
                                    onClick={() => exportarCSV(filas, insumoSel?.nombre)}
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
                                        <th className="px-5 py-3 font-semibold">Fecha despacho</th>
                                        <th className="px-5 py-3 font-semibold">Trabajador</th>
                                        <th className="px-5 py-3 font-semibold">Servicio</th>
                                        <th className="px-5 py-3 font-semibold text-center">Cantidad</th>
                                        <th className="px-5 py-3 font-semibold">Solicitante</th>
                                        <th className="px-5 py-3 font-semibold">Fecha recepción</th>
                                        <th className="px-5 py-3 font-semibold text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filas.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                                                No se encontraron entregas en el período seleccionado.
                                            </td>
                                        </tr>
                                    ) : filas.map(s => (
                                        <tr key={s.id} className="hover:bg-slate-50 transition">
                                            <td className="px-5 py-3 text-xs text-slate-500">{fmt(s.fecha_despacho ?? s.created_at)}</td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0">
                                                        {s.trabajador?.nombre?.charAt(0) ?? '?'}
                                                    </div>
                                                    <p className="font-medium text-slate-800 text-xs">{s.trabajador?.nombre ?? '—'}</p>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-xs text-slate-500">{s.trabajador?.servicio ?? '—'}</td>
                                            <td className="px-5 py-3 text-center font-bold text-slate-700">
                                                {s.cantidad}
                                                <span className="text-xs text-slate-400 font-normal ml-0.5">{insumoSel?.unidad_medida}</span>
                                            </td>
                                            <td className="px-5 py-3 text-xs text-slate-500">{s.solicitante?.nombre ?? '—'}</td>
                                            <td className="px-5 py-3 text-xs text-slate-500">
                                                {s.fecha_recepcion ? fmt(s.fecha_recepcion) : <span className="text-slate-300">Pendiente</span>}
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
                                                    ${s.estado === 'recibida'
                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                        : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                                                    {s.estado}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
