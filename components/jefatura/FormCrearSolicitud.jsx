'use client';
/**
 * components/jefatura/FormCrearSolicitud.jsx
 *
 * Formulario multi-insumo con:
 *  - Buscador de insumos con dropdown (filtrado por texto) → agrega a lista
 *  - Búsqueda de funcionario por RUT o nombre (detección automática)
 *  - Pedido agrupador con nro_correlativo (todos los ítems bajo el mismo id de pedido)
 */
import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatRut, validateRut } from '@/lib/rut';
import Alert from '@/components/ui/Alert';

/**
 * Props:
 *   mostrarStock      {boolean}  Muestra cantidades de stock. Default: false.
 *   soloPropioUsuario {boolean}  El solicitante ES el trabajador (sin búsqueda). Para Trabajador.
 */
export default function FormCrearSolicitud({ onSuccess, mostrarStock = false, soloPropioUsuario = false }) {
    const { perfil } = useAuth();

    /* ── Catálogo de insumos ─────────────────────────────── */
    const [catalogo, setCatalogo] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    /* ── Buscador de insumos ─────────────────────────────── */
    const [busquedaInsumo, setBusquedaInsumo] = useState('');
    const [dropdownAbierto, setDropdownAbierto] = useState(false);
    const searchInsumoRef = useRef(null);
    const dropdownRef = useRef(null);

    /* ── Lista de ítems seleccionados ────────────────────── */
    // { key:number, insumo:{id,nombre,stock_actual,unidad_medida}, cantidad:number }
    const [items, setItems] = useState([]);

    /* ── Búsqueda de funcionario (RUT o nombre) ──────────── */
    const [busquedaFuncionario, setBusquedaFuncionario] = useState('');
    const [buscandoFuncionario, setBuscandoFuncionario] = useState(false);
    const [resultadosFuncionario, setResultadosFuncionario] = useState([]);
    const [trabajadorEncontrado, setTrabajadorEncontrado] = useState(null);
    const [funcionarioError, setFuncionarioError] = useState('');
    const [dropdownFuncAbierto, setDropdownFuncAbierto] = useState(false);
    const debounceTimer = useRef(null);
    const funcionarioRef = useRef(null);
    // Flag: true cuando el cambio de busquedaFuncionario vino de una selección
    // programática (no del usuario), para no resetear trabajadorEncontrado.
    const skipBusquedaRef = useRef(false);

    /* ── Motivo y feedback ───────────────────────────────── */
    const [motivo, setMotivo] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    /* ── Cargar catálogo ─────────────────────────────────── */
    useEffect(() => {
        const cargar = async () => {
            setLoadingData(true);
            const { data } = await supabase
                .from('insumos')
                .select('id, nombre, stock_actual, unidad_medida')
                .eq('activo', true)
                .gt('stock_actual', 0)
                .order('nombre');
            setCatalogo(data ?? []);
            setLoadingData(false);
        };
        cargar();
    }, []);

    /* ── Propio usuario como trabajador (rol Trabajador) ─── */
    // startTransition evita la advertencia de setState síncrono dentro de effect
    useEffect(() => {
        if (soloPropioUsuario && perfil) {
            startTransition(() => {
                setTrabajadorEncontrado({
                    id: perfil.id,
                    rut: perfil.rut,
                    nombre: perfil.nombre,
                    servicio: perfil.servicio,
                    rol: perfil.rol,
                    activo: true,
                });
            });
        }
    }, [soloPropioUsuario, perfil]);

    /* ── Cerrar dropdowns al hacer clic fuera ────────────── */
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                searchInsumoRef.current && !searchInsumoRef.current.contains(e.target)) {
                setDropdownAbierto(false);
            }
            if (funcionarioRef.current && !funcionarioRef.current.contains(e.target)) {
                setDropdownFuncAbierto(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    /* ────────────────────────────────────────────────────── */
    /* LÓGICA: buscador de insumos                           */
    /* ────────────────────────────────────────────────────── */
    const idsYaAgregados = items.map(it => it.insumo.id);

    const insumosFiltrados = catalogo.filter(ins =>
        !idsYaAgregados.includes(ins.id) &&
        ins.nombre.toLowerCase().includes(busquedaInsumo.toLowerCase().trim())
    );

    const agregarInsumo = (ins) => {
        setItems(prev => [...prev, { key: Date.now(), insumo: ins, cantidad: 1 }]);
        setBusquedaInsumo('');
        setDropdownAbierto(false);
        searchInsumoRef.current?.focus();
    };

    const eliminarItem = (key) => setItems(prev => prev.filter(it => it.key !== key));

    const actualizarCantidad = (key, valor) =>
        setItems(prev => prev.map(it => it.key === key ? { ...it, cantidad: valor } : it));

    /* ────────────────────────────────────────────────────── */
    /* LÓGICA: búsqueda de funcionario (RUT o nombre)        */
    /* ────────────────────────────────────────────────────── */

    /** Detecta si el texto parece un RUT chileno (comienza con dígito). */
    const esFormatoRut = (s) => /^\d/.test(s.trim()) || /\d-[\dkK]/.test(s.trim());

    const buscarFuncionario = useCallback(async (texto) => {
        if (!texto || texto.trim().length < 2) {
            setResultadosFuncionario([]);
            setDropdownFuncAbierto(false);
            return;
        }
        setBuscandoFuncionario(true);
        setFuncionarioError('');

        if (esFormatoRut(texto)) {
            /* ── Búsqueda por RUT ─────────────────── */
            const formateado = texto.trim();
            if (!validateRut(formateado) && formateado.length > 5) {
                setBuscandoFuncionario(false);
                setFuncionarioError('RUT con formato inválido');
                setResultadosFuncionario([]);
                setDropdownFuncAbierto(false);
                return;
            }
            const { data, error } = await supabase.rpc('buscar_trabajador_por_rut', { p_rut: formateado });
            setBuscandoFuncionario(false);
            if (error || !data || data.length === 0) {
                setResultadosFuncionario([]);
                setDropdownFuncAbierto(false);
                if (formateado.length > 6) setFuncionarioError('No se encontró ningún usuario con ese RUT.');
            } else {
                setResultadosFuncionario(data);
                setDropdownFuncAbierto(true);
            }
        } else {
            /* ── Búsqueda por nombre ──────────────── */
            const { data, error } = await supabase.rpc('buscar_trabajador_por_nombre', { p_nombre: texto.trim() });
            setBuscandoFuncionario(false);
            if (error || !data || data.length === 0) {
                setResultadosFuncionario([]);
                setDropdownFuncAbierto(false);
            } else {
                setResultadosFuncionario(data);
                setDropdownFuncAbierto(true);
            }
        }
    }, []);

    useEffect(() => {
        if (soloPropioUsuario) return;
        // Si el cambio fue por selección programática, saltamos el reset
        if (skipBusquedaRef.current) {
            skipBusquedaRef.current = false;
            return;
        }
        startTransition(() => {
            setTrabajadorEncontrado(null);
            setFuncionarioError('');
        });
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => buscarFuncionario(busquedaFuncionario), 350);
        return () => clearTimeout(debounceTimer.current);
    }, [busquedaFuncionario, soloPropioUsuario, buscarFuncionario]);

    const seleccionarFuncionario = (u) => {
        if (!u.activo) { setFuncionarioError('Este usuario está inactivo.'); return; }
        skipBusquedaRef.current = true; // evita que el useEffect resetee trabajadorEncontrado
        setTrabajadorEncontrado(u);
        setBusquedaFuncionario(u.nombre);
        setDropdownFuncAbierto(false);
        setResultadosFuncionario([]);
        setFuncionarioError('');
    };

    /* ────────────────────────────────────────────────────── */
    /* ENVÍO DEL FORMULARIO                                   */
    /* ────────────────────────────────────────────────────── */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setFeedback(null);

        if (!trabajadorEncontrado) {
            setFeedback({ type: 'error', message: 'Debes seleccionar un trabajador.' });
            return;
        }
        if (items.length === 0) {
            setFeedback({ type: 'error', message: 'Agrega al menos un insumo al pedido.' });
            return;
        }
        for (const it of items) {
            const qty = parseInt(it.cantidad, 10);
            if (!qty || qty <= 0) {
                setFeedback({ type: 'error', message: `Cantidad inválida para "${it.insumo.nombre}".` });
                return;
            }
            if (qty > it.insumo.stock_actual) {
                setFeedback({
                    type: 'warning',
                    message: `Stock insuficiente para "${it.insumo.nombre}": solo hay ${it.insumo.stock_actual} ${it.insumo.unidad_medida}.`,
                });
                return;
            }
        }

        if (!perfil?.id) {
            setFeedback({ type: 'error', message: 'Sesión no disponible. Recarga la página e intenta nuevamente.' });
            return;
        }

        setLoading(true);

        /* 1. Crear el pedido agrupador → obtiene nro_correlativo */
        const { data: pedido, error: errPedido } = await supabase
            .from('pedidos')
            .insert({
                solicitante_id: perfil.id,
                trabajador_id: trabajadorEncontrado.id,
                motivo: motivo.trim() || null,
            })
            .select('id, nro_correlativo')
            .single();

        if (errPedido || !pedido) {
            setLoading(false);
            const detalle = errPedido
                ? `${errPedido.message} (código: ${errPedido.code})`
                : 'No se obtuvo respuesta del servidor. Verifica que la tabla pedidos existe en la base de datos.';
            setFeedback({ type: 'error', message: `Error al crear el pedido: ${detalle}` });
            console.error('[FormCrearSolicitud] Error pedido:', errPedido);
            return;
        }

        /* 2. Insertar cada ítem en solicitudes vinculado al pedido */
        const filas = items.map(it => ({
            pedido_id: pedido.id,
            solicitante_id: perfil.id,
            trabajador_id: trabajadorEncontrado.id,
            insumo_id: it.insumo.id,
            cantidad: parseInt(it.cantidad, 10),
            motivo: motivo.trim() || null,
        }));

        const { error: errSolicitudes } = await supabase.from('solicitudes').insert(filas);
        setLoading(false);

        if (errSolicitudes) {
            setFeedback({ type: 'error', message: `Error al registrar los ítems: ${errSolicitudes.message} (código: ${errSolicitudes.code})` });
            console.error('[FormCrearSolicitud] Error solicitudes:', errSolicitudes);
            return;
        }

        setFeedback({
            type: 'success',
            message: `✅ Pedido #${pedido.nro_correlativo} creado con ${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}.`,
        });

        setItems([]);
        setBusquedaInsumo('');
        setMotivo('');
        if (!soloPropioUsuario) { setBusquedaFuncionario(''); setTrabajadorEncontrado(null); }
        onSuccess?.();
    };

    /* ────────────────────────────────────────────────────── */
    /* RENDER                                                 */
    /* ────────────────────────────────────────────────────── */
    if (loadingData) return (
        <div className="flex items-center justify-center py-10 text-slate-400 gap-2">
            <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Cargando insumos…
        </div>
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── SECCIÓN: Funcionario ────────────────────── */}
            {soloPropioUsuario && trabajadorEncontrado && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                    <span className="text-blue-500 text-base shrink-0">👤</span>
                    <div>
                        <p className="font-semibold text-blue-800 leading-tight">Solicitud a tu nombre</p>
                        <p className="text-blue-600 text-xs mt-0.5">{trabajadorEncontrado.servicio ?? ''}</p>
                    </div>
                </div>
            )}

            {!soloPropioUsuario && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Funcionario{' '}
                        <span className="text-slate-400 font-normal text-xs">(busca por nombre o RUT)</span>
                        <span className="text-red-500 ml-1">*</span>
                    </label>

                    <div className="relative" ref={funcionarioRef}>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                                </svg>
                            </span>
                            <input
                                type="text"
                                value={busquedaFuncionario}
                                onChange={e => {
                                    const v = e.target.value;
                                    setBusquedaFuncionario(esFormatoRut(v) ? formatRut(v) : v);
                                    setTrabajadorEncontrado(null);
                                }}
                                onFocus={() => resultadosFuncionario.length > 0 && setDropdownFuncAbierto(true)}
                                disabled={loading}
                                placeholder="Escribe nombre o RUT del funcionario…"
                                className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition text-sm"
                            />
                            {buscandoFuncionario && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                                </div>
                            )}
                            {trabajadorEncontrado && !buscandoFuncionario && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            )}
                        </div>

                        {/* Dropdown resultados funcionario */}
                        {dropdownFuncAbierto && resultadosFuncionario.length > 0 && (
                            <ul className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                                {resultadosFuncionario.map(u => (
                                    <li key={u.id}>
                                        <button
                                            type="button"
                                            onClick={() => seleccionarFuncionario(u)}
                                            disabled={!u.activo}
                                            className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center justify-between gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                                            <div>
                                                <p className="text-sm font-medium text-slate-800 leading-tight">{u.nombre}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {u.rut && <span className="mr-2">{u.rut}</span>}
                                                    {u.servicio && <span>{u.servicio} · </span>}
                                                    <span className="capitalize">{u.rol}</span>
                                                    {!u.activo && <span className="ml-1 text-red-500">(inactivo)</span>}
                                                </p>
                                            </div>
                                            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {funcionarioError && (
                        <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                            <span>⚠️</span> {funcionarioError}
                        </p>
                    )}

                    {trabajadorEncontrado && (
                        <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-green-600 text-base shrink-0">✅</span>
                                <div>
                                    <p className="font-semibold text-green-800 leading-tight">{trabajadorEncontrado.nombre}</p>
                                    <p className="text-green-600 text-xs mt-0.5">
                                        {trabajadorEncontrado.rut && <span className="mr-2">{trabajadorEncontrado.rut}</span>}
                                        {trabajadorEncontrado.servicio ? `${trabajadorEncontrado.servicio} · ` : ''}
                                        <span className="capitalize">{trabajadorEncontrado.rol}</span>
                                        {trabajadorEncontrado.id === perfil?.id && <span className="ml-1 font-medium">(tú)</span>}
                                    </p>
                                </div>
                            </div>
                            <button type="button"
                                onClick={() => { setTrabajadorEncontrado(null); setBusquedaFuncionario(''); }}
                                className="text-xs text-slate-400 hover:text-red-500 transition shrink-0">
                                Cambiar
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── SECCIÓN: Buscador de insumos ────────────── */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Insumos del pedido <span className="text-red-500">*</span>
                </label>

                <div className="relative">
                    <div className="relative" ref={searchInsumoRef}>
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={busquedaInsumo}
                            onChange={e => { setBusquedaInsumo(e.target.value); setDropdownAbierto(true); }}
                            onFocus={() => setDropdownAbierto(true)}
                            disabled={loading || catalogo.length === 0}
                            placeholder={catalogo.length === 0 ? 'Sin insumos disponibles' : 'Escribe para buscar un insumo…'}
                            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition text-sm"
                        />
                    </div>

                    {/* Dropdown de insumos filtrados */}
                    {dropdownAbierto && insumosFiltrados.length > 0 && (
                        <ul ref={dropdownRef}
                            className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                            {insumosFiltrados.map(ins => (
                                <li key={ins.id}>
                                    <button
                                        type="button"
                                        onClick={() => agregarInsumo(ins)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition flex items-center justify-between gap-2 text-sm">
                                        <div>
                                            <span className="font-medium text-slate-800">{ins.nombre}</span>
                                            {mostrarStock && (
                                                <span className="ml-2 text-xs text-slate-400">
                                                    ({ins.stock_actual} {ins.unidad_medida} disp.)
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-blue-500 text-lg leading-none font-bold shrink-0">+</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {dropdownAbierto && busquedaInsumo.length > 1 && insumosFiltrados.length === 0 && (
                        <div ref={dropdownRef}
                            className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 text-sm text-slate-400">
                            Sin coincidencias para &quot;{busquedaInsumo}&quot;
                        </div>
                    )}
                </div>

                {catalogo.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">⚠ No hay insumos con stock disponible.</p>
                )}

                {/* Lista de ítems agregados */}
                {items.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {items.map((it, idx) => (
                            <div key={it.key}
                                className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">

                                <span className="text-xs text-slate-400 font-semibold w-5 text-center shrink-0">{idx + 1}</span>

                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 truncate">{it.insumo.nombre}</p>
                                    {mostrarStock && (
                                        <p className="text-xs text-slate-400 leading-tight">
                                            Disp.: {it.insumo.stock_actual} {it.insumo.unidad_medida}
                                        </p>
                                    )}
                                </div>

                                {/* Controles de cantidad */}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button type="button" disabled={loading || it.cantidad <= 1}
                                        onClick={() => actualizarCantidad(it.key, Math.max(1, it.cantidad - 1))}
                                        className="w-7 h-7 rounded-lg border border-slate-300 bg-white text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 transition text-sm">
                                        −
                                    </button>
                                    <input
                                        type="number" min={1} max={it.insumo.stock_actual}
                                        value={it.cantidad}
                                        onChange={e => actualizarCantidad(it.key, parseInt(e.target.value, 10) || 1)}
                                        disabled={loading}
                                        className="w-12 text-center text-sm px-1 py-1 rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 transition"
                                    />
                                    <button type="button" disabled={loading || it.cantidad >= it.insumo.stock_actual}
                                        onClick={() => actualizarCantidad(it.key, Math.min(it.insumo.stock_actual, it.cantidad + 1))}
                                        className="w-7 h-7 rounded-lg border border-slate-300 bg-white text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100 disabled:opacity-40 transition text-sm">
                                        +
                                    </button>
                                </div>

                                <span className="text-xs text-slate-400 shrink-0 w-12">{it.insumo.unidad_medida}</span>

                                <button type="button" onClick={() => eliminarItem(it.key)} disabled={loading}
                                    className="text-slate-300 hover:text-red-500 transition disabled:opacity-40 shrink-0" title="Quitar">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}

                        <div className="flex items-center justify-between pt-1 text-xs text-slate-500 px-1">
                            <span>{items.length} {items.length === 1 ? 'ítem' : 'ítems'} en el pedido</span>
                            <button type="button" onClick={() => setItems([])} disabled={loading}
                                className="text-red-400 hover:text-red-600 transition disabled:opacity-40">
                                Vaciar lista
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Motivo ──────────────────────────────────── */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Motivo / Justificación <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <textarea
                    value={motivo} onChange={e => setMotivo(e.target.value)}
                    disabled={loading} rows={3}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 transition text-sm"
                    placeholder="Describe el motivo: actividad, proyecto, área…"
                />
            </div>

            {feedback && <Alert type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

            {/* ── Botón enviar ─────────────────────────────── */}
            <button type="submit"
                disabled={loading || !trabajadorEncontrado || items.length === 0}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
                {loading ? (
                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando…</>
                ) : (
                    `➕ Crear Pedido${items.length > 0 ? ` (${items.length} ${items.length === 1 ? 'ítem' : 'ítems'})` : ''}`
                )}
            </button>
        </form>
    );
}
