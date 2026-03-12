'use client';
/**
 * components/admin/reportes/ReporteSalidasInsumo.jsx
 *
 * Reporte de mermas: muestra todos los movimientos tipo 'merma' del período.
 * Permite filtrar por un insumo específico o ver todos.
 */
import { useState, useCallback, useRef, useEffect, startTransition } from 'react';
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

function exportarCSV(filas) {
    const cols = ['Fecha', 'Insumo', 'Cantidad', 'Stock Anterior', 'Stock Nuevo', 'Registrado por', 'Motivo'];
    const rows = filas.map(m => [
        fmt(m.created_at),
        m.insumo?.nombre ?? '',
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
    a.download = `mermas.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function ReporteSalidasInsumo() {
    const [catalogo, setCatalogo] = useState([]);
    const [catalogoCargado, setCatalogoCargado] = useState(false);
    const [insumoId, setInsumoId] = useState('');
    const [inputInsumo, setInputInsumo] = useState('');
    const [dropAbierto, setDropAbierto] = useState(false);
    const [periodo, setPeriodo] = useState({ desde: restarDias(30), hasta: hoy() });
    const [filas, setFilas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const fetchId = useRef(0);
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
        const myId = ++fetchId.current;
        setLoading(true);
        setError(null);
        const dStr = `${desde}T00:00:00`;
        const hStr = `${hasta}T23:59:59`;
        let query = supabase.from('movimientos_stock')
            .select('id, cantidad, stock_anterior, stock_nuevo, observaciones, created_at, insumo:insumos(nombre, unidad_medida), usuario:usuarios(nombre)')
            .eq('tipo', 'merma')
            .gte('created_at', dStr)
            .lte('created_at', hStr)
            .order('created_at', { ascending: false });
        if (id) query = query.eq('insumo_id', id);
        query.then(({ data, error: err }) => {
            if (myId !== fetchId.current) return;
            if (err) { setError(err.message); setLoading(false); return; }
            setFilas(data ?? []);
            setLoading(false);
        });
    }, []);

    useEffect(() => { startTransition(() => fetchData(insumoId, periodo.desde, periodo.hasta)); }, [fetchData, insumoId, periodo.desde, periodo.hasta]);

    const totalMerma = filas.reduce((a, m) => a + m.cantidad, 0);
    const insumoSel = catalogo.find(i => i.id === insumoId);

    const sugerencias = dropAbierto
        ? catalogo.filter(i => i.nombre.toLowerCase().includes(inputInsumo.toLowerCase())).slice(0, 12)
        : [];

    return (
        <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <span className="w-7 h-7 bg-red-100 text-red-600 rounded-lg flex items-center justify-center text-sm">⚠️</span>
                    Mermas de stock
                </h3>

                {/* Combobox opcional de insumo */}
                <div className="relative w-full max-w-md" ref={dropRef}>
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                        <input
                            type="text"
                            value={inputInsumo}
                            onFocus={() => { cargarCatalogo(); setDropAbierto(true); }}
                            onChange={e => {
                                const v = e.target.value;
                                setInputInsumo(v);
                                cargarCatalogo();
                                setDropAbierto(true);
                                if (!v) { setInsumoId(''); }
                            }}
                            placeholder="Todos los insumos (opcional)…"
                            className="w-full pl-9 pr-8 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                        />
                        {inputInsumo && (
                            <button
                                onClick={() => { setInputInsumo(''); setInsumoId(''); setDropAbierto(false); }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base leading-none"
                                title="Ver todos los insumos"
                            >✕</button>
                        )}
                    </div>
                    {dropAbierto && sugerencias.length > 0 && (
                        <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                            {sugerencias.map(i => (
                                <li
                                    key={i.id}
                                    onMouseDown={e => {
                                        e.preventDefault();
                                        setInputInsumo(i.nombre);
                                        setInsumoId(i.id);
                                        setDropAbierto(false);
                                    }}
                                    className={`px-3 py-2 cursor-pointer text-sm flex items-center justify-between hover:bg-red-50
                                        ${i.id === insumoId ? 'bg-red-50 font-medium text-red-700' : 'text-slate-700'}`}
                                >
                                    <span>{i.nombre}</span>
                                    <span className="text-sm text-slate-400 ml-3 shrink-0">{i.unidad_medida}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <PeriodSelector desde={periodo.desde} hasta={periodo.hasta} onChange={p => setPeriodo(p)} />

                {loading && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        Actualizando…
                    </div>
                )}
                {error && (
                    <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ Error: {error}</p>
                )}
            </div>

            {/* Resultados */}
            {!loading && !error && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <div>
                            <h4 className="font-semibold text-slate-800">
                                Mermas registradas
                                {insumoSel && <span className="text-slate-500 font-normal"> — {insumoSel.nombre}</span>}
                            </h4>
                            <p className="text-sm text-slate-500 mt-0.5">
                                {periodo.desde} al {periodo.hasta} · {filas.length} registro{filas.length !== 1 ? 's' : ''}
                                {totalMerma > 0 && ` · Total: ${totalMerma}${insumoSel ? ` ${insumoSel.unidad_medida}` : ''}`}
                            </p>
                        </div>
                        {filas.length > 0 && (
                            <button
                                onClick={() => exportarCSV(filas)}
                                className="px-3 py-1.5 text-sm bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg font-medium transition"
                            >
                                ⬇️ CSV
                            </button>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-left text-sm text-slate-500 uppercase tracking-wider">
                                    <th className="px-5 py-3 font-semibold">Fecha</th>
                                    <th className="px-5 py-3 font-semibold">Insumo</th>
                                    <th className="px-5 py-3 font-semibold text-right">Cantidad</th>
                                    <th className="px-5 py-3 font-semibold text-right">Stock anterior</th>
                                    <th className="px-5 py-3 font-semibold text-right">Stock nuevo</th>
                                    <th className="px-5 py-3 font-semibold">Registrado por</th>
                                    <th className="px-5 py-3 font-semibold">Motivo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filas.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-10 text-center text-slate-400">
                                            No se encontraron mermas en el período seleccionado.
                                        </td>
                                    </tr>
                                ) : filas.map(m => (
                                    <tr key={m.id} className="hover:bg-slate-50 transition">
                                        <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{fmt(m.created_at)}</td>
                                        <td className="px-5 py-3 font-medium text-slate-800">
                                            {m.insumo?.nombre ?? '—'}                                            
                                        </td>
                                        <td className="px-5 py-3 text-right font-bold text-red-600">
                                            -{m.cantidad}
                                        </td>
                                        <td className="px-5 py-3 text-right text-sm text-slate-500">{m.stock_anterior ?? '—'}</td>
                                        <td className="px-5 py-3 text-right text-sm font-semibold text-slate-700">{m.stock_nuevo ?? '—'}</td>
                                        <td className="px-5 py-3 text-sm text-slate-600">{m.usuario?.nombre ?? '—'}</td>
                                        <td className="px-5 py-3 text-sm text-slate-600 italic max-w-xs truncate">{m.observaciones ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

