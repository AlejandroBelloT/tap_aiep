'use client';
/**
 * components/shared/SolicitudCompraForm.jsx
 *
 * Formulario de Solicitud de Compra — estilo orden/factura.
 *  1. Cabecera automática con nombre del solicitante y fecha.
 *  2. Datos generales: urgencia, proveedor sugerido, justificación.
 *  3. Sección "Agregar ítem": buscar insumo + cantidad → botón Agregar.
 *  4. Tabla de ítems confirmados (líneas de orden de compra).
 *  5. Botón "Enviar solicitud" al pie.
 *  6. Historial de mis solicitudes previas.
 */
import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/* ── Constantes ───────────────────────────────────────────── */
const URGENCIA_OPT = [
    { value: 'normal', label: 'Normal', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    { value: 'urgente', label: 'Urgente', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
    { value: 'critico', label: 'Crítico', cls: 'bg-red-100   text-red-700   border-red-300' },
];

const URGENCIA_ACTIVE = {
    normal: 'bg-slate-600  text-white border-slate-600',
    urgente: 'bg-amber-500  text-white border-amber-500',
    critico: 'bg-red-600    text-white border-red-600',
};

const ESTADO_CLS = {
    pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
    aprobada: 'bg-green-100 text-green-700 border-green-200',
    rechazada: 'bg-red-100   text-red-700   border-red-200',
};
const ESTADO_LABEL = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

function nroSC(n) { return `SC-${String(n).padStart(4, '0')}`; }
function fmtPeso(v) { return `$${Number(v).toLocaleString('es-CL')}`; }
function fmtFecha(iso) {
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Ítem de entrada vacío ───────────────────────────────── */
const entradaVacia = () => ({
    nombre: '', codigo: '', cantidad: 1, unidad_medida: 'unidad', precio_estimado: '',
});

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */
export default function SolicitudCompraForm() {
    const { perfil, session } = useAuth();

    /* ── Datos generales ────────────────────────────────────── */
    const [urgencia, setUrgencia] = useState('normal');
    const [proveedor, setProveedor] = useState('');
    const [justificacion, setJustificacion] = useState('');

    /* ── Ítem en edición (fila de ingreso) ──────────────────── */
    const [entrada, setEntrada] = useState(entradaVacia());
    const [busqTerm, setBusqTerm] = useState('');
    const [dropOpen, setDropOpen] = useState(false);
    const dropRef = useRef(null);

    /* ── Lista de ítems confirmados (tabla de la orden) ─────── */
    const [listaItems, setListaItems] = useState([]);

    /* ── Envío ──────────────────────────────────────────────── */
    const [enviando, setEnviando] = useState(false);
    const [feedback, setFeedback] = useState(null);

    /* ── Insumos para autocompletar ─────────────────────────── */
    const [insumos, setInsumos] = useState([]);

    /* ── Historial ──────────────────────────────────────────── */
    const [historial, setHistorial] = useState([]);
    const [loadingHist, setLoadingHist] = useState(true);
    const [detalleAbierto, setDetalleAbierto] = useState(null);

    /* ──────────────────────────────────────────────────────────
       Efectos
    ────────────────────────────────────────────────────────── */

    // Cargar catálogo de insumos
    useEffect(() => {
        if (!session) return;
        supabase
            .from('insumos')
            .select('id, nombre, codigo, unidad_medida')
            .eq('activo', true)
            .order('nombre')
            .then(({ data }) => startTransition(() => setInsumos(data ?? [])));
    }, [session]);

    // Cargar historial del usuario
    const perfilId = perfil?.id ?? null;
    const cargarHistorial = useCallback(async () => {
        if (!perfilId) return;
        setLoadingHist(true);
        const { data } = await supabase
            .from('solicitudes_compra')
            .select(`
                id, nro_solicitud, estado, urgencia, justificacion,
                proveedor_sugerido, items, observaciones_admin,
                created_at, revisado_por, fecha_revision,
                revisadoPor:usuarios!solicitudes_compra_revisado_por_fkey(nombre)
            `)
            .eq('solicitante_id', perfilId)
            .order('created_at', { ascending: false });
        startTransition(() => {
            setHistorial(data ?? []);
            setLoadingHist(false);
        });
    }, [perfilId]);

    useEffect(() => {
        if (!session) return;
        startTransition(cargarHistorial);
    }, [session, cargarHistorial]);

    // Cerrar dropdown al clic fuera
    useEffect(() => {
        const h = (e) => {
            if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    /* ──────────────────────────────────────────────────────────
       Autocompletar
    ────────────────────────────────────────────────────────── */
    const sugerencias = useMemo(() => {
        if (!dropOpen || !busqTerm.trim()) return [];
        const q = busqTerm.toLowerCase();
        return insumos
            .filter(i =>
                i.nombre.toLowerCase().includes(q) ||
                (i.codigo ?? '').toLowerCase().includes(q)
            )
            .slice(0, 8);
    }, [insumos, dropOpen, busqTerm]);

    const seleccionarInsumo = (ins) => {
        setEntrada(prev => ({
            ...prev,
            nombre: ins.nombre,
            codigo: ins.codigo ?? '',
            unidad_medida: ins.unidad_medida ?? 'unidad',
        }));
        setBusqTerm(ins.nombre);
        setDropOpen(false);
    };

    /* ──────────────────────────────────────────────────────────
       Agregar ítem a la lista
    ────────────────────────────────────────────────────────── */
    const puedeAgregar = entrada.nombre.trim() && Number(entrada.cantidad) > 0;

    const agregarItem = () => {
        if (!puedeAgregar) return;
        setListaItems(prev => [
            ...prev,
            {
                _key: Date.now() + Math.random(),
                nombre: entrada.nombre.trim(),
                codigo: entrada.codigo.trim() || null,
                cantidad: Number(entrada.cantidad),
                unidad_medida: entrada.unidad_medida.trim() || 'unidad',
                precio_estimado: entrada.precio_estimado !== '' ? Number(entrada.precio_estimado) : null,
            },
        ]);
        setEntrada(entradaVacia());
        setBusqTerm('');
        setDropOpen(false);
    };

    const quitarItem = (key) => setListaItems(prev => prev.filter(it => it._key !== key));

    /* ──────────────────────────────────────────────────────────
       Total estimado
    ────────────────────────────────────────────────────────── */
    const totalEstimado = useMemo(() =>
        listaItems.reduce((acc, it) =>
            it.precio_estimado != null ? acc + it.precio_estimado * it.cantidad : acc, 0
        ), [listaItems]);

    const hayTotalParcial = listaItems.some(it => it.precio_estimado == null);

    /* ──────────────────────────────────────────────────────────
       Validación general
    ────────────────────────────────────────────────────────── */
    const esValido = justificacion.trim() && listaItems.length > 0;

    /* ──────────────────────────────────────────────────────────
       Enviar
    ────────────────────────────────────────────────────────── */
    const handleSubmit = async () => {
        if (!esValido || !perfil?.id || enviando) return;
        setEnviando(true);
        setFeedback(null);

        const payload = {
            solicitante_id: perfil.id,
            urgencia,
            justificacion: justificacion.trim(),
            proveedor_sugerido: proveedor.trim() || null,
            items: listaItems.map(({ nombre, codigo, cantidad, unidad_medida, precio_estimado }) => ({
                nombre, codigo, cantidad, unidad_medida, precio_estimado,
            })),
        };

        const { error } = await supabase.from('solicitudes_compra').insert(payload);

        if (error) {
            setFeedback({ type: 'error', msg: error.message });
        } else {
            setFeedback({ type: 'ok', msg: '✅ Solicitud enviada. El administrador la revisará próximamente.' });
            setUrgencia('normal');
            setProveedor('');
            setJustificacion('');
            setListaItems([]);
            cargarHistorial();
        }
        setEnviando(false);
    };

    /* ──────────────────────────────────────────────────────────
       RENDER
    ────────────────────────────────────────────────────────── */
    return (
        <div className="space-y-6 max-w-4xl">

            {/* ══════════════════════════════════════════════
                TARJETA PRINCIPAL — ORDEN DE COMPRA
            ══════════════════════════════════════════════ */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                {/* ── Cabecera estilo documento ─────────── */}
                <div className="bg-linear-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-lg">🛒</div>
                        <div>
                            <p className="text-white font-bold text-base leading-none">Solicitud de Compra</p>
                            <p className="text-blue-100 text-xs mt-0.5">Nueva orden de insumos</p>
                        </div>
                    </div>
                    <div className="text-right text-sm">
                        <p className="text-white font-semibold">{perfil?.nombre ?? '—'}</p>
                        <p className="text-blue-200 text-xs capitalize">
                            {perfil?.rol ?? ''}{perfil?.servicio ? ` · ${perfil.servicio}` : ''}
                        </p>
                        <p className="text-blue-200 text-xs mt-0.5">
                            {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </div>

                <div className="p-6 space-y-6">

                    {/* ── Datos generales ──────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                        {/* Urgencia */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                Urgencia
                            </label>
                            <div className="flex gap-2">
                                {URGENCIA_OPT.map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setUrgencia(opt.value)}
                                        className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition
                                            ${urgencia === opt.value
                                                ? URGENCIA_ACTIVE[opt.value]
                                                : opt.cls + ' hover:brightness-95'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Proveedor sugerido */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                Proveedor sugerido{' '}
                                <span className="normal-case font-normal text-slate-400">(opcional)</span>
                            </label>
                            <input type="text" value={proveedor} onChange={e => setProveedor(e.target.value)}
                                placeholder="Ej: Distribuidora Médica S.A."
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                        </div>

                        {/* Justificación */}
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                Justificación <span className="text-red-500">*</span>
                            </label>
                            <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)}
                                rows={2} placeholder="Motivo de la solicitud de compra…"
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" />
                        </div>
                    </div>

                    {/* ── Separador ────────────────────────── */}
                    <div className="border-t border-dashed border-slate-200" />

                    {/* ── Sección agregar ítem ─────────────── */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Agregar ítem
                        </p>
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">

                                {/* Búsqueda de insumo — col 5 */}
                                <div className="sm:col-span-5 relative" ref={dropRef}>
                                    <label className="text-xs text-slate-500 block mb-1">
                                        Insumo <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={busqTerm}
                                        onChange={e => {
                                            setBusqTerm(e.target.value);
                                            setEntrada(prev => ({ ...prev, nombre: e.target.value }));
                                            setDropOpen(true);
                                        }}
                                        onFocus={() => setDropOpen(true)}
                                        placeholder="Buscar por nombre o código…"
                                        className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />

                                    {/* Dropdown */}
                                    {dropOpen && sugerencias.length > 0 && (
                                        <ul className="absolute z-30 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                                            {sugerencias.map(ins => (
                                                <li key={ins.id}>
                                                    <button type="button"
                                                        onMouseDown={() => seleccionarInsumo(ins)}
                                                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 text-slate-800 transition flex items-center justify-between gap-3">
                                                        <span className="truncate font-medium">{ins.nombre}</span>
                                                        <span className="shrink-0 text-xs text-slate-400 font-mono">{ins.codigo ?? ''}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {/* Cantidad — col 2 */}
                                <div className="sm:col-span-2">
                                    <label className="text-xs text-slate-500 block mb-1">
                                        Cantidad <span className="text-red-500">*</span>
                                    </label>
                                    <input type="number" min={1} value={entrada.cantidad}
                                        onChange={e => setEntrada(prev => ({ ...prev, cantidad: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                                </div>

                                {/* Unidad — col 2 */}
                                <div className="sm:col-span-2">
                                    <label className="text-xs text-slate-500 block mb-1">Unidad</label>
                                    <input type="text" value={entrada.unidad_medida}
                                        onChange={e => setEntrada(prev => ({ ...prev, unidad_medida: e.target.value }))}
                                        placeholder="unidad"
                                        className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                                </div>

                                {/* Precio estimado — col 2 */}
                                <div className="sm:col-span-2">
                                    <label className="text-xs text-slate-500 block mb-1">Precio est. ($)</label>
                                    <input type="number" min={0} value={entrada.precio_estimado}
                                        onChange={e => setEntrada(prev => ({ ...prev, precio_estimado: e.target.value }))}
                                        placeholder="Opcional"
                                        className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                                </div>

                                {/* Botón Agregar — col 1 */}
                                <div className="sm:col-span-1 flex items-end">
                                    <button type="button" onClick={agregarItem} disabled={!puedeAgregar}
                                        title="Agregar ítem a la lista"
                                        className="w-full flex items-center justify-center gap-1 py-2 px-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed">
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                        </svg>
                                        <span className="hidden sm:inline text-xs">Agregar</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Tabla de ítems confirmados ────────── */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Ítems de la orden
                            {listaItems.length > 0 && (
                                <span className="ml-2 normal-case font-normal text-slate-400">
                                    ({listaItems.length} ítem{listaItems.length !== 1 ? 's' : ''})
                                </span>
                            )}
                        </p>

                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            {listaItems.length === 0 ? (
                                <div className="px-6 py-8 text-center text-slate-400 text-sm bg-slate-50">
                                    <p className="text-2xl mb-2">📋</p>
                                    <p>Sin ítems. Usa el formulario de arriba para agregar insumos.</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider text-left border-b border-slate-200">
                                            <th className="px-4 py-3 font-semibold w-8">#</th>
                                            <th className="px-4 py-3 font-semibold">Insumo</th>
                                            <th className="px-4 py-3 font-semibold text-center">Cant.</th>
                                            <th className="px-4 py-3 font-semibold">Unidad</th>
                                            <th className="px-4 py-3 font-semibold text-right">P. Unit. est.</th>
                                            <th className="px-4 py-3 font-semibold text-right">Subtotal</th>
                                            <th className="px-2 py-3 w-8" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {listaItems.map((it, idx) => {
                                            const subtotal = it.precio_estimado != null
                                                ? it.precio_estimado * it.cantidad : null;
                                            return (
                                                <tr key={it._key} className="hover:bg-slate-50 transition group">
                                                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{idx + 1}</td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-slate-800">{it.nombre}</p>
                                                        {it.codigo && (
                                                            <p className="text-xs text-slate-400 font-mono">{it.codigo}</p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-semibold text-slate-800">
                                                        {it.cantidad}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">{it.unidad_medida}</td>
                                                    <td className="px-4 py-3 text-right text-slate-500">
                                                        {it.precio_estimado != null ? fmtPeso(it.precio_estimado) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                                                        {subtotal != null ? fmtPeso(subtotal) : '—'}
                                                    </td>
                                                    <td className="px-2 py-3">
                                                        <button type="button" onClick={() => quitarItem(it._key)}
                                                            title="Quitar ítem"
                                                            className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                    d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    {/* Pie: total */}
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                                            <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                                                Total estimado
                                                {hayTotalParcial && (
                                                    <span className="font-normal text-slate-400"> (parcial)</span>
                                                )}:
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-blue-700 text-base">
                                                {totalEstimado > 0 ? fmtPeso(totalEstimado) : '—'}
                                            </td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* ── Feedback ─────────────────────────── */}
                    {feedback && (
                        <div className={`rounded-xl px-4 py-3 text-sm border
                            ${feedback.type === 'ok'
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : 'bg-red-50 border-red-200 text-red-700'}`}>
                            {feedback.msg}
                        </div>
                    )}

                    {/* ── Botón Enviar ──────────────────────── */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <p className="text-xs text-slate-400">
                            {listaItems.length === 0
                                ? 'Agrega al menos un ítem para poder enviar.'
                                : !justificacion.trim()
                                    ? 'Completa la justificación para poder enviar.'
                                    : `${listaItems.length} ítem${listaItems.length !== 1 ? 's' : ''} listo${listaItems.length !== 1 ? 's' : ''} para enviar.`}
                        </p>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!esValido || enviando}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                            {enviando
                                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>}
                            {enviando ? 'Enviando…' : 'Enviar solicitud'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════
                HISTORIAL MIS SOLICITUDES
            ══════════════════════════════════════════════ */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">Mis solicitudes enviadas</h3>
                    <button onClick={cargarHistorial} title="Recargar"
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {loadingHist ? (
                    <div className="px-5 py-10 text-center text-slate-400 text-sm">
                        <span className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                        Cargando…
                    </div>
                ) : historial.length === 0 ? (
                    <div className="px-5 py-10 text-center text-slate-400 text-sm">
                        Aún no has enviado solicitudes de compra.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider text-left">
                                    <th className="px-5 py-3 font-semibold">N°</th>
                                    <th className="px-5 py-3 font-semibold">Fecha</th>
                                    <th className="px-5 py-3 font-semibold">Urgencia</th>
                                    <th className="px-5 py-3 font-semibold">Ítems</th>
                                    <th className="px-5 py-3 font-semibold text-center">Estado</th>
                                    <th className="px-5 py-3 font-semibold text-center">Ver</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {historial.map(sc => {
                                    const urgOpt = URGENCIA_OPT.find(u => u.value === sc.urgencia) ?? URGENCIA_OPT[0];
                                    return (
                                        <tr key={sc.id} className="hover:bg-slate-50 transition">
                                            <td className="px-5 py-3 font-mono font-semibold text-slate-800">
                                                {nroSC(sc.nro_solicitud)}
                                            </td>
                                            <td className="px-5 py-3 text-slate-500 text-xs">{fmtFecha(sc.created_at)}</td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${urgOpt.cls}`}>
                                                    {urgOpt.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-slate-500 text-xs">
                                                {Array.isArray(sc.items)
                                                    ? `${sc.items.length} ítem${sc.items.length !== 1 ? 's' : ''}`
                                                    : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_CLS[sc.estado] ?? ''}`}>
                                                    {ESTADO_LABEL[sc.estado] ?? sc.estado}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <button onClick={() => setDetalleAbierto(sc)}
                                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium underline underline-offset-2 transition">
                                                    Ver detalle
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════
                MODAL DETALLE
            ══════════════════════════════════════════════ */}
            {detalleAbierto && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                🛒 {nroSC(detalleAbierto.nro_solicitud)}
                                <span className={`ml-1 text-xs px-2 py-0.5 rounded-full border font-medium ${ESTADO_CLS[detalleAbierto.estado]}`}>
                                    {ESTADO_LABEL[detalleAbierto.estado]}
                                </span>
                            </h3>
                            <button onClick={() => setDetalleAbierto(null)}
                                className="text-slate-400 hover:text-slate-600 transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-xs text-slate-500 block mb-0.5">Fecha envío</span>
                                    <span className="text-slate-800">{new Date(detalleAbierto.created_at).toLocaleString('es-CL')}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-500 block mb-0.5">Urgencia</span>
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border
                                        ${URGENCIA_OPT.find(u => u.value === detalleAbierto.urgencia)?.cls}`}>
                                        {URGENCIA_OPT.find(u => u.value === detalleAbierto.urgencia)?.label}
                                    </span>
                                </div>
                                {detalleAbierto.proveedor_sugerido && (
                                    <div className="col-span-2">
                                        <span className="text-xs text-slate-500 block mb-0.5">Proveedor sugerido</span>
                                        <span className="text-slate-800">{detalleAbierto.proveedor_sugerido}</span>
                                    </div>
                                )}
                                <div className="col-span-2">
                                    <span className="text-xs text-slate-500 block mb-0.5">Justificación</span>
                                    <p className="text-slate-800 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                                        {detalleAbierto.justificacion}
                                    </p>
                                </div>
                            </div>
                            {/* Ítems detalle */}
                            <div>
                                <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">
                                    Ítems solicitados
                                </p>
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                                                <th className="px-4 py-2 text-left font-semibold">Insumo</th>
                                                <th className="px-4 py-2 text-right font-semibold">Cant.</th>
                                                <th className="px-4 py-2 text-left font-semibold">Unidad</th>
                                                <th className="px-4 py-2 text-right font-semibold">P. Unit.</th>
                                                <th className="px-4 py-2 text-right font-semibold">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(detalleAbierto.items ?? []).map((it, i) => {
                                                const sub = it.precio_estimado != null
                                                    ? it.precio_estimado * it.cantidad : null;
                                                return (
                                                    <tr key={i} className="text-slate-700">
                                                        <td className="px-4 py-2">
                                                            <p className="font-medium">{it.nombre}</p>
                                                            {it.codigo && <p className="text-xs text-slate-400 font-mono">{it.codigo}</p>}
                                                        </td>
                                                        <td className="px-4 py-2 text-right font-semibold">{it.cantidad}</td>
                                                        <td className="px-4 py-2 text-slate-500">{it.unidad_medida}</td>
                                                        <td className="px-4 py-2 text-right text-slate-500">
                                                            {it.precio_estimado != null ? fmtPeso(it.precio_estimado) : '—'}
                                                        </td>
                                                        <td className="px-4 py-2 text-right font-semibold">
                                                            {sub != null ? fmtPeso(sub) : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {/* Respuesta admin */}
                            {detalleAbierto.estado !== 'pendiente' && (
                                <div className={`rounded-xl border p-4 ${ESTADO_CLS[detalleAbierto.estado]}`}>
                                    <p className="text-sm font-semibold mb-1">
                                        {detalleAbierto.estado === 'aprobada' ? '✅ Aprobada' : '❌ Rechazada'}
                                        {detalleAbierto.revisadoPor?.nombre && ` por ${detalleAbierto.revisadoPor.nombre}`}
                                    </p>
                                    {detalleAbierto.fecha_revision && (
                                        <p className="text-xs opacity-70 mb-1">
                                            {new Date(detalleAbierto.fecha_revision).toLocaleString('es-CL')}
                                        </p>
                                    )}
                                    {detalleAbierto.observaciones_admin && (
                                        <p className="text-sm mt-1">{detalleAbierto.observaciones_admin}</p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setDetalleAbierto(null)}
                                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
