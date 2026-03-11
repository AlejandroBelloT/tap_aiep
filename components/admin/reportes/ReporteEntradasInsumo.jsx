'use client';
/**
 * components/admin/reportes/ReporteEntradasInsumo.jsx
 *
 * Todas las entradas de stock en un período (tipo='ingreso').
 * Muestra todos los insumos sin necesidad de seleccionar uno.
 * Filtros opcionales: nombre de insumo, origen (recepción de compra / ingreso manual).
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

const ORIGEN_CONFIG = {
    compra: { label: 'Recepción de compra', icon: '📦', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    manual: { label: 'Ingreso manual', icon: '📥', color: 'bg-green-50 text-green-700 border-green-200' },
};

function detectarOrigen(obs) {
    if (!obs) return 'manual';
    return /recepci[oó]n\s+SC-/i.test(obs) ? 'compra' : 'manual';
}

function exportarCSV(filas) {
    const cols = ['Fecha', 'Insumo', 'Origen', 'Cantidad Ingresada', 'Stock Anterior', 'Stock Nuevo', 'Registrado por', 'Observaciones'];
    const rows = filas.map(m => [
        fmt(m.created_at),
        m.insumo?.nombre ?? '',
        ORIGEN_CONFIG[detectarOrigen(m.observaciones)].label,
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
    a.download = `entradas_stock.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function ReporteEntradasInsumo() {
    const [periodo, setPeriodo] = useState({ desde: restarDias(30), hasta: hoy() });
    const [filas, setFilas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filtroOrigen, setFiltroOrigen] = useState('todos');
    const [filtroInsumo, setFiltroInsumo] = useState('');
    const fetchId = useRef(0);

    const fetchData = useCallback((desde, hasta) => {
        const myId = ++fetchId.current;
        setLoading(true);
        setError(null);
        const dStr = `${desde}T00:00:00`;
        const hStr = `${hasta}T23:59:59`;
        supabase.from('movimientos_stock')
            .select('id, tipo, cantidad, stock_anterior, stock_nuevo, observaciones, created_at, insumo:insumos(nombre, unidad_medida), usuario:usuarios(nombre)')
            .eq('tipo', 'ingreso')
            .gte('created_at', dStr)
            .lte('created_at', hStr)
            .order('created_at', { ascending: false })
            .then(({ data, error: err }) => {
                if (myId !== fetchId.current) return;
                if (err) { setError(err.message); setLoading(false); return; }
                setFilas(data ?? []);
                setFiltroOrigen('todos');
                setFiltroInsumo('');
                setLoading(false);
            });
    }, []);

    useEffect(() => { startTransition(() => fetchData(periodo.desde, periodo.hasta)); }, [fetchData, periodo.desde, periodo.hasta]);

    const filasFiltradas = filas.filter(m => {
        if (filtroOrigen !== 'todos' && detectarOrigen(m.observaciones) !== filtroOrigen) return false;
        if (filtroInsumo && !m.insumo?.nombre?.toLowerCase().includes(filtroInsumo.toLowerCase())) return false;
        return true;
    });

    const totalIngresado = filas.reduce((a, m) => a + m.cantidad, 0);

    return (
        <div className="space-y-5">
            {/* Selector de insumo y período */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <span className="w-7 h-7 bg-green-100 text-green-600 rounded-lg flex items-center justify-center text-sm">📥</span>
                    Entradas de stock — todos los insumos
                </h3>

                <PeriodSelector desde={periodo.desde} hasta={periodo.hasta} onChange={p => { setPeriodo(p); fetchData(p.desde, p.hasta); }} />

                <input
                    type="text"
                    placeholder="Filtrar por nombre de insumo…"
                    value={filtroInsumo}
                    onChange={e => setFiltroInsumo(e.target.value)}
                    className="w-full max-w-sm text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800
                     focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                />

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
            {!loading && !error && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div>
                                <h4 className="font-semibold text-slate-800">Detalle de entradas</h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {periodo.desde} al {periodo.hasta} · {filasFiltradas.length} registro{filasFiltradas.length !== 1 ? 's' : ''}
                                    {totalIngresado > 0 && ` · Total ingresado: ${totalIngresado}`}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {filasFiltradas.length > 0 && (
                                    <button
                                        onClick={() => exportarCSV(filasFiltradas)}
                                        className="px-3 py-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg font-medium transition"
                                    >
                                        ⬇️ CSV
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                                        <th className="px-5 py-3 font-semibold">Fecha</th>
                                        <th className="px-5 py-3 font-semibold">Insumo</th>
                                        <th className="px-5 py-3 font-semibold">Origen</th>
                                        <th className="px-5 py-3 font-semibold text-right">Cantidad ingresada</th>
                                        <th className="px-5 py-3 font-semibold text-right">Stock anterior</th>
                                        <th className="px-5 py-3 font-semibold text-right">Stock resultante</th>
                                        <th className="px-5 py-3 font-semibold">Registrado por</th>
                                        <th className="px-5 py-3 font-semibold">Observaciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filasFiltradas.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                                                No se encontraron ingresos de stock en el período seleccionado.
                                            </td>
                                        </tr>
                                    ) : filasFiltradas.map(m => {
                                        const origen = detectarOrigen(m.observaciones);
                                        const cfg = ORIGEN_CONFIG[origen];
                                        return (
                                            <tr key={m.id} className="hover:bg-slate-50 transition">
                                                <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(m.created_at)}</td>
                                                <td className="px-5 py-3 font-medium text-slate-800">
                                                    {m.insumo?.nombre ?? '—'}
                                                    {m.insumo?.unidad_medida && (
                                                        <span className="ml-1 text-xs text-slate-400 font-normal">({m.insumo.unidad_medida})</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                                                        {cfg.icon} {cfg.label}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-green-700 whitespace-nowrap">
                                                    +{m.cantidad}
                                                    <span className="text-xs text-slate-400 font-normal ml-0.5">{m.insumo?.unidad_medida ?? ''}</span>
                                                </td>
                                                <td className="px-5 py-3 text-right text-slate-500 text-xs">{m.stock_anterior}</td>
                                                <td className="px-5 py-3 text-right font-semibold text-slate-700 text-xs">{m.stock_nuevo}</td>
                                                <td className="px-5 py-3 text-xs text-slate-600">{m.usuario?.nombre ?? '—'}</td>
                                                <td className="px-5 py-3 text-xs text-slate-400 italic max-w-xs truncate">{m.observaciones ?? '—'}</td>
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
