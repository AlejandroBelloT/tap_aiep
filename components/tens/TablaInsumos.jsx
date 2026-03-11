'use client';
/**
 * components/tens/TablaInsumos.jsx
 * Tabla de inventario con estado de stock y acciones rápidas.
 * Recibe callbacks para abrir formularios de Ingreso y Merma.
 */
import { useEffect, useState, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import Badge from '@/components/ui/Badge';

export default function TablaInsumos({ onIngreso, onMerma, readOnly = false }) {
    const [insumos, setInsumos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');

    const cargar = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('insumos')
            .select('*')
            .eq('activo', true)
            .order('nombre');

        if (!error) setInsumos(data ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        startTransition(cargar);

        // Suscripción en tiempo real
        const channel = supabase
            .channel('insumos-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'insumos' }, cargar)
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [cargar]);

    const filtrados = insumos.filter((i) =>
        i.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        (i.codigo ?? '').toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Inventario de Insumos</h3>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="Buscar insumo o código…"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                    />
                    <button
                        onClick={cargar}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                        title="Recargar"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                            <th className="px-5 py-3 font-semibold">Insumo</th>
                            <th className="px-5 py-3 font-semibold">Código</th>
                            <th className="px-5 py-3 font-semibold">Unidad</th>
                            <th className="px-5 py-3 font-semibold text-center">Stock actual</th>
                            <th className="px-5 py-3 font-semibold text-center">Mínimo</th>
                            <th className="px-5 py-3 font-semibold">Estado</th>
                            {!readOnly && <th className="px-5 py-3 font-semibold">Acciones</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            <tr>
                                <td colSpan={readOnly ? 6 : 7} className="px-5 py-10 text-center text-slate-400">
                                    <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                                    Cargando inventario…
                                </td>
                            </tr>
                        ) : filtrados.length === 0 ? (
                            <tr>
                                <td colSpan={readOnly ? 6 : 7} className="px-5 py-10 text-center text-slate-400">
                                    {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay insumos registrados.'}
                                </td>
                            </tr>
                        ) : (
                            filtrados.map((insumo) => {
                                const bajStock = insumo.stock_actual <= insumo.stock_minimo;
                                return (
                                    <tr
                                        key={insumo.id}
                                        className={`hover:bg-slate-50 transition ${bajStock ? 'bg-orange-50/40' : ''}`}
                                    >
                                        <td className="px-5 py-3 font-medium text-slate-800">{insumo.nombre}</td>
                                        <td className="px-5 py-3 text-slate-500 font-mono text-xs">{insumo.codigo ?? '—'}</td>
                                        <td className="px-5 py-3 text-slate-500">{insumo.unidad_medida}</td>
                                        <td className={`px-5 py-3 text-center font-bold ${bajStock ? 'text-orange-600' : 'text-slate-800'}`}>
                                            {insumo.stock_actual}
                                        </td>
                                        <td className="px-5 py-3 text-center text-slate-500">{insumo.stock_minimo}</td>
                                        <td className="px-5 py-3">
                                            {bajStock ? <Badge estado="bajo_stock" /> : <Badge estado="activo" />}
                                        </td>
                                        {!readOnly && (
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => onIngreso(insumo)}
                                                        className="px-2.5 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 rounded-lg font-medium transition"
                                                    >
                                                        + Ingreso
                                                    </button>
                                                    <button
                                                        onClick={() => onMerma(insumo)}
                                                        className="px-2.5 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-medium transition"
                                                    >
                                                        Merma
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer con totales */}
            {!loading && (
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>{filtrados.length} insumo{filtrados.length !== 1 ? 's' : ''}</span>
                    <span className="text-orange-600 font-medium">
                        {insumos.filter((i) => i.stock_actual <= i.stock_minimo).length} con stock bajo
                    </span>
                </div>
            )}
        </div>
    );
}
