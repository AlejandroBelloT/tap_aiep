'use client';
/**
 * components/admin/reportes/ReporteTrabajador.jsx
 *
 * Reporte de insumos entregados a un trabajador en un período.
 * Muestra las solicitudes en estado 'despachada' o 'recibida' para el trabajador seleccionado.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatRut, validateRut } from '@/lib/rut';
import PeriodSelector from './PeriodSelector';
import Badge from '@/components/ui/Badge';

function hoy() { return new Date().toISOString().split('T')[0]; }
function restarDias(d) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - d);
    return fecha.toISOString().split('T')[0];
}

const fmt = (iso) => iso
    ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—';

function exportarCSV(filas, trabajador) {
    const cols = ['Fecha Despacho', 'Insumo', 'Cantidad', 'Unidad', 'Solicitante', 'Estado', 'Observaciones'];
    const rows = filas.map(s => [
        fmt(s.fecha_despacho ?? s.created_at),
        s.insumo?.nombre ?? '',
        s.cantidad,
        s.insumo?.unidad_medida ?? '',
        s.solicitante?.nombre ?? '',
        s.estado,
        s.observaciones ?? '',
    ]);
    const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insumos_trabajador_${trabajador?.replace(/\s+/g, '_') ?? 'reporte'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function ReporteTrabajador() {
    const [rutInput, setRutInput] = useState('');
    const [buscando, setBuscando] = useState(false);
    const [trabajador, setTrabajador] = useState(null);
    const [rutError, setRutError] = useState('');

    // Búsqueda por nombre
    const [modoSearch, setModoSearch] = useState('rut'); // 'rut' | 'nombre'
    const [nombreInput, setNombreInput] = useState('');
    const [sugerenciasNombre, setSugerenciasNombre] = useState([]);
    const [cargandoNombre, setCargandoNombre] = useState(false);
    const [dropNombreAbierto, setDropNombreAbierto] = useState(false);
    const dropNombreRef = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (dropNombreRef.current && !dropNombreRef.current.contains(e.target)) setDropNombreAbierto(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!nombreInput.trim() || modoSearch !== 'nombre') { setSugerenciasNombre([]); return; }
        const timer = setTimeout(async () => {
            setCargandoNombre(true);
            const { data } = await supabase.from('usuarios')
                .select('id, nombre, rut, rol, servicio')
                .ilike('nombre', `%${nombreInput.trim()}%`)
                .order('nombre')
                .limit(10);
            setSugerenciasNombre(data ?? []);
            setCargandoNombre(false);
            setDropNombreAbierto(true);
        }, 300);
        return () => clearTimeout(timer);
    }, [nombreInput, modoSearch]);

    const [periodo, setPeriodo] = useState({ desde: restarDias(365), hasta: hoy() });

    const [filas, setFilas] = useState(null); // null = aún no buscado
    const [totalSinFiltro, setTotalSinFiltro] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async (trabajadorId, desde, hasta) => {
        setLoading(true); setError(null);
        const dStr = `${desde}T00:00:00`;
        const hStr = `${hasta}T23:59:59`;

        const { data, error: err } = await supabase
            .from('solicitudes')
            .select(`
                id, estado, cantidad, motivo, observaciones, created_at, updated_at,
                insumo:insumos(nombre, unidad_medida, codigo),
                solicitante:usuarios!solicitudes_solicitante_id_fkey(nombre),
                entrega:entregas!entregas_solicitud_id_fkey(fecha_despacho, fecha_recepcion)
            `)
            .eq('trabajador_id', trabajadorId)
            .gte('updated_at', dStr)
            .lte('updated_at', hStr)
            .order('updated_at', { ascending: false });

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
    }, []);

    // Cuenta total sin filtro de fecha para diagnóstico
    const fetchTotal = useCallback(async (trabajadorId) => {
        const { count } = await supabase
            .from('solicitudes')
            .select('*', { count: 'exact', head: true })
            .eq('trabajador_id', trabajadorId);
        setTotalSinFiltro(count ?? 0);
    }, []);

    // Buscar trabajador por RUT
    const buscarTrabajador = useCallback(async () => {
        if (!validateRut(rutInput)) { setRutError('RUT inválido.'); return; }
        setRutError('');
        setBuscando(true);
        const { data, error: rpcError } = await supabase.rpc('buscar_trabajador_por_rut', { p_rut: rutInput.trim() });
        setBuscando(false);
        if (rpcError) { setRutError(`Error al buscar: ${rpcError.message}`); setTrabajador(null); return; }
        if (!data || data.length === 0) { setRutError('No se encontró ningún usuario con ese RUT.'); setTrabajador(null); return; }
        const t = data[0];
        setTrabajador(t);
        setFilas(null);
        setTotalSinFiltro(null);
        await fetchTotal(t.id);
        fetchData(t.id, periodo.desde, periodo.hasta);
    }, [rutInput, periodo.desde, periodo.hasta, fetchData, fetchTotal]);

    const filasMostradas = filas ?? [];

    return (
        <div className="space-y-5">
            {/* Búsqueda de trabajador */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <span className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">👤</span>
                    Seleccionar trabajador
                </h3>

                {/* Tabs modo búsqueda */}
                <div className="flex rounded-lg overflow-hidden border border-slate-200 w-fit">
                    <button
                        type="button"
                        onClick={() => { setModoSearch('rut'); setNombreInput(''); setSugerenciasNombre([]); }}
                        className={`px-3.5 py-1.5 text-xs font-medium transition border-r border-slate-200
                            ${modoSearch === 'rut' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        Buscar por RUT
                    </button>
                    <button
                        type="button"
                        onClick={() => { setModoSearch('nombre'); setRutInput(''); setRutError(''); }}
                        className={`px-3.5 py-1.5 text-xs font-medium transition
                            ${modoSearch === 'nombre' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                        Buscar por nombre
                    </button>
                </div>

                {/* Búsqueda por RUT */}
                {modoSearch === 'rut' && (
                    <div className="flex gap-2 flex-wrap">
                        <div className="flex-1 min-w-48 relative">
                            <input
                                type="text"
                                value={rutInput}
                                onChange={e => { setRutInput(formatRut(e.target.value)); setTrabajador(null); }}
                                onKeyDown={e => e.key === 'Enter' && buscarTrabajador()}
                                placeholder="RUT del trabajador (Ej: 12.345.678-9)"
                                maxLength={12}
                                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={buscarTrabajador}
                            disabled={buscando || rutInput.length < 5}
                            className="px-4 py-2.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                        >
                            {buscando ? '…' : '🔍 Buscar'}
                        </button>
                        {rutError && <p className="w-full text-xs text-red-500 flex items-center gap-1"><span>⚠️</span> {rutError}</p>}
                    </div>
                )}

                {/* Búsqueda por nombre con autocompletar */}
                {modoSearch === 'nombre' && (
                    <div className="relative max-w-sm" ref={dropNombreRef}>
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                            </svg>
                            <input
                                type="text"
                                value={nombreInput}
                                onChange={e => { setNombreInput(e.target.value); setTrabajador(null); }}
                                onFocus={() => { if (sugerenciasNombre.length > 0) setDropNombreAbierto(true); }}
                                placeholder="Nombre del trabajador…"
                                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {cargandoNombre && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            )}
                        </div>
                        {dropNombreAbierto && sugerenciasNombre.length > 0 && (
                            <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                                {sugerenciasNombre.map(u => (
                                    <li
                                        key={u.id}
                                        onMouseDown={e => {
                                            e.preventDefault();
                                            setNombreInput(u.nombre);
                                            setDropNombreAbierto(false);
                                            setTrabajador(u);
                                            setFilas(null);
                                            setTotalSinFiltro(null);
                                            fetchTotal(u.id);
                                            fetchData(u.id, periodo.desde, periodo.hasta);
                                        }}
                                        className="px-3 py-2.5 cursor-pointer text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0"
                                    >
                                        <p className="font-medium text-slate-800">{u.nombre}</p>
                                        <p className="text-xs text-slate-400">{u.servicio ?? 'Sin servicio'} · {u.rol}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {nombreInput.trim().length >= 2 && !cargandoNombre && sugerenciasNombre.length === 0 && (
                            <p className="text-xs text-slate-400 mt-1.5 ml-1">Sin resultados para "{nombreInput}"</p>
                        )}
                    </div>
                )}

                {trabajador && (
                    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-green-200 text-green-700 font-bold flex items-center justify-center shrink-0">
                            {trabajador.nombre.charAt(0)}
                        </div>
                        <div>
                            <p className="font-semibold text-green-800">{trabajador.nombre}</p>
                            <p className="text-xs text-green-600">{trabajador.servicio ?? 'Sin servicio'} · {trabajador.rol}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Período y generar */}
            {trabajador && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                        <span className="w-7 h-7 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center text-sm">📅</span>
                        Período del reporte
                    </h3>
                    <div className="flex items-center gap-3 flex-wrap">
                        <PeriodSelector desde={periodo.desde} hasta={periodo.hasta} onChange={p => { setPeriodo(p); if (trabajador) fetchData(trabajador.id, p.desde, p.hasta); }} />
                        {trabajador && (
                            <button
                                onClick={() => fetchData(trabajador.id, periodo.desde, periodo.hasta)}
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
            )}

            {/* Resultados */}
            {trabajador && !loading && filas !== null && (
                <div className="space-y-4">
                    {/* Diagnóstico: total histórico vs período */}
                    {totalSinFiltro !== null && filasMostradas.length === 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                            {totalSinFiltro === 0
                                ? '⚠️ Este trabajador no tiene ninguna solicitud registrada en el sistema.'
                                : `⚠️ No hay solicitudes en el período seleccionado, pero el trabajador tiene ${totalSinFiltro} solicitud${totalSinFiltro !== 1 ? 'es' : ''} en total. Amplía el rango de fechas.`}
                        </div>
                    )}
                    {/* Tabla detalle */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div>
                                <h4 className="font-semibold text-slate-800">
                                    Detalle — {trabajador?.nombre}
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {periodo.desde} al {periodo.hasta} · {filasMostradas.length} registro{filasMostradas.length !== 1 ? 's' : ''}
                                    {filasMostradas.length > 0 && ` · Total despachado: ${filasMostradas.filter(s => ['despachada', 'recibida'].includes(s.estado)).reduce((a, s) => a + s.cantidad, 0)} unidades`}
                                </p>
                            </div>
                            {filasMostradas.length > 0 && (
                                <button
                                    onClick={() => exportarCSV(filasMostradas, trabajador?.nombre)}
                                    className="px-3 py-1.5 text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg font-medium transition"
                                >
                                    ⬇️ Exportar CSV
                                </button>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                                        <th className="px-5 py-3 font-semibold">Insumo</th>
                                        <th className="px-5 py-3 font-semibold text-center">Cantidad</th>
                                        <th className="px-5 py-3 font-semibold">Fecha despacho</th>
                                        <th className="px-5 py-3 font-semibold">Fecha recepción</th>
                                        <th className="px-5 py-3 font-semibold">Solicitante</th>
                                        <th className="px-5 py-3 font-semibold">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filasMostradas.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                                                No se encontraron solicitudes para este trabajador en el período seleccionado.
                                            </td>
                                        </tr>
                                    ) : filasMostradas.map(s => (
                                        <tr key={s.id} className="hover:bg-slate-50 transition">
                                            <td className="px-5 py-3">
                                                <p className="font-medium text-slate-800">{s.insumo?.nombre}</p>
                                                {s.motivo && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-40" title={s.motivo}>{s.motivo}</p>}
                                            </td>
                                            <td className="px-5 py-3 text-center font-semibold text-slate-700">
                                                {s.cantidad}
                                                <span className="text-xs text-slate-400 font-normal ml-0.5">{s.insumo?.unidad_medida}</span>
                                            </td>
                                            <td className="px-5 py-3 text-xs text-slate-500">{fmt(s.fecha_despacho ?? s.created_at)}</td>
                                            <td className="px-5 py-3 text-xs text-slate-500">{fmt(s.fecha_recepcion) ?? <span className="text-slate-300">Pendiente</span>}</td>
                                            <td className="px-5 py-3 text-xs text-slate-600">{s.solicitante?.nombre ?? '—'}</td>
                                            <td className="px-5 py-3">
                                                <Badge estado={s.estado} />
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
